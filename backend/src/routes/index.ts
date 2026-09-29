import { Router } from 'express';
import authRoutes from '../modules/auth/auth.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import fuelRoutes from '../modules/fuels/fuels.routes.js';
import salesRoutes from '../modules/sales/sales.routes.js';
import shiftRoutes from '../modules/shifts/shifts.routes.js';
import customerRoutes from '../modules/customers/customers.routes.js';
import expenseRoutes from '../modules/expenses/expenses.routes.js';
import supplierRoutes from '../modules/suppliers/suppliers.routes.js';
import purchaseRoutes from '../modules/purchases/purchases.routes.js';
import stockRoutes from '../modules/stock/stock.routes.js';
import reportRoutes from '../modules/reports/reports.routes.js';
import userRoutes from '../modules/users/users.routes.js';
import notificationRoutes from '../modules/notifications/notifications.routes.js';
import { authenticate, authorize, resolveTenant } from '../middleware/auth.js';
import * as fuelController from '../modules/fuels/fuels.controller.js';
import * as customerController from '../modules/customers/customers.controller.js';
import * as stockController from '../modules/stock/stock.controller.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/fuels', fuelRoutes);
router.use('/sales', salesRoutes);
router.use('/shifts', shiftRoutes);
router.use('/customers', customerRoutes);
router.use('/expenses', expenseRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/stock', stockRoutes);
router.use('/reports', reportRoutes);
router.use('/users', userRoutes);
router.use('/notifications', notificationRoutes);

// Documented aliases from the build spec (section 48). Each one points at the
// exact controller that owns the data - there is no second implementation.
const fuelPriceRouter = Router();
fuelPriceRouter.use(authenticate, resolveTenant);
fuelPriceRouter.get('/', fuelController.listFuelPrices);

const customerTransactionRouter = Router();
customerTransactionRouter.use(authenticate, resolveTenant);
customerTransactionRouter.get('/', customerController.listTransactions);

const stockHistoryRouter = Router();
stockHistoryRouter.use(authenticate, resolveTenant, authorize('admin', 'manager'));
stockHistoryRouter.get('/', stockController.ledger);

router.use('/fuel-prices', fuelPriceRouter);
router.use('/customer-transactions', customerTransactionRouter);
router.use('/stock-history', stockHistoryRouter);

export default router;
