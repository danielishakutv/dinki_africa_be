const db = require('../../config/database');
const AppError = require('../../utils/AppError');

// Columns returned for a card in the feed. Kept lean so the grid stays light.
const CARD_COLUMNS = [
  's.id', 's.title', 's.image_url', 's.thumb_url', 's.category', 's.tags',
  's.source_type', 's.source_name', 's.source_url', 's.tailor_id', 's.price',
  's.like_count', 's.save_count', 's.comment_count', 's.view_count', 's.created_at',
  'tu.name as tailor_name', 'tu.avatar_url as tailor_avatar', 'tu.initials as tailor_initials',
  'tu.avatar_color as tailor_avatar_color', 'tp.storefront_slug as tailor_slug',
];

function baseQuery() {
  return db('styles as s')
    .leftJoin('users as tu', 'tu.id', 's.tailor_id')
    .leftJoin('tailor_profiles as tp', 'tp.user_id', 's.tailor_id');
}

// Annotate each row with the viewer's like/save state. Done as correlated
// EXISTS subqueries so a logged-out viewer pays nothing and a logged-in viewer
// gets accurate filled hearts/saves without an extra round trip.
function withViewerState(query, userId) {
  if (userId) {
    query
      .select(db.raw('EXISTS(SELECT 1 FROM style_likes sl WHERE sl.style_id = s.id AND sl.user_id = ?) AS liked', [userId]))
      .select(db.raw("EXISTS(SELECT 1 FROM favourites f WHERE f.item_type = 'style' AND f.item_id = s.id AND f.user_id = ?) AS saved", [userId]));
  }
  return query;
}

function normalizeRow(row, userId) {
  return {
    ...row,
    tags: row.tags || [],
    liked: userId ? !!row.liked : false,
    saved: userId ? !!row.saved : false,
  };
}

async function listStyles({ category, tag, q, source_type, sort = 'recent', page = 1, limit = 24 }, userId) {
  const filtered = baseQuery().where('s.is_published', true);

  if (category) filtered.where('s.category', category);
  if (source_type) filtered.where('s.source_type', source_type);
  if (tag) filtered.whereRaw('? = ANY(s.tags)', [tag]);
  if (q) {
    filtered.where((b) => {
      b.where('s.title', 'ilike', `%${q}%`)
        .orWhere('s.description', 'ilike', `%${q}%`)
        .orWhere('s.category', 'ilike', `%${q}%`)
        .orWhereRaw('EXISTS (SELECT 1 FROM unnest(s.tags) AS t WHERE t ILIKE ?)', [`%${q}%`]);
    });
  }

  const [{ count }] = await filtered.clone().count('s.id as count');
  const total = parseInt(count, 10);

  const offset = (page - 1) * limit;
  const rows = await withViewerState(filtered.select(CARD_COLUMNS), userId)
    .modify((qb) => {
      if (sort === 'trending') {
        // Recency-weighted engagement so a hot new style can out-rank an old
        // one that merely accumulated views.
        qb.orderByRaw('(s.like_count * 2 + s.save_count * 3 + s.comment_count * 2 + s.view_count * 0.2) DESC, s.created_at DESC');
      } else {
        qb.orderBy('s.created_at', 'desc');
      }
    })
    .limit(limit)
    .offset(offset);

  return {
    items: rows.map((r) => normalizeRow(r, userId)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
}

async function getStyle(id, userId) {
  const row = await withViewerState(
    baseQuery().where('s.id', id).where('s.is_published', true)
      .select([...CARD_COLUMNS, 's.description']),
    userId
  ).first();

  if (!row) throw new AppError('Style not found', 404, 'NOT_FOUND');

  // Count the view. Fire-and-forget — a counter hiccup must never break the page.
  db('styles').where({ id }).increment('view_count', 1)
    .catch((err) => console.error('[STYLES] view increment failed:', err.message));

  const similar = await getSimilar(row, userId);
  return { ...normalizeRow(row, userId), similar };
}

// "More like this" — same category first, then anything sharing a tag, ranked by
// engagement. Always excludes the style being viewed.
async function getSimilar(style, userId, limit = 12) {
  const hasCategory = !!style.category;
  const hasTags = Array.isArray(style.tags) && style.tags.length > 0;

  const query = baseQuery()
    .where('s.is_published', true)
    .whereNot('s.id', style.id)
    .modify((qb) => {
      // Prefer same-category / shared-tag styles; if the style has neither, fall
      // back to global trending (no grouping clause — avoids an empty WHERE group).
      if (hasCategory || hasTags) {
        qb.where((b) => {
          if (hasCategory) b.orWhere('s.category', style.category);
          if (hasTags) b.orWhereRaw('s.tags && ?::text[]', [style.tags]);
        });
      }
    })
    .select(CARD_COLUMNS)
    .orderByRaw('(s.like_count * 2 + s.save_count * 3 + s.view_count * 0.2) DESC, s.created_at DESC')
    .limit(limit);

  const rows = await withViewerState(query, userId);
  return rows.map((r) => normalizeRow(r, userId));
}

async function toggleLike(styleId, userId) {
  const style = await db('styles').where({ id: styleId }).first('id');
  if (!style) throw new AppError('Style not found', 404, 'NOT_FOUND');

  const existing = await db('style_likes').where({ style_id: styleId, user_id: userId }).first();

  if (existing) {
    await db('style_likes').where({ id: existing.id }).del();
    const [updated] = await db('styles').where({ id: styleId })
      .whereRaw('like_count > 0').decrement('like_count', 1)
      .returning('like_count');
    return { liked: false, like_count: updated ? updated.like_count : 0 };
  }

  await db('style_likes').insert({ style_id: styleId, user_id: userId });
  const [updated] = await db('styles').where({ id: styleId })
    .increment('like_count', 1).returning('like_count');
  return { liked: true, like_count: updated.like_count };
}

async function listComments(styleId, { page = 1, limit = 30 }) {
  const offset = (page - 1) * limit;
  const [{ count }] = await db('style_comments').where({ style_id: styleId }).count('id as count');

  const comments = await db('style_comments as c')
    .join('users as u', 'u.id', 'c.user_id')
    .where('c.style_id', styleId)
    .select('c.id', 'c.body', 'c.created_at', 'c.user_id',
      'u.name as author_name', 'u.avatar_url as author_avatar',
      'u.initials as author_initials', 'u.avatar_color as author_avatar_color')
    .orderBy('c.created_at', 'desc')
    .limit(limit)
    .offset(offset);

  return {
    comments,
    pagination: { page, limit, total: parseInt(count, 10), pages: Math.ceil(parseInt(count, 10) / limit) },
  };
}

async function addComment(styleId, userId, body) {
  const style = await db('styles').where({ id: styleId }).first('id');
  if (!style) throw new AppError('Style not found', 404, 'NOT_FOUND');

  const [comment] = await db('style_comments')
    .insert({ style_id: styleId, user_id: userId, body })
    .returning(['id', 'body', 'created_at', 'user_id']);

  await db('styles').where({ id: styleId }).increment('comment_count', 1);

  const author = await db('users').where({ id: userId })
    .first('name as author_name', 'avatar_url as author_avatar', 'initials as author_initials', 'avatar_color as author_avatar_color');

  return { ...comment, ...author };
}

async function deleteComment(commentId, userId, role) {
  const comment = await db('style_comments').where({ id: commentId }).first();
  if (!comment) throw new AppError('Comment not found', 404, 'NOT_FOUND');

  const isAdmin = role === 'admin' || role === 'superadmin';
  if (comment.user_id !== userId && !isAdmin) {
    throw new AppError('Not allowed to delete this comment', 403, 'FORBIDDEN');
  }

  await db('style_comments').where({ id: commentId }).del();
  await db('styles').where({ id: comment.style_id }).whereRaw('comment_count > 0').decrement('comment_count', 1);
  return { deleted: true };
}

// Create a style. Tailors publish their own work (source_type forced to 'tailor');
// admins/superadmins curate from any source.
async function createStyle(user, data) {
  const isAdmin = user.role === 'admin' || user.role === 'superadmin';

  const insert = {
    title: data.title,
    description: data.description || null,
    image_url: data.image_url,
    thumb_url: data.thumb_url || null,
    category: data.category || null,
    tags: data.tags && data.tags.length ? data.tags : null,
    color: data.color || null,
    price: data.price != null ? data.price : null,
    created_by: user.id,
  };

  if (isAdmin) {
    insert.source_type = data.source_type || 'admin';
    insert.tailor_id = data.tailor_id || null;
    insert.source_name = data.source_name || null;
    insert.source_url = data.source_url || null;
  } else {
    // Tailor self-publishing — always attributed to them.
    insert.source_type = 'tailor';
    insert.tailor_id = user.id;
  }

  const [created] = await db('styles').insert(insert).returning('*');
  return created;
}

async function deleteStyle(styleId, user) {
  const style = await db('styles').where({ id: styleId }).first();
  if (!style) throw new AppError('Style not found', 404, 'NOT_FOUND');

  const isAdmin = user.role === 'admin' || user.role === 'superadmin';
  const isOwnerTailor = style.source_type === 'tailor' && style.tailor_id === user.id;
  if (!isAdmin && !isOwnerTailor) {
    throw new AppError('Not allowed to delete this style', 403, 'FORBIDDEN');
  }

  await db('styles').where({ id: styleId }).del();
  return { deleted: true };
}

// Distinct published categories with counts — powers the filter chips.
async function listCategories() {
  const rows = await db('styles')
    .where({ is_published: true })
    .whereNotNull('category')
    .select('category')
    .count('id as count')
    .groupBy('category')
    .orderBy('count', 'desc');
  return rows.map((r) => ({ category: r.category, count: parseInt(r.count, 10) }));
}

module.exports = {
  listStyles,
  getStyle,
  toggleLike,
  listComments,
  addComment,
  deleteComment,
  createStyle,
  deleteStyle,
  listCategories,
};
