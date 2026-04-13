const db = require('../../config/database');
const AppError = require('../../utils/AppError');

async function listCustomers(tailorId, { search, page = 1, limit = 20 }) {
  const query = db('customers').where({ tailor_id: tailorId });

  if (search) {
    query.where(function () {
      this.whereILike('name', `%${search}%`)
        .orWhereILike('phone', `%${search}%`)
        .orWhereILike('email', `%${search}%`);
    });
  }

  const offset = (page - 1) * limit;

  const [{ count }] = await query.clone().count('id as count');
  const customers = await query
    .select('id', 'name', 'phone', 'email', 'location', 'initials', 'avatar_color', 'created_at')
    .orderBy('name', 'asc')
    .limit(limit)
    .offset(offset);

  return {
    customers,
    pagination: {
      page,
      limit,
      total: parseInt(count),
      pages: Math.ceil(parseInt(count) / limit),
    },
  };
}

async function getCustomer(tailorId, customerId) {
  const customer = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .first();

  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');
  return customer;
}

async function createCustomer(tailorId, data) {
  const initials = data.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  const avatarColor = colors[Math.floor(Math.random() * colors.length)];

  const [customer] = await db('customers')
    .insert({
      tailor_id: tailorId,
      name: data.name,
      phone: data.phone || null,
      email: data.email || null,
      location: data.location || null,
      initials,
      avatar_color: avatarColor,
      measurements: JSON.stringify({ _version: 1, standard: {}, custom: [] }),
      custom_fields: JSON.stringify([]),
    })
    .returning('*');

  return customer;
}

async function updateCustomer(tailorId, customerId, data) {
  const customer = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .first();

  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const allowed = ['name', 'phone', 'email', 'location'];
  const updates = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }

  if (updates.name) {
    updates.initials = updates.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  updates.updated_at = new Date();

  const [updated] = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .update(updates)
    .returning('*');

  return updated;
}

async function deleteCustomer(tailorId, customerId) {
  const customer = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .first();

  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  await db('customers').where({ id: customerId, tailor_id: tailorId }).del();
}

async function updateMeasurements(tailorId, customerId, data) {
  const customer = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .first();

  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const measurements = customer.measurements || { _version: 1, standard: {}, custom: [] };
  const standardFields = ['neck', 'chest', 'waist', 'hips', 'shoulder', 'sleeve', 'length', 'inseam'];

  for (const field of standardFields) {
    if (data[field] !== undefined) {
      measurements.standard[field] = data[field];
    }
  }

  if (data.notes !== undefined) {
    measurements.notes = data.notes;
  }

  const [updated] = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .update({
      measurements: JSON.stringify(measurements),
      measurement_notes: data.notes || customer.measurement_notes,
      updated_at: new Date(),
    })
    .returning(['id', 'measurements', 'measurement_notes', 'updated_at']);

  return updated;
}

async function addCustomField(tailorId, customerId, field) {
  const customer = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .first();

  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const measurements = customer.measurements || { _version: 1, standard: {}, custom: [] };

  const exists = measurements.custom.find(f => f.key === field.key);
  if (exists) throw new AppError('Custom field with this key already exists', 409, 'DUPLICATE_KEY');

  measurements.custom.push({
    key: field.key,
    label: field.label,
    unit: field.unit || null,
    value: field.value,
  });

  const [updated] = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .update({
      measurements: JSON.stringify(measurements),
      updated_at: new Date(),
    })
    .returning(['id', 'measurements', 'updated_at']);

  return updated;
}

async function removeCustomField(tailorId, customerId, key) {
  const customer = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .first();

  if (!customer) throw new AppError('Customer not found', 404, 'NOT_FOUND');

  const measurements = customer.measurements || { _version: 1, standard: {}, custom: [] };
  const idx = measurements.custom.findIndex(f => f.key === key);

  if (idx === -1) throw new AppError('Custom field not found', 404, 'NOT_FOUND');

  measurements.custom.splice(idx, 1);

  const [updated] = await db('customers')
    .where({ id: customerId, tailor_id: tailorId })
    .update({
      measurements: JSON.stringify(measurements),
      updated_at: new Date(),
    })
    .returning(['id', 'measurements', 'updated_at']);

  return updated;
}

module.exports = {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  updateMeasurements,
  addCustomField,
  removeCustomField,
};
