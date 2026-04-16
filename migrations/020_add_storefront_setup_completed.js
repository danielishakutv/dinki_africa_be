/**
 * Add storefront_setup_completed to tailor_profiles.
 * Separated because 019 was already applied before this column was added.
 */
exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('tailor_profiles', 'storefront_setup_completed');
  if (!hasCol) {
    await knex.schema.alterTable('tailor_profiles', (t) => {
      t.boolean('storefront_setup_completed').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('tailor_profiles', 'storefront_setup_completed');
  if (hasCol) {
    await knex.schema.alterTable('tailor_profiles', (t) => {
      t.dropColumn('storefront_setup_completed');
    });
  }
};
