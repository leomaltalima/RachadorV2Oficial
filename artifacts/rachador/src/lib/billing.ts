export type BillingSummary = {
  plan: "free" | "pro";
  planName: string;
  status: string;
  interval: "monthly" | "yearly" | null;
  stripeCustomerId: string | null;
  subscriptionId: string | null;
  startedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  usage: { used: number; limit: number | null; remaining: number | null; period: string };
};

export type BillingPlans = {
  free: { name: string; benefits: string[] };
  pro: { name: string; monthlyPriceCents: number; yearlyPriceCents: number; benefits: string[] };
  savingsCents: number;
  savingsPercent: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: "include", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
  return data as T;
}

export function getBillingSummary() {
  return request<BillingSummary>("/api/billing/me");
}

export function getBillingPlans() {
  return request<BillingPlans>("/api/billing/plans");
}

export function startCheckout(interval: "monthly" | "yearly") {
  return request<{ url: string }>("/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interval }),
  });
}

export function openBillingPortal() {
  return request<{ url: string }>("/api/billing/portal", { method: "POST" });
}

export function cancelSubscription() {
  return request<BillingSummary>("/api/billing/cancel", { method: "POST" });
}

export function reactivateSubscription() {
  return request<BillingSummary>("/api/billing/reactivate", { method: "POST" });
}