import { pgTable, serial, timestamp, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gruposTable } from "./grupos";
import { participantesTable } from "./participantes";

export const pagamentosTable = pgTable("pagamentos", {
  id: serial("id").primaryKey(),
  deId: integer("de_id").notNull().references(() => participantesTable.id),
  paraId: integer("para_id").notNull().references(() => participantesTable.id),
  grupoId: integer("grupo_id").notNull().references(() => gruposTable.id, { onDelete: "cascade" }),
  valor: numeric("valor", { precision: 12, scale: 2 }).notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPagamentoSchema = createInsertSchema(pagamentosTable).omit({ id: true, criadoEm: true });
export type InsertPagamento = z.infer<typeof insertPagamentoSchema>;
export type Pagamento = typeof pagamentosTable.$inferSelect;
