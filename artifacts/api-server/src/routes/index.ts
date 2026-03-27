import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipesRouter from "./recipes";
import paprikaRouter from "./paprika";

const router: IRouter = Router();

router.use(healthRouter);
router.use(recipesRouter);
router.use(paprikaRouter);

export default router;
