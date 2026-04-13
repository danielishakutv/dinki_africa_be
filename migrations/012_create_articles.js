exports.up = async function (knex) {
  await knex.schema.createTable('articles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('author_id').references('id').inTable('users');
    t.string('title', 300).notNullable();
    t.string('slug', 300).unique().notNullable();
    t.text('excerpt');
    t.text('body');
    t.string('category', 30).checkIn(['tips', 'business', 'industry', 'trends']);
    t.string('image_url', 500);
    t.smallint('read_time_minutes');
    t.boolean('is_featured').defaultTo(false);
    t.boolean('is_published').defaultTo(false);
    t.timestamp('published_at', { useTz: true });
    t.integer('view_count').defaultTo(0);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('articles');
};
