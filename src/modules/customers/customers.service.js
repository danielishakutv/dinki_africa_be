const db = require('../../config/database');
const { nanoid } = require('nanoid');
const AppError = require('../../utils/AppError');

// --- helpers ---------------------------------------------------------------

function generateInitials(name) {
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

function randomColor() {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
}

/**
 * Find an existing user by phone or email (for identity matching).
 * Returns null if both are empty or no match found.
 */
async function findMatchingUser(phone, email) {
  if (!phone && !email) return null;

  const query = db('users');

  if (phone && email) {
    query.where(function () {
      this.where('phone', phone).orWhere('email', email);
    });
  } else if (phone) {
    query.where('phone', phone);
  } else {
    query.where('email', email);
  }

  return query.first();
}

// --- core ------------------------------------------------------------------

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
  const initials = generateInitials(data.name);
  const avatarColor = randomColor();
  const phone = data.phone || null;
  const email = data.email || null;

  // --- identity matching ---------------------------------------------------
  const matchedUser = await findMatchingUser(phone, email);

  if (matchedUser) {
    // Check if this tailor already has a customer linked to this user
    const existing = await db('customers')
      .where({ tailor_id: tailorId, user_id: matchedUser.id })
      .first();

    if (existing) {
      throw new AppError(
        'You already have this customer in your list',
        409,
        'DUPLICATE_CUSTOMER'
      );
    }

    // Return the match info so the frontend can show a confirmation dialog
    return {
      requires_confirmation: true,
      existing_user: {
        id: matchedUser.id,
        name: matchedUser.name,
        phone: matchedUser.phone,
        email: matchedUser.account_status === 'inactive' ? null : matchedUser.email,
        initials: matchedUser.initials,
        avatar_color: matchedUser.avatar_color,
        location_city: matchedUser.location_city,
        account_status: matchedUser.account_status,
      },
      match_field: matchedUser.phone === phone ? 'phone' : 'email',
    };
  }

  // --- no match → create inactive user + customer --------------------------
  try {
    return await db.transaction(async (trx) => {
      let userId = null;

      if (phone || email) {
        const [newUser] = await trx('users')
          .insert({
            name: data.name,
            email: email || `placeholder-${nanoid(12)}@inactive.dinki.africa`,
            password_hash: 'INACTIVE_ACCOUNT_NO_PASSWORD',
            role: 'customer',
            phone,
            initials,
            avatar_color: avatarColor,
            account_status: 'inactive',
            is_active: true,
            referral_code: nanoid(8),
          })
          .returning(['id']);

        userId = newUser.id;
      }

      const [customer] = await trx('customers')
        .insert({
          tailor_id: tailorId,
          user_id: userId,
          name: data.name,
          phone,
          email,
          location: data.location || null,
          initials,
          avatar_color: avatarColor,
          measurements: JSON.stringify({ _version: 1, standard: {}, custom: [] }),
          custom_fields: JSON.stringify([]),
        })
        .returning('*');

      return customer;
    });
  } catch (err) {
    // Unique constraint violation — the user exists but findMatchingUser missed it
    // (race condition, phone format mismatch, etc). Re-check and show confirmation.
    if (err.code === '23505') {
      const retryMatch = await findMatchingUser(phone, email);
      if (retryMatch) {
        const existing = await db('customers')
          .where({ tailor_id: tailorId, user_id: retryMatch.id })
          .first();

        if (existing) {
          throw new AppError(
            'You already have this customer in your list',
            409,
            'DUPLICATE_CUSTOMER'
          );
        }

        return {
          requires_confirmation: true,
          existing_user: {
            id: retryMatch.id,
            name: retryMatch.name,
            phone: retryMatch.phone,
            email: retryMatch.account_status === 'inactive' ? null : retryMatch.email,
            initials: retryMatch.initials,
            avatar_color: retryMatch.avatar_color,
            location_city: retryMatch.location_city,
            account_status: retryMatch.account_status,
          },
          match_field: retryMatch.phone === phone ? 'phone' : 'email',
        };
      }
    }
    throw err;
  }
}

/**
 * Link an existing user to this tailor's customer list.
 * Called after the tailor confirms the identity match.
 */
async function linkCustomer(tailorId, data) {
  const { user_id } = data;

  const user = await db('users').where({ id: user_id }).first();
  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  // Check for duplicate link
  const existing = await db('customers')
    .where({ tailor_id: tailorId, user_id })
    .first();

  if (existing) {
    throw new AppError('You already have this customer in your list', 409, 'DUPLICATE_CUSTOMER');
  }

  // Use the user's own data as the source of truth
  const initials = user.initials || generateInitials(user.name);
  const userEmail = user.account_status === 'inactive' ? null : user.email;

  const [customer] = await db('customers')
    .insert({
      tailor_id: tailorId,
      user_id,
      name: user.name,
      phone: user.phone || null,
      email: userEmail,
      location: [user.location_city, user.location_state].filter(Boolean).join(', ') || null,
      initials,
      avatar_color: user.avatar_color || randomColor(),
      measurements: JSON.stringify({ _version: 1, standard: {}, custom: [] }),
      custom_fields: JSON.stringify([]),
    })
    .returning('*');

  return customer;
}

/**
 * Force-create a customer without linking to any user.
 * Used when tailor says "No, this is a different person".
 */
async function createCustomerForced(tailorId, data) {
  const initials = generateInitials(data.name);
  const avatarColor = randomColor();

  return db.transaction(async (trx) => {
    let userId = null;
    const phone = data.phone || null;
    const email = data.email || null;

    // Still create an inactive user so the person can claim it later,
    // but with a distinct account (different from the matched one)
    if (phone || email) {
      // Only create if the email isn't already taken
      const emailToUse = email || `placeholder-${nanoid(12)}@inactive.dinki.africa`;
      const emailExists = await trx('users').where({ email: emailToUse }).first();

      if (!emailExists) {
        const [newUser] = await trx('users')
          .insert({
            name: data.name,
            email: emailToUse,
            password_hash: 'INACTIVE_ACCOUNT_NO_PASSWORD',
            role: 'customer',
            phone: phone,
            initials,
            avatar_color: avatarColor,
            account_status: 'inactive',
            is_active: true,
            referral_code: nanoid(8),
          })
          .returning(['id']);

        userId = newUser.id;
      }
    }

    const [customer] = await trx('customers')
      .insert({
        tailor_id: tailorId,
        user_id: userId,
        name: data.name,
        phone,
        email,
        location: data.location || null,
        initials,
        avatar_color: avatarColor,
        measurements: JSON.stringify({ _version: 1, standard: {}, custom: [] }),
        custom_fields: JSON.stringify([]),
      })
      .returning('*');

    return customer;
  });
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

  // Archive current measurements before overwriting
  if (customer.user_id && customer.measurements) {
    await db('measurement_history').insert({
      user_id: customer.user_id,
      tailor_id: tailorId,
      customer_id: customerId,
      measurements: JSON.stringify(customer.measurements),
    });
  }

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
  linkCustomer,
  createCustomerForced,
  updateCustomer,
  deleteCustomer,
  updateMeasurements,
  addCustomField,
  removeCustomField,
};
