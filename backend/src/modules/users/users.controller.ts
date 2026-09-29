import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError, ok } from '../../utils/http.js';
import { connectMaster } from '../../db/master.js';
import { hashPassword, normaliseEmail, passwordIssues } from '../../utils/password.js';
import { parsePagination, paginateMeta, escapeRegex } from '../../utils/pagination.js';

/** Shape of a user as the API returns it: no password hash, stable string id. */
export function serializeUser(user: Record<string, any>) {
  const { passwordHash: _passwordHash, _id, __v, ...rest } = user;
  return { ...rest, id: String(_id) };
}

export const listUsers = asyncHandler(async (req, res) => {
  const { User } = req.tenant!;
  const pagination = parsePagination(req.query as { page?: string; limit?: string }, 20, 100);
  const filter: Record<string, unknown> = {};
  if (req.query.role && req.query.role !== 'all') filter.role = req.query.role;
  if (req.query.active && req.query.active !== 'all') filter.active = req.query.active === 'true';
  if (req.query.search) {
    const term = escapeRegex(String(req.query.search).trim());
    filter.$or = [{ name: { $regex: term, $options: 'i' } }, { email: { $regex: term, $options: 'i' } }];
  }

  const [rows, total] = await Promise.all([
    User.find(filter).sort({ createdAt: 1 }).skip(pagination.skip).limit(pagination.limit).lean(),
    User.countDocuments(filter),
  ]);

  // Expose a stable `id` (the UI keys rows on it) and never leak passwordHash.
  const items = rows.map(serializeUser);

  res.json(ok({ items, meta: paginateMeta(total, pagination) }));
});

export const createUser = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const auth = req.auth!;
  const body = req.body as { name: string; email: string; password: string; role: 'admin' | 'manager' | 'cashier'; phone?: string };

  const issues = passwordIssues(body.password);
  if (issues.length) throw ApiError.validation(issues[0]);

  const email = normaliseEmail(body.email);
  const existing = await models.User.findOne({ email }).lean();
  if (existing) throw ApiError.conflict('A user with this email already exists on this pump.');

  const user = await models.User.create({
    name: body.name.trim(),
    email,
    passwordHash: await hashPassword(body.password),
    role: body.role,
    phone: body.phone?.trim() || '',
    active: true,
  });

  // keep the master login index in sync so login can find the right pump fast
  const { Pump } = await connectMaster();
  await Pump.updateOne({ _id: auth.pumpId }, { $addToSet: { loginEmails: email } });

  res.status(201).json(
    ok({ id: String(user._id), name: user.name, email: user.email, role: user.role, active: user.active }, `${user.name} added.`),
  );
});

export const updateUser = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const user = await models.User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');

  const body = req.body as { name?: string; email?: string; role?: 'admin' | 'manager' | 'cashier'; phone?: string; active?: boolean; password?: string };

  if (body.name !== undefined) user.name = body.name.trim();
  if (body.phone !== undefined) user.phone = body.phone.trim();
  if (body.role !== undefined) {
    // never let the last admin be demoted
    if (user.role === 'admin' && body.role !== 'admin') {
      const adminCount = await models.User.countDocuments({ role: 'admin', active: true });
      if (adminCount <= 1) throw ApiError.badRequest('This is the only admin account. Create another admin before changing this role.');
    }
    user.role = body.role;
  }
  if (body.active !== undefined) {
    if (String(user._id) === req.auth!.userId && body.active === false) {
      throw ApiError.badRequest('You cannot deactivate your own account.');
    }
    user.active = body.active;
  }
  if (body.email !== undefined) {
    const email = normaliseEmail(body.email);
    const dup = await models.User.findOne({ email, _id: { $ne: user._id } }).lean();
    if (dup) throw ApiError.conflict('Another user already uses this email.');
    user.email = email;
  }
  if (body.password) {
    const issues = passwordIssues(body.password);
    if (issues.length) throw ApiError.validation(issues[0]);
    user.passwordHash = await hashPassword(body.password);
  }

  await user.save();

  const { Pump } = await connectMaster();
  await Pump.updateOne({ _id: req.auth!.pumpId }, { $addToSet: { loginEmails: user.email } });

  res.json(ok({ id: String(user._id), name: user.name, email: user.email, role: user.role, active: user.active }, `${user.name} updated.`));
});

export const deleteUser = asyncHandler(async (req, res) => {
  const models = req.tenant!;
  const user = await models.User.findById(req.params.id);
  if (!user) throw ApiError.notFound('User not found.');
  if (String(user._id) === req.auth!.userId) throw ApiError.badRequest('You cannot delete your own account.');

  const hasSales = await models.Sale.countDocuments({ userId: user._id });
  if (hasSales) {
    user.active = false;
    await user.save();
    return res.json(ok({ id: String(user._id), deactivated: true }, `${user.name} has recorded sales, so the account was deactivated instead of deleted.`));
  }

  await user.deleteOne();
  res.json(ok({ id: String(user._id), deleted: true }, `${user.name} deleted.`));
});
