import type { CharacterJobStatus, CharacterJobView, Expression } from '../../../packages/game-core/src/index.ts';

export interface ImageUsage { textInput: number; imageInput: number; imageOutput: number; costUsd: number }
export interface ImageResult { image: Buffer; usage: ImageUsage | null; requestId?: string }
export interface ImageProvider {
  readonly available: boolean;
  readonly testMode: boolean;
  readonly model: string;
  generate(input: { photo: Buffer; base?: Buffer; expression: Expression; correction?: string }): Promise<ImageResult>;
}
export interface CharacterJob {
  id: string; owner: string; idempotencyKey: string; fingerprint: string; name: string;
  status: CharacterJobStatus; createdAt: number; expiresAt: number;
  baseRevision: number; baseApproved: boolean; sourcePresent: boolean;
  completed: Partial<Record<Expression, string>>; currentExpression: Expression | null;
  stepAttempts: Partial<Record<Expression, number>>; attempts: number;
  skin: string; atlasRevision: number; error: CharacterJobView['error'];
  usage: ImageUsage[]; unmeteredRequests: number; requestIds: string[]; testMode: boolean; model: string;
}
export interface JobStore {
  get(id: string): CharacterJob | undefined;
  find(owner: string, key: string): CharacterJob | undefined;
  list(): CharacterJob[];
  save(job: CharacterJob): void;
  close(): void;
}
export interface AssetStore {
  read(jobId: string, name: string): Promise<Buffer>;
  write(jobId: string, name: string, data: Buffer): Promise<void>;
  remove(jobId: string, name?: string): Promise<void>;
}
export class GenerationError extends Error {
  code: string; canRetry: boolean; automatic: boolean; uncertain: boolean;
  constructor(code: string, message: string, options: { canRetry?: boolean; automatic?: boolean; uncertain?: boolean } = {}) {
    super(message); this.name = 'GenerationError'; this.code = code;
    this.canRetry = options.canRetry ?? false; this.automatic = options.automatic ?? false; this.uncertain = options.uncertain ?? false;
  }
}
