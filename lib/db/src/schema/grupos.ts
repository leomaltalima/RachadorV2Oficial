import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gruposTable = pgTable("grupos", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  codigoConvite: text("codigo_convite").notNull().unique(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGrupoSchema = createInsertSchema(gruposTable).omit({ id: true, criadoEm: true });
export type InsertGrupo = z.infer<typeof insertGrupoSchema>;
export type Grupo = typeof gruposTable.$inferSelect;
