import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipesRouter from "./recipes";
import paprikaRouter from "./paprika";
import dietaryRouter from "./dietary";
import chatgptRouter from "./chatgpt";
import trashRouter from "./trash";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dietaryRouter);
router.use(recipesRouter);
router.use(paprikaRouter);
router.use(chatgptRouter);
router.use(trashRouter);

export default router;
