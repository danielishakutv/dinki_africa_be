exports.up = async function (knex) {
  await knex.schema.createTable('portfolio_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tailor_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('title', 200).notNullable();
    t.string('image_url', 500).notNullable();
    t.decimal('rating', 2, 1);
    t.smallint('display_order').defaultTo(0);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('reviews', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tailor_id').notNullable().references('id').inTable('users');
    t.uuid('customer_id').notNullable().references('id').inTable('users');
    t.uuid('order_id').references('id').inTable('orders');
    t.smallint('rating').notNullable();
    t.text('text');
    t.boolean('is_visible').defaultTo(true);
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  await knex.raw(`
    ALTER TABLE reviews ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5)
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX idx_reviews_unique ON reviews(customer_id, order_id)
  `);
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('reviews');
  await knex.schema.dropTableIfExists('portfolio_items');
};
