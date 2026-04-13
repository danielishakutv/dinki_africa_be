exports.up = async function (knex) {
  await knex.schema.createTable('orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('customer_id').notNullable().references('id').inTable('users');
    t.uuid('tailor_id').notNullable().references('id').inTable('users');
    t.string('title', 200).notNullable();
    t.text('description');
    t.integer('budget');
    t.date('due_date');
    t.string('fabric_preference', 100);
    t.text('measurement_notes');
    t.string('status', 20).defaultTo('pending')
      .checkIn(['pending', 'accepted', 'in_progress', 'completed', 'cancelled']);
    t.specificType('reference_images', 'TEXT[]');
    t.uuid('style_id').references('id').inTable('marketplace_styles');
    t.uuid('job_id').references('id').inTable('jobs');
    t.timestamps(true, true);

    t.index('customer_id', 'idx_orders_customer');
    t.index('tailor_id', 'idx_orders_tailor');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('orders');
};
