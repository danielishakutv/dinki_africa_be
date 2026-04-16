const db = require('../../config/database');
const redis = require('../../config/redis');
const AppError = require('../../utils/AppError');

const CACHE_TTL = 300; // 5 minutes

async function getStorefront(slug) {
  // Try cache first
  const cacheKey = `storefront:${slug}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const profile = await db('tailor_profiles as tp')
    .join('users as u', 'u.id', 'tp.user_id')
    .where({ 'tp.storefront_slug': slug, 'u.is_active': true })
    .select(
      'u.id as tailor_id',
      'u.name',
      'u.avatar_url',
      'u.initials',
      'u.avatar_color',
      'u.bio',
      'u.location_city',
      'u.location_state',
      'u.specialties',
      'tp.verified',
      'tp.completed_jobs',
      'tp.response_time',
      'tp.start_price',
      'tp.years_experience',
      'tp.rating_avg',
      'tp.rating_count',
      'tp.storefront_slug',
      'tp.storefront_bio',
      'tp.storefront_image',
      'tp.storefront_setup_completed',
      'tp.cover_image_position',
      'u.created_at'
    )
    .first();

  if (!profile) throw new AppError('Storefront not found', 404, 'NOT_FOUND');

  // Enrich with portfolio count
  const [{ count: portfolioCount }] = await db('portfolio_items')
    .where({ tailor_id: profile.tailor_id })
    .count('id as count');

  // Enrich with recent portfolio previews (top 4)
  const portfolioPreview = await db('portfolio_items')
    .where({ tailor_id: profile.tailor_id })
    .orderBy('display_order', 'asc')
    .orderBy('created_at', 'desc')
    .select('id', 'title', 'image_url', 'rating')
    .limit(4);

  const result = {
    ...profile,
    portfolio_count: parseInt(portfolioCount),
    portfolio_preview: portfolioPreview,
  };

  // Cache result
  await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));

  return result;
}

async function getPortfolio(slug, { page = 1, limit = 20 }) {
  const profile = await db('tailor_profiles')
    .where({ storefront_slug: slug })
    .select('user_id')
    .first();

  if (!profile) throw new AppError('Storefront not found', 404, 'NOT_FOUND');

  const offset = (page - 1) * limit;

  const [{ count }] = await db('portfolio_items')
    .where({ tailor_id: profile.user_id })
    .count('id as count');

  const items = await db('portfolio_items')
    .where({ tailor_id: profile.user_id })
    .orderBy('display_order', 'asc')
    .orderBy('created_at', 'desc')
    .select('id', 'title', 'image_url', 'rating', 'display_order', 'created_at')
    .limit(limit)
    .offset(offset);

  return {
    items,
    pagination: {
      page,
      limit,
      total: parseInt(count),
      pages: Math.ceil(parseInt(count) / limit),
    },
  };
}

async function getReviews(slug, { page = 1, limit = 10 }) {
  const profile = await db('tailor_profiles')
    .where({ storefront_slug: slug })
    .select('user_id')
    .first();

  if (!profile) throw new AppError('Storefront not found', 404, 'NOT_FOUND');

  const offset = (page - 1) * limit;

  const [{ count }] = await db('reviews')
    .where({ tailor_id: profile.user_id, is_visible: true })
    .count('id as count');

  const reviews = await db('reviews as r')
    .join('users as u', 'u.id', 'r.customer_id')
    .where({ 'r.tailor_id': profile.user_id, 'r.is_visible': true })
    .select(
      'r.id',
      'r.rating',
      'r.text',
      'r.created_at',
      'u.name as customer_name',
      'u.initials as customer_initials',
      'u.avatar_url as customer_avatar',
      'u.avatar_color as customer_avatar_color'
    )
    .orderBy('r.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    reviews,
    pagination: {
      page,
      limit,
      total: parseInt(count),
      pages: Math.ceil(parseInt(count) / limit),
    },
  };
}

async function updateStorefront(tailorId, data) {
  const profile = await db('tailor_profiles').where({ user_id: tailorId }).first();
  if (!profile) throw new AppError('Tailor profile not found', 404, 'NOT_FOUND');

  const updates = {};
  if (data.bio !== undefined) updates.storefront_bio = data.bio;
  if (data.image !== undefined) updates.storefront_image = data.image;
  if (data.response_time !== undefined) updates.response_time = data.response_time;
  if (data.start_price !== undefined) updates.start_price = data.start_price;
  if (data.years_experience !== undefined) updates.years_experience = data.years_experience;
  if (data.cover_position !== undefined) updates.cover_image_position = data.cover_position;
  if (data.setup_completed !== undefined) updates.storefront_setup_completed = !!data.setup_completed;

  if (data.slug !== undefined) {
    // Check slug uniqueness
    const existing = await db('tailor_profiles')
      .where({ storefront_slug: data.slug })
      .whereNot({ user_id: tailorId })
      .first();
    if (existing) throw new AppError('Slug already taken', 409, 'SLUG_TAKEN');
    updates.storefront_slug = data.slug;
  }

  updates.updated_at = new Date();

  const [updated] = await db('tailor_profiles')
    .where({ user_id: tailorId })
    .update(updates)
    .returning(['storefront_slug', 'storefront_bio', 'storefront_image', 'cover_image_position', 'storefront_setup_completed', 'response_time', 'start_price', 'years_experience', 'updated_at']);

  // Invalidate cache
  await redis.del(`storefront:${profile.storefront_slug}`);
  if (updates.storefront_slug && updates.storefront_slug !== profile.storefront_slug) {
    await redis.del(`storefront:${updates.storefront_slug}`);
  }

  return updated;
}

async function addPortfolioItem(tailorId, data) {
  const [item] = await db('portfolio_items')
    .insert({
      tailor_id: tailorId,
      title: data.title,
      image_url: data.image_url,
      display_order: data.display_order || 0,
    })
    .returning('*');

  // Invalidate storefront cache
  const profile = await db('tailor_profiles').where({ user_id: tailorId }).select('storefront_slug').first();
  if (profile?.storefront_slug) {
    await redis.del(`storefront:${profile.storefront_slug}`);
  }

  return item;
}

async function removePortfolioItem(tailorId, itemId) {
  const item = await db('portfolio_items')
    .where({ id: itemId, tailor_id: tailorId })
    .first();

  if (!item) throw new AppError('Portfolio item not found', 404, 'NOT_FOUND');

  await db('portfolio_items').where({ id: itemId }).del();

  // Invalidate storefront cache
  const profile = await db('tailor_profiles').where({ user_id: tailorId }).select('storefront_slug').first();
  if (profile?.storefront_slug) {
    await redis.del(`storefront:${profile.storefront_slug}`);
  }
}

module.exports = {
  getStorefront,
  getPortfolio,
  getReviews,
  updateStorefront,
  addPortfolioItem,
  removePortfolioItem,
};
