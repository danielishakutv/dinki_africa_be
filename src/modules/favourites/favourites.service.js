const db = require('../../config/database');
const AppError = require('../../utils/AppError');

async function toggleFavourite(userId, { item_type, item_id }) {
  // Check if already favourited
  const existing = await db('favourites')
    .where({ user_id: userId, item_type, item_id })
    .first();

  if (existing) {
    // Remove favourite
    await db('favourites').where({ id: existing.id }).del();

    // "Save" a style is a favourite — keep the style's save_count in sync.
    if (item_type === 'style') {
      await db('styles')
        .where({ id: item_id })
        .whereRaw('save_count > 0')
        .decrement('save_count', 1);
    }

    return { favourited: false };
  }

  // Add favourite
  const [fav] = await db('favourites')
    .insert({ user_id: userId, item_type, item_id })
    .returning('*');

  if (item_type === 'style') {
    await db('styles')
      .where({ id: item_id })
      .increment('save_count', 1);
  }

  return { favourited: true, id: fav.id };
}

async function listFavourites(userId, { type, page = 1, limit = 20 }) {
  const query = db('favourites').where({ user_id: userId });

  if (type) query.where('item_type', type);

  const offset = (page - 1) * limit;
  const [{ count }] = await query.clone().count('id as count');

  const favourites = await query
    .select('id', 'item_type', 'item_id', 'created_at')
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset);

  // Enrich with item details
  const enriched = await Promise.all(
    favourites.map(async (fav) => {
      let item = null;
      if (fav.item_type === 'tailor') {
        item = await db('users')
          .where({ id: fav.item_id })
          .select('id', 'name', 'initials', 'avatar_url', 'avatar_color', 'location_city')
          .first();
      } else if (fav.item_type === 'style') {
        item = await db('styles as s')
          .leftJoin('users as tu', 'tu.id', 's.tailor_id')
          .leftJoin('tailor_profiles as tp', 'tp.user_id', 's.tailor_id')
          .where('s.id', fav.item_id)
          .select('s.id', 's.title', 's.image_url', 's.thumb_url', 's.category',
            's.price', 's.like_count', 's.save_count', 's.source_type', 's.source_name',
            'tu.name as tailor_name', 'tp.storefront_slug as tailor_slug')
          .first();
      } else if (fav.item_type === 'fabric') {
        item = await db('fabrics')
          .where({ id: fav.item_id })
          .select('id', 'name', 'price', 'origin', 'images')
          .first();
      }
      return { ...fav, item };
    })
  );

  return {
    favourites: enriched,
    pagination: {
      page,
      limit,
      total: parseInt(count),
      pages: Math.ceil(parseInt(count) / limit),
    },
  };
}

async function checkFavourites(userId, items) {
  // items = [{ item_type, item_id }, ...]
  if (!Array.isArray(items) || items.length === 0) return [];

  const results = await Promise.all(
    items.map(async ({ item_type, item_id }) => {
      const fav = await db('favourites')
        .where({ user_id: userId, item_type, item_id })
        .first();
      return { item_type, item_id, favourited: !!fav };
    })
  );

  return results;
}

module.exports = {
  toggleFavourite,
  listFavourites,
  checkFavourites,
};
