import { Router } from "express";
import crypto from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { z } from "zod/v4";
import {
  assinaturasTable,
  db,
  usuariosTable,
} from "@workspace/db";
import {
  cancelSubscription,
  createPixCharge,
  simulatePixCharge,
  type BillingPlan,
} from "../lib/abacatepay";
import { syncAuthenticatedUser } from "../userDirectory";

const router = Router();
const checkoutSchema = z.object({ plan: z.enum(["PRO", "MASTER"]) });
const PLAN_PRICES: Record<BillingPlan, number> = { PRO: 999, MASTER: 1599 };
const PLAN_NAMES: Record<BillingPlan, string> = { PRO: "Rachador PRO", MASTER: "Rachador Master" };

router.get("/billing/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Faça login para consultar sua assinatura." });
    return;
  }
  const user = await syncAuthenticatedUser(userId);
  const subscriptions = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.usuarioId, user.id))
    .orderBy(desc(assinaturasTable.atualizadaEm));
  const subscription = subscriptions[0];
  const pendingSubscription = subscriptions.find((item) => item.status === "PENDING");

  const active = subscription?.status === "ACTIVE";
  const currentPlan = active && subscription?.plano === "MASTER"
    ? "MASTER"
    : active
      ? "PRO"
      : "FREE";
  res.json({
    plan: currentPlan,
    pendingPlan: pendingSubscription?.plano === "MASTER"
      ? "MASTER"
      : pendingSubscription?.plano === "PRO"
        ? "PRO"
        : null,
    status: subscription?.status ?? "FREE",
    billingCycle: subscription?.cicloCobranca ?? null,
    amount: active && (subscription?.plano === "MASTER" || subscription?.plano === "PRO")
      ? PLAN_PRICES[subscription.plano] / 100
      : null,
    startedAt: subscription?.iniciadaEm ?? null,
    nextBillingAt: subscription?.proximaCobrancaEm ?? null,
    canceledAt: subscription?.canceladaEm ?? null,
    checkoutId: subscription?.abacatePayCheckoutId ?? null,
    paymentMethod: subscription?.abacatePayPixCode ? "PIX" : null,
    pixCode: subscription?.abacatePayPixCode ?? null,
    pixQrCode: subscription?.abacatePayPixQrCode ?? null,
    pixExpiresAt: subscription?.abacatePayPixExpiresAt ?? null,
  });
});

router.post("/billing/checkout", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Faça login para escolher um plano." });
    return;
  }
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escolha um plano válido: PRO ou MASTER." });
    return;
  }

  try {
    const user = await syncAuthenticatedUser(userId);
    if (!user.email) {
      res.status(422).json({ error: "Cadastre um e-mail na sua conta antes de escolher um plano." });
      return;
    }

    const subscriptions = await db
      .select()
      .from(assinaturasTable)
      .where(eq(assinaturasTable.usuarioId, user.id))
      .orderBy(desc(assinaturasTable.atualizadaEm));
    const activeSubscription = subscriptions.find((item) => item.status === "ACTIVE");
    const plan = parsed.data.plan as BillingPlan;
    if (activeSubscription) {
      res.status(409).json({ error: "Você já possui um plano pago ativo." });
      return;
    }
    const pendingSubscription = subscriptions.find(
      (item) => item.status === "PENDING" && item.plano === plan,
    );
    if (pendingSubscription?.abacatePayCheckoutId && pendingSubscription.abacatePayPixCode) {
      res.status(200).json({
        checkoutId: pendingSubscription.abacatePayCheckoutId,
        checkoutUrl: null,
        paymentMethod: "PIX",
        plan,
        pixCode: pendingSubscription.abacatePayPixCode,
        pixQrCode: pendingSubscription.abacatePayPixQrCode,
        pixExpiresAt: pendingSubscription.abacatePayPixExpiresAt,
        devMode: true,
      });
      return;
    }

    const externalId = `rachador-user-${user.id}-${crypto.randomUUID()}`;
    const metadata = {
      userId: String(user.id),
      clerkUserId: user.clerkUserId ?? userId,
      plan,
    };
    const pix = await createPixCharge({
      amount: PLAN_PRICES[plan],
      description: PLAN_NAMES[plan],
      expiresIn: 1800,
      externalId,
      metadata,
    });

    await db.insert(assinaturasTable).values({
      usuarioId: user.id,
      plano: plan,
      status: "PENDING",
      cicloCobranca: "one_time",
      abacatePayCheckoutId: pix.id,
      abacatePayPixCode: pix.brCode,
      abacatePayPixQrCode: pix.brCodeBase64,
      abacatePayPixExpiresAt: pix.expiresAt ? new Date(pix.expiresAt) : null,
      abacatePayProductId: plan.toLowerCase(),
      externalId,
      atualizadaEm: new Date(),
    });

    res.status(201).json({
      checkoutUrl: null,
      checkoutId: pix.id,
      plan,
      paymentMethod: "PIX",
      pixCode: pix.brCode,
      pixQrCode: pix.brCodeBase64,
      pixExpiresAt: pix.expiresAt ?? null,
      devMode: pix.devMode ?? true,
    });
  } catch (error) {
    req.log.error({ err: error }, "Falha ao criar checkout AbacatePay");
    const providerMessage = error instanceof Error ? error.message : "";
    if (/not available for this store/i.test(providerMessage)) {
      res.status(503).json({
        error: "O PIX ainda não está habilitado nesta loja da AbacatePay. Ative o PIX no ambiente de testes e tente novamente.",
      });
      return;
    }
    res.status(502).json({ error: "Não foi possível iniciar o checkout. Tente novamente." });
  }
});

router.post("/billing/pix/simulate", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Faça login para simular o pagamento PIX." });
    return;
  }
  const parsed = z.object({ checkoutId: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Identificador de cobrança PIX inválido." });
    return;
  }

  try {
    const user = await syncAuthenticatedUser(userId);
    const [pendingSubscription] = await db
      .select()
      .from(assinaturasTable)
      .where(and(
        eq(assinaturasTable.usuarioId, user.id),
        eq(assinaturasTable.abacatePayCheckoutId, parsed.data.checkoutId),
        eq(assinaturasTable.status, "PENDING"),
      ))
      .limit(1);
    if (!pendingSubscription) {
      res.status(404).json({ error: "Cobrança PIX pendente não encontrada." });
      return;
    }

    const pix = await simulatePixCharge(parsed.data.checkoutId);
    res.json({ checkoutId: pix.id, status: pix.status });
  } catch (error) {
    req.log.error({ err: error }, "Falha ao simular pagamento PIX AbacatePay");
    res.status(502).json({ error: "Não foi possível simular o pagamento PIX." });
  }
});

router.post("/billing/cancel", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Faça login para cancelar sua assinatura." });
    return;
  }
  try {
    const user = await syncAuthenticatedUser(userId);
    const subscriptions = await db
      .select()
      .from(assinaturasTable)
      .where(and(eq(assinaturasTable.usuarioId, user.id), eq(assinaturasTable.status, "ACTIVE")))
      .orderBy(desc(assinaturasTable.atualizadaEm))
    const subscription = subscriptions[0];
    if (!subscription?.abacatePaySubscriptionId) {
      res.status(404).json({ error: "Nenhuma assinatura ativa encontrada." });
      return;
    }

    await cancelSubscription(subscription.abacatePaySubscriptionId);
    res.json({ status: "cancellation_requested" });
  } catch (error) {
    req.log.error({ err: error }, "Falha ao cancelar assinatura AbacatePay");
    res.status(502).json({ error: "Não foi possível solicitar o cancelamento. Tente novamente." });
  }
});

export default router;
