import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, despesasTable, divisoesTable, pagamentosTable, participantesTable, gruposTable } from "@workspace/db";
import { GetSaldoParams } from "@workspace/api-zod";

const router: IRouter = Router();

/**
 * Greedy debt simplification algorithm.
 * Given net balances per participant, produce minimal set of transfers.
 */
function simplifyDebts(
  balances: Map<number, number>
): { deId: number; paraId: number; valor: number }[] {
  const debtors: { id: number; val: number }[] = [];
  const creditors: { id: number; val: number }[] = [];

  balances.forEach((val, id) => {
    if (val < -0.005) debtors.push({ id, val });
    else if (val > 0.005) creditors.push({ id, val });
  });

  const result: { deId: number; paraId: number; valor: number }[] = [];

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(-debtor.val, creditor.val);
    const rounded = Math.round(amount * 100) / 100;

    if (rounded > 0.005) {
      result.push({ deId: debtor.id, paraId: creditor.id, valor: rounded });
    }

    debtor.val += amount;
    creditor.val -= amount;

    if (Math.abs(debtor.val) < 0.005) i++;
    if (Math.abs(creditor.val) < 0.005) j++;
  }

  return result;
}

router.get("/grupos/:grupoId/saldo", async (req, res): Promise<void> => {
  const params = GetSaldoParams.safeParse(req.params);
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
    .where(eq(participantesTable.grupoId, params.data.grupoId));

  const despesas = await db
    .select()
    .from(despesasTable)
    .where(eq(despesasTable.grupoId, params.data.grupoId));

  const pagamentos = await db
    .select()
    .from(pagamentosTable)
    .where(eq(pagamentosTable.grupoId, params.data.grupoId));

  // net balance per participante: positive = is owed money, negative = owes money
  const balances = new Map<number, number>();
  parts.forEach((p) => balances.set(p.id, 0));

  let totalGasto = 0;

  for (const d of despesas) {
    const valor = parseFloat(d.valor);
    totalGasto += valor;

    // payer gets credited the full amount
    balances.set(d.pagoPorId, (balances.get(d.pagoPorId) ?? 0) + valor);

    // each divisão debits the participant
    const divisoes = await db
      .select()
      .from(divisoesTable)
      .where(eq(divisoesTable.despesaId, d.id));

    for (const div of divisoes) {
      const vd = parseFloat(div.valorDevido);
      balances.set(div.participanteId, (balances.get(div.participanteId) ?? 0) - vd);
    }
  }

  // apply payments
  for (const p of pagamentos) {
    const valor = parseFloat(p.valor);
    balances.set(p.deId, (balances.get(p.deId) ?? 0) + valor);
    balances.set(p.paraId, (balances.get(p.paraId) ?? 0) - valor);
  }

  const debitos = simplifyDebts(balances);

  const participantesSaldo = parts.map((p) => ({
    participanteId: p.id,
    nome: p.nome,
    saldoLiquido: Math.round((balances.get(p.id) ?? 0) * 100) / 100,
  }));

  res.json({
    debitos,
    participantes: participantesSaldo,
    totalGasto: Math.round(totalGasto * 100) / 100,
  });
});

export default router;
