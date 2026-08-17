import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gruposRouter from "./grupos";
import participantesRouter from "./participantes";
import despesasRouter from "./despesas";
import saldoRouter from "./saldo";
import pagamentosRouter from "./pagamentos";
import meRouter from "./me";
import scanReceiptRouter from "./scanReceipt";

const router: IRouter = Router();

router.use(healthRouter);
router.use(meRouter);
router.use(gruposRouter);
router.use(participantesRouter);
router.use(despesasRouter);
router.use(saldoRouter);
router.use(pagamentosRouter);
router.use(scanReceiptRouter);

export default router;
