/**
 * Add cover_image_position and storefront_setup_completed to tailor_profiles.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('tailor_profiles', (t) => {
    t.string('cover_image_position', 50).nullable().defaultTo('center center');
    t.boolean('storefront_setup_completed').notNullable().defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('tailor_profiles', (t) => {
    t.dropColumn('cover_image_position');
    t.dropColumn('storefront_setup_completed');
  });
};
