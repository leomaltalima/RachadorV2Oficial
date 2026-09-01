import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, despesasTable, divisoesTable, gruposTable, participantesTable } from "@workspace/db";
import {
  CreateDespesaBody,
  CreateDespesaParams,
  DeleteDespesaParams,
  ListDespesasParams,
} from "@workspace/api-zod";
import { notifyNovaDespesa } from "../lib/pushNotifications";

const router: IRouter = Router();

router.get("/grupos/:grupoId/despesas", async (req, res): Promise<void> => {
  const params = ListDespesasParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const despesas = await db
    .select()
    .from(despesasTable)
    .where(eq(despesasTable.grupoId, params.data.grupoId))
    .orderBy(despesasTable.criadoEm);

  const result = await Promise.all(
    despesas.map(async (d) => {
      const divisoes = await db
        .select()
        .from(divisoesTable)
        .where(eq(divisoesTable.despesaId, d.id));
      return {
        ...d,
        valor: parseFloat(d.valor),
        divisoes: divisoes.map((div) => ({
          participanteId: div.participanteId,
          valorDevido: parseFloat(div.valorDevido),
          porcentagem: div.porcentagem == null ? null : parseFloat(div.porcentagem),
          cotas: div.cotas == null ? null : parseFloat(div.cotas),
        })),
      };
    })
  );

  res.json(result);
});

router.post("/grupos/:grupoId/despesas", async (req, res): Promise<void> => {
  const params = CreateDespesaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateDespesaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [grupo] = await db
    .select()
    .from(gruposTable)
    .where(eq(gruposTable.id, params.data.grupoId));

  if (!grupo) {
    res.status(404).json({ error: "Grupo não encontrado" });
    return;
  }

  const participantesGrupo = await db
    .select({ id: participantesTable.id, nome: participantesTable.nome })
    .from(participantesTable)
    .where(eq(participantesTable.grupoId, params.data.grupoId));
  const participantesIds = new Set(participantesGrupo.map((p) => p.id));
  const pagoPor = participantesGrupo.find((p) => p.id === parsed.data.pagoPorId);
  const idsDivisao = parsed.data.divisoes.map((d) => d.participanteId);

  if (!pagoPor) {
    res.status(400).json({ error: "O pagador não pertence a este grupo" });
    return;
  }
  if (new Set(idsDivisao).size !== idsDivisao.length) {
    res.status(400).json({ error: "Um participante não pode aparecer mais de uma vez na divisão" });
    return;
  }
  if (idsDivisao.some((id) => !participantesIds.has(id))) {
    res.status(400).json({ error: "Todos os participantes da divisão devem pertencer ao grupo" });
    return;
  }
  if (parsed.data.divisoes.some((d) => d.valorDevido < 0)) {
    res.status(400).json({ error: "Os valores da divisão não podem ser negativos" });
    return;
  }

  const totalCentavos = Math.round(parsed.data.valor * 100);
  const somaCentavos = parsed.data.divisoes.reduce(
    (total, d) => total + Math.round(d.valorDevido * 100),
    0,
  );
  if (somaCentavos !== totalCentavos) {
    res.status(400).json({
      error: `A soma da divisão deve ser exatamente R$ ${parsed.data.valor.toFixed(2).replace(".", ",")}`,
    });
    return;
  }

  const tipoDivisao = parsed.data.tipoDivisao ?? "igual";
  if (tipoDivisao === "porcentagem") {
    const soma = parsed.data.divisoes.reduce((total, d) => total + (d.porcentagem ?? 0), 0);
    if (Math.abs(soma - 100) > 0.01) {
      res.status(400).json({ error: "A soma das porcentagens deve ser 100%" });
      return;
    }
  }
  if (tipoDivisao === "cotas" && parsed.data.divisoes.some((d) => !d.cotas || d.cotas <= 0)) {
    res.status(400).json({ error: "Todas as cotas devem ser maiores que zero" });
    return;
  }

  const created = await db.transaction(async (tx) => {
    const [despesa] = await tx.insert(despesasTable).values({
      descricao: parsed.data.descricao,
      valor: parsed.data.valor.toFixed(2),
      categoria: parsed.data.categoria ?? "Outros",
      tipoDivisao,
      pagoPorId: parsed.data.pagoPorId,
      grupoId: params.data.grupoId,
    }).returning();

    const divisoes = await tx.insert(divisoesTable).values(
      parsed.data.divisoes.map((d) => ({
        despesaId: despesa.id,
        participanteId: d.participanteId,
        valorDevido: d.valorDevido.toFixed(2),
        porcentagem: d.porcentagem == null ? null : d.porcentagem.toFixed(4),
        cotas: d.cotas == null ? null : d.cotas.toFixed(4),
      }))
    ).returning();
    return { despesa, divisoes };
  });

  res.status(201).json({
    ...created.despesa,
    valor: parseFloat(created.despesa.valor),
    divisoes: created.divisoes.map((d) => ({
      participanteId: d.participanteId,
      valorDevido: parseFloat(d.valorDevido),
      porcentagem: d.porcentagem == null ? null : parseFloat(d.porcentagem),
      cotas: d.cotas == null ? null : parseFloat(d.cotas),
    })),
  });

  // Fire-and-forget push notification (after response is sent)
  notifyNovaDespesa({
    grupoId: params.data.grupoId,
    descricao: parsed.data.descricao,
    valor: parsed.data.valor,
    pagoPorId: parsed.data.pagoPorId,
    pagadorNome: pagoPor.nome,
  }).catch(() => {});
});

router.delete("/despesas/:id", async (req, res): Promise<void> => {
  const params = DeleteDespesaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(despesasTable)
    .where(eq(despesasTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Despesa não encontrada" });
    return;
  }

  res.sendStatus(204);
});

export default router;
