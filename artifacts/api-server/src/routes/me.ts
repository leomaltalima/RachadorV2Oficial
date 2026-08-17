import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, participantesTable, gruposTable } from "@workspace/db";

const router: IRouter = Router();

// Returns all groups where the logged-in Clerk user is a participant
router.get("/me/grupos", async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Não autorizado" });
    return;
  }

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

  const [part] = await db
    .update(participantesTable)
    .set({ clerkUserId: userId })
    .where(eq(participantesTable.id, id))
    .returning();

  if (!part) {
    res.status(404).json({ error: "Participante não encontrado" });
    return;
  }

  res.json(part);
});

export default router;
