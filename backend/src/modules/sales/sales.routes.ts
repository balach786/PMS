import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { saleSchema, updateSaleSchema } from '../auth/auth.validation.js';
import * as c from './sales.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

router.get('/', c.listSales);
router.get('/:id', c.getSale);
router.get('/:id/receipt', c.getReceipt);
router.post('/', authorize('admin', 'manager', 'cashier'), validate(saleSchema), c.createSale);
router.patch('/:id', authorize('admin', 'manager'), validate(updateSaleSchema), c.updateSale);
router.post('/:id/void', authorize('admin', 'manager'), c.voidSale);

export default router;
