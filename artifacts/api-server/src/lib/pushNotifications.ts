import { db, pushTokensTable, participantesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import { logger } from "./logger";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  badge?: number;
}

async function sendExpoPushNotifications(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!response.ok) {
      logger.error({ status: response.status }, "Expo push API returned error");
    }
  } catch (err) {
    logger.error({ err }, "Failed to send Expo push notifications");
  }
}

/**
 * Notify all participants of a group about a new despesa, excluding the
 * participant who created it (pagoPorId).
 */
export async function notifyNovaDespesa(opts: {
  grupoId: number;
  descricao: string;
  valor: number;
  pagoPorId: number;
  pagadorNome: string;
}): Promise<void> {
  const { grupoId, descricao, valor, pagoPorId, pagadorNome } = opts;

  // Find all push tokens for this group except the payer
  const tokens = await db
    .select({ token: pushTokensTable.token, participanteId: pushTokensTable.participanteId })
    .from(pushTokensTable)
    .innerJoin(participantesTable, eq(participantesTable.id, pushTokensTable.participanteId))
    .where(eq(participantesTable.grupoId, grupoId));

  const otherTokens = tokens.filter((t) => t.participanteId !== pagoPorId);
  if (otherTokens.length === 0) return;

  const valorFormatado = valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const messages: PushMessage[] = otherTokens.map((t) => ({
    to: t.token,
    title: "Nova despesa adicionada 💸",
    body: `${pagadorNome} pagou ${descricao} — ${valorFormatado}`,
    sound: "default",
    data: { grupoId },
  }));

  await sendExpoPushNotifications(messages);
}

/**
 * Notify participants involved in a pagamento about the payment.
 */
export async function notifyNovoPagamento(opts: {
  grupoId: number;
  valor: number;
  deNome: string;
  paraNome: string;
  deId: number;
  paraId: number;
}): Promise<void> {
  const { grupoId, valor, deNome, paraNome, deId, paraId } = opts;

  // Notify the recipient (paraId) only
  const tokens = await db
    .select({ token: pushTokensTable.token })
    .from(pushTokensTable)
    .where(eq(pushTokensTable.participanteId, paraId));

  if (tokens.length === 0) return;

  const valorFormatado = valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const messages: PushMessage[] = tokens.map((t) => ({
    to: t.token,
    title: "Pagamento registrado ✅",
    body: `${deNome} pagou ${valorFormatado} para você`,
    sound: "default",
    data: { grupoId },
  }));

  await sendExpoPushNotifications(messages);
}
