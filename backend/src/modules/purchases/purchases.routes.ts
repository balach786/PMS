import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { purchaseSchema } from '../auth/auth.validation.js';
import * as c from './purchases.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

router.get('/', authorize('admin', 'manager'), c.listPurchases);
router.post('/', authorize('admin', 'manager'), validate(purchaseSchema), c.createPurchase);
router.post('/:id/void', authorize('admin', 'manager'), c.voidPurchase);

export default router;
