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

// Never pass raw provider messages or headers to a browser or log.
export function classifyProviderError(error: unknown): GenerationError {
  if (error instanceof GenerationError) return error;
  if (error instanceof OpenAI.APIConnectionError) return new GenerationError('interrupted', 'The image service connection was interrupted. This attempt may have been charged. Your completed faces are saved; retry only this step.', { canRetry: true, uncertain: true });
  if (error instanceof OpenAI.APIError) {
    if (error.code === 'moderation_blocked') return new GenerationError('blocked', 'This photo could not be processed. Please choose a different clear portrait.');
    if (error.status === 401 || error.status === 403) return new GenerationError('access', 'Photo generation is paused while API access is checked. Your completed faces are saved. Sample artwork is ready to play.', { canRetry: true });
    if (error.type === 'insufficient_quota' || ['insufficient_quota', 'credit_balance_exhausted', 'organization_spend_limit_exceeded', 'project_spend_limit_exceeded', 'organization_usage_limit_exceeded'].includes(error.code ?? '')) return new GenerationError('quota', 'Photo generation has reached its budget. Your progress is saved. Sample artwork is ready to play.', { canRetry: true });
    if (error.status === 429 || (error.status ?? 0) >= 500) {
      const retryAfter = error.headers?.get('retry-after'), seconds = retryAfter ? Number(retryAfter) : 0;
      const retryDelayMs = retryAfter ? Number.isFinite(seconds) ? seconds * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now()) : undefined;
      return new GenerationError('temporary', 'The image service is busy. Your completed faces are saved.', { canRetry: true, automatic: true, retryDelayMs: Number.isFinite(retryDelayMs) ? Math.max(1000, retryDelayMs!) : undefined });
    }
  }
  return new GenerationError('generation_failed', 'This face could not be generated. Try another photo.');
}

export class OpenAIImageProvider implements ImageProvider {
  get available() { return !!this.client && (!this.pause || this.pause.retryAt <= this.clock()); }
  get serviceStatus() { return this.pause && this.pause.retryAt > this.clock() ? this.pause : undefined; }
  private pause?: { message: string; retryAt: number };
  private clock: () => number;
  readonly testMode = false;
  readonly model: string;
  private client: OpenAI | null;
  private quality: 'high' | 'medium';
  constructor(options: { apiKey?: string; model?: string; quality?: 'high' | 'medium'; fetch?: typeof fetch; clock?: () => number } = {}) {
    this.model = options.model || 'gpt-image-2.5-sunburst-2026-09-08';
    if (!/^gpt-image-2\.5-(sunburst|flare)-2026-09-08$/.test(this.model)) throw new Error('Development cost accounting requires a pinned GPT Image 2.5 September 2026 model.');
    this.quality = options.quality || 'high';
    this.clock = options.clock ?? Date.now;
    this.client = options.apiKey ? new OpenAI({ apiKey: options.apiKey, maxRetries: 0, timeout: 180_000, fetch: options.fetch }) : null;
  }
  async generate(input: { photo: Buffer; base?: Buffer; expression: Expression; correction?: string }): Promise<ImageResult> {
    if (!this.client) throw new GenerationError('not_configured', 'Photo generation is not connected yet. You can still play with sample Balaji.');
    if (this.serviceStatus) throw new GenerationError('service_paused', this.serviceStatus.message, { canRetry: true });
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
      const fault = classifyProviderError(error);
      if (['access', 'quota'].includes(fault.code)) this.pause = { message: fault.message, retryAt: this.clock() + 300_000 };
      throw fault;
    }
  }
}
