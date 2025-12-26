/**
 * テスト用画像ファイルを生成するスクリプト
 */
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const basePath = path.join(__dirname, '../../e2e/fixtures');

async function createTestImages() {
  // Create blue PNG
  await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  })
    .png()
    .toFile(path.join(basePath, 'test-image.png'));
  console.log('Created test-image.png');

  // Create green WEBP
  await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 3,
      background: { r: 0, g: 255, b: 0 },
    },
  })
    .webp()
    .toFile(path.join(basePath, 'test-image.webp'));
  console.log('Created test-image.webp');

  // Create large image (>300KB) - 1920x1080 with random noise
  const largeBuffer = Buffer.alloc(1920 * 1080 * 3);
  for (let i = 0; i < largeBuffer.length; i++) {
    largeBuffer[i] = Math.floor(Math.random() * 256);
  }
  await sharp(largeBuffer, { raw: { width: 1920, height: 1080, channels: 3 } })
    .jpeg({ quality: 95 })
    .toFile(path.join(basePath, 'test-image-large.jpg'));
  const stats = fs.statSync(path.join(basePath, 'test-image-large.jpg'));
  console.log(`Created test-image-large.jpg (${stats.size} bytes)`);
}

createTestImages().catch(console.error);
