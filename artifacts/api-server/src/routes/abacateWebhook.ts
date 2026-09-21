import crypto from "node:crypto";
import { Router, type Request } from "express";
import { and, eq, or } from "drizzle-orm";
import {
  assinaturasTable,
  db,
  usuariosTable,
  webhookEventosTable,
} from "@workspace/db";

const router = Router();
const EVENTS = new Set([
  "transparent.completed",
  "transparent.refunded",
  "transparent.disputed",
  "transparent.lost",
  "subscription.completed",
  "subscription.renewed",
  "subscription.cancelled",
  "subscription.payment_failed",
  "subscription.trial_started",
]);

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
  const key = process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY;
  if (!key || !signature) return false;
  const expected = crypto.createHmac("sha256", key).update(rawBody).digest("base64");
  return safeEqual(signature, expected);
}

function recordValues(event: Record<string, unknown>) {
  const data = (event.data && typeof event.data === "object" ? event.data : {}) as Record<string, any>;
  const subscription = (data.subscription ?? {}) as Record<string, any>;
  const transparent = (data.transparent ?? data.pix ?? {}) as Record<string, any>;
  const checkout = (data.checkout ?? subscription.checkout ?? transparent ?? {}) as Record<string, any>;
  const customer = (data.customer ?? subscription.customer ?? {}) as Record<string, any>;
  const checkoutCustomer = checkout.customer;
  const subscriptionCustomer = subscription.customer;
  const metadata = {
    ...((checkout.metadata && typeof checkout.metadata === "object" ? checkout.metadata : {}) as Record<string, unknown>),
    ...((subscription.metadata && typeof subscription.metadata === "object" ? subscription.metadata : {}) as Record<string, unknown>),
    ...((transparent.metadata && typeof transparent.metadata === "object" ? transparent.metadata : {}) as Record<string, unknown>),
    ...((checkoutCustomer?.metadata && typeof checkoutCustomer.metadata === "object"
      ? checkoutCustomer.metadata
      : {}) as Record<string, unknown>),
  };
  const items = [
    ...(Array.isArray(subscription.items) ? subscription.items : []),
    ...(Array.isArray(checkout.items) ? checkout.items : []),
  ] as Array<Record<string, unknown>>;
  const productIds = [...new Set(items.map((item) => String(item.id ?? "")).filter(Boolean))];
  const directProductId = String(subscription.productId ?? checkout.productId ?? "");
  if (directProductId) productIds.push(directProductId);
  const externalId = String(transparent.externalId ?? subscription.externalId ?? checkout.externalId ?? metadata.externalId ?? "");
  const customerId = String(
    subscription.customerId ??
      checkout.customerId ??
      (typeof subscriptionCustomer === "string" ? subscriptionCustomer : subscriptionCustomer?.id) ??
      (typeof checkoutCustomer === "string" ? checkoutCustomer : checkoutCustomer?.id) ??
      customer.id ??
      "",
  );
  const subscriptionId = String(subscription.id ?? "");
  const checkoutId = String(transparent.id ?? checkout.id ?? "");
  const localUserId = Number(metadata.userId);
  const clerkUserId = String(metadata.clerkUserId ?? "");
  return {
    data,
    subscription,
    checkout,
    transparent,
    metadata,
    productIds,
    externalId,
    customerId,
    subscriptionId,
    checkoutId,
    localUserId: Number.isInteger(localUserId) && localUserId > 0 ? localUserId : null,
    clerkUserId,
  };
}

function configuredProductIds() {
  return [
    process.env.ABACATEPAY_PRO_PRODUCT_ID,
    process.env.ABACATEPAY_MASTER_PRODUCT_ID,
    process.env.ABACATEPAY_MONTHLY_PRODUCT_ID,
    process.env.ABACATEPAY_ANNUAL_PRODUCT_ID,
  ].filter((value): value is string => Boolean(value));
}

async function processEvent(tx: any, event: Record<string, unknown>) {
  const eventName = String(event.event ?? "");
  if (!EVENTS.has(eventName)) return;
  const values = recordValues(event);
  const validProducts = configuredProductIds();

  const userConditions = [];
  if (values.localUserId) userConditions.push(eq(usuariosTable.id, values.localUserId));
  if (values.clerkUserId) userConditions.push(eq(usuariosTable.clerkUserId, values.clerkUserId));
  const [matchedUser] = userConditions.length
    ? await tx.select({ id: usuariosTable.id }).from(usuariosTable).where(or(...userConditions)).limit(1)
    : [];

  const identityConditions = [
    values.subscriptionId ? eq(assinaturasTable.abacatePaySubscriptionId, values.subscriptionId) : null,
    values.checkoutId ? eq(assinaturasTable.abacatePayCheckoutId, values.checkoutId) : null,
    values.externalId ? eq(assinaturasTable.externalId, values.externalId) : null,
    values.customerId ? eq(assinaturasTable.abacatePayCustomerId, values.customerId) : null,
  ].filter((condition): condition is NonNullable<typeof condition> => condition !== null);
  const [existing] = identityConditions.length
    ? await tx.select().from(assinaturasTable).where(or(...identityConditions)).limit(1)
    : [];
  if (!matchedUser && !existing) return;
  if (!validProducts.includes(values.productIds[0] ?? "") && !existing && !values.externalId) return;
  const resolvedUser = matchedUser ?? (existing ? { id: existing.usuarioId } : null);
  if (!resolvedUser) return;

  const productId = values.productIds.find((id) => validProducts.includes(id))
    ?? existing?.abacatePayProductId
    ?? (values.metadata.plan === "MASTER"
      ? process.env.ABACATEPAY_MASTER_PRODUCT_ID
      : values.metadata.billingCycle === "yearly"
      ? process.env.ABACATEPAY_ANNUAL_PRODUCT_ID
      : process.env.ABACATEPAY_MONTHLY_PRODUCT_ID)
    ?? validProducts[0]
    ?? (values.metadata.plan === "MASTER" ? "master" : "pro");
  const isTransparent = eventName.startsWith("transparent.");
  const plan = values.metadata.plan === "MASTER"
    || existing?.plano === "MASTER"
    || productId === process.env.ABACATEPAY_MASTER_PRODUCT_ID
    ? "MASTER"
    : "PRO";
  const cycle = isTransparent
    ? "one_time"
    : values.metadata.billingCycle === "yearly" || productId === process.env.ABACATEPAY_ANNUAL_PRODUCT_ID
      ? "yearly"
      : "monthly";
  const status = eventName === "subscription.completed" || eventName === "subscription.renewed" || eventName === "transparent.completed"
    ? "ACTIVE"
    : eventName === "subscription.cancelled" || eventName === "transparent.refunded" || eventName === "transparent.disputed" || eventName === "transparent.lost"
      ? "CANCELLED"
      : eventName === "subscription.payment_failed"
        ? "PAST_DUE"
        : "TRIALING";
  const nextBilling = values.subscription.nextBillingAt ?? values.subscription.nextBillingDate;
  const update = {
    usuarioId: resolvedUser.id,
    plano: plan,
    status,
    cicloCobranca: cycle,
    abacatePayCustomerId: values.customerId || existing?.abacatePayCustomerId,
    abacatePaySubscriptionId: values.subscriptionId || existing?.abacatePaySubscriptionId,
    abacatePayCheckoutId: values.checkoutId || existing?.abacatePayCheckoutId,
    abacatePayCheckoutUrl: String(values.checkout.url ?? "") || existing?.abacatePayCheckoutUrl,
    abacatePayPixCode: String(values.transparent.brCode ?? "") || existing?.abacatePayPixCode,
    abacatePayPixQrCode: String(values.transparent.brCodeBase64 ?? "") || existing?.abacatePayPixQrCode,
    abacatePayPixExpiresAt: values.transparent.expiresAt ? new Date(values.transparent.expiresAt) : existing?.abacatePayPixExpiresAt,
    abacatePayProductId: productId,
    externalId: values.externalId || existing?.externalId,
    iniciadaEm: status === "ACTIVE" && !existing?.iniciadaEm ? new Date() : existing?.iniciadaEm,
    canceladaEm: status === "CANCELLED" ? new Date() : existing?.canceladaEm,
    proximaCobrancaEm: nextBilling ? new Date(nextBilling) : existing?.proximaCobrancaEm,
    atualizadaEm: new Date(),
  };

  if (existing) {
    await tx.update(assinaturasTable).set(update).where(eq(assinaturasTable.id, existing.id));
  } else {
    await tx.insert(assinaturasTable).values(update);
  }
}

router.post("/", async (req: Request, res) => {
  const providedSecret = String(req.query.webhookSecret ?? "");
  if (!process.env.ABACATEPAY_WEBHOOK_SECRET || !safeEqual(providedSecret, process.env.ABACATEPAY_WEBHOOK_SECRET)) {
    res.status(401).json({ error: "Webhook secret inválido." });
    return;
  }
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from("");
  if (!verifySignature(rawBody, req.header("X-Webhook-Signature"))) {
    res.status(401).json({ error: "Assinatura do webhook inválida." });
    return;
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    res.status(400).json({ error: "Payload JSON inválido." });
    return;
  }
  if (
    (event.apiVersion !== 2 && event.apiVersion !== "2") ||
    typeof event.id !== "string" ||
    typeof event.event !== "string"
  ) {
    res.status(400).json({ error: "Evento AbacatePay v2 inválido." });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [stored] = await tx
        .insert(webhookEventosTable)
        .values({
          provedor: "abacatepay",
          eventoId: event.id as string,
          evento: event.event as string,
          status: "PROCESSING",
          payload: event,
        })
        .onConflictDoNothing()
        .returning({ id: webhookEventosTable.id });
      if (!stored) return;

      await processEvent(tx, event);
      await tx.update(webhookEventosTable).set({
        status: "PROCESSED",
        processadoEm: new Date(),
      }).where(eq(webhookEventosTable.id, stored.id));
    });
    res.status(200).json({ received: true });
  } catch (error) {
    req.log.error({ err: error }, "Falha ao processar webhook AbacatePay");
    res.status(500).json({ error: "Não foi possível processar o webhook." });
  }
});

export default router;
