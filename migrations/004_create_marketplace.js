exports.up = async function (knex) {
  await knex.schema.createTable('marketplace_styles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('tailor_id').notNullable().references('id').inTable('users');
    t.string('title', 200).notNullable();
    t.text('description');
    t.integer('price').notNullable();
    t.string('category', 30).checkIn(['men', 'women', 'unisex']);
    t.specificType('images', 'TEXT[]').notNullable();
    t.specificType('colors', 'TEXT[]');
    t.boolean('is_active').defaultTo(true);
    t.integer('view_count').defaultTo(0);
    t.integer('favourite_count').defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('fabrics', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('seller_id').references('id').inTable('users');
    t.string('name', 100).notNullable();
    t.string('origin', 100);
    t.integer('price').notNullable();
    t.string('unit', 30);
    t.string('color_hex', 7);
    t.string('pattern', 50);
    t.boolean('in_stock').defaultTo(true);
    t.specificType('images', 'TEXT[]');
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('fabrics');
  await knex.schema.dropTableIfExists('marketplace_styles');
};
