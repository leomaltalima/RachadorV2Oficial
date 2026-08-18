import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, participantesTable, gruposTable } from "@workspace/db";
import {
  AddParticipanteBody,
  AddParticipanteParams,
  UpdateParticipanteBody,
  UpdateParticipanteParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/grupos/:grupoId/participantes", async (req, res): Promise<void> => {
  const params = AddParticipanteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddParticipanteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [grupo] = await db
    .select()
    .from(gruposTable)
    .where(eq(gruposTable.id, params.data.grupoId));

  if (!grupo) {
    res.status(404).json({ error: "Grupo não encontrado" });
    return;
  }

  const [part] = await db
    .insert(participantesTable)
    .values({
      nome: parsed.data.nome,
      chavePix: parsed.data.chavePix ?? null,
      grupoId: params.data.grupoId,
    })
    .returning();

  res.status(201).json(part);
});

// Update participant profile image
router.patch("/participantes/:id/imagem", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "ID inválido" });
    return;
  }

  const { imagem } = req.body as { imagem: string | null };

  const [part] = await db
    .update(participantesTable)
    .set({ imagem: imagem ?? null })
    .where(eq(participantesTable.id, id))
    .returning();

  if (!part) {
    res.status(404).json({ error: "Participante não encontrado" });
    return;
  }

  res.json(part);
});

router.patch("/participantes/:id", async (req, res): Promise<void> => {
  const params = UpdateParticipanteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateParticipanteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.nome !== undefined) updateData.nome = parsed.data.nome;
  if (parsed.data.chavePix !== undefined) updateData.chavePix = parsed.data.chavePix;

  const [part] = await db
    .update(participantesTable)
    .set(updateData)
    .where(eq(participantesTable.id, params.data.id))
    .returning();

  if (!part) {
    res.status(404).json({ error: "Participante não encontrado" });
    return;
  }

  res.json(part);
});

export default router;
