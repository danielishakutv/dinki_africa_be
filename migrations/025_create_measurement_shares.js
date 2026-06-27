/**
 * Customer-owned measurement share links.
 *
 * A customer can publish one or more measurement sets as a public "Dinki link"
 * (dinki.africa/m/:token) they can hand to any tailor. Each share is a
 * self-contained snapshot (so editing later never silently changes a link a
 * tailor already saved) plus a view tally for the owner's analytics.
 *
 * This is intentionally separate from `customers.measurements` (which is
 * tailor-entered, per-tailor). Here the platform user owns and controls the data.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('measurement_shares', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token', 24).notNullable().unique();   // public, unguessable slug
    t.string('title', 120).notNullable().defaultTo('My Measurements');
    // { standard: { chest: 38, ... }, custom: [{ key,label,unit,value }], notes }
    t.jsonb('measurements').notNullable().defaultTo('{}');
    t.string('unit', 8).notNullable().defaultTo('in');
    t.boolean('is_public').notNullable().defaultTo(true);
    t.integer('view_count').notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.index('user_id', 'measurement_shares_user_idx');
  });

  await knex.schema.createTable('measurement_share_views', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('share_id').notNullable().references('id').inTable('measurement_shares').onDelete('CASCADE');
    // Hash of ip+ua — lets us count unique-ish viewers without storing PII.
    t.string('viewer_hash', 64);
    t.string('referrer', 255);
    t.timestamp('viewed_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index(['share_id', 'viewed_at'], 'measurement_share_views_idx');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('measurement_share_views');
  await knex.schema.dropTableIfExists('measurement_shares');
};
