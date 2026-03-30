import { Router, type IRouter } from "express";
import healthRouter from "./health";
import recipesRouter from "./recipes";
import dietaryRouter from "./dietary";
import chatgptRouter from "./chatgpt";
import trashRouter from "./trash";
import cartRouter from "./cart";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dietaryRouter);
router.use(recipesRouter);
router.use(chatgptRouter);
router.use(trashRouter);
router.use(cartRouter);

export default router;
