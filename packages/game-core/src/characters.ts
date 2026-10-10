import type { CharacterPack, Expression } from './types.ts';

export const EXPRESSIONS: readonly Expression[] = ['serious', 'grin', 'laugh', 'giggle', 'bonked', 'dizzy'];
export const EXPRESSION_FRAMES: Record<Expression, number> = { serious: 0, grin: 1, laugh: 2, giggle: 3, bonked: 4, dizzy: 5 };
export const DEFAULT_SKIN = '#da995c';
export const CHARACTER_RETENTION_MS = 24 * 60 * 60 * 1000;
export type CharacterJobStatus = 'uploading' | 'queued' | 'generating' | 'awaiting_approval' | 'preview' | 'ready' | 'failed' | 'interrupted' | 'expired';
export interface CharacterJobView {
  id: string; name: string; status: CharacterJobStatus; completed: Expression[];
  currentExpression: Expression | null; baseRevision: number; baseApproved: boolean;
  attempts: number; remainingAttempts: number; retryableExpressions: Expression[];
  expiresAt: number; sourceUrl: string | null; preview: CharacterPack | null;
  error: { code: string; message: string; canRetry: boolean; uncertain: boolean } | null;
  testMode: boolean;
}
export interface CharacterServiceConfig { available: boolean; testMode: boolean; maxUploadBytes: number; message?: string; uploadMode?: 's3' | 'multipart' }
