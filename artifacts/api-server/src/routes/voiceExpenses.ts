import { Router } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod/v4";
import { db, gruposTable, participantesTable } from "@workspace/db";
import { isUsingDirectOpenAI, openai } from "@workspace/integrations-openai-ai-server";
import { ensureCompatibleFormat, speechToText } from "@workspace/integrations-openai-ai-server/audio";
import { reserveAiUse } from "../billing";

const router = Router();

const categories = ["Alimentação", "Transporte", "Hospedagem", "Lazer", "Mercado", "Compras", "Saúde", "Outros"] as const;
const voiceInputSchema = z.object({
  audioBase64: z.string().min(32),
  mimeType: z.string().optional(),
});
const modelSchema = z.object({
  summary: z.string().default(""),
  warnings: z.array(z.string()).default([]),
  expenses: z.array(z.object({
    description: z.string().nullable().default(null),
    amount: z.number().nullable().default(null),
    category: z.string().nullable().default(null),
    paidBy: z.string().nullable().default(null),
    participantNames: z.array(z.string()).default([]),
    divisionType: z.enum(["equal", "selected", "custom", "percentage", "shares"]).default("equal"),
    percentages: z.record(z.string(), z.number()).default({}),
    shares: z.record(z.string(), z.number()).default({}),
    customAmounts: z.record(z.string(), z.number()).default({}),
    notes: z.string().nullable().default(null),
    needsConfirmation: z.array(z.string()).default([]),
    confidence: z.object({
      amount: z.enum(["high", "medium", "low"]).default("low"),
      paidBy: z.enum(["high", "medium", "low"]).default("low"),
      participants: z.enum(["high", "medium", "low"]).default("low"),
      category: z.enum(["high", "medium", "low"]).default("low"),
    }).default({ amount: "low", paidBy: "low", participants: "low", category: "low" }),
  })).default([]),
});

type Participant = typeof participantesTable.$inferSelect;
type ModelExpense = z.infer<typeof modelSchema>["expenses"][number];

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

function cents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return Math.round(value) / 100;
}

function distribute(total: number, weights: number[]) {
  const totalCents = cents(total);
  const positive = weights.map((weight) => Math.max(0, weight));
  const weightTotal = positive.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) return positive.map(() => 0);
  const values = positive.map((weight) => Math.floor((totalCents * weight) / weightTotal));
  let remainder = totalCents - values.reduce((sum, value) => sum + value, 0);
  for (let index = 0; remainder > 0; index = (index + 1) % values.length) {
    if (positive[index] > 0) {
      values[index] += 1;
      remainder -= 1;
    }
  }
  return values.map(fromCents);
}

function categoryFromModel(value: string | null) {
  if (!value) return null;
  const direct = categories.find((category) => normalize(category) === normalize(value));
  if (direct) return direct;
  const aliases: Record<string, (typeof categories)[number]> = {
    restaurante: "Alimentação",
    comida: "Alimentação",
    jantar: "Alimentação",
    almoco: "Alimentação",
    uber: "Transporte",
    taxi: "Transporte",
    hotel: "Hospedagem",
    cinema: "Lazer",
    supermercado: "Mercado",
  };
  return aliases[normalize(value)] ?? null;
}

function resolveName(rawName: string, participants: Participant[]) {
  const name = normalize(rawName);
  const exact = participants.filter((participant) => normalize(participant.nome) === name);
  if (exact.length === 1) return { participant: exact[0], ambiguous: false };
  if (exact.length > 1) return { participant: null, ambiguous: true };
  const partial = participants.filter((participant) => {
    const candidate = normalize(participant.nome);
    return candidate.startsWith(name) || name.startsWith(candidate);
  });
  if (partial.length === 1) return { participant: partial[0], ambiguous: false };
  return { participant: null, ambiguous: partial.length > 1 };
}

function participantNamesFromExpense(expense: ModelExpense, participants: Participant[]) {
  const everyone = expense.participantNames.some((name) =>
    ["todos", "todo mundo", "todas", "todos nos", "toda a gente"].includes(normalize(name)),
  );
  if (everyone) return { matches: participants, unresolved: [] as string[], ambiguous: [] as string[] };

  const matches: Participant[] = [];
  const unresolved: string[] = [];
  const ambiguous: string[] = [];
  for (const rawName of expense.participantNames) {
    const result = resolveName(rawName, participants);
    if (result.participant && !matches.some((match) => match.id === result.participant!.id)) {
      matches.push(result.participant);
    } else if (result.ambiguous) {
      ambiguous.push(rawName);
    } else {
      unresolved.push(rawName);
    }
  }
  return { matches, unresolved, ambiguous };
}

function computeDraftDivisions(
  expense: ModelExpense,
  participants: Participant[],
  selected: Participant[],
  needsConfirmation: string[],
) {
  const amount = expense.amount ?? 0;
  let values = selected.map(() => 0);
  let metadata: { porcentagem: number | null; cotas: number | null }[] = selected.map(() => ({ porcentagem: null, cotas: null }));

  if (expense.divisionType === "percentage") {
    const weights = selected.map((participant) => expense.percentages[participant.nome] ?? expense.percentages[normalize(participant.nome)] ?? 0);
    const percentageTotal = weights.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(percentageTotal - 100) > 0.01) {
      needsConfirmation.push("As porcentagens precisam totalizar 100%.");
    } else {
      values = distribute(amount, weights);
      metadata = weights.map((weight) => ({ porcentagem: weight, cotas: null }));
    }
  } else if (expense.divisionType === "shares") {
    const weights = selected.map((participant) => expense.shares[participant.nome] ?? expense.shares[normalize(participant.nome)] ?? 0);
    if (weights.some((weight) => weight < 0) || weights.every((weight) => weight <= 0)) {
      needsConfirmation.push("As cotas precisam ser maiores que zero.");
    } else {
      values = distribute(amount, weights);
      metadata = weights.map((weight) => ({ porcentagem: null, cotas: weight }));
    }
  } else if (expense.divisionType === "custom") {
    const customValues = selected.map((participant) => expense.customAmounts[participant.nome] ?? expense.customAmounts[normalize(participant.nome)] ?? 0);
    if (cents(customValues.reduce((sum, value) => sum + value, 0)) !== cents(amount)) {
      needsConfirmation.push("Os valores personalizados precisam somar o total.");
    } else {
      values = customValues.map((value) => fromCents(cents(value)));
    }
  } else {
    values = distribute(amount, selected.map(() => 1));
  }

  return participants.map((participant) => {
    const index = selected.findIndex((selectedParticipant) => selectedParticipant.id === participant.id);
    return {
      participanteId: participant.id,
      nome: participant.nome,
      valorDevido: index >= 0 ? values[index] : 0,
      porcentagem: index >= 0 ? metadata[index].porcentagem : null,
      cotas: index >= 0 ? metadata[index].cotas : null,
    };
  });
}

function divisionType(value: ModelExpense["divisionType"]) {
  return ({ equal: "igual", selected: "selecionados", custom: "personalizado", percentage: "porcentagem", shares: "cotas" } as const)[value];
}

router.post("/grupos/:grupoId/voice-expenses/parse", async (req, res): Promise<void> => {
  const grupoId = Number(req.params.grupoId);
  if (!Number.isInteger(grupoId)) {
    res.status(400).json({ error: "Grupo inválido" });
    return;
  }
  const parsedInput = voiceInputSchema.safeParse(req.body);
  if (!parsedInput.success) {
    res.status(400).json({ error: "Envie um áudio válido para processar." });
    return;
  }

  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Faça login para usar os gastos por voz." });
    return;
  }

  const [group] = await db.select().from(gruposTable).where(eq(gruposTable.id, grupoId));
  if (!group) {
    res.status(404).json({ error: "Grupo não encontrado" });
    return;
  }
  const participants = await db.select().from(participantesTable).where(eq(participantesTable.grupoId, grupoId));
  const currentParticipant = participants.find((participant) => participant.clerkUserId === userId);
  if (!currentParticipant && group.criadorClerkUserId !== userId) {
    res.status(403).json({ error: "Você não pertence a este grupo." });
    return;
  }

  const usage = await reserveAiUse(userId, "voice");
  if (!usage.allowed) {
    res.status(402).json({
      error: "Você atingiu o limite de 3 divisões automáticas gratuitas neste mês.",
      code: "premium_required",
      billing: usage.summary,
    });
    return;
  }

  try {
    const rawBase64 = parsedInput.data.audioBase64.replace(/^data:[^;]+;base64,/, "");
    const audioBuffer = Buffer.from(rawBase64, "base64");
    if (audioBuffer.length < 256) {
      res.status(400).json({ error: "O áudio está vazio ou é muito curto." });
      return;
    }
    const compatible = await ensureCompatibleFormat(audioBuffer);
    const transcript = await speechToText(compatible.buffer, compatible.format);
    if (!transcript.trim()) {
      res.status(422).json({ error: "Não encontramos fala no áudio. Tente gravar novamente." });
      return;
    }

    const participantContext = participants.map((participant) => `- ${participant.nome} (id interno ${participant.id})`).join("\n");
    const currentName = currentParticipant?.nome ?? "não identificado entre os participantes";
    const interpretationModel = isUsingDirectOpenAI ? "gpt-4.1-mini" : "gpt-5.6-terra";
    const response = await openai.chat.completions.create({
      model: interpretationModel,
      max_completion_tokens: 5000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você interpreta narrativas de despesas compartilhadas em português brasileiro.

Retorne exclusivamente JSON válido neste formato:
{
  "summary": "resumo curto",
  "warnings": ["avisos"],
  "expenses": [{
    "description": "descrição ou null",
    "amount": 0,
    "category": "Alimentação|Transporte|Hospedagem|Lazer|Mercado|Compras|Saúde|Outros ou null",
    "paidBy": "nome exato da lista ou null",
    "participantNames": ["nomes exatos da lista"],
    "divisionType": "equal|selected|custom|percentage|shares",
    "percentages": {"nome exato": 50},
    "shares": {"nome exato": 1},
    "customAmounts": {"nome exato": 20},
    "notes": "observação ou null",
    "needsConfirmation": ["o que falta confirmar"],
    "confidence": {"amount": "high|medium|low", "paidBy": "high|medium|low", "participants": "high|medium|low", "category": "high|medium|low"}
  }]
}

Usuário autenticado: ${currentName}.
Participantes reais disponíveis (use somente estes nomes, nunca invente):
${participantContext}

Regras:
- Interprete “eu”, “meu” e “minha” como o usuário autenticado, quando ele estiver na lista.
- Identifique todos os gastos independentes na narrativa.
- Para “todo mundo”, liste todos os nomes reais da lista em participantNames.
- Para exclusões e exceções, prefira separar subgastos em despesas atômicas quando houver um valor próprio; caso contrário, use custom e indique a regra em notes.
- Nunca invente valor, pagador ou participante. Use null, lista vazia e needsConfirmation quando faltar informação.
- Nunca retorne IDs. A aplicação fará a associação segura pelos nomes.
- O backend fará a matemática final; retorne apenas percentuais, cotas ou valores explicitamente falados.`,
        },
        { role: "user", content: transcript },
      ],
    });
    const content = response.choices[0]?.message?.content ?? "";
    let rawModel: unknown;
    try {
      rawModel = JSON.parse(content);
    } catch {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      rawModel = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    }
    const model = modelSchema.safeParse(rawModel);
    if (!model.success) {
      res.status(502).json({ error: "A IA retornou uma estrutura inválida. Tente gravar novamente." });
      return;
    }

    const drafts = model.data.expenses.map((expense, index) => {
      const needsConfirmation = [...expense.needsConfirmation];
      const resolvedParticipants = participantNamesFromExpense(expense, participants);
      const selected = resolvedParticipants.matches;
      const unresolved = [...resolvedParticipants.unresolved, ...resolvedParticipants.ambiguous];
      for (const name of resolvedParticipants.ambiguous) needsConfirmation.push(`Precisamos confirmar qual participante é “${name}”.`);
      for (const name of resolvedParticipants.unresolved) needsConfirmation.push(`“${name}” não corresponde a um participante do grupo.`);
      if (expense.amount == null || expense.amount <= 0) needsConfirmation.push("Informe um valor para este gasto.");
      if (!expense.description?.trim()) needsConfirmation.push("Informe uma descrição para este gasto.");
      if (selected.length === 0) needsConfirmation.push("Selecione quem participou deste gasto.");

      let paidById: number | null = null;
      let paidByName: string | null = null;
      if (expense.paidBy) {
        const paidBy = normalize(expense.paidBy) === "eu" ? currentParticipant : resolveName(expense.paidBy, participants).participant;
        if (paidBy) {
          paidById = paidBy.id;
          paidByName = paidBy.nome;
        } else {
          needsConfirmation.push(`Precisamos confirmar quem pagou: “${expense.paidBy}”.`);
        }
      } else {
        needsConfirmation.push("Informe quem pagou este gasto.");
      }

      const type =
        expense.divisionType === "equal" && selected.length > 0 && selected.length < participants.length
          ? "selecionados"
          : divisionType(expense.divisionType);
      const divisions = computeDraftDivisions(expense, participants, selected, needsConfirmation);
      return {
        id: `voice-${Date.now()}-${index}`,
        descricao: expense.description?.trim() || "",
        valor: expense.amount == null ? null : fromCents(cents(expense.amount)),
        categoria: categoryFromModel(expense.category),
        tipoDivisao: type,
        pagoPorId: paidById,
        pagoPorNome: paidByName,
        divisoes: divisions,
        nomesNaoResolvidos: unresolved,
        precisaConfirmacao: [...new Set(needsConfirmation)],
        confianca: {
          valor: ({ high: "alta", medium: "média", low: "baixa" } as const)[expense.confidence.amount],
          pagador: ({ high: "alta", medium: "média", low: "baixa" } as const)[expense.confidence.paidBy],
          participantes: ({ high: "alta", medium: "média", low: "baixa" } as const)[expense.confidence.participants],
          categoria: ({ high: "alta", medium: "média", low: "baixa" } as const)[expense.confidence.category],
        },
        observacoes: expense.notes,
      };
    });

    res.json({
      transcricao: transcript,
      resumo: model.data.summary || `Encontramos ${drafts.length} gasto(s).`,
      despesas: drafts,
      avisos: model.data.warnings,
    });
  } catch (error) {
    console.error("Erro ao processar gastos por voz:", error);
    res.status(502).json({ error: "Não conseguimos interpretar esse áudio. Tente novamente ou cadastre manualmente." });
  }
});

export default router;