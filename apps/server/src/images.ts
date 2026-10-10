import sharp from 'sharp';
import { DEFAULT_SKIN, EXPRESSIONS, type Expression } from '../../../packages/game-core/src/index.ts';
import { GenerationError } from './contracts.ts';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export async function normalizePhoto(input: Buffer) {
  if (!input.length || input.length > MAX_UPLOAD_BYTES) throw new GenerationError('invalid_photo', 'Choose a photo under 10 MB.');
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, animated: false });
    const meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format ?? '') || (meta.pages ?? 1) > 1) throw new Error('format');
    if ((meta.width ?? 0) < 256 || (meta.height ?? 0) < 256) throw new Error('size');
    return await image.rotate().resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 90 }).toBuffer();
  } catch { throw new GenerationError('invalid_photo', 'Choose a clear JPG, PNG or WebP portrait at least 256 pixels wide and tall.'); }
}

export async function normalizeHead(input: Buffer): Promise<{ image: Buffer; skin: string }> {
  let pixels: Buffer, width: number, height: number;
  try {
    const result = await sharp(input, { limitInputPixels: 16_000_000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    pixels = result.data; width = result.info.width; height = result.info.height;
  } catch { throw invalidHead('Return one readable transparent PNG head.'); }
  if (width < 256 || height < 256) throw invalidHead('Return a full-resolution head.');
  let left = width, right = -1, top = height, bottom = -1, solid = 0, edge = 0;
  const colours = new Map<string, number>();
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4, alpha = pixels[offset + 3];
    if (alpha < 24) continue;
    solid++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    if (x < 3 || y < 3 || x > width - 4 || y > height - 4) edge++;
    // Sample the central cheek region, exclude ink, neutral glasses and highlights.
    const [r, g, b] = pixels.subarray(offset, offset + 3);
    if (alpha > 240 && x > width * .3 && x < width * .7 && y > height * .35 && y < height * .75 && r > g && g > b && r > 60 && r - b > 15 && g < 245) {
      const key = [r, g, b].map(c => Math.round(c / 12) * 12).join(','); colours.set(key, (colours.get(key) || 0) + 1);
    }
  }
  if (solid < width * height * .04 || solid > width * height * .8 || edge > 0 || right <= left || bottom <= top) throw invalidHead('Use real transparent alpha, exactly one complete head, and generous transparent margins. Do not clip hair, ears or chin.');
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 };
  if (crop.width / crop.height < .4 || crop.width / crop.height > 1.8) throw invalidHead('Return a single upright frontal head, without torso or props.');
  const head = await sharp(input).extract(crop).resize(416, 410, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const image = await sharp({ create: { width: 512, height: 512, channels: 4, background: '#00000000' } }).composite([
    { input: head.data, left: Math.round((512 - head.info.width) / 2), top: 450 - head.info.height },
  ]).png().toBuffer();
  const dominant = [...colours].sort((a, b) => b[1] - a[1])[0]?.[0];
  const skin = dominant ? '#' + dominant.split(',').map(n => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('') : DEFAULT_SKIN;
  return { image, skin };
}
function invalidHead(message: string) { return new GenerationError('invalid_art', message, { canRetry: true, automatic: true }); }

export async function assembleAtlas(heads: Partial<Record<Expression, Buffer>>, baseOnly = false) {
  if (!heads.grin || (!baseOnly && EXPRESSIONS.some(expression => !heads[expression]))) throw new Error('Incomplete face pack');
  const inputs = EXPRESSIONS.map((expression, index) => ({ input: heads[expression] ?? heads.grin!, left: index % 3 * 512, top: Math.floor(index / 3) * 512 }));
  return sharp({ create: { width: 1536, height: 1024, channels: 4, background: '#00000000' } }).composite(inputs).png().toBuffer();
}
