/**
 * Add cover_image_position column to tailor_profiles.
 * Stores CSS object-position value (e.g. "center 30%") for storefront cover image.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tailor_profiles', (t) => {
    t.string('cover_image_position', 50).nullable().defaultTo('center center');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tailor_profiles', (t) => {
    t.dropColumn('cover_image_position');
  });
};
