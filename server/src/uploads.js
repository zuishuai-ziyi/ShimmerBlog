import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsDir = path.resolve(__dirname, '../uploads');
export const avatarsDir = path.join(uploadsDir, 'avatars');
export const imagesDir = path.join(uploadsDir, 'images');

for (const dir of [avatarsDir, imagesDir]) fs.mkdirSync(dir, { recursive: true });

const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

function makeImageStorage(dir) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const ext = IMAGE_TYPES[file.mimetype] ?? (path.extname(file.originalname).toLowerCase() || '.bin');
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    },
  });
}

function imageFilter(_req, file, cb) {
  if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
  cb(new Error('仅支持 png/jpg/gif/webp 图片'));
}

export const avatarUpload = multer({
  storage: makeImageStorage(avatarsDir),
  fileFilter: imageFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

export const imageUpload = multer({
  storage: makeImageStorage(imagesDir),
  fileFilter: imageFilter,
  limits: { fileSize: 8 * 1024 * 1024 },
});
