exports.up = async function (knex) {
  await knex.schema.alterTable('conversations', (t) => {
    // Store array of user IDs who pinned this conversation
    t.jsonb('pinned_by').defaultTo('[]');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('conversations', (t) => {
    t.dropColumn('pinned_by');
  });
};
