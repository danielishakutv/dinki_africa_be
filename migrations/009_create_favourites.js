exports.up = async function (knex) {
  await knex.schema.createTable('favourites', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('item_type', 20).notNullable().checkIn(['style', 'fabric', 'tailor']);
    t.uuid('item_id').notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['user_id', 'item_type', 'item_id']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('favourites');
};
