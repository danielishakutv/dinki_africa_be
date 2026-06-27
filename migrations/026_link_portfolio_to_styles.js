/**
 * Make tailor storefront work show up in the public styles feed.
 *
 * Adds styles.portfolio_item_id so each storefront portfolio item can be mirrored
 * as a feed style (source_type='tailor'). Then backfills the feed from every
 * existing portfolio item so current storefronts populate Explore immediately.
 *
 * The mirror is kept in sync by storefronts.service (add → create style,
 * remove → delete the linked style).
 */
exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('styles', 'portfolio_item_id');
  if (!hasCol) {
    await knex.schema.alterTable('styles', (t) => {
      t.uuid('portfolio_item_id').references('id').inTable('portfolio_items').onDelete('CASCADE');
      t.index('portfolio_item_id', 'styles_portfolio_item_idx');
    });
  }

  // Backfill: one feed style per existing portfolio item that isn't mirrored yet.
  await knex.raw(`
    INSERT INTO styles
      (id, title, image_url, thumb_url, source_type, tailor_id, is_published,
       portfolio_item_id, created_by, created_at, updated_at)
    SELECT
      gen_random_uuid(), pi.title, pi.image_url, pi.image_url, 'tailor', pi.tailor_id, true,
      pi.id, pi.tailor_id, pi.created_at, now()
    FROM portfolio_items pi
    WHERE NOT EXISTS (
      SELECT 1 FROM styles s WHERE s.portfolio_item_id = pi.id
    )
  `);
};

exports.down = async function (knex) {
  // Remove mirrored styles, then drop the link column.
  await knex('styles').whereNotNull('portfolio_item_id').del();
  const hasCol = await knex.schema.hasColumn('styles', 'portfolio_item_id');
  if (hasCol) {
    await knex.schema.alterTable('styles', (t) => {
      t.dropColumn('portfolio_item_id');
    });
  }
};
