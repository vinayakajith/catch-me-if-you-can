import OpenAI, { toFile } from 'openai';
import sharp from 'sharp';
import type { Expression } from '../../../packages/game-core/src/index.ts';
import { GenerationError, type ImageProvider, type ImageResult } from './contracts.ts';
import { headPrompt } from './prompts.ts';

export async function validateImageRequest(input: { photo: Buffer; base?: Buffer }, prompt: string) {
  if (Buffer.byteLength(prompt, 'utf8') > 4096) throw new GenerationError('request_limits', 'This image request exceeds the development prompt limit.');
  for (const image of input.base ? [input.photo, input.base] : [input.photo]) {
    const meta = await sharp(image, { limitInputPixels: 1_048_576 }).metadata().catch(() => null);
    if (!meta?.width || !meta.height || meta.width > 1024 || meta.height > 1024 || (meta.pages ?? 1) > 1 || !['jpeg', 'png'].includes(meta.format ?? '')) {
      throw new GenerationError('request_limits', 'This image request exceeds the development image limits.');
    }
  }
}

export class OpenAIImageProvider implements ImageProvider {
  readonly available: boolean;
  readonly testMode = false;
  readonly model: string;
  private client: OpenAI | null;
  private quality: 'high' | 'medium';
  constructor(options: { apiKey?: string; model?: string; quality?: 'high' | 'medium' } = {}) {
    this.model = options.model || 'gpt-image-2.5-sunburst-2026-09-08';
    if (!/^gpt-image-2\.5-(sunburst|flare)-2026-09-08$/.test(this.model)) throw new Error('Development cost accounting requires a pinned GPT Image 2.5 September 2026 model.');
    this.quality = options.quality || 'high';
    this.available = Boolean(options.apiKey);
    this.client = options.apiKey ? new OpenAI({ apiKey: options.apiKey, maxRetries: 0, timeout: 180_000 }) : null;
  }
  async generate(input: { photo: Buffer; base?: Buffer; expression: Expression; correction?: string }): Promise<ImageResult> {
    if (!this.client) throw new GenerationError('not_configured', 'Photo generation is not connected yet. You can still play with sample Balaji.');
    try {
      const prompt = headPrompt(input.expression, Boolean(input.base), input.correction);
      await validateImageRequest(input, prompt);
      const images = [await toFile(input.photo, 'reference.jpg', { type: 'image/jpeg' })];
      if (input.base) images.push(await toFile(input.base, 'approved-head.png', { type: 'image/png' }));
      const response = await this.client.images.edit({
        model: this.model, image: images, prompt,
        size: '1024x1024', quality: this.quality, background: 'transparent', output_format: 'png', n: 1,
      });
      const data = response.data?.[0]?.b64_json;
      if (!data) throw new GenerationError('empty_result', 'The image service returned no face. Retry this face when you are ready.', { canRetry: true, uncertain: true });
      const usage = response.usage;
      const textInput = usage?.input_tokens_details?.text_tokens ?? 0, imageInput = usage?.input_tokens_details?.image_tokens ?? 0, imageOutput = usage?.output_tokens ?? 0;
      return { image: Buffer.from(data, 'base64'), requestId: response._request_id ?? undefined,
        usage: usage ? { textInput, imageInput, imageOutput, costUsd: (textInput * 5 + imageInput * 8 + imageOutput * 30) / 1e6 } : null };
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      if (error instanceof OpenAI.APIConnectionError) throw new GenerationError('interrupted', 'The image service connection was interrupted. This attempt may have been charged. Your completed faces are saved; retry only this step.', { canRetry: true, uncertain: true });
      if (error instanceof OpenAI.APIError) {
        if (error.code === 'moderation_blocked') throw new GenerationError('blocked', 'This photo could not be processed. Please choose a different clear portrait.');
        if (error.status === 401 || error.status === 403) throw new GenerationError('access', 'The image service needs its API access checked. Sample Balaji is still ready to play.');
        if (error.code === 'insufficient_quota') throw new GenerationError('quota', 'Photo generation has reached its budget. Your progress is saved.');
        if (error.status === 429 || (error.status ?? 0) >= 500) throw new GenerationError('temporary', 'The image service is busy. Your completed faces are saved.', { canRetry: true, automatic: true });
      }
      throw new GenerationError('generation_failed', 'This face could not be generated. Try another photo.');
    }
  }
}
