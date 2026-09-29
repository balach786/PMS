import { Router } from 'express';
import { authenticate, authorize, resolveTenant } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { fuelSchema, updateFuelSchema, fuelPriceSchema } from '../auth/auth.validation.js';
import * as c from './fuels.controller.js';

const router = Router();
router.use(authenticate, resolveTenant);

router.get('/', c.listFuels);
/** Daily fuel price board (section 22) */
router.get('/prices', c.listFuelPrices);
/** Price change audit trail for one fuel */
router.get('/:id/price-history', c.fuelPriceHistory);
router.get('/reconcile', authorize('admin', 'manager'), c.reconcile);
router.get('/isolation-check', authorize('admin', 'manager'), c.isolationCheck);
router.post('/', authorize('admin', 'manager'), validate(fuelSchema), c.createFuel);
router.patch('/:id', authorize('admin', 'manager'), validate(updateFuelSchema), c.updateFuel);
router.patch('/:id/price', authorize('admin', 'manager'), validate(fuelPriceSchema), c.updateFuelPrice);
router.delete('/:id', authorize('admin'), c.deleteFuel);

export default router;
