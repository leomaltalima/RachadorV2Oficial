import { integer, pgTable, serial, text, timestamp, boolean, index } from "drizzle-orm/pg-core";

export const assinaturasTable = pgTable(
  "assinaturas",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    plano: text("plano").notNull().default("free"),
    status: text("status").notNull().default("free"),
    intervalo: text("intervalo"),
    inicioEm: timestamp("inicio_em", { withTimezone: true }),
    periodoAtualInicioEm: timestamp("periodo_atual_inicio_em", { withTimezone: true }),
    periodoAtualFimEm: timestamp("periodo_atual_fim_em", { withTimezone: true }),
    cancelamentoAgendado: boolean("cancelamento_agendado").notNull().default(false),
    aiUsoMes: integer("ai_uso_mes").notNull().default(0),
    aiUsoPeriodo: text("ai_uso_periodo").notNull().default("1970-01"),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clerkUserIdIdx: index("assinaturas_clerk_user_id_idx").on(table.clerkUserId),
    stripeCustomerIdIdx: index("assinaturas_stripe_customer_id_idx").on(table.stripeCustomerId),
  }),
);

export type Assinatura = typeof assinaturasTable.$inferSelect;