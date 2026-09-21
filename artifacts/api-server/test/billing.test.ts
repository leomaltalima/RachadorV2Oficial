import crypto from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authUserId: "clerk-user-1" as string | null,
  users: [{
    id: 7,
    clerkUserId: "clerk-user-1",
    nome: "Pessoa Teste",
    email: "pessoa@example.com",
  }],
  subscriptions: [] as Record<string, unknown>[],
  events: [] as Record<string, unknown>[],
  providerPixCharges: [] as Record<string, unknown>[],
  providerSubscriptions: [] as string[],
  nextSubscriptionId: 1,
}));

const usuariosTable = vi.hoisted(() => ({
  id: { table: "usuarios", column: "id" },
  clerkUserId: { table: "usuarios", column: "clerkUserId" },
}));
const assinaturasTable = vi.hoisted(() => ({
  id: { table: "assinaturas", column: "id" },
  usuarioId: { table: "assinaturas", column: "usuarioId" },
  status: { table: "assinaturas", column: "status" },
  atualizadaEm: { table: "assinaturas", column: "atualizadaEm" },
  abacatePaySubscriptionId: { table: "assinaturas", column: "abacatePaySubscriptionId" },
  abacatePayCheckoutId: { table: "assinaturas", column: "abacatePayCheckoutId" },
  externalId: { table: "assinaturas", column: "externalId" },
  abacatePayCustomerId: { table: "assinaturas", column: "abacatePayCustomerId" },
  abacatePayCheckoutUrl: { table: "assinaturas", column: "abacatePayCheckoutUrl" },
}));
const webhookEventosTable = vi.hoisted(() => ({
  id: { table: "webhook_eventos", column: "id" },
}));

function tableRows(table: unknown) {
  if (table === usuariosTable) return state.users;
  if (table === assinaturasTable) return state.subscriptions;
  if (table === webhookEventosTable) return state.events;
  return [];
}

const db = vi.hoisted(() => ({
  select: vi.fn(() => ({
    from: (table: unknown) => {
      const rows = tableRows(table);
      const query = {
        where: () => query,
        orderBy: () => query,
        limit: async () => rows.slice(0, 1),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
  })),
  insert: vi.fn((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      if (table === assinaturasTable) {
        state.subscriptions.push({ ...values, id: state.nextSubscriptionId++ });
      }
      return ({
      onConflictDoNothing: () => ({
        returning: async () => {
          if (table === webhookEventosTable && state.events.some((event) => event.eventoId === values.eventoId)) return [];
          if (table === webhookEventosTable) {
            const event = { ...values, id: state.events.length + 1 };
            state.events.push(event);
            return [{ id: event.id }];
          }
          if (table === assinaturasTable) {
            return [state.subscriptions[state.subscriptions.length - 1]];
          }
          return [];
        },
      }),
      onConflictDoUpdate: () => ({
        returning: async () => [state.users[0]],
      }),
      returning: async () => {
        return table === assinaturasTable
          ? [state.subscriptions[state.subscriptions.length - 1]]
          : [values];
      },
      });
    },
  })),
  update: vi.fn(() => ({
    set: (values: Record<string, unknown>) => ({
      where: async () => {
        const target = values.status === "PROCESSED" ? state.events[0] : state.subscriptions[0];
        if (target) Object.assign(target, values);
      },
    }),
  })),
  transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(db)),
}));

vi.mock("drizzle-orm", () => ({
  and: (...conditions: unknown[]) => conditions,
  desc: (column: unknown) => column,
  eq: (column: unknown, value: unknown) => ({ column, value }),
  or: (...conditions: unknown[]) => conditions,
}));

vi.mock("@workspace/db", () => ({
  db,
  usuariosTable,
  assinaturasTable,
  webhookEventosTable,
}));

vi.mock("@clerk/express", () => ({
  getAuth: () => ({ userId: state.authUserId }),
  clerkClient: {
    users: {
      getUser: vi.fn(async () => ({
        id: "clerk-user-1",
        fullName: "Pessoa Teste",
        primaryEmailAddress: {
          emailAddress: "pessoa@example.com",
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

vi.mock("@clerk/shared/keys", () => ({ publishableKeyFromHost: () => undefined }));

vi.mock("../src/lib/abacatepay", () => ({
  createPixCharge: vi.fn(async (input: Record<string, unknown>) => {
    const pix = {
      id: `pix_char_${state.providerPixCharges.length + 1}`,
      method: "PIX",
      data: {
        amount: input.amount,
        expiresIn: input.expiresIn,
      },
      amount: input.amount,
      status: "PENDING",
      devMode: true,
      brCode: "000201pix-test-code",
      brCodeBase64: "data:image/png;base64,pix-test",
      expiresAt: "2026-09-17T18:00:00.000Z",
      ...input,
    };
    state.providerPixCharges.push(pix);
    return pix;
  }),
  simulatePixCharge: vi.fn(async (id: string) => ({
    id,
    amount: 990,
    status: "PAID",
    devMode: true,
    brCode: "000201pix-test-code",
    brCodeBase64: "data:image/png;base64,pix-test",
  })),
  cancelSubscription: vi.fn(async (id: string) => {
    state.providerSubscriptions.push(id);
  }),
}));

import billingRouter from "../src/routes/billing";
import webhookRouter from "../src/routes/abacateWebhook";

const billingApp = express();
billingApp.use(express.json());
billingApp.use("/api", billingRouter);

const webhookApp = express();
webhookApp.use(
  "/api/webhooks/abacatepay",
  express.raw({ type: "application/json" }),
  webhookRouter,
);

function webhookRequest(event: Record<string, unknown>) {
  const raw = JSON.stringify(event);
  const signature = crypto.createHmac("sha256", "public-key").update(raw).digest("base64");
  return request(webhookApp)
    .post("/api/webhooks/abacatepay?webhookSecret=webhook-secret")
    .set("Content-Type", "application/json")
    .set("X-Webhook-Signature", signature)
    .send(raw);
}

beforeEach(() => {
  process.env.ABACATEPAY_PRO_PRODUCT_ID = "prod_pro";
  process.env.ABACATEPAY_MASTER_PRODUCT_ID = "prod_master";
  process.env.ABACATEPAY_MONTHLY_PRODUCT_ID = "prod_monthly";
  process.env.ABACATEPAY_ANNUAL_PRODUCT_ID = "prod_yearly";
  process.env.ABACATEPAY_WEBHOOK_SECRET = "webhook-secret";
  process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY = "public-key";
  process.env.ABACATEPAY_RETURN_URL = "https://rachador.example/rachador/planos";
  state.authUserId = "clerk-user-1";
  state.subscriptions.length = 0;
  state.events.length = 0;
  state.providerPixCharges.length = 0;
  state.providerSubscriptions.length = 0;
});

describe("billing endpoints", () => {
  it("rejects unauthenticated checkout", async () => {
    state.authUserId = null;
    const response = await request(billingApp).post("/api/billing/checkout").send({ plan: "PRO" });
    expect(response.status).toBe(401);
  });

  it.each(["PRO", "MASTER"] as const)("creates a server-owned %s PIX checkout", async (plan) => {
    const response = await request(billingApp)
      .post("/api/billing/checkout")
      .send({ plan });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      checkoutUrl: null,
      paymentMethod: "PIX",
      plan,
      pixCode: "000201pix-test-code",
      devMode: true,
    });
    expect(state.providerPixCharges[0]).toMatchObject({
      method: "PIX",
      data: {
        amount: plan === "PRO" ? 999 : 1599,
        expiresIn: 1800,
      },
      externalId: expect.stringContaining("rachador-user-7-"),
      metadata: { userId: "7", clerkUserId: "clerk-user-1", plan },
    });
    expect(state.subscriptions[0]).toMatchObject({ status: "PENDING", plano: plan, cicloCobranca: "one_time" });
  });

  it("creates a new PIX charge after a cancelled payment and reuses a pending PIX charge", async () => {
    state.subscriptions.push({
      id: 1,
      usuarioId: 7,
      status: "CANCELLED",
      plano: "PRO",
      atualizadaEm: new Date(),
    });
    const reused = await request(billingApp).post("/api/billing/checkout").send({ plan: "PRO" });
    expect(reused.status).toBe(201);
    expect(state.providerPixCharges).toHaveLength(1);
    expect(state.providerPixCharges[0]).toMatchObject({ method: "PIX" });

    state.subscriptions.length = 0;
    state.subscriptions.push({
      id: 2,
      usuarioId: 7,
      status: "ACTIVE",
      plano: "PRO",
      abacatePaySubscriptionId: "subs_active",
      atualizadaEm: new Date(),
    });
    const active = await request(billingApp).post("/api/billing/checkout").send({ plan: "PRO" });
    expect(active.status).toBe(409);

    state.subscriptions.length = 0;
    state.subscriptions.push({
      id: 3,
      usuarioId: 7,
      status: "PENDING",
      plano: "PRO",
      abacatePayCheckoutId: "pix_pending",
      abacatePayPixCode: "000201pending",
      abacatePayPixQrCode: "data:image/png;base64,pending",
      abacatePayPixExpiresAt: new Date("2026-09-17T18:00:00.000Z"),
      atualizadaEm: new Date(),
    });
    const pending = await request(billingApp).post("/api/billing/checkout").send({ plan: "PRO" });
    expect(pending.status).toBe(200);
    expect(pending.body).toMatchObject({
      checkoutId: "pix_pending",
      checkoutUrl: null,
      paymentMethod: "PIX",
      plan: "PRO",
      pixCode: "000201pending",
    });
  });

  it("simulates a pending Dev mode PIX payment", async () => {
    state.subscriptions.push({
      id: 4,
      usuarioId: 7,
      status: "PENDING",
      plano: "PRO",
      abacatePayCheckoutId: "pix_pending",
      atualizadaEm: new Date(),
    });
    const response = await request(billingApp)
      .post("/api/billing/pix/simulate")
      .send({ checkoutId: "pix_pending" });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ checkoutId: "pix_pending", status: "PAID" });
  });

  it("calls provider cancellation without downgrading locally", async () => {
    state.subscriptions.push({
      id: 1,
      usuarioId: 7,
      status: "ACTIVE",
      plano: "PRO",
      abacatePaySubscriptionId: "subs_1",
      atualizadaEm: new Date(),
    });
    const response = await request(billingApp).post("/api/billing/cancel").send({});
    expect(response.status).toBe(200);
    expect(state.providerSubscriptions).toEqual(["subs_1"]);
    expect(state.subscriptions[0].status).toBe("ACTIVE");
  });
});

describe("AbacatePay webhook", () => {
  const completedEvent = {
    id: "log_1",
    apiVersion: 2,
    event: "subscription.completed",
    data: {
      subscription: {
        id: "subs_1",
        customerId: "cust_1",
        metadata: { userId: "7", clerkUserId: "clerk-user-1", billingCycle: "monthly" },
        items: [{ id: "prod_monthly", quantity: 1 }],
      },
    },
  };

  it("rejects invalid secret or signature", async () => {
    const response = await request(webhookApp)
      .post("/api/webhooks/abacatepay?webhookSecret=wrong")
      .set("Content-Type", "application/json")
      .set("X-Webhook-Signature", "bad")
      .send(JSON.stringify(completedEvent));
    expect(response.status).toBe(401);
  });

  it("does not accept a hex digest or sha256-prefixed signature", async () => {
    const raw = JSON.stringify(completedEvent);
    const hex = crypto.createHmac("sha256", "public-key").update(raw).digest("hex");
    const response = await request(webhookApp)
      .post("/api/webhooks/abacatepay?webhookSecret=webhook-secret")
      .set("Content-Type", "application/json")
      .set("X-Webhook-Signature", `sha256=${hex}`)
      .send(raw);
    expect(response.status).toBe(401);
  });

  it("grants Pro only for a verified completed event and ignores duplicates", async () => {
    const first = await webhookRequest(completedEvent);
    const second = await webhookRequest(completedEvent);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(state.events).toHaveLength(1);
    expect(state.subscriptions[0]).toMatchObject({
      usuarioId: 7,
      status: "ACTIVE",
      abacatePaySubscriptionId: "subs_1",
      abacatePayProductId: "prod_monthly",
    });
  });

  it("matches the configured product from checkout.items in the v2 payload", async () => {
    const event = {
      ...completedEvent,
      id: "log_checkout_items",
      data: {
        subscription: {
          id: "subs_checkout_items",
          customerId: "cust_1",
          metadata: { userId: "7", clerkUserId: "clerk-user-1" },
        },
        checkout: {
          id: "bill_checkout_items",
          customerId: "cust_1",
          metadata: { billingCycle: "yearly" },
          items: [{ id: "prod_yearly", quantity: 1 }],
        },
      },
    };
    const response = await webhookRequest(event);
    expect(response.status).toBe(200);
    expect(state.subscriptions[0]).toMatchObject({
      status: "ACTIVE",
      abacatePayProductId: "prod_yearly",
      cicloCobranca: "yearly",
    });
  });

  it("activates the selected MASTER plan from a transparent PIX webhook", async () => {
    const event = {
      id: "log_transparent_master",
      apiVersion: 2,
      event: "transparent.completed",
      data: {
        transparent: {
          id: "pix_master_1",
          externalId: "rachador-user-7-transparent-master",
          metadata: { userId: "7", clerkUserId: "clerk-user-1", plan: "MASTER" },
          brCode: "000201master",
          brCodeBase64: "data:image/png;base64,master",
          expiresAt: "2026-09-17T18:00:00.000Z",
        },
      },
    };
    const response = await webhookRequest(event);
    expect(response.status).toBe(200);
    expect(state.subscriptions[0]).toMatchObject({
      status: "ACTIVE",
      plano: "MASTER",
      cicloCobranca: "one_time",
      abacatePayCheckoutId: "pix_master_1",
    });
  });
});
