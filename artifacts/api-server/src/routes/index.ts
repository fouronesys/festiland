import { Router, type IRouter } from "express";
import healthRouter from "./health";
import { requireMember } from "../middlewares/festilandAuth";
import accountingRouter from "./accounting";
import contactsRouter from "./contacts";
import dashboardRouter from "./dashboard";
import inventoryRouter from "./inventory";
import productsRouter from "./products";
import salesRouter from "./sales";
import teamRouter from "./team";

const router: IRouter = Router();

router.use(healthRouter);
router.use(requireMember);
router.use(accountingRouter);
router.use(contactsRouter);
router.use(dashboardRouter);
router.use(inventoryRouter);
router.use(productsRouter);
router.use(salesRouter);
router.use(teamRouter);

export default router;
