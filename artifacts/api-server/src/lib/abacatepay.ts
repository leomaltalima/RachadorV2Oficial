const ABACATEPAY_API_URL = "https://api.abacatepay.com/v2";

export type BillingPlan = "PRO" | "MASTER";

type ProviderResponse<T> = {
  data?: T;
  success?: boolean;
  error?: unknown;
};

export type AbacateCustomer = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type AbacateCheckout = {
  id: string;
  url: string;
  externalId?: string | null;
  customerId?: string | null;
  items?: Array<{ id: string; quantity: number }>;
  amount?: number | null;
};

export type AbacateSubscription = {
  id: string;
  customerId?: string | null;
  externalId?: string | null;
  metadata?: Record<string, unknown> | null;
  items?: Array<{ id: string; quantity: number }>;
  status?: string | null;
  nextBillingAt?: string | null;
  nextBillingDate?: string | null;
};

export type AbacatePixCharge = {
  id: string;
  amount: number;
  status: string;
  devMode?: boolean;
  brCode: string;
  brCodeBase64: string;
  createdAt?: string;
  updatedAt?: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown> | null;
};

function getApiKey(): string {
  const key = process.env.ABACATEPAY_API_KEY;
  if (!key) throw new Error("ABACATEPAY_API_KEY não configurada.");
  return key;
}

async function request<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${ABACATEPAY_API_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as ProviderResponse<T> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`AbacatePay: ${detail}`);
  }
  return payload.data;
}

async function requestGet<T>(path: string): Promise<T> {
  const response = await fetch(`${ABACATEPAY_API_URL}${path}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      "Content-Type": "application/json",
    },
  });
  const payload = (await response.json().catch(() => null)) as ProviderResponse<T> | null;
  if (!response.ok || !payload?.success || !payload.data) {
    const detail = typeof payload?.error === "string" ? payload.error : `HTTP ${response.status}`;
    throw new Error(`AbacatePay: ${detail}`);
  }
  return payload.data;
}

export function createPixCharge(input: {
  amount: number;
  externalId: string;
  description: string;
  expiresIn: number;
  metadata: Record<string, string>;
}): Promise<AbacatePixCharge> {
  return request<AbacatePixCharge>("/transparents/create", {
    method: "PIX",
    data: {
      amount: input.amount,
      expiresIn: input.expiresIn,
      description: input.description,
      externalId: input.externalId,
      metadata: input.metadata,
    },
  });
}

export function getPixChargeStatus(id: string): Promise<Pick<AbacatePixCharge, "id" | "status" | "expiresAt">> {
  return requestGet(`/transparents/check?id=${encodeURIComponent(id)}`);
}

export function simulatePixCharge(id: string): Promise<AbacatePixCharge> {
  return request<AbacatePixCharge>(`/transparents/simulate-payment?id=${encodeURIComponent(id)}`, {});
}

export function createCustomer(input: {
  email: string;
  name: string;
  metadata: Record<string, string>;
}): Promise<AbacateCustomer> {
  return request<AbacateCustomer>("/customers/create", input);
}

export function createSubscription(input: {
  items: [{ id: string; quantity: 1 }];
  customerId: string;
  methods: ["CARD"];
  externalId: string;
  metadata: Record<string, string>;
  returnUrl?: string;
  completionUrl?: string;
}): Promise<AbacateCheckout> {
  return request<AbacateCheckout>("/subscriptions/create", input);
}

export function cancelSubscription(id: string): Promise<unknown> {
  return request<unknown>("/subscriptions/cancel", { id });
}
