exports.up = async function (knex) {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).unique().notNullable();
    t.string('password_hash', 255).notNullable();
    t.string('role', 20).notNullable().checkIn(['customer', 'tailor', 'admin']);
    t.string('name', 100).notNullable();
    t.string('phone', 20);
    t.string('avatar_url', 500);
    t.string('initials', 3);
    t.string('avatar_color', 50);
    t.text('bio');
    t.string('location_city', 100);
    t.string('location_state', 100);
    t.string('location_country', 3).defaultTo('NGA');
    t.decimal('latitude', 10, 8);
    t.decimal('longitude', 11, 8);
    t.specificType('specialties', 'TEXT[]');
    t.boolean('email_verified').defaultTo(false);
    t.boolean('phone_verified').defaultTo(false);
    t.boolean('is_active').defaultTo(true);
    t.timestamp('last_login_at', { useTz: true });
    t.integer('login_count').defaultTo(0);
    t.integer('failed_login_count').defaultTo(0);
    t.timestamp('locked_until', { useTz: true });
    t.jsonb('preferences').defaultTo('{}');
    t.boolean('onboarding_completed').defaultTo(false);
    t.string('referral_code', 20).unique();
    t.uuid('referred_by').references('id').inTable('users');
    t.timestamps(true, true);
  });

  await knex.schema.createTable('tailor_profiles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').unique().notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.boolean('verified').defaultTo(false);
    t.timestamp('verified_at', { useTz: true });
    t.uuid('verified_by').references('id').inTable('users');
    t.integer('completed_jobs').defaultTo(0);
    t.string('response_time', 30).defaultTo('2 hours');
    t.integer('start_price');
    t.integer('years_experience').defaultTo(0);
    t.decimal('rating_avg', 3, 2).defaultTo(0);
    t.integer('rating_count').defaultTo(0);
    t.string('storefront_slug', 50).unique();
    t.text('storefront_bio');
    t.string('storefront_image', 500);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('tailor_profiles');
  await knex.schema.dropTableIfExists('users');
};
