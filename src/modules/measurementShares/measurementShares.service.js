const crypto = require('crypto');
const { nanoid } = require('nanoid');
const db = require('../../config/database');
const config = require('../../config');
const AppError = require('../../utils/AppError');

function publicUrl(token) {
  return `${config.frontendUrl}/m/${token}`;
}

function shape(share) {
  return { ...share, public_url: publicUrl(share.token) };
}

async function createShare(userId, { title, measurements, unit }) {
  const [share] = await db('measurement_shares')
    .insert({
      user_id: userId,
      token: nanoid(12),
      title: title || 'My Measurements',
      // jsonb columns must be serialised explicitly (matches customers.service).
      measurements: JSON.stringify(measurements || {}),
      unit: unit || 'in',
    })
    .returning('*');
  return shape(share);
}

async function listShares(userId) {
  const shares = await db('measurement_shares')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .select('*');
  return shares.map(shape);
}

async function getShare(userId, id) {
  const share = await db('measurement_shares').where({ id, user_id: userId }).first();
  if (!share) throw new AppError('Measurement share not found', 404, 'NOT_FOUND');
  return shape(share);
}

async function updateShare(userId, id, data) {
  const share = await db('measurement_shares').where({ id, user_id: userId }).first();
  if (!share) throw new AppError('Measurement share not found', 404, 'NOT_FOUND');

  const updates = {};
  if (data.title !== undefined) updates.title = data.title;
  if (data.measurements !== undefined) updates.measurements = JSON.stringify(data.measurements);
  if (data.unit !== undefined) updates.unit = data.unit;
  if (data.is_public !== undefined) updates.is_public = !!data.is_public;
  updates.updated_at = new Date();

  const [updated] = await db('measurement_shares').where({ id }).update(updates).returning('*');
  return shape(updated);
}

async function deleteShare(userId, id) {
  const deleted = await db('measurement_shares').where({ id, user_id: userId }).del();
  if (!deleted) throw new AppError('Measurement share not found', 404, 'NOT_FOUND');
  return { deleted: true };
}

// Public view of a share. Records a (lightly de-duplicated) view unless the
// owner is previewing their own link. Returns read-only data + owner attribution.
async function viewByToken(token, { viewerId, ip, userAgent, referrer }) {
  const share = await db('measurement_shares as ms')
    .join('users as u', 'u.id', 'ms.user_id')
    .where('ms.token', token)
    .select('ms.*', 'u.name as owner_name', 'u.initials as owner_initials',
      'u.avatar_url as owner_avatar', 'u.avatar_color as owner_avatar_color')
    .first();

  if (!share || !share.is_public) {
    throw new AppError('This measurement link is unavailable', 404, 'NOT_FOUND');
  }

  const isOwner = viewerId && viewerId === share.user_id;
  if (!isOwner) {
    const viewerHash = crypto.createHash('sha256')
      .update(`${ip || ''}|${userAgent || ''}|${share.id}`).digest('hex').slice(0, 64);

    // De-dup: don't re-count the same viewer within 30 minutes (stops refresh inflation).
    const recent = await db('measurement_share_views')
      .where({ share_id: share.id, viewer_hash: viewerHash })
      .where('viewed_at', '>', new Date(Date.now() - 30 * 60 * 1000))
      .first('id');

    if (!recent) {
      await db('measurement_share_views').insert({
        share_id: share.id,
        viewer_hash: viewerHash,
        referrer: referrer ? String(referrer).slice(0, 255) : null,
      });
      await db('measurement_shares').where({ id: share.id }).increment('view_count', 1);
      share.view_count += 1;
    }
  }

  return {
    title: share.title,
    measurements: share.measurements,
    unit: share.unit,
    view_count: share.view_count,
    created_at: share.created_at,
    owner: {
      name: share.owner_name,
      initials: share.owner_initials,
      avatar_url: share.owner_avatar,
      avatar_color: share.owner_avatar_color,
    },
  };
}

async function getAnalytics(userId, id) {
  const share = await db('measurement_shares').where({ id, user_id: userId }).first();
  if (!share) throw new AppError('Measurement share not found', 404, 'NOT_FOUND');

  const [{ unique_viewers }] = await db('measurement_share_views')
    .where({ share_id: id })
    .countDistinct('viewer_hash as unique_viewers');

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const daily = await db('measurement_share_views')
    .where('share_id', id)
    .where('viewed_at', '>=', since)
    .select(db.raw("to_char(viewed_at, 'YYYY-MM-DD') as day"))
    .count('id as views')
    .groupByRaw("to_char(viewed_at, 'YYYY-MM-DD')")
    .orderBy('day', 'asc');

  const recent = await db('measurement_share_views')
    .where('share_id', id)
    .orderBy('viewed_at', 'desc')
    .limit(10)
    .select('viewed_at', 'referrer');

  return {
    title: share.title,
    public_url: publicUrl(share.token),
    total_views: share.view_count,
    unique_viewers: parseInt(unique_viewers, 10),
    timeseries: daily.map((d) => ({ day: d.day, views: parseInt(d.views, 10) })),
    recent_views: recent,
  };
}

module.exports = {
  createShare,
  listShares,
  getShare,
  updateShare,
  deleteShare,
  viewByToken,
  getAnalytics,
};
