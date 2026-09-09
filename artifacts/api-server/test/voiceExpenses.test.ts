import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { realVoiceRecording } from "./fixtures/realVoiceRecording";

const state = vi.hoisted(() => ({
  authUserId: "clerk-user-1" as string | null,
  transcript: "Paguei o jantar de cinquenta reais para mim e para a Bia.",
  modelContent: "",
  groups: [
    {
      id: 1,
      nome: "Viagem",
      codigoConvite: "VIAGEM",
      imagem: null,
      criadorClerkUserId: "clerk-user-1",
      criadoEm: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  participants: [
    {
      id: 1,
      nome: "Eu",
      chavePix: null,
      imagem: null,
      grupoId: 1,
      clerkUserId: "clerk-user-1",
      criadoEm: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: 2,
      nome: "Bia",
      chavePix: null,
      imagem: null,
      grupoId: 1,
      clerkUserId: null,
      criadoEm: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: 3,
      nome: "Carlos",
      chavePix: null,
      imagem: null,
      grupoId: 1,
      clerkUserId: null,
      criadoEm: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: 4,
      nome: "Ana Paula",
      chavePix: null,
      imagem: null,
      grupoId: 1,
      clerkUserId: null,
      criadoEm: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: 5,
      nome: "Ana Clara",
      chavePix: null,
      imagem: null,
      grupoId: 1,
      clerkUserId: null,
      criadoEm: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  expenses: [] as Record<string, unknown>[],
  divisions: [] as Record<string, unknown>[],
  nextExpenseId: 1,
  nextDivisionId: 1,
  sttCalls: 0,
  modelCalls: 0,
  lastAudio: null as Buffer | null,
}));

const gruposTable = vi.hoisted(() => ({
  id: { table: "grupos", column: "id" },
  codigoConvite: { table: "grupos", column: "codigoConvite" },
}));
const participantesTable = vi.hoisted(() => ({
  id: { table: "participantes", column: "id" },
  grupoId: { table: "participantes", column: "grupoId" },
  clerkUserId: { table: "participantes", column: "clerkUserId" },
}));
const despesasTable = vi.hoisted(() => ({
  id: { table: "despesas", column: "id" },
  grupoId: { table: "despesas", column: "grupoId" },
  idempotencyKey: { table: "despesas", column: "idempotencyKey" },
}));
const divisoesTable = vi.hoisted(() => ({
  id: { table: "divisoes", column: "id" },
  despesaId: { table: "divisoes", column: "despesaId" },
}));
const pagamentosTable = vi.hoisted(() => ({
  id: { table: "pagamentos", column: "id" },
  grupoId: { table: "pagamentos", column: "grupoId" },
}));
const pushTokensTable = vi.hoisted(() => ({
  id: { table: "push_tokens", column: "id" },
  participanteId: { table: "push_tokens", column: "participanteId" },
}));

function rowsFor(table: unknown) {
  if (table === gruposTable) return state.groups;
  if (table === participantesTable) return state.participants;
  if (table === despesasTable) return state.expenses;
  if (table === divisoesTable) return state.divisions;
  if (table === pagamentosTable) return [];
  if (table === pushTokensTable) return [];
  return [];
}

function makeSelect() {
  return {
    from(table: unknown) {
      const rows = rowsFor(table);
      return {
        where: async () => rows,
        orderBy: async () => rows,
        innerJoin: () => ({
          where: async () => rows,
        }),
      };
    },
  };
}

const db = vi.hoisted(() => ({
  select: vi.fn(() => makeSelect()),
  insert: vi.fn((table: unknown) => ({
    values: (values: Record<string, unknown> | Record<string, unknown>[]) => ({
      onConflictDoNothing: () => ({
        returning: async () => {
          if (table !== despesasTable) return [];
          const value = values as Record<string, unknown>;
          const existing = state.expenses.find(
            (expense) =>
              expense.grupoId === value.grupoId && expense.idempotencyKey === value.idempotencyKey,
          );
          if (existing) return [];
          const expense = {
            ...value,
            id: state.nextExpenseId++,
            criadoEm: new Date(),
          };
          state.expenses.push(expense);
          return [expense];
        },
      }),
      returning: async () => {
        const entries = Array.isArray(values) ? values : [values];
        if (table === divisoesTable) {
          const created = entries.map((value) => ({
            ...value,
            id: state.nextDivisionId++,
          }));
          state.divisions.push(...created);
          return created;
        }
        return entries;
      },
    }),
  })),
  transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown> | Record<string, unknown>[]) => ({
          onConflictDoNothing: () => ({
            returning: async () => {
              if (table !== despesasTable) return [];
              const value = values as Record<string, unknown>;
              const existing = state.expenses.find(
                (expense) =>
                  expense.grupoId === value.grupoId && expense.idempotencyKey === value.idempotencyKey,
              );
              if (existing) return [];
              const expense = {
                ...value,
                id: state.nextExpenseId++,
                criadoEm: new Date(),
              };
              state.expenses.push(expense);
              return [expense];
            },
          }),
          returning: async () => {
            const entries = Array.isArray(values) ? values : [values];
            if (table === divisoesTable) {
              const created = entries.map((value) => ({
                ...value,
                id: state.nextDivisionId++,
              }));
              state.divisions.push(...created);
              return created;
            }
            return entries;
          },
        }),
      }),
    }),
  ),
  delete: vi.fn(() => ({ where: async () => undefined })),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (column: unknown, value: unknown) => ({ column, value }),
  inArray: (column: unknown, values: unknown[]) => ({ column, values }),
}));

vi.mock("@clerk/express", () => ({
  clerkMiddleware: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  getAuth: () => ({ userId: state.authUserId }),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: () => undefined,
}));

vi.mock("@workspace/db", () => ({
  db,
  gruposTable,
  participantesTable,
  despesasTable,
  divisoesTable,
  pagamentosTable,
  pushTokensTable,
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  isUsingDirectOpenAI: false,
  openai: {
    chat: {
      completions: {
        create: vi.fn(async () => {
          state.modelCalls += 1;
          return { choices: [{ message: { content: state.modelContent } }] };
        }),
      },
    },
  },
}));

vi.mock("@workspace/integrations-openai-ai-server/audio", () => ({
  ensureCompatibleFormat: vi.fn(async (audio: Buffer) => ({ buffer: audio, format: "wav" })),
  speechToText: vi.fn(async (audio: Buffer) => {
    state.sttCalls += 1;
    state.lastAudio = audio;
    return state.transcript;
  }),
}));

import app from "../src/app";

const audioBase64 = `data:audio/wav;base64,${realVoiceRecording.toString("base64")}`;

function modelExpense(overrides: Record<string, unknown> = {}) {
  return {
    description: "Jantar",
    amount: 50,
    category: "jantar",
    paidBy: "Eu",
    participantNames: ["Eu", "Bia"],
    divisionType: "equal",
    percentages: {},
    shares: {},
    customAmounts: {},
    notes: null,
    needsConfirmation: [],
    confidence: {
      amount: "high",
      paidBy: "high",
      participants: "high",
      category: "medium",
    },
    ...overrides,
  };
}

async function parseVoice(expenses: Record<string, unknown>[], audio = audioBase64) {
  state.modelContent = JSON.stringify({
    summary: `Encontramos ${expenses.length} gasto(s).`,
    warnings: [],
    expenses,
  });
  return request(app)
    .post("/api/grupos/1/voice-expenses/parse")
    .set("Authorization", "Bearer test-user-session")
    .send({ audioBase64: audio, mimeType: "audio/wav" });
}

beforeEach(() => {
  state.authUserId = "clerk-user-1";
  state.transcript = "Paguei o jantar de cinquenta reais para mim e para a Bia.";
  state.modelContent = "";
  state.expenses.length = 0;
  state.divisions.length = 0;
  state.nextExpenseId = 1;
  state.nextDivisionId = 1;
  state.sttCalls = 0;
  state.modelCalls = 0;
  state.lastAudio = null;
});

describe("POST /api/grupos/:grupoId/voice-expenses/parse", () => {
  it("usa uma gravação WAV real e interpreta uma despesa narrada em português", async () => {
    const response = await parseVoice([modelExpense()]);

    expect(response.status).toBe(200);
    expect(response.body.transcricao).toContain("jantar");
    expect(response.body.despesas).toHaveLength(1);
    expect(response.body.despesas[0]).toMatchObject({
      descricao: "Jantar",
      valor: 50,
      categoria: "Alimentação",
      pagoPorId: 1,
      pagoPorNome: "Eu",
      tipoDivisao: "selecionados",
    });
    expect(response.body.despesas[0].divisoes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participanteId: 1, valorDevido: 25 }),
        expect.objectContaining({ participanteId: 2, valorDevido: 25 }),
      ]),
    );
    expect(state.lastAudio?.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(state.lastAudio?.subarray(8, 12).toString("ascii")).toBe("WAVE");
    expect(state.expenses).toHaveLength(0);
  });

  it("retorna todos os gastos independentes sem persistir despesas no parsing", async () => {
    state.transcript = "Também paguei o táxi e o hotel.";
    const response = await parseVoice([
      modelExpense({ description: "Táxi", amount: 30, category: "uber" }),
      modelExpense({ description: "Hotel", amount: 120, category: "hotel" }),
    ]);

    expect(response.status).toBe(200);
    expect(response.body.despesas).toHaveLength(2);
    expect(response.body.despesas.map((expense: { descricao: string }) => expense.descricao)).toEqual([
      "Táxi",
      "Hotel",
    ]);
    expect(state.sttCalls).toBe(1);
    expect(state.modelCalls).toBe(1);
    expect(state.expenses).toHaveLength(0);
    expect(state.divisions).toHaveLength(0);
  });

  it("sinaliza nomes ambíguos para confirmação humana", async () => {
    const response = await parseVoice([
      modelExpense({ participantNames: ["Ana"], paidBy: "Ana" }),
    ]);

    expect(response.status).toBe(200);
    expect(response.body.despesas[0].nomesNaoResolvidos).toContain("Ana");
    expect(response.body.despesas[0].precisaConfirmacao).toEqual(
      expect.arrayContaining([
        "Precisamos confirmar qual participante é “Ana”.",
        "Precisamos confirmar quem pagou: “Ana”.",
      ]),
    );
    expect(response.body.despesas[0].divisoes.find(
      (division: { participanteId: number }) => division.participanteId === 4,
    )?.valorDevido).toBe(0);
    expect(state.expenses).toHaveLength(0);
  });

  it("calcula divisões personalizadas e mantém os valores no rascunho", async () => {
    const response = await parseVoice([
      modelExpense({
        amount: 90,
        divisionType: "custom",
        participantNames: ["Eu", "Bia", "Carlos"],
        customAmounts: { Eu: 10, Bia: 20, Carlos: 60 },
      }),
    ]);

    expect(response.status).toBe(200);
    expect(response.body.despesas[0]).toMatchObject({
      valor: 90,
      tipoDivisao: "personalizado",
    });
    expect(response.body.despesas[0].divisoes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ participanteId: 1, valorDevido: 10 }),
        expect.objectContaining({ participanteId: 2, valorDevido: 20 }),
        expect.objectContaining({ participanteId: 3, valorDevido: 60 }),
      ]),
    );
    expect(state.expenses).toHaveLength(0);
  });

  it("rejeita áudio inválido antes de chamar transcrição", async () => {
    const response = await parseVoice([modelExpense()], "data:audio/wav;base64,not-a-real-recording");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("O áudio está vazio ou é muito curto.");
    expect(state.sttCalls).toBe(0);
    expect(state.modelCalls).toBe(0);
    expect(state.expenses).toHaveLength(0);
  });

  it("preserva a parte interpretável e marca a falha parcial para revisão", async () => {
    const response = await parseVoice([
      modelExpense({ description: "Almoço", amount: 40 }),
      modelExpense({
        description: null,
        amount: null,
        paidBy: null,
        participantNames: ["Pessoa que não existe"],
      }),
    ]);

    expect(response.status).toBe(200);
    expect(response.body.despesas).toHaveLength(2);
    expect(response.body.despesas[0].precisaConfirmacao).toEqual([]);
    expect(response.body.despesas[1].precisaConfirmacao).toEqual(
      expect.arrayContaining([
        "Informe um valor para este gasto.",
        "Informe uma descrição para este gasto.",
        "Selecione quem participou deste gasto.",
        "Informe quem pagou este gasto.",
        "“Pessoa que não existe” não corresponde a um participante do grupo.",
      ]),
    );
    expect(state.expenses).toHaveLength(0);
  });

  it("mantém a rota protegida", async () => {
    state.authUserId = null;
    const response = await parseVoice([modelExpense()]);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Faça login para usar os gastos por voz.");
    expect(state.sttCalls).toBe(0);
    expect(state.expenses).toHaveLength(0);
  });
});

describe("confirmação de rascunho de gasto por voz", () => {
  it("não duplica a despesa quando a confirmação é reenviada", async () => {
    const parsed = await parseVoice([modelExpense({ amount: 75 })]);
    expect(parsed.status).toBe(200);
    expect(state.expenses).toHaveLength(0);

    const draft = parsed.body.despesas[0];
    const payload = {
      descricao: draft.descricao,
      valor: draft.valor,
      categoria: draft.categoria,
      tipoDivisao: draft.tipoDivisao,
      pagoPorId: draft.pagoPorId,
      divisoes: draft.divisoes
        .filter((division: { valorDevido: number }) => division.valorDevido > 0)
        .map((division: { participanteId: number; valorDevido: number }) => ({
          participanteId: division.participanteId,
          valorDevido: division.valorDevido,
        })),
      idempotencyKey: "voice-draft-confirmation-1",
    };

    const first = await request(app)
      .post("/api/grupos/1/despesas")
      .set("Authorization", "Bearer test-user-session")
      .send(payload);
    const second = await request(app)
      .post("/api/grupos/1/despesas")
      .set("Authorization", "Bearer test-user-session")
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(state.expenses).toHaveLength(1);
    expect(state.divisions).toHaveLength(2);
  });
});