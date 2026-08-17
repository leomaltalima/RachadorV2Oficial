import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, pushTokensTable, participantesTable, gruposTable } from "@workspace/db";

const router: IRouter = Router();

function parseParticipanteId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseBody(body: unknown): { token: string; grupoId: number; codigoConvite: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const token = typeof b.token === "string" && b.token.length > 0 ? b.token : null;
  const grupoId =
    Number.isInteger(Number(b.grupoId)) && Number(b.grupoId) > 0 ? Number(b.grupoId) : null;
  const codigoConvite =
    typeof b.codigoConvite === "string" && b.codigoConvite.length > 0 ? b.codigoConvite : null;
  if (!token || !grupoId || !codigoConvite) return null;
  return { token, grupoId, codigoConvite };
}

/**
 * Verify the caller's credential:
 * - The participant belongs to the declared group.
 * - The group's invite code matches what the caller provided.
 * The invite code is the group-session credential that proves membership.
 */
async function verifyCredential(
  participanteId: number,
  grupoId: number,
  codigoConvite: string,
): Promise<boolean> {
  const rows = await db
    .select({ grupoCodigoConvite: gruposTable.codigoConvite })
    .from(participantesTable)
    .innerJoin(gruposTable, eq(gruposTable.id, participantesTable.grupoId))
    .where(
      and(
        eq(participantesTable.id, participanteId),
        eq(participantesTable.grupoId, grupoId),
        eq(gruposTable.codigoConvite, codigoConvite),
      ),
    );
  return rows.length > 0;
}

// Register a push token for a participante
router.post("/participantes/:participanteId/push-token", async (req, res): Promise<void> => {
  const participanteId = parseParticipanteId(req.params.participanteId);
  if (!participanteId) {
    res.status(400).json({ error: "participanteId inválido" });
    return;
  }

  const body = parseBody(req.body);
  if (!body) {
    res.status(400).json({ error: "token, grupoId e codigoConvite são obrigatórios" });
    return;
  }

  // Credential check: participant must belong to the group AND caller must know the invite code
  const valid = await verifyCredential(participanteId, body.grupoId, body.codigoConvite);
  if (!valid) {
    res.status(403).json({ error: "Credenciais inválidas" });
    return;
  }

  // Upsert on (participanteId, token) — one device can be in multiple groups
  await db
    .insert(pushTokensTable)
    .values({ participanteId, token: body.token })
    .onConflictDoNothing();

  res.status(200).json({ ok: true });
});

// Remove a push token for a participante
router.delete("/participantes/:participanteId/push-token", async (req, res): Promise<void> => {
  const participanteId = parseParticipanteId(req.params.participanteId);
  if (!participanteId) {
    res.status(400).json({ error: "participanteId inválido" });
    return;
  }

  const body = parseBody(req.body);
  if (!body) {
    res.status(400).json({ error: "token, grupoId e codigoConvite são obrigatórios" });
    return;
  }

  // Credential check
  const valid = await verifyCredential(participanteId, body.grupoId, body.codigoConvite);
  if (!valid) {
    res.status(403).json({ error: "Credenciais inválidas" });
    return;
  }

  await db
    .delete(pushTokensTable)
    .where(
      and(
        eq(pushTokensTable.participanteId, participanteId),
        eq(pushTokensTable.token, body.token),
      ),
    );

  res.status(200).json({ ok: true });
});

export default router;
