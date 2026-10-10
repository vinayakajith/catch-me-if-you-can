import type { CharacterJobView, CharacterServiceConfig } from '@catch-me-if-you-can/game-core';

const jobKey = 'fh-character-job';
const pendingKey = 'fh-character-upload';
export function savedCharacterJob() { try { return localStorage.getItem(jobKey); } catch { return null; } }
export function pendingCharacterUpload() { try { return localStorage.getItem(pendingKey); } catch { return null; } }
export function rememberCharacterJob(id: string | null) { try { if (id) localStorage.setItem(jobKey, id); else localStorage.removeItem(jobKey); localStorage.removeItem(pendingKey); } catch { /* Current tab still works. */ } }
export function uploadKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
export class CharacterApiError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status = status; } }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, { credentials: 'same-origin', ...init, headers: { 'x-fh-request': '1', ...init?.headers } }); }
  catch { throw new CharacterApiError(0, 'Connection lost. Your saved progress will return when you reconnect.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new CharacterApiError(response.status, data.message || 'The photo lab is unavailable. Please try again.');
  return data as T;
}
export const characterConfig = () => request<CharacterServiceConfig>('/api/characters/config');
export const getCharacterJob = (id: string, signal?: AbortSignal) => request<CharacterJobView>(`/api/characters/${encodeURIComponent(id)}`, { signal });
export async function recoverCharacterUpload() {
  const key = pendingCharacterUpload();
  if (!key) { const id = savedCharacterJob(); return id ? getCharacterJob(id) : null; }
  // A refresh can overtake image decoding on the server. Look up the same upload;
  // never send a second paid creation request to recover a lost response.
  for (let attempt = 0; ; attempt++) {
    try {
      let job = await request<CharacterJobView>(`/api/characters/uploads/${encodeURIComponent(key)}`);
      // A completed S3 upload may have lost the final acknowledgement. This
      // queues the existing job only; it never starts a second image job.
      if (job.status === 'uploading') job = await completeUpload(job.id);
      if (pendingCharacterUpload() === key) rememberCharacterJob(job.id);
      return job;
    } catch (fault) {
      if (!(fault instanceof CharacterApiError) || fault.status !== 404 || attempt >= 3) throw fault;
      await new Promise(resolve => setTimeout(resolve, 750));
    }
  }
}
export async function createCharacterJob(photo: Blob, name: string, key: string) {
  try { localStorage.setItem(pendingKey, key); } catch { /* Same-tab retries still reuse this key. */ }
  let cloud = false;
  try {
    cloud = (await characterConfig()).uploadMode === 's3';
    if (cloud) {
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await photo.arrayBuffer())), b => b.toString(16).padStart(2, '0')).join('');
      const result = await request<{ job: CharacterJobView; upload: { url: string; fields: Record<string, string> } | null }>('/api/characters/uploads', {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify({ name, digest }),
      });
      if (!result.upload) return result.job;
      const body = new FormData();
      for (const [field, value] of Object.entries(result.upload.fields)) body.append(field, value);
      body.append('file', photo, 'portrait.jpg');
      let response: Response;
      try { response = await fetch(result.upload.url, { method: 'POST', credentials: 'omit', body }); }
      catch { throw new CharacterApiError(0, 'The photo upload lost its connection. Find the saved upload, or choose the photo again.'); }
      if (!response.ok) throw new CharacterApiError(response.status, 'The photo did not finish uploading. Choose it again; no image has been generated.');
      return completeUpload(result.job.id);
    }
    const body = new FormData(); body.append('name', name); body.append('photo', photo, 'portrait.jpg');
    return await request<CharacterJobView>('/api/characters', { method: 'POST', headers: { 'idempotency-key': key }, body });
  }
  catch (fault) {
    if (!cloud && fault instanceof CharacterApiError && fault.status >= 400 && fault.status < 500) { try { localStorage.removeItem(pendingKey); } catch { /* Unavailable storage. */ } }
    throw fault;
  }
}
const completeUpload = (id: string) => request<CharacterJobView>(`/api/characters/uploads/${encodeURIComponent(id)}/complete`, { method: 'POST' });
export const characterAction = (id: string, action: 'approve' | 'retry' | 'finalize', body: object) => request<CharacterJobView>(`/api/characters/${encodeURIComponent(id)}/${action}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
