import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { supplierSchema } from '../auth/auth.validation.js';
import * as c from './suppliers.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

router.get('/', authorize('admin', 'manager'), c.listSuppliers);
router.get('/:id', authorize('admin', 'manager'), c.getSupplier);
router.post('/', authorize('admin', 'manager'), validate(supplierSchema), c.createSupplier);
router.patch('/:id', authorize('admin', 'manager'), validate(supplierSchema.partial()), c.updateSupplier);
router.delete('/:id', authorize('admin', 'manager'), c.deleteSupplier);

export default router;
