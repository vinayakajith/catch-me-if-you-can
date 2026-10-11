import type { CharacterJobStatus, CharacterJobView, CharacterServiceConfig, Expression } from '../../../packages/game-core/src/index.ts';

export interface ImageUsage { textInput: number; imageInput: number; imageOutput: number; costUsd: number }
export interface ImageResult { image: Buffer; usage: ImageUsage | null; requestId?: string }
export interface ImageProvider {
  readonly available: boolean;
  readonly testMode: boolean;
  readonly model: string;
  readonly canAffordGeneration?: boolean;
  readonly serviceStatus?: { message: string; retryAt: number };
  generate(input: { photo: Buffer; base?: Buffer; expression: Expression; correction?: string }): Promise<ImageResult>;
}
export interface CharacterJob {
  playerRoomId?: string;
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
  url?(jobId: string, name: string, expiresAt: number): Promise<string>;
  write(jobId: string, name: string, data: Buffer): Promise<void>;
  remove(jobId: string, name?: string): Promise<void>;
}
export class GenerationError extends Error {
  code: string; canRetry: boolean; automatic: boolean; uncertain: boolean; retryDelayMs?: number;
  constructor(code: string, message: string, options: { canRetry?: boolean; automatic?: boolean; uncertain?: boolean; retryDelayMs?: number } = {}) {
    super(message); this.name = 'GenerationError'; this.code = code;
    this.canRetry = options.canRetry ?? false; this.automatic = options.automatic ?? false; this.uncertain = options.uncertain ?? false; this.retryDelayMs = options.retryDelayMs;
  }
}

export type Awaitable<T> = T | Promise<T>;
export type AssetResponse = Buffer | { url: string };
export interface PlayerPortraitJob { roomId: string; expiresAt: number }
export interface CharacterService {
  initialize(): Promise<void>;
  get(id: string, owner: string): Awaitable<CharacterJob>;
  findUpload(owner: string, key: string): Awaitable<CharacterJob>;
  view(job: CharacterJob): Awaitable<CharacterJobView>;
  create(owner: string, key: string, name: string, upload: Buffer, player?: PlayerPortraitJob): Promise<CharacterJob>;
  approve(id: string, owner: string, revision: number): Awaitable<CharacterJob>;
  retry(id: string, owner: string, expression: Expression, revision: number): Awaitable<CharacterJob>;
  finalize(id: string, owner: string, name: string, skin: string): Promise<CharacterJob>;
  asset(id: string, owner: string, name: string): Promise<AssetResponse>;
  characterBytes(id: string, owner: string): Promise<Buffer>;
  config?(): Promise<CharacterServiceConfig>;
  cleanup(): Promise<void>;
  close(): Promise<void>;
}
