import { boolean, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Local user identities used by the explicit group membership relation.
 * The current app still uses participantes for its expense flows; this table
 * provides a normalized user/group model without changing existing data.
 */
export const usuariosTable = pgTable(
  "usuarios",
  {
    id: serial("id").primaryKey(),
    nome: text("nome").notNull(),
    email: text("email"),
    imagemUrl: text("imagem_url"),
    clerkUserId: text("clerk_user_id").unique(),
    loginGoogle: boolean("login_google").notNull().default(false),
    loginEmailSenha: boolean("login_email_senha").notNull().default(false),
    emailVerificado: boolean("email_verificado").notNull().default(false),
    administrador: boolean("administrador").notNull().default(false),
    bloqueado: boolean("bloqueado").notNull().default(false),
    ultimoLoginEm: timestamp("ultimo_login_em", { withTimezone: true }),
    atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usuarios_email_idx").on(table.email),
    index("usuarios_administrador_idx").on(table.administrador),
  ],
);

export type Usuario = typeof usuariosTable.$inferSelect;