import { Router, type IRouter } from "express";
import healthRouter from "./health";
import gruposRouter from "./grupos";
import participantesRouter from "./participantes";
import despesasRouter from "./despesas";
import saldoRouter from "./saldo";
import pagamentosRouter from "./pagamentos";

const router: IRouter = Router();

router.use(healthRouter);
router.use(gruposRouter);
router.use(participantesRouter);
router.use(despesasRouter);
router.use(saldoRouter);
router.use(pagamentosRouter);

export default router;
