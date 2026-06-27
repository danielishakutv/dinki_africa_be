/**
 * Styles feed — the public "Pinterest for fashion" discovery surface.
 *
 * A `style` is a single fashion image that anyone can browse before login and
 * interact with after login. Unlike `marketplace_styles` (tailor-scoped, priced,
 * men/women/unisex enum), styles come from many sources — a tailor's work, the
 * superadmin's curation, or external/internet inspiration — and span any category
 * (corporate, native, traditional, casual, accessories, materials, …).
 *
 * Saves reuse the existing `favourites` table (item_type='style'); likes and
 * comments get their own tables here. Counters are denormalised onto `styles`
 * so the grid never has to aggregate on read.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('styles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('title', 200).notNullable();
    t.text('description');

    // Imagery. image_url is the display image; thumb_url is a lighter variant
    // for the grid (falls back to image_url when null).
    t.string('image_url', 1000).notNullable();
    t.string('thumb_url', 1000);

    // Provenance. source_type tells the UI how to attribute the style.
    //  - 'tailor'   → made by a Dinki tailor (tailor_id set; "Contact tailor")
    //  - 'admin'    → curated/uploaded by the superadmin
    //  - 'external' → inspiration from the internet (source_name / source_url)
    t.string('source_type', 20).notNullable().defaultTo('admin')
      .checkIn(['tailor', 'admin', 'external']);
    t.uuid('tailor_id').references('id').inTable('users').onDelete('SET NULL');
    t.string('source_name', 160);   // attribution label when no tailor (e.g. brand, site)
    t.string('source_url', 1000);   // link to the original (external)

    // Classification. category is a free string (not an enum) so the taxonomy
    // can grow — corporate, native, traditional, casual, ankara, agbada, bridal,
    // accessories, materials, … tags add finer, searchable facets.
    t.string('category', 40);
    t.specificType('tags', 'TEXT[]');
    t.string('color', 30);

    // Optional commerce hint — a "from" price in kobo for orderable styles.
    t.integer('price');

    // Denormalised engagement counters.
    t.integer('like_count').notNullable().defaultTo(0);
    t.integer('save_count').notNullable().defaultTo(0);
    t.integer('comment_count').notNullable().defaultTo(0);
    t.integer('view_count').notNullable().defaultTo(0);

    t.boolean('is_published').notNullable().defaultTo(true);
    t.uuid('created_by').references('id').inTable('users').onDelete('SET NULL');
    t.timestamps(true, true);

    t.index(['is_published', 'created_at'], 'styles_published_created_idx');
    t.index('category', 'styles_category_idx');
    t.index('source_type', 'styles_source_type_idx');
    t.index('tailor_id', 'styles_tailor_idx');
  });

  await knex.schema.createTable('style_likes', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('style_id').notNullable().references('id').inTable('styles').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.unique(['style_id', 'user_id']);
  });

  await knex.schema.createTable('style_comments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('style_id').notNullable().references('id').inTable('styles').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('body').notNullable();
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index(['style_id', 'created_at'], 'style_comments_style_idx');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('style_comments');
  await knex.schema.dropTableIfExists('style_likes');
  await knex.schema.dropTableIfExists('styles');
};
