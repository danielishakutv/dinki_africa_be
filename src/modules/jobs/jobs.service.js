const db = require('../../config/database');
const AppError = require('../../utils/AppError');

const STATUS_ORDER = ['cutting', 'stitching', 'ready', 'delivered'];

async function listJobs(tailorId, { status, overdue, search, page = 1, limit = 20 }) {
  const query = db('jobs')
    .where({ 'jobs.tailor_id': tailorId })
    .leftJoin('customers', 'jobs.customer_id', 'customers.id')
    .select(
      'jobs.id', 'jobs.title', 'jobs.status', 'jobs.due_date', 'jobs.price',
      'jobs.invoiced', 'jobs.created_at',
      'customers.name as customer_name', 'customers.initials as customer_initials',
      'customers.avatar_color as customer_avatar_color'
    );

  if (status) query.where('jobs.status', status);
  if (overdue) {
    query.where('jobs.due_date', '<', db.fn.now())
      .whereNot('jobs.status', 'delivered');
  }
  if (search) {
    query.where(function () {
      this.whereILike('jobs.title', `%${search}%`)
        .orWhereILike('customers.name', `%${search}%`);
    });
  }

  const offset = (page - 1) * limit;
  const countQuery = query.clone().clearSelect().clearOrder().count('jobs.id as count').first();
  const { count } = await countQuery;

  const jobs = await query
    .orderBy('jobs.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    jobs,
    pagination: {
      page,
      limit,
      total: parseInt(count),
      pages: Math.ceil(parseInt(count) / limit),
    },
  };
}

async function getJob(tailorId, jobId) {
  const job = await db('jobs')
    .where({ 'jobs.id': jobId, 'jobs.tailor_id': tailorId })
    .leftJoin('customers', 'jobs.customer_id', 'customers.id')
    .select(
      'jobs.*',
      'customers.name as customer_name', 'customers.phone as customer_phone',
      'customers.email as customer_email', 'customers.initials as customer_initials',
      'customers.avatar_color as customer_avatar_color'
    )
    .first();

  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND');
  return job;
}

async function createJob(tailorId, data) {
  // Verify customer belongs to this tailor
  const customer = await db('customers')
    .where({ id: data.customer_id, tailor_id: tailorId })
    .first();

  if (!customer) throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');

  const [job] = await db('jobs')
    .insert({
      tailor_id: tailorId,
      customer_id: data.customer_id,
      title: data.title,
      description: data.description || null,
      style_image_url: data.style_image_url || null,
      due_date: data.due_date || null,
      price: data.price || null,
      status: 'cutting',
    })
    .returning('*');

  return job;
}

async function updateJob(tailorId, jobId, data) {
  const job = await db('jobs').where({ id: jobId, tailor_id: tailorId }).first();
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND');

  const allowed = ['title', 'description', 'style_image_url', 'due_date', 'price'];
  const updates = {};
  for (const key of allowed) {
    if (data[key] !== undefined) updates[key] = data[key];
  }

  updates.updated_at = new Date();

  const [updated] = await db('jobs')
    .where({ id: jobId, tailor_id: tailorId })
    .update(updates)
    .returning('*');

  return updated;
}

async function updateStatus(tailorId, jobId, newStatus) {
  const job = await db('jobs').where({ id: jobId, tailor_id: tailorId }).first();
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND');

  const currentIdx = STATUS_ORDER.indexOf(job.status);
  const newIdx = STATUS_ORDER.indexOf(newStatus);

  if (newIdx <= currentIdx) {
    throw new AppError(
      `Cannot transition from '${job.status}' to '${newStatus}'. Status can only advance forward.`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }

  if (newIdx !== currentIdx + 1) {
    throw new AppError(
      `Must advance to '${STATUS_ORDER[currentIdx + 1]}' next`,
      400,
      'INVALID_STATUS_TRANSITION'
    );
  }

  const updates = { status: newStatus, updated_at: new Date() };
  if (newStatus === 'delivered') {
    updates.delivered_at = new Date();
  }

  const [updated] = await db('jobs')
    .where({ id: jobId, tailor_id: tailorId })
    .update(updates)
    .returning('*');

  return updated;
}

async function toggleInvoice(tailorId, jobId, invoiced) {
  const job = await db('jobs').where({ id: jobId, tailor_id: tailorId }).first();
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND');

  if (job.status !== 'ready') {
    throw new AppError('Can only toggle invoice when status is ready', 400, 'INVALID_INVOICE_STATE');
  }

  const updates = {
    invoiced,
    invoiced_at: invoiced ? new Date() : null,
    updated_at: new Date(),
  };

  const [updated] = await db('jobs')
    .where({ id: jobId, tailor_id: tailorId })
    .update(updates)
    .returning('*');

  return updated;
}

async function deleteJob(tailorId, jobId) {
  const job = await db('jobs').where({ id: jobId, tailor_id: tailorId }).first();
  if (!job) throw new AppError('Job not found', 404, 'NOT_FOUND');

  await db('jobs').where({ id: jobId, tailor_id: tailorId }).del();
}

async function getStats(tailorId) {
  const [active] = await db('jobs')
    .where({ tailor_id: tailorId })
    .whereIn('status', ['cutting', 'stitching'])
    .count('id as count');

  const [pendingInvoices] = await db('jobs')
    .where({ tailor_id: tailorId, invoiced: false, status: 'ready' })
    .count('id as count');

  const [pendingValue] = await db('jobs')
    .where({ tailor_id: tailorId, invoiced: false, status: 'ready' })
    .sum('price as total');

  const [totalRevenue] = await db('jobs')
    .where({ tailor_id: tailorId, status: 'delivered' })
    .sum('price as total');

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [monthlyRevenue] = await db('jobs')
    .where({ tailor_id: tailorId, status: 'delivered' })
    .where('delivered_at', '>=', startOfMonth)
    .sum('price as total');

  const [delivered] = await db('jobs')
    .where({ tailor_id: tailorId, status: 'delivered' })
    .count('id as count');

  return {
    activeCount: parseInt(active.count),
    pendingInvoices: parseInt(pendingInvoices.count),
    pendingInvoiceValue: pendingValue.total || 0,
    totalRevenue: totalRevenue.total || 0,
    monthlyRevenue: monthlyRevenue.total || 0,
    deliveredCount: parseInt(delivered.count),
  };
}

module.exports = {
  listJobs,
  getJob,
  createJob,
  updateJob,
  updateStatus,
  toggleInvoice,
  deleteJob,
  getStats,
};
