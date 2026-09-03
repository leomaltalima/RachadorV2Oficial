import { pgTable, text, serial, timestamp, integer, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gruposTable } from "./grupos";
import { participantesTable } from "./participantes";

export const despesasTable = pgTable("despesas", {
  id: serial("id").primaryKey(),
  descricao: text("descricao").notNull(),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  categoria: text("categoria").notNull().default("Outros"),
  tipoDivisao: text("tipo_divisao").notNull().default("igual"),
  pagoPorId: integer("pago_por_id").notNull().references(() => participantesTable.id),
  grupoId: integer("grupo_id").notNull().references(() => gruposTable.id, { onDelete: "cascade" }),
  idempotencyKey: text("idempotency_key"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("despesas_grupo_idempotency_key_idx").on(table.grupoId, table.idempotencyKey),
]);

export const divisoesTable = pgTable("divisoes", {
  id: serial("id").primaryKey(),
  despesaId: integer("despesa_id").notNull().references(() => despesasTable.id, { onDelete: "cascade" }),
  participanteId: integer("participante_id").notNull().references(() => participantesTable.id),
  valorDevido: numeric("valor_devido", { precision: 12, scale: 2 }).notNull(),
  porcentagem: numeric("porcentagem", { precision: 7, scale: 4 }),
  cotas: numeric("cotas", { precision: 12, scale: 4 }),
});

export const insertDespesaSchema = createInsertSchema(despesasTable).omit({ id: true, criadoEm: true });
export const insertDivisaoSchema = createInsertSchema(divisoesTable).omit({ id: true });
export type InsertDespesa = z.infer<typeof insertDespesaSchema>;
export type InsertDivisao = z.infer<typeof insertDivisaoSchema>;
export type Despesa = typeof despesasTable.$inferSelect;
export type Divisao = typeof divisoesTable.$inferSelect;
