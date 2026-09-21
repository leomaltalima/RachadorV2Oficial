import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authUserId: "user_1" as string | null,
  modelCalls: 0,
  users: [{ id: 1, clerkUserId: "user_1", nome: "Usuário", email: "user@example.com" }],
  subscriptions: [{ id: 1, usuarioId: 1, status: "ACTIVE", plano: "PRO" }],
}));
const usuariosTable = vi.hoisted(() => ({
  id: { table: "usuarios", column: "id" },
  clerkUserId: { table: "usuarios", column: "clerkUserId" },
}));
const assinaturasTable = vi.hoisted(() => ({
  usuarioId: { table: "assinaturas", column: "usuarioId" },
  status: { table: "assinaturas", column: "status" },
  plano: { table: "assinaturas", column: "plano" },
}));
const db = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: (table: unknown) => ({
      where: async () => table === usuariosTable ? state.users : state.subscriptions,
      limit: async () => table === usuariosTable ? state.users : state.subscriptions,
    }),
  })),
  insert: vi.fn(() => ({
    values: () => ({
      onConflictDoUpdate: () => ({
        returning: async () => [state.users[0]],
      }),
    }),
  })),
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: state.authUserId }),
  clerkClient: {
    users: {
      getUser: vi.fn(async () => ({
        id: "user_1",
        fullName: "Usuário",
        primaryEmailAddress: {
          emailAddress: "user@example.com",
          verification: { status: "verified" },
        },
        externalAccounts: [],
        hasImage: false,
        imageUrl: null,
        passwordEnabled: true,
        banned: false,
        locked: false,
        lastSignInAt: null,
      })),
    },
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  eq: (column: unknown, value: unknown) => ({ column, value }),
}));

vi.mock("@workspace/db", () => ({
  db,
  usuariosTable,
  assinaturasTable,
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(async () => {
          state.modelCalls += 1;
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  itens: [],
                  taxaServico: null,
                  totalSemTaxa: 0,
                  totalComTaxa: null,
                }),
              },
            }],
          };
        }),
      },
    },
  },
}));

import scanReceiptRouter from "../src/routes/scanReceipt";

const app = express();
app.use(express.json());
app.use("/api", scanReceiptRouter);

beforeEach(() => {
  state.authUserId = "user_1";
  state.modelCalls = 0;
  state.subscriptions[0].status = "ACTIVE";
});

describe("POST /api/scan-receipt", () => {
  it("bloqueia Free antes de chamar a IA de visão", async () => {
    state.subscriptions[0].status = "CANCELLED";
    const response = await request(app)
      .post("/api/scan-receipt")
      .send({ image: "data:image/jpeg;base64,dGVzdGU=" });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe("PLAN_REQUIRED");
    expect(state.modelCalls).toBe(0);
  });

  it("processa a nota sem depender de assinatura", async () => {
    const response = await request(app)
      .post("/api/scan-receipt")
      .send({ image: "data:image/jpeg;base64,dGVzdGU=" });

    expect(response.status).toBe(200);
    expect(state.modelCalls).toBe(1);
  });
});