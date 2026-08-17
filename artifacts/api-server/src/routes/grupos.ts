import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, gruposTable, participantesTable } from "@workspace/db";
import {
  CreateGrupoBody,
  GetGrupoByCodigoParams,
  GetGrupoParams,
} from "@workspace/api-zod";
import { getAuth } from "@clerk/express";
import { nanoid } from "../lib/nanoid";

const router: IRouter = Router();

router.post("/grupos", async (req, res): Promise<void> => {
  const parsed = CreateGrupoBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { userId } = getAuth(req);
  const { nome, participantes } = parsed.data;
  const codigoConvite = nanoid(8);

  const [grupo] = await db
    .insert(gruposTable)
    .values({ nome, codigoConvite, criadorClerkUserId: userId ?? null })
    .returning();

  const parts = await db
    .insert(participantesTable)
    .values(
      participantes.map((p) => ({
        nome: p.nome,
        chavePix: p.chavePix ?? null,
        grupoId: grupo.id,
      }))
    )
    .returning();

  res.status(201).json({ ...grupo, participantes: parts });
});

router.get("/grupos/by-code/:codigo", async (req, res): Promise<void> => {
  const params = GetGrupoByCodigoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [grupo] = await db
    .select()
    .from(gruposTable)
    .where(eq(gruposTable.codigoConvite, params.data.codigo));

  if (!grupo) {
    res.status(404).json({ error: "Grupo não encontrado" });
    return;
  }

  const parts = await db
    .select()
    .from(participantesTable)
    .where(eq(participantesTable.grupoId, grupo.id));

  res.json({
    ...grupo,
    participantes: parts.map(({ clerkUserId, ...p }) => ({
      ...p,
      claimado: clerkUserId != null,
    })),
  });
});

router.get("/grupos/:grupoId", async (req, res): Promise<void> => {
  const params = GetGrupoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
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

  const parts = await db
    .select()
    .from(participantesTable)
    .where(eq(participantesTable.grupoId, grupo.id));

  res.json({
    ...grupo,
    participantes: parts.map(({ clerkUserId, ...p }) => ({
      ...p,
      claimado: clerkUserId != null,
    })),
  });
});

// Update group image — only the creator can do this
router.patch("/grupos/:grupoId/imagem", async (req, res): Promise<void> => {
  const params = GetGrupoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Não autorizado" });
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

  if (grupo.criadorClerkUserId !== userId) {
    res.status(403).json({ error: "Apenas o criador do grupo pode alterar a imagem" });
    return;
  }

  const { imagem } = req.body as { imagem: string | null };

  const [updated] = await db
    .update(gruposTable)
    .set({ imagem: imagem ?? null })
    .where(eq(gruposTable.id, params.data.grupoId))
    .returning();

  res.json(updated);
});

export default router;
