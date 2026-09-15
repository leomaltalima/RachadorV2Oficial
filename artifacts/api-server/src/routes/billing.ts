import { Router } from "express";
import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { assinaturasTable, db } from "@workspace/db";
import {
  BILLING_PLANS,
  getBillingRow,
  isProSubscription,
  toBillingSummary,
  updateCancellation,
} from "../billing";
import { getUncachableStripeClient } from "../stripeClient";

const router = Router();
const checkoutSchema = z.object({ interval: z.enum(["monthly", "yearly"]) });

function requireUser(req: Request, res: Response) {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Faça login para gerenciar sua assinatura." });
    return null;
  }
  return userId;
}

function requestOrigin(req: any) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  const host = req.headers.host;
  return host ? `${forwardedProto}://${host}` : process.env.PUBLIC_APP_URL || "http://localhost";
}

router.get("/billing/plans", (_req, res) => {
  const monthly = BILLING_PLANS.pro.monthlyPriceCents;
  const yearly = BILLING_PLANS.pro.yearlyPriceCents;
  res.json({
    free: BILLING_PLANS.free,
    pro: BILLING_PLANS.pro,
    savingsCents: monthly * 12 - yearly,
    savingsPercent: Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100),
  });
});

router.get("/billing/me", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const row = await getBillingRow(userId);
  res.json(toBillingSummary(row));
});

router.post("/billing/checkout", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Escolha um plano mensal ou anual." });
    return;
  }

  const row = await getBillingRow(userId);
  if (isProSubscription(row)) {
    res.status(409).json({ error: "Você já possui o Rachador Pro." });
    return;
  }
  const priceId = parsed.data.interval === "monthly" ? process.env.STRIPE_PRICE_MONTHLY_ID : process.env.STRIPE_PRICE_YEARLY_ID;
  if (!priceId) {
    res.status(503).json({ error: "Os preços do Stripe ainda não foram configurados." });
    return;
  }

  const stripe = await getUncachableStripeClient();
  let customerId = row.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ metadata: { clerkUserId: userId } });
    customerId = customer.id;
    // The webhook is the source of subscription status; this only stores the relationship.
    await db
      .update(assinaturasTable)
      .set({ stripeCustomerId: customerId, atualizadoEm: new Date() })
      .where(eq(assinaturasTable.clerkUserId, userId));
  }

  const origin = requestOrigin(req);
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/?billing=success`,
    cancel_url: `${origin}/?billing=cancelled`,
    metadata: { clerkUserId: userId, plan: "pro", interval: parsed.data.interval },
    subscription_data: { metadata: { clerkUserId: userId, plan: "pro", interval: parsed.data.interval } },
    allow_promotion_codes: true,
  });
  console.info("[billing_event]", { event: "checkout_started", clerkUserId: userId, interval: parsed.data.interval });
  res.json({ url: session.url });
});

router.post("/billing/portal", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const row = await getBillingRow(userId);
  if (!row.stripeCustomerId) {
    res.status(409).json({ error: "Nenhuma assinatura Stripe encontrada." });
    return;
  }
  const stripe = await getUncachableStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: `${requestOrigin(req)}/`,
  });
  res.json({ url: session.url });
});

router.post("/billing/cancel", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const row = await getBillingRow(userId);
  if (!row.stripeSubscriptionId || !isProSubscription(row)) {
    res.status(409).json({ error: "Nenhuma assinatura ativa para cancelar." });
    return;
  }
  const stripe = await getUncachableStripeClient();
  const subscription = await stripe.subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: true });
  await updateCancellation(userId, subscription.cancel_at_period_end);
  res.json(toBillingSummary(await getBillingRow(userId)));
});

router.post("/billing/reactivate", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const row = await getBillingRow(userId);
  if (!row.stripeSubscriptionId || !isProSubscription(row)) {
    res.status(409).json({ error: "Nenhuma assinatura ativa para reativar." });
    return;
  }
  const stripe = await getUncachableStripeClient();
  const subscription = await stripe.subscriptions.update(row.stripeSubscriptionId, { cancel_at_period_end: false });
  await updateCancellation(userId, subscription.cancel_at_period_end);
  res.json(toBillingSummary(await getBillingRow(userId)));
});

export default router;