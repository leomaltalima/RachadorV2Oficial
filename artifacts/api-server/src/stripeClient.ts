import Stripe from "stripe";
import { StripeSync, runMigrations } from "stripe-replit-sync";

type StripeCredentials = {
  secretKey: string;
  webhookSecret?: string;
};

async function getStripeCredentials(): Promise<StripeCredentials> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? `repl ${process.env.REPL_IDENTITY}`
    : process.env.WEB_REPL_RENEWAL
      ? `depl ${process.env.WEB_REPL_RENEWAL}`
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("A conexão Stripe do Replit não está disponível neste ambiente.");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=stripe`,
    {
      headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Não foi possível obter a conexão Stripe: ${response.status}`);
  }

  const data = (await response.json()) as {
    items?: Array<{ settings?: { secret_key?: string; webhook_secret?: string } }>;
  };
  const settings = data.items?.[0]?.settings;
  if (!settings?.secret_key) {
    throw new Error("A conexão Stripe não possui uma chave secreta configurada.");
  }

  return {
    secretKey: settings.secret_key,
    webhookSecret: settings.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET,
  };
}

export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey);
}

export async function getStripeWebhookSecret(): Promise<string> {
  const { webhookSecret } = await getStripeCredentials();
  if (!webhookSecret) {
    throw new Error("O segredo de assinatura do webhook Stripe não está configurado.");
  }
  return webhookSecret;
}

export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL é obrigatória para sincronizar Stripe.");

  const { secretKey, webhookSecret } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl },
    stripeSecretKey: secretKey,
    stripeWebhookSecret: webhookSecret ?? "",
  });
}

export async function initializeStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  await runMigrations({ databaseUrl });
  const sync = await getStripeSync();
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0] || process.env.REPLIT_DEV_DOMAIN;
  if (domain) {
    await sync.findOrCreateManagedWebhook(`https://${domain}/api/stripe/webhook`, {
      enabled_events: ["*"],
      description: "Rachador — sincronização de assinaturas",
    });
  }
  await sync.syncBackfill();
}