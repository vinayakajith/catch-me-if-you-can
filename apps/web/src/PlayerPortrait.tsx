import { useEffect, useRef, useState } from 'react';
import type { CharacterJobView, SharedPlayer } from '@catch-me-if-you-can/game-core';
import { PhotoCrop, type CropHandle } from './PhotoCrop';
import { characterConfig, createCharacterJob, uploadKey } from './character-api';
import { roomRequest } from './room-api';

export function PlayerPortrait({ roomId, player }: { roomId: string; player: SharedPlayer }) {
  const crop = useRef<CropHandle | null>(null), selected = useRef(uploadKey());
  const [editing, setEditing] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [available, setAvailable] = useState(false), [job, setJob] = useState<CharacterJobView | null>(null);
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    characterConfig().then(c => { if (active) setAvailable(c.available); }).catch(() => {});
    const poll = async () => {
      try { const r = await roomRequest<{ job: CharacterJobView | null }>(`/api/rooms/${roomId}/portrait`); if (active) { setJob(r.job); if (r.job && ['uploading', 'queued', 'generating'].includes(r.job.status)) timer = setTimeout(poll, 2000); } } catch { /* Presets work even if image processing is unavailable. */ }
    };
    void poll(); return () => { active = false; clearTimeout(timer); };
  }, [roomId, busy]);
  const send = async () => {
    if (!crop.current) return; setBusy(true); setError('');
    try {
      const photo = await crop.current.exportPhoto();
      const next = await createCharacterJob(photo, player.name, selected.current, roomId);
      await roomRequest(`/api/rooms/${roomId}/portrait`, { jobId: next.id }); setJob(next); setEditing(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const generating = job && ['uploading', 'queued', 'generating'].includes(job.status);
  const usePreset = async () => {
    setBusy(true); setError('');
    try { await roomRequest(`/api/rooms/${roomId}/portrait`, { jobId: null }); setJob(null); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <div className="player-portrait-controls"><h3>Your witch. Your face.</h3><p className="portrait-privacy">We delete your original photo after processing. Your game face stays only for this room, which closes after one hour.</p>
    {editing ? <><PhotoCrop handle={crop} onReady={() => { setReady(true); }} onError={setError} /><button className="button secondary" disabled={!ready || busy} onClick={() => void send()}>{busy ? 'Uploading…' : 'Make my laughing face'}</button><button className="text-button" onClick={() => setEditing(false)}>Keep my preset</button></> : <>
      <div className="portrait-options"><button className="text-button" disabled={busy} onClick={() => void usePreset()}>Use preset witch</button><button className="text-button" disabled={!available || busy || !!generating} onClick={() => { selected.current = uploadKey(); setReady(false); setError(''); setEditing(true); }}>Upload my photo</button></div>
      <p role="status">{generating ? 'Making your laughing face. You can ready up and play now.' : job?.status === 'ready' ? 'Your face is ready. Same face, every glorious bonk.' : job?.error ? 'The photo spell fizzled. Your preset is ready to play.' : !available ? 'Photo magic is resting. Your coloured witch is ready.' : 'Optional · one laughing face for all your witch’s moves.'}</p>
    </>}{error && <p className="shared-error" role="alert">{error}</p>}
  </div>;
}
