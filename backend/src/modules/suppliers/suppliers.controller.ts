import mongoose from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { parsePagination, paginateMeta, escapeRegex } from '../../utils/pagination.js';
import { money, volume } from '../../utils/number.js';

export const listSuppliers = asyncHandler(async (req, res) => {
  const { Supplier } = req.tenant!;
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter: Record<string, unknown> = {};
  if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
  if (req.query.search) {
    const term = escapeRegex(String(req.query.search).trim());
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    Supplier.countDocuments(filter),
  ]);

  res.json(ok({ items, meta: paginateMeta(total, pagination) }));
});

export const createSupplier = asyncHandler(async (req, res) => {
  const { Supplier } = req.tenant!;
  const body = req.body as Record<string, string>;
  const supplier = await Supplier.create({
    name: body.name.trim(),
    phone: body.phone?.trim() || '',
    email: body.email?.trim().toLowerCase() || '',
    address: body.address?.trim() || '',
    notes: body.notes?.trim() || '',
    status: body.status ?? 'active',
  });
  res.status(201).json(ok(supplier, `${supplier.name} added.`));
});

export const updateSupplier = asyncHandler(async (req, res) => {
  const { Supplier } = req.tenant!;
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw ApiError.notFound('Supplier not found.');
  const body = req.body as Record<string, string>;

  if (body.name !== undefined) supplier.name = body.name.trim();
  if (body.phone !== undefined) supplier.phone = body.phone.trim();
  if (body.email !== undefined) supplier.email = body.email.trim().toLowerCase();
  if (body.address !== undefined) supplier.address = body.address.trim();
  if (body.notes !== undefined) supplier.notes = body.notes.trim();
  if (body.status !== undefined) supplier.status = body.status as 'active' | 'inactive';

  await supplier.save();
  res.json(ok(supplier, `${supplier.name} updated.`));
});

export const deleteSupplier = asyncHandler(async (req, res) => {
  const { Supplier, Purchase } = req.tenant!;
  const supplier = await Supplier.findById(req.params.id);
  if (!supplier) throw ApiError.notFound('Supplier not found.');

  const purchases = await Purchase.countDocuments({ supplierId: supplier._id });
  if (purchases) {
    supplier.status = 'inactive';
    await supplier.save();
    return res.json(
      ok({ id: String(supplier._id), deactivated: true }, `${supplier.name} has purchase history, so it was deactivated instead of deleted.`),
    );
  }
  await supplier.deleteOne();
  res.json(ok({ id: String(supplier._id), deleted: true }, `${supplier.name} deleted.`));
});

export const getSupplier = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const supplier = await models.Supplier.findById(req.params.id).lean();
  if (!supplier) throw ApiError.notFound('Supplier not found.');

  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter = { supplierId: new mongoose.Types.ObjectId(String(supplier._id)), status: 'active' };

  const [purchases, total] = await Promise.all([
    models.Purchase.find(filter).sort({ date: -1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    models.Purchase.countDocuments(filter),
  ]);

  const [agg] = await models.Purchase.aggregate<{ totalAmount: number; totalQuantity: number }>([
    { $match: filter },
    { $group: { _id: null, totalAmount: { $sum: '$totalAmount' }, totalQuantity: { $sum: '$quantity' } } },
  ]);

  res.json(
    ok(
      {
        ...supplier,
        totals: {
          totalAmount: money(agg?.totalAmount ?? 0),
          totalQuantity: volume(agg?.totalQuantity ?? 0),
          purchases: total,
        },
        purchases,
      },
      undefined,
      paginateMeta(total, pagination),
    ),
  );
});
