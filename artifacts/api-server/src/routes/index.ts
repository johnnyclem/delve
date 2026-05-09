import { Router, type IRouter } from "express";
import healthRouter from "./health";
import campaignRouter from "./campaign";
import membersRouter from "./members";
import charactersRouter from "./characters";
import sessionsRouter from "./sessions";
import calendarRouter from "./calendar";
import diceRouter from "./dice";
import unsubscribeRouter from "./unsubscribe";
import rsvpRouter from "./rsvp";
import adminRouter from "./admin";
import storageRouter from "./storage";
import mapsRouter from "./maps";
import npcsRouter from "./npcs";
import rulesRouter from "./rules";
import entitiesRouter from "./entities";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(campaignRouter);
router.use(membersRouter);
router.use(charactersRouter);
router.use(sessionsRouter);
router.use(calendarRouter);
router.use(diceRouter);
router.use(unsubscribeRouter);
router.use(rsvpRouter);
router.use(adminRouter);
router.use(storageRouter);
router.use(mapsRouter);
router.use(npcsRouter);
router.use(rulesRouter);
router.use(entitiesRouter);
router.use(chatRouter);

export default router;
