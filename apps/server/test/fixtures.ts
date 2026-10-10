import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { EXPRESSION_FRAMES, type Expression } from '../../../packages/game-core/src/index.ts';
import type { ImageProvider, ImageResult } from '../src/contracts.ts';

export class FixtureProvider implements ImageProvider {
  available = true; testMode = true; model = 'test-fixture';
  calls: { expression: Expression; base?: Buffer; photo: Buffer }[] = [];
  failures: Error[] = []; delayMs = 0;
  async generate(input: { photo: Buffer; base?: Buffer; expression: Expression }): Promise<ImageResult> {
    this.calls.push(input);
    if (this.delayMs) await new Promise(resolve => setTimeout(resolve, this.delayMs));
    const error = this.failures.shift(); if (error) throw error;
    const atlas = await readFile(new URL('../../web/public/assets/balaji-heads.png', import.meta.url));
    const frame = EXPRESSION_FRAMES[input.expression];
    const image = await sharp(atlas).extract({ left: frame % 3 * 512, top: Math.floor(frame / 3) * 512, width: 512, height: 512 }).png().toBuffer();
    return { image, usage: { textInput: 100, imageInput: 200, imageOutput: 1756, costUsd: .05478 } };
  }
}
export async function portrait() { return sharp({ create: { width: 600, height: 800, channels: 3, background: '#cc9977' } }).jpeg().toBuffer(); }
