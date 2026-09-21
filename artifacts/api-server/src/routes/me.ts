import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, participantesTable, gruposTable } from "@workspace/db";
import { syncAuthenticatedUser } from "../userDirectory";

const router: IRouter = Router();

// Returns all groups where the logged-in Clerk user is a participant
router.get("/me/grupos", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  await syncAuthenticatedUser(userId);

  const meus = await db
    .select()
    .from(participantesTable)
    .where(eq(participantesTable.clerkUserId, userId));

  const results = await Promise.all(
    meus.map(async (participante) => {
      const [grupo] = await db
        .select()
        .from(gruposTable)
        .where(eq(gruposTable.id, participante.grupoId));
      if (!grupo) return null;

      const todosParticipantes = await db
        .select()
        .from(participantesTable)
        .where(eq(participantesTable.grupoId, participante.grupoId));

      return {
        grupo: { ...grupo, participantes: todosParticipantes },
        participante,
      };
    }),
  );

  res.json(results.filter(Boolean));
});

// Links the logged-in Clerk user to an existing participant
router.post("/participantes/:id/claim", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  // Check if already claimed by someone else
  const [existing] = await db
    .select()
    .from(participantesTable)
    .where(eq(participantesTable.id, id));

  if (!existing) {
    res.status(404).json({ error: "Participante não encontrado" });
    return;
  }

  if (existing.clerkUserId != null && existing.clerkUserId !== userId) {
    res.status(409).json({ error: "Este participante já está vinculado a outra conta" });
    return;
  }

  const [part] = await db
    .update(participantesTable)
    .set({ clerkUserId: userId })
    .where(eq(participantesTable.id, id))
    .returning();

  res.json(part);
});

// Removes the logged-in Clerk user from a participant (leave group)
router.delete("/participantes/:id/leave", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  // Only allow leaving if this userId owns the participant
  const [part] = await db
    .update(participantesTable)
    .set({ clerkUserId: null })
    .where(eq(participantesTable.id, id))
    .returning();

  if (!part) {
    res.status(404).json({ error: "Participante não encontrado" });
    return;
  }

  res.json({ ok: true });
});

export default router;
