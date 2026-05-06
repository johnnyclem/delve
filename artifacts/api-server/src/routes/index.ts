import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignRouter from "./campaign";
import membersRouter from "./members";
import charactersRouter from "./characters";
import sessionsRouter from "./sessions";
import calendarRouter from "./calendar";
import diceRouter from "./dice";
import unsubscribeRouter from "./unsubscribe";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignRouter);
router.use(membersRouter);
router.use(charactersRouter);
router.use(sessionsRouter);
router.use(calendarRouter);
router.use(diceRouter);
router.use(unsubscribeRouter);
router.use(adminRouter);

export default router;
