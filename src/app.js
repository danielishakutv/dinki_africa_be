const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const hpp = require('hpp');
const config = require('./config');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

// Trust proxy (behind Apache/Cloudflare)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));

// Cookie parser
app.use(cookieParser());

// Prevent HTTP parameter pollution
app.use(hpp());

// Compression
app.use(compression());

// Request logging
if (config.env !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Serve uploaded files
const path = require('path');
app.use('/uploads', express.static(path.resolve(config.upload.dir), {
  maxAge: '7d',
  immutable: true,
}));

// Health check
app.get('/v1/health', async (req, res) => {
  const db = require('./config/database');
  const redis = require('./config/redis');

  let dbStatus = 'ok';
  let redisStatus = 'ok';

  try {
    await db.raw('SELECT 1');
  } catch {
    dbStatus = 'error';
  }

  try {
    await redis.ping();
  } catch {
    redisStatus = 'error';
  }

  const status = dbStatus === 'ok' && redisStatus === 'ok' ? 200 : 503;

  res.status(status).json({
    success: true,
    data: {
      status: status === 200 ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      db: dbStatus,
      redis: redisStatus,
      timestamp: new Date().toISOString(),
    },
  });
});

// API routes
app.use('/v1/auth', require('./modules/auth/auth.routes'));
app.use('/v1/users', require('./modules/users/users.routes'));
app.use('/v1/customers', require('./modules/customers/customers.routes'));
app.use('/v1/jobs', require('./modules/jobs/jobs.routes'));
app.use('/v1/storefronts', require('./modules/storefronts/storefronts.routes'));
app.use('/v1/orders', require('./modules/orders/orders.routes'));
app.use('/v1/reviews', require('./modules/reviews/reviews.routes'));
app.use('/v1/favourites', require('./modules/favourites/favourites.routes'));
app.use('/v1/conversations', require('./modules/messaging/messaging.routes'));
app.use('/v1/notifications', require('./modules/notifications/notifications.routes'));
app.use('/v1/uploads', require('./modules/uploads/uploads.routes'));

// OG meta page for shared storefront links.
// Crawlers (WhatsApp, iMessage, Facebook) GET /t/:slug here and receive tailor-specific
// og:* / twitter:* meta tags. Real users are immediately JS-redirected to the SPA.
const _escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

app.get('/t/:slug', async (req, res, next) => {
  const { slug } = req.params;
  if (!/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(slug)) {
    return next(new AppError('Invalid storefront slug', 400, 'INVALID_SLUG'));
  }
  try {
    const storefrontsService = require('./modules/storefronts/storefronts.service');
    const meta = await storefrontsService.getShareMeta(slug);
    const spaUrl = `${config.frontendUrl}/${encodeURIComponent(slug)}`;
    const e = _escapeHtml;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${e(meta.title)}</title>
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="Dinki Africa" />
  <meta property="og:title" content="${e(meta.title)}" />
  <meta property="og:description" content="${e(meta.description)}" />
  <meta property="og:image" content="${e(meta.image_url)}" />
  <meta property="og:url" content="${e(meta.canonical_url)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${e(meta.title)}" />
  <meta name="twitter:description" content="${e(meta.description)}" />
  <meta name="twitter:image" content="${e(meta.image_url)}" />
  <link rel="canonical" href="${e(meta.canonical_url)}" />
  <meta http-equiv="refresh" content="0; url=${e(spaUrl)}" />
</head>
<body>
  <script>window.location.replace(${JSON.stringify(spaUrl)});</script>
  <noscript><a href="${e(spaUrl)}">${e(meta.title)}</a></noscript>
</body>
</html>`);
  } catch (err) {
    next(err);
  }
});

// 404 handler
app.all('*', (req, res, next) => {
  next(new AppError(`Route ${req.originalUrl} not found`, 404, 'NOT_FOUND'));
});

// Global error handler
app.use(errorHandler);

module.exports = app;
