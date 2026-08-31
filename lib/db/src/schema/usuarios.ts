import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Local user identities used by the explicit group membership relation.
 * The current app still uses participantes for its expense flows; this table
 * provides a normalized user/group model without changing existing data.
 */
export const usuariosTable = pgTable("usuarios", {
  id: serial("id").primaryKey(),
  nome: text("nome").notNull(),
  clerkUserId: text("clerk_user_id").unique(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export type Usuario = typeof usuariosTable.$inferSelect;