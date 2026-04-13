const db = require('../../config/database');
const AppError = require('../../utils/AppError');

async function getProfile(userId) {
  const user = await db('users')
    .where({ id: userId })
    .select('id', 'email', 'name', 'phone', 'avatar_url', 'initials', 'avatar_color',
      'bio', 'location_city', 'location_state', 'location_country', 'specialties',
      'role', 'onboarding_completed', 'preferences', 'referral_code', 'created_at')
    .first();

  if (!user) throw new AppError('User not found', 404, 'NOT_FOUND');

  if (user.role === 'tailor') {
    const profile = await db('tailor_profiles').where({ user_id: userId }).first();
    if (profile) {
      user.tailor_profile = {
        verified: profile.verified,
        completed_jobs: profile.completed_jobs,
        response_time: profile.response_time,
        start_price: profile.start_price,
        years_experience: profile.years_experience,
        rating_avg: profile.rating_avg,
        rating_count: profile.rating_count,
        storefront_slug: profile.storefront_slug,
        storefront_bio: profile.storefront_bio,
        storefront_image: profile.storefront_image,
      };
    }
  }

  return user;
}

async function updateProfile(userId, data) {
  const allowed = ['name', 'bio', 'phone', 'location_city', 'location_state', 'location_country', 'specialties'];
  const updates = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }

  if (updates.name) {
    updates.initials = updates.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  updates.updated_at = new Date();

  const [user] = await db('users').where({ id: userId }).update(updates)
    .returning(['id', 'name', 'email', 'phone', 'bio', 'avatar_url', 'initials',
      'location_city', 'location_state', 'specialties']);

  return user;
}

async function updateAvatar(userId, avatarUrl) {
  const [user] = await db('users').where({ id: userId })
    .update({ avatar_url: avatarUrl, updated_at: new Date() })
    .returning(['id', 'avatar_url']);
  return user;
}

async function updatePreferences(userId, prefs) {
  const user = await db('users').where({ id: userId }).first();
  const merged = { ...user.preferences, ...prefs };

  await db('users').where({ id: userId }).update({
    preferences: JSON.stringify(merged),
    updated_at: new Date(),
  });

  return merged;
}

async function completeOnboarding(userId, data) {
  const updates = {
    name: data.name,
    location_city: data.location_city,
    location_state: data.location_state,
    onboarding_completed: true,
    updated_at: new Date(),
  };

  if (data.name) {
    updates.initials = data.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }
  if (data.specialties) updates.specialties = data.specialties;

  const [user] = await db('users').where({ id: userId }).update(updates)
    .returning(['id', 'name', 'onboarding_completed']);

  return user;
}

async function getStats(userId, role) {
  if (role === 'tailor') {
    const [customers] = await db('customers').where({ tailor_id: userId }).count('id as count');
    const [activeJobs] = await db('jobs').where({ tailor_id: userId }).whereNot({ status: 'delivered' }).count('id as count');
    const [completedJobs] = await db('jobs').where({ tailor_id: userId, status: 'delivered' }).count('id as count');
    const [pendingInvoices] = await db('jobs').where({ tailor_id: userId, invoiced: false, status: 'delivered' }).count('id as count');
    const [revenue] = await db('jobs').where({ tailor_id: userId, invoiced: true }).sum('price as total');

    return {
      customers: parseInt(customers.count),
      activeJobs: parseInt(activeJobs.count),
      completedJobs: parseInt(completedJobs.count),
      pendingInvoices: parseInt(pendingInvoices.count),
      revenue: revenue.total || 0,
    };
  }

  // Customer stats
  const [orders] = await db('orders').where({ customer_id: userId }).count('id as count');
  const [activeOrders] = await db('orders').where({ customer_id: userId }).whereIn('status', ['pending', 'accepted', 'in_progress']).count('id as count');

  return {
    totalOrders: parseInt(orders.count),
    activeOrders: parseInt(activeOrders.count),
  };
}

async function softDelete(userId) {
  await db('users').where({ id: userId }).update({
    is_active: false,
    email: db.raw("email || '_deleted_' || id"),
    updated_at: new Date(),
  });
  await db('refresh_tokens').where({ user_id: userId }).del();
}

module.exports = { getProfile, updateProfile, updateAvatar, updatePreferences, completeOnboarding, getStats, softDelete };
