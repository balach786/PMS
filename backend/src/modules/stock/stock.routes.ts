import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { stockAdjustmentSchema } from '../auth/auth.validation.js';
import * as c from './stock.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

router.get('/overview', authorize('admin', 'manager'), c.overview);
router.get('/ledger', authorize('admin', 'manager'), c.ledger);
router.get('/fuel/:id', authorize('admin', 'manager'), c.fuelHistory);
router.post('/adjust', authorize('admin', 'manager'), validate(stockAdjustmentSchema), c.adjustStock);

export default router;
