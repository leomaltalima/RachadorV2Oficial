import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { assinaturasTable, db, type Assinatura } from "@workspace/db";

export const FREE_AI_LIMIT = 3;

export const BILLING_PLANS = {
  free: {
    id: "free",
    name: "Rachador Free",
    benefits: ["Grupos e participantes", "Despesas manuais", "Divisão manual", "3 divisões automáticas por mês"],
  },
  pro: {
    id: "pro",
    name: "Rachador Pro",
    monthlyPriceCents: 990,
    yearlyPriceCents: 7990,
    benefits: ["Tudo do plano Free", "IA por voz", "Foto de nota fiscal", "Divisões automáticas sem limite gratuito"],
  },
} as const;

export type BillingInterval = "monthly" | "yearly";

export function usagePeriod(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function ensureBillingRow(clerkUserId: string): Promise<void> {
  await db
    .insert(assinaturasTable)
    .values({ clerkUserId })
    .onConflictDoNothing({ target: assinaturasTable.clerkUserId });
}

export function isProSubscription(row: Assinatura): boolean {
  return row.plano === "pro" && ["active", "trialing"].includes(row.status);
}

export async function getBillingRow(clerkUserId: string): Promise<Assinatura> {
  await ensureBillingRow(clerkUserId);
  const [row] = await db
    .select()
    .from(assinaturasTable)
    .where(eq(assinaturasTable.clerkUserId, clerkUserId));
  if (!row) throw new Error("Não foi possível inicializar a assinatura.");
  return row;
}

export function toBillingSummary(row: Assinatura) {
  const pro = isProSubscription(row);
  const usagePeriodNow = usagePeriod();
  const used = row.aiUsoPeriodo === usagePeriodNow ? row.aiUsoMes : 0;
  return {
    plan: pro ? "pro" : "free",
    planName: pro ? BILLING_PLANS.pro.name : BILLING_PLANS.free.name,
    status: row.status,
    interval: row.intervalo,
    stripeCustomerId: row.stripeCustomerId,
    subscriptionId: row.stripeSubscriptionId,
    startedAt: row.inicioEm,
    currentPeriodStart: row.periodoAtualInicioEm,
    currentPeriodEnd: row.periodoAtualFimEm,
    cancelAtPeriodEnd: row.cancelamentoAgendado,
    usage: {
      used,
      limit: pro ? null : FREE_AI_LIMIT,
      remaining: pro ? null : Math.max(0, FREE_AI_LIMIT - used),
      period: usagePeriodNow,
    },
  };
}

/**
 * Atomically reserves one shared AI use for voice or receipt scanning.
 * The database decides access; the client cannot increment or reset this value.
 */
export async function reserveAiUse(clerkUserId: string, feature: "voice" | "receipt") {
  await ensureBillingRow(clerkUserId);
  const period = usagePeriod();
  const result = await db.execute(sql`
    UPDATE assinaturas
    SET
      ai_uso_mes = CASE WHEN ai_uso_periodo <> ${period} THEN 1 ELSE ai_uso_mes + 1 END,
      ai_uso_periodo = ${period},
      atualizado_em = NOW()
    WHERE clerk_user_id = ${clerkUserId}
      AND (
        (plano = 'pro' AND status IN ('active', 'trialing'))
        OR (plano = 'free' AND (ai_uso_periodo <> ${period} OR ai_uso_mes < ${FREE_AI_LIMIT}))
      )
    RETURNING clerk_user_id
  `);
  const allowed = result.rows.length > 0;
  const row = await getBillingRow(clerkUserId);
  const summary = toBillingSummary(row);

  console.info("[billing_event]", {
    event: allowed ? feature === "voice" ? "ai_voice_used" : "receipt_scan_used" : "free_ai_limit_reached",
    clerkUserId,
    allowed,
  });

  return { allowed, summary };
}

export async function upsertSubscription(params: {
  clerkUserId: string;
  customerId: string;
  subscriptionId: string;
  status: string;
  interval: string | null;
  start: Date | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}) {
  await db
    .insert(assinaturasTable)
    .values({
      clerkUserId: params.clerkUserId,
      stripeCustomerId: params.customerId,
      stripeSubscriptionId: params.subscriptionId,
      plano: "pro",
      status: params.status,
      intervalo: params.interval,
      inicioEm: params.start,
      periodoAtualInicioEm: params.periodStart,
      periodoAtualFimEm: params.periodEnd,
      cancelamentoAgendado: params.cancelAtPeriodEnd,
      atualizadoEm: new Date(),
    })
    .onConflictDoUpdate({
      target: assinaturasTable.clerkUserId,
      set: {
        stripeCustomerId: params.customerId,
        stripeSubscriptionId: params.subscriptionId,
        plano: "pro",
        status: params.status,
        intervalo: params.interval,
        inicioEm: params.start,
        periodoAtualInicioEm: params.periodStart,
        periodoAtualFimEm: params.periodEnd,
        cancelamentoAgendado: params.cancelAtPeriodEnd,
        atualizadoEm: new Date(),
      },
    });
}

export async function markSubscriptionCanceled(subscriptionId: string) {
  await db
    .update(assinaturasTable)
    .set({
      plano: "free",
      status: "canceled",
      cancelamentoAgendado: false,
      atualizadoEm: new Date(),
    })
    .where(eq(assinaturasTable.stripeSubscriptionId, subscriptionId));
}

export async function markPaymentFailed(subscriptionId: string) {
  await db
    .update(assinaturasTable)
    .set({ status: "past_due", atualizadoEm: new Date() })
    .where(eq(assinaturasTable.stripeSubscriptionId, subscriptionId));
}

export async function updateCancellation(clerkUserId: string, cancelAtPeriodEnd: boolean) {
  await db
    .update(assinaturasTable)
    .set({ cancelamentoAgendado: cancelAtPeriodEnd, atualizadoEm: new Date() })
    .where(and(eq(assinaturasTable.clerkUserId, clerkUserId), eq(assinaturasTable.plano, "pro")));
}