import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, despesasTable, divisoesTable, gruposTable, participantesTable } from "@workspace/db";
import {
  CreateDespesaBody,
  CreateDespesaParams,
  DeleteDespesaParams,
  ListDespesasParams,
} from "@workspace/api-zod";
import { notifyNovaDespesa } from "../lib/pushNotifications";

const router: IRouter = Router();

router.get("/grupos/:grupoId/despesas", async (req, res): Promise<void> => {
  const params = ListDespesasParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const despesas = await db
    .select()
    .from(despesasTable)
    .where(eq(despesasTable.grupoId, params.data.grupoId))
    .orderBy(despesasTable.criadoEm);

  const result = await Promise.all(
    despesas.map(async (d) => {
      const divisoes = await db
        .select()
        .from(divisoesTable)
        .where(eq(divisoesTable.despesaId, d.id));
      return {
        ...d,
        valor: parseFloat(d.valor),
        divisoes: divisoes.map((div) => ({
          participanteId: div.participanteId,
          valorDevido: parseFloat(div.valorDevido),
        })),
      };
    })
  );

  res.json(result);
});

router.post("/grupos/:grupoId/despesas", async (req, res): Promise<void> => {
  const params = CreateDespesaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreateDespesaBody.safeParse(req.body);
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

  const pagoPor = await db
    .select()
    .from(participantesTable)
    .where(eq(participantesTable.id, parsed.data.pagoPorId));

  if (!pagoPor.length) {
    res.status(404).json({ error: "Participante pagador não encontrado" });
    return;
  }

  const [despesa] = await db
    .insert(despesasTable)
    .values({
      descricao: parsed.data.descricao,
      valor: String(parsed.data.valor),
      pagoPorId: parsed.data.pagoPorId,
      grupoId: params.data.grupoId,
    })
    .returning();

  await db.insert(divisoesTable).values(
    parsed.data.divisoes.map((d) => ({
      despesaId: despesa.id,
      participanteId: d.participanteId,
      valorDevido: String(d.valorDevido),
    }))
  );

  const divisoes = await db
    .select()
    .from(divisoesTable)
    .where(eq(divisoesTable.despesaId, despesa.id));

  res.status(201).json({
    ...despesa,
    valor: parseFloat(despesa.valor),
    divisoes: divisoes.map((d) => ({
      participanteId: d.participanteId,
      valorDevido: parseFloat(d.valorDevido),
    })),
  });

  // Fire-and-forget push notification (after response is sent)
  notifyNovaDespesa({
    grupoId: params.data.grupoId,
    descricao: parsed.data.descricao,
    valor: parsed.data.valor,
    pagoPorId: parsed.data.pagoPorId,
    pagadorNome: pagoPor[0].nome,
  }).catch(() => {});
});

router.delete("/despesas/:id", async (req, res): Promise<void> => {
  const params = DeleteDespesaParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(despesasTable)
    .where(eq(despesasTable.id, params.data.id))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Despesa não encontrada" });
    return;
  }

  res.sendStatus(204);
});

export default router;
