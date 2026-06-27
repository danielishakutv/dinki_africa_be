/**
 * Seed the styles feed with a starter set so the Explore grid is alive on first
 * deploy. Idempotent: if any styles already exist it does nothing (never deletes).
 *
 * IMAGES: these use the picsum.photos CDN as lightweight, fast, always-loading
 * placeholders with varied heights (so the masonry looks real). They are NOT
 * fashion photos — replace them with real imagery via the in-app "Add Style"
 * flow (tailors) or admin curation. The token in the URL keeps each tile stable.
 */
const CATEGORIES = [
  { category: 'agbada', tags: ['agbada', 'native', 'mens', 'occasion'], titles: ['Royal Agbada', 'Embroidered Grand Agbada', 'Wedding Agbada Set'] },
  { category: 'ankara', tags: ['ankara', 'print', 'colourful'], titles: ['Ankara Flare Dress', 'Modern Ankara Two-Piece', 'Ankara Peplum Top'] },
  { category: 'aso-ebi', tags: ['aso-ebi', 'lace', 'occasion', 'bridal'], titles: ['Aso-Ebi Lace Gown', 'Beaded Aso-Ebi Style', 'Aso-Ebi Trad Combo'] },
  { category: 'kaftan', tags: ['kaftan', 'casual', 'flowy'], titles: ['Flowing Kaftan', 'Embellished Kaftan', 'Everyday Kaftan'] },
  { category: 'corporate', tags: ['corporate', 'office', 'tailored', 'mens'], titles: ['Sharp Corporate Suit', 'Tailored Two-Piece', 'Office Sheath Dress'] },
  { category: 'native', tags: ['native', 'senator', 'mens'], titles: ['Senator Native Wear', 'Kampala Native', 'Plain Native Set'] },
  { category: 'traditional', tags: ['traditional', 'wrapper', 'occasion'], titles: ['Wrapper & Blouse', 'Iro and Buba', 'Traditional Bridal Trad'] },
  { category: 'casual', tags: ['casual', 'everyday', 'street'], titles: ['Casual Co-ord Set', 'Relaxed Linen Fit', 'Weekend Casual'] },
  { category: 'bridal', tags: ['bridal', 'wedding', 'occasion'], titles: ['Bridal Reception Gown', 'White Wedding Dress', 'Bridal Trad Look'] },
  { category: 'accessories', tags: ['accessories', 'beads', 'gele'], titles: ['Statement Gele', 'Beaded Necklace Set', 'Handcrafted Clutch'] },
  { category: 'materials', tags: ['materials', 'fabric', 'lace', 'ankara'], titles: ['Premium Swiss Lace', 'Ankara Fabric Roll', 'Aso-Oke Material'] },
];

// Deterministic pseudo-variety without Math.random (keeps re-runs stable).
const HEIGHTS = [620, 760, 700, 840, 660, 900, 720, 800];

exports.seed = async function (knex) {
  const [{ count }] = await knex('styles').count('id as count');
  if (parseInt(count, 10) > 0) {
    // Feed already populated — do not duplicate or overwrite.
    return;
  }

  const rows = [];
  let i = 0;
  for (const group of CATEGORIES) {
    group.titles.forEach((title, t) => {
      const seed = `dinki-${group.category}-${t}`;
      const h = HEIGHTS[i % HEIGHTS.length];
      const sourceType = i % 3 === 0 ? 'external' : 'admin';
      rows.push({
        title,
        description: `${title} — a curated ${group.category} look to inspire your next outfit.`,
        image_url: `https://picsum.photos/seed/${seed}/600/${h}`,
        thumb_url: `https://picsum.photos/seed/${seed}/300/${Math.round(h / 2)}`,
        category: group.category,
        tags: group.tags,
        source_type: sourceType,
        source_name: sourceType === 'external' ? 'Dinki Inspiration' : 'Dinki Curated',
        like_count: 4 + ((i * 7) % 40),
        save_count: 2 + ((i * 5) % 30),
        view_count: 30 + ((i * 17) % 300),
        comment_count: (i * 3) % 6,
        is_published: true,
      });
      i += 1;
    });
  }

  await knex('styles').insert(rows);
  // eslint-disable-next-line no-console
  console.log(`[SEED] inserted ${rows.length} starter styles`);
};
