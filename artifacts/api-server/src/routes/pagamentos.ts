import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pagamentosTable, gruposTable, participantesTable } from "@workspace/db";
import {
  CreatePagamentoBody,
  CreatePagamentoParams,
  ListPagamentosParams,
  DeletePagamentoParams,
} from "@workspace/api-zod";
import { notifyNovoPagamento } from "../lib/pushNotifications";

const router: IRouter = Router();

router.get("/grupos/:grupoId/pagamentos", async (req, res): Promise<void> => {
  const params = ListPagamentosParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const pagamentos = await db
    .select()
    .from(pagamentosTable)
    .where(eq(pagamentosTable.grupoId, params.data.grupoId))
    .orderBy(pagamentosTable.criadoEm);

  res.json(
    pagamentos.map((p) => ({
      ...p,
      valor: parseFloat(p.valor),
      comprovante: p.comprovante ?? null,
    }))
  );
});

router.post("/grupos/:grupoId/pagamentos", async (req, res): Promise<void> => {
  const params = CreatePagamentoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CreatePagamentoBody.safeParse(req.body);
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

  const [de] = await db
    .select()
    .from(participantesTable)
    .where(eq(participantesTable.id, parsed.data.deId));

  const [para] = await db
    .select()
    .from(participantesTable)
    .where(eq(participantesTable.id, parsed.data.paraId));

  if (!de || !para) {
    res.status(404).json({ error: "Participante não encontrado" });
    return;
  }

  const [pag] = await db
    .insert(pagamentosTable)
    .values({
      deId: parsed.data.deId,
      paraId: parsed.data.paraId,
      grupoId: params.data.grupoId,
      valor: String(parsed.data.valor),
      comprovante: parsed.data.comprovante ?? null,
    })
    .returning();

  res.status(201).json({
    ...pag,
    valor: parseFloat(pag.valor),
    comprovante: pag.comprovante ?? null,
  });

  // Fire-and-forget push notification (after response is sent)
  notifyNovoPagamento({
    grupoId: params.data.grupoId,
    valor: parsed.data.valor,
    deNome: de.nome,
    paraNome: para.nome,
    deId: parsed.data.deId,
    paraId: parsed.data.paraId,
  }).catch(() => {});
});

router.delete("/pagamentos/:id", async (req, res): Promise<void> => {
  const params = DeletePagamentoParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(pagamentosTable)
    .where(eq(pagamentosTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Pagamento não encontrado" });
    return;
  }

  await db.delete(pagamentosTable).where(eq(pagamentosTable.id, params.data.id));
  res.status(204).send();
});

export default router;
