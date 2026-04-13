const db = require('../../config/database');
const redis = require('../../config/redis');
const AppError = require('../../utils/AppError');

async function createReview(customerId, data) {
  // Verify the order exists, belongs to this customer, and is completed/delivered
  const order = await db('orders')
    .where({ id: data.order_id, customer_id: customerId })
    .first();

  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');

  if (order.status !== 'completed' && order.status !== 'accepted') {
    throw new AppError('Can only review completed orders', 400, 'ORDER_NOT_COMPLETED');
  }

  // Check if already reviewed
  const existing = await db('reviews')
    .where({ customer_id: customerId, order_id: data.order_id })
    .first();

  if (existing) throw new AppError('You have already reviewed this order', 409, 'ALREADY_REVIEWED');

  // Insert review
  const [review] = await db('reviews')
    .insert({
      tailor_id: order.tailor_id,
      customer_id: customerId,
      order_id: data.order_id,
      rating: data.rating,
      text: data.text || null,
    })
    .returning('*');

  // Recalculate tailor's average rating
  await recalculateRating(order.tailor_id);

  return review;
}

async function recalculateRating(tailorId) {
  const [agg] = await db('reviews')
    .where({ tailor_id: tailorId, is_visible: true })
    .select(
      db.raw('COUNT(id) as count'),
      db.raw('COALESCE(AVG(rating), 0) as avg')
    );

  await db('tailor_profiles')
    .where({ user_id: tailorId })
    .update({
      rating_avg: parseFloat(agg.avg).toFixed(2),
      rating_count: parseInt(agg.count),
      updated_at: new Date(),
    });

  // Invalidate storefront cache
  const profile = await db('tailor_profiles')
    .where({ user_id: tailorId })
    .select('storefront_slug')
    .first();

  if (profile?.storefront_slug) {
    await redis.del(`storefront:${profile.storefront_slug}`);
  }
}

async function getMyReviews(customerId, { page = 1, limit = 20 }) {
  const offset = (page - 1) * limit;

  const [{ count }] = await db('reviews')
    .where({ customer_id: customerId })
    .count('id as count');

  const reviews = await db('reviews as r')
    .where({ 'r.customer_id': customerId })
    .join('users as t', 't.id', 'r.tailor_id')
    .select(
      'r.id', 'r.rating', 'r.text', 'r.order_id', 'r.created_at',
      't.name as tailor_name', 't.initials as tailor_initials',
      't.avatar_url as tailor_avatar'
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

module.exports = {
  createReview,
  getMyReviews,
};
