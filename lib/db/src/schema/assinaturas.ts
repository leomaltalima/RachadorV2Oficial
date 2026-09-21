import {
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usuariosTable } from "./usuarios";

export const assinaturasTable = pgTable(
  "assinaturas",
  {
    id: serial("id").primaryKey(),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuariosTable.id, { onDelete: "cascade" }),
    plano: text("plano").notNull().default("PRO"),
    status: text("status").notNull().default("PENDING"),
    cicloCobranca: text("ciclo_cobranca").notNull(),
    abacatePayCustomerId: text("abacatepay_customer_id"),
    abacatePaySubscriptionId: text("abacatepay_subscription_id"),
    abacatePayProductId: text("abacatepay_product_id").notNull(),
    abacatePayCheckoutId: text("abacatepay_checkout_id"),
    abacatePayCheckoutUrl: text("abacatepay_checkout_url"),
    abacatePayPixCode: text("abacatepay_pix_code"),
    abacatePayPixQrCode: text("abacatepay_pix_qr_code"),
    abacatePayPixExpiresAt: timestamp("abacatepay_pix_expires_at", { withTimezone: true }),
    externalId: text("external_id"),
    iniciadaEm: timestamp("iniciada_em", { withTimezone: true }),
    atualizadaEm: timestamp("atualizada_em", { withTimezone: true }).notNull().defaultNow(),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    proximaCobrancaEm: timestamp("proxima_cobranca_em", { withTimezone: true }),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("assinaturas_usuario_idx").on(table.usuarioId),
    index("assinaturas_status_idx").on(table.status),
    uniqueIndex("assinaturas_subscription_id_idx").on(table.abacatePaySubscriptionId),
    uniqueIndex("assinaturas_checkout_id_idx").on(table.abacatePayCheckoutId),
    uniqueIndex("assinaturas_external_id_idx").on(table.externalId),
  ],
);

export type Assinatura = typeof assinaturasTable.$inferSelect;
