const db = require('../../config/database');
const AppError = require('../../utils/AppError');

async function createOrder(customerId, data) {
  // Verify tailor exists and is active
  const tailor = await db('users')
    .where({ id: data.tailor_id, role: 'tailor', is_active: true })
    .first();
  if (!tailor) throw new AppError('Tailor not found', 404, 'TAILOR_NOT_FOUND');

  // Verify style_id if provided
  if (data.style_id) {
    const style = await db('marketplace_styles')
      .where({ id: data.style_id, is_active: true })
      .first();
    if (!style) throw new AppError('Style not found', 404, 'STYLE_NOT_FOUND');
  }

  const [order] = await db('orders')
    .insert({
      customer_id: customerId,
      tailor_id: data.tailor_id,
      title: data.title,
      description: data.description || null,
      budget: data.budget || null,
      due_date: data.due_date || null,
      fabric_preference: data.fabric_preference || null,
      measurement_notes: data.measurement_notes || null,
      style_id: data.style_id || null,
      status: 'pending',
    })
    .returning('*');

  return order;
}

async function listCustomerOrders(customerId, { status, page = 1, limit = 20 }) {
  const query = db('orders')
    .where({ 'orders.customer_id': customerId })
    .join('users as tailor', 'tailor.id', 'orders.tailor_id')
    .select(
      'orders.id', 'orders.title', 'orders.status', 'orders.budget',
      'orders.due_date', 'orders.created_at',
      'tailor.name as tailor_name', 'tailor.initials as tailor_initials',
      'tailor.avatar_url as tailor_avatar', 'tailor.avatar_color as tailor_avatar_color'
    );

  if (status) query.where('orders.status', status);

  const offset = (page - 1) * limit;
  const [{ count }] = await query.clone().clearSelect().clearOrder().count('orders.id as count');

  const orders = await query
    .orderBy('orders.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    orders,
    pagination: {
      page,
      limit,
      total: parseInt(count),
      pages: Math.ceil(parseInt(count) / limit),
    },
  };
}

async function listTailorOrders(tailorId, { status, page = 1, limit = 20 }) {
  const query = db('orders')
    .where({ 'orders.tailor_id': tailorId })
    .join('users as customer', 'customer.id', 'orders.customer_id')
    .select(
      'orders.id', 'orders.title', 'orders.status', 'orders.budget',
      'orders.due_date', 'orders.description', 'orders.fabric_preference',
      'orders.measurement_notes', 'orders.reference_images', 'orders.created_at',
      'customer.name as customer_name', 'customer.initials as customer_initials',
      'customer.avatar_url as customer_avatar', 'customer.avatar_color as customer_avatar_color'
    );

  if (status) query.where('orders.status', status);

  const offset = (page - 1) * limit;
  const [{ count }] = await query.clone().clearSelect().clearOrder().count('orders.id as count');

  const orders = await query
    .orderBy('orders.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    orders,
    pagination: {
      page,
      limit,
      total: parseInt(count),
      pages: Math.ceil(parseInt(count) / limit),
    },
  };
}

async function getOrder(userId, orderId) {
  const order = await db('orders')
    .where({ 'orders.id': orderId })
    .join('users as tailor', 'tailor.id', 'orders.tailor_id')
    .join('users as customer', 'customer.id', 'orders.customer_id')
    .select(
      'orders.*',
      'tailor.name as tailor_name', 'tailor.initials as tailor_initials',
      'tailor.avatar_url as tailor_avatar', 'tailor.avatar_color as tailor_avatar_color',
      'customer.name as customer_name', 'customer.initials as customer_initials',
      'customer.avatar_url as customer_avatar', 'customer.avatar_color as customer_avatar_color'
    )
    .first();

  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');

  // Ensure the user is either the customer or the tailor
  if (order.customer_id !== userId && order.tailor_id !== userId) {
    throw new AppError('Not authorized to view this order', 403, 'FORBIDDEN');
  }

  return order;
}

async function acceptOrder(tailorId, orderId) {
  const order = await db('orders')
    .where({ id: orderId, tailor_id: tailorId })
    .first();

  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');
  if (order.status !== 'pending') {
    throw new AppError(`Cannot accept order with status '${order.status}'`, 400, 'INVALID_STATUS');
  }

  // Auto-create a job from this order
  // First, check if customer is already in tailor's customer list — if not, create them
  const customerUser = await db('users').where({ id: order.customer_id }).first();

  let tailorCustomer = await db('customers')
    .where({ tailor_id: tailorId })
    .where(function () {
      this.where('email', customerUser.email)
        .orWhere('phone', customerUser.phone);
    })
    .first();

  if (!tailorCustomer) {
    const initials = customerUser.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    const avatarColor = colors[Math.floor(Math.random() * colors.length)];

    [tailorCustomer] = await db('customers')
      .insert({
        tailor_id: tailorId,
        name: customerUser.name,
        phone: customerUser.phone || null,
        email: customerUser.email,
        initials,
        avatar_color: avatarColor,
      })
      .returning('*');
  }

  // Create the job
  const [job] = await db('jobs')
    .insert({
      tailor_id: tailorId,
      customer_id: tailorCustomer.id,
      title: order.title,
      description: order.description || null,
      style_image_url: order.reference_images?.[0] || null,
      due_date: order.due_date || null,
      price: order.budget || null,
      status: 'cutting',
    })
    .returning('*');

  // Update order status and link to job
  const [updated] = await db('orders')
    .where({ id: orderId })
    .update({
      status: 'accepted',
      job_id: job.id,
      updated_at: new Date(),
    })
    .returning('*');

  // Increment tailor's completed_jobs count is handled when job reaches 'delivered'
  return { order: updated, job };
}

async function declineOrder(tailorId, orderId, reason) {
  const order = await db('orders')
    .where({ id: orderId, tailor_id: tailorId })
    .first();

  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');
  if (order.status !== 'pending') {
    throw new AppError(`Cannot decline order with status '${order.status}'`, 400, 'INVALID_STATUS');
  }

  const [updated] = await db('orders')
    .where({ id: orderId })
    .update({
      status: 'cancelled',
      description: order.description
        ? `${order.description}\n\n--- Declined: ${reason}`
        : `Declined: ${reason}`,
      updated_at: new Date(),
    })
    .returning('*');

  return updated;
}

async function cancelOrder(customerId, orderId) {
  const order = await db('orders')
    .where({ id: orderId, customer_id: customerId })
    .first();

  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');
  if (order.status !== 'pending') {
    throw new AppError('Only pending orders can be cancelled', 400, 'INVALID_STATUS');
  }

  const [updated] = await db('orders')
    .where({ id: orderId })
    .update({
      status: 'cancelled',
      updated_at: new Date(),
    })
    .returning('*');

  return updated;
}

async function addReferenceImages(customerId, orderId, imageUrls) {
  const order = await db('orders')
    .where({ id: orderId, customer_id: customerId })
    .first();

  if (!order) throw new AppError('Order not found', 404, 'NOT_FOUND');
  if (order.status === 'cancelled' || order.status === 'completed') {
    throw new AppError('Cannot add images to this order', 400, 'INVALID_STATUS');
  }

  const existing = order.reference_images || [];
  const combined = [...existing, ...imageUrls];

  if (combined.length > 4) {
    throw new AppError('Maximum 4 reference images allowed', 400, 'MAX_IMAGES_EXCEEDED');
  }

  const [updated] = await db('orders')
    .where({ id: orderId })
    .update({
      reference_images: combined,
      updated_at: new Date(),
    })
    .returning('*');

  return updated;
}

module.exports = {
  createOrder,
  listCustomerOrders,
  listTailorOrders,
  getOrder,
  acceptOrder,
  declineOrder,
  cancelOrder,
  addReferenceImages,
};
