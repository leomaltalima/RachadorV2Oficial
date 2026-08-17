import { pgTable, text, serial, timestamp, integer, unique } from "drizzle-orm/pg-core";
import { participantesTable } from "./participantes";

export const pushTokensTable = pgTable(
  "push_tokens",
  {
    id: serial("id").primaryKey(),
    participanteId: integer("participante_id")
      .notNull()
      .references(() => participantesTable.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One device can be associated with multiple participants (different groups).
    // Uniqueness is per (participant, device) pair.
    unique("push_tokens_participante_token_unique").on(t.participanteId, t.token),
  ],
);

export type PushToken = typeof pushTokensTable.$inferSelect;
