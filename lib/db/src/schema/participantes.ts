import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gruposTable } from "./grupos";

export const participantesTable = pgTable("participantes", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  chavePix: text("chave_pix"),
  grupoId: integer("grupo_id").notNull().references(() => gruposTable.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const insertParticipanteSchema = createInsertSchema(participantesTable).omit({ id: true, criadoEm: true });
export type InsertParticipante = z.infer<typeof insertParticipanteSchema>;
export type Participante = typeof participantesTable.$inferSelect;
