import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { customerSchema, paymentSchema } from '../auth/auth.validation.js';
import * as c from './customers.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

router.get('/', c.listCustomers);
router.get('/transactions', c.listTransactions);
router.get('/:id', c.getCustomer);
router.post('/', authorize('admin', 'manager', 'cashier'), validate(customerSchema), c.createCustomer);
router.patch('/:id', authorize('admin', 'manager', 'cashier'), validate(customerSchema.partial()), c.updateCustomer);
router.post('/:id/payments', authorize('admin', 'manager', 'cashier'), validate(paymentSchema), c.receivePayment);
router.delete('/:id', authorize('admin', 'manager'), c.deleteCustomer);

export default router;
