import { integer, pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core";
import { gruposTable } from "./grupos";
import { usuariosTable } from "./usuarios";

/**
 * Explicit many-to-many relation between users and groups.
 */
export const grupoUsuariosTable = pgTable(
  "grupo_usuarios",
  {
    grupoId: integer("grupo_id")
      .notNull()
      .references(() => gruposTable.id, { onDelete: "cascade" }),
    usuarioId: integer("usuario_id")
      .notNull()
      .references(() => usuariosTable.id, { onDelete: "cascade" }),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "grupo_usuarios_pkey",
      columns: [table.grupoId, table.usuarioId],
    }),
  ],
);

export type GrupoUsuario = typeof grupoUsuariosTable.$inferSelect;