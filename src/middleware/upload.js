const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const AppError = require('../utils/AppError');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Only JPEG, PNG, and WebP images are allowed', 400, 'INVALID_FILE_TYPE'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: config.upload.maxFileSize },
});

async function processImage(buffer, filename) {
  const uploadDir = path.resolve(config.upload.dir);
  const ext = 'webp';
  const name = `${filename}.${ext}`;
  const thumbName = `${filename}_thumb.${ext}`;

  // Full size (max 1200px width, 80% quality)
  await sharp(buffer)
    .resize(1200, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(path.join(uploadDir, name));

  // Thumbnail (200px width)
  await sharp(buffer)
    .resize(200, null, { withoutEnlargement: true })
    .webp({ quality: 70 })
    .toFile(path.join(uploadDir, thumbName));

  return { url: `/uploads/${name}`, thumbnail: `/uploads/${thumbName}` };
}

// Middleware that processes uploaded file through Sharp
function processUpload(req, res, next) {
  if (!req.file) return next();

  const filename = uuidv4();
  processImage(req.file.buffer, filename)
    .then((result) => {
      req.file.filename = `${filename}.webp`;
      req.file.processedUrl = result.url;
      req.file.thumbnailUrl = result.thumbnail;
      next();
    })
    .catch(next);
}

module.exports = { upload, processImage, processUpload };
