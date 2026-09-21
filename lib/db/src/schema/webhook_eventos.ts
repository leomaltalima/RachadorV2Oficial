import { index, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const webhookEventosTable = pgTable(
  "webhook_eventos",
  {
    id: serial("id").primaryKey(),
    provedor: text("provedor").notNull().default("abacatepay"),
    eventoId: text("evento_id").notNull(),
    evento: text("evento").notNull(),
    status: text("status").notNull().default("PROCESSING"),
    payload: jsonb("payload"),
    processadoEm: timestamp("processado_em", { withTimezone: true }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("webhook_eventos_provedor_evento_idx").on(table.provedor, table.eventoId),
    index("webhook_eventos_status_idx").on(table.status),
  ],
);

export type WebhookEvento = typeof webhookEventosTable.$inferSelect;
