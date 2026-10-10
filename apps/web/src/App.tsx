import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, Clock3, DoorOpen, Footprints, HelpCircle, Home, Lightbulb, Map, MousePointer2, Search, ShoppingBag, Sparkles, Trophy, Upload, Volume2, VolumeX, Waves, X } from 'lucide-react';
import { HINT_MS, HOUSE, LocalHuntSession, createFatherProfile, freshHuntSeed, type CharacterPack, type ActionResult, type Point } from '@father-hunter/game-core';
import { Brand, Dad, HouseMap, Joystick, formatTime } from './components';
import { GameCanvas } from './game/GameCanvas';
import { CaseIntro } from './CaseIntro';
import type { GameBridge } from './game/HouseScene';
import { playSound, unlockSound } from './sound';
import { CharacterCreator } from './CharacterCreator';
import { CharacterApiError, getCharacterJob, pendingCharacterUpload, recoverCharacterUpload, rememberCharacterJob, savedCharacterJob } from './character-api';

function stored(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Private browsing still works. */ } }
import { Round, type Preferences } from './Round';
import { RoomPage } from './RoomPage';
import { createRoom } from './room-api';
import { uploadKey } from './character-api';

export default function App() {
  const [path, setPath] = useState(location.pathname);
  const navigate = (path: string) => { history.pushState(null, '', path); setPath(path); };
  useEffect(() => { const change = () => setPath(location.pathname); addEventListener('popstate', change); return () => removeEventListener('popstate', change); }, []);
  const [round, setRound] = useState<{ name: string; seed: string; father: CharacterPack } | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(() => ({ sound: stored('fh-sound', 'true') === 'true', reducedMotion: stored('fh-motion', String(matchMedia('(prefers-reduced-motion: reduce)').matches)) === 'true' }));
  const lastSeed = useRef(stored('fh-last-seed', ''));
  const start = (name: string, father: CharacterPack, replay = false) => {
    if (father.expiresAt && father.expiresAt <= Date.now()) { rememberCharacterJob(null); setRound(null); return; }
    if (preferences.sound) unlockSound();
    save('fh-name', name);
    save('fh-father-name', father.name);
    const fixtureSeed = import.meta.env.DEV && !replay ? new URLSearchParams(location.search).get('seed') : null;
    const seed = fixtureSeed || freshHuntSeed(lastSeed.current, `hunt-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    lastSeed.current = seed; save('fh-last-seed', seed);
    setRound({ name, seed, father });
    window.scrollTo(0, 0);
  };
  const setPreference = (key: keyof Preferences) => setPreferences(prev => { const next = { ...prev, [key]: !prev[key] }; save(key === 'sound' ? 'fh-sound' : 'fh-motion', String(next[key])); return next; });
  const roomId = /^\/r\/([a-f0-9-]{36})\/?$/.exec(path)?.[1];
  if (roomId) return <RoomPage key={roomId} id={roomId} preferences={preferences} togglePreference={setPreference} onHome={() => navigate('/')} />;
  return round ? <Round key={round.seed} name={round.name} seed={round.seed} father={round.father} preferences={preferences} togglePreference={setPreference} onLeave={() => setRound(null)} onReplay={() => start(round.name, round.father, true)} /> : <Landing onStart={start} onRoom={id => navigate(`/r/${id}`)} />;
}

function Landing({ onStart, onRoom }: { onStart: (name: string, father: CharacterPack) => void; onRoom(id: string): void }) {
  const [hosting, setHosting] = useState(false);
  const [name, setName] = useState(() => stored('fh-name', ''));
  const [fatherName, setFatherName] = useState(() => stored('fh-father-name', 'Balaji'));
  const [selected, setSelected] = useState<CharacterPack | null>(null), [creating, setCreating] = useState(false), [resume, setResume] = useState(Boolean(savedCharacterJob() || pendingCharacterUpload())), [photoError, setPhotoError] = useState('');
  const father = selected ? createFatherProfile(fatherName, selected) : createFatherProfile(fatherName);
  useEffect(() => {
    const id = savedCharacterJob(), pending = pendingCharacterUpload(); if (!id && !pending) return;
    let alive = true;
    (pending ? recoverCharacterUpload() : getCharacterJob(id!)).then(job => { if (!alive || !job) return; if (job.status === 'ready' && job.preview) { setSelected(job.preview); setResume(false); } else setResume(true); }).catch(error => {
      if (!alive) return;
      if (error instanceof CharacterApiError && [404, 410].includes(error.status)) { if (!pending || error.status === 410) { rememberCharacterJob(null); setResume(false); } setPhotoError(error.message); }
    });
    return () => { alive = false; };
  }, []);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !fatherName.trim() || hosting) return;
    setHosting(true); setPhotoError(''); save('fh-name', name.trim()); save('fh-father-name', fatherName.trim());
    const fingerprint = JSON.stringify([name.trim(), fatherName.trim(), father.id]);
    let key = uploadKey();
    try { const old = JSON.parse(stored('fh-room-create', 'null')); if (old?.fingerprint === fingerprint) key = old.key; } catch {}
    save('fh-room-create', JSON.stringify({ fingerprint, key }));
    try { const view = await createRoom(name.trim(), fatherName.trim(), father.id, key); save('fh-room-create', 'null'); onRoom(view.room.id); }
    catch (fault) { setPhotoError((fault as Error).message); } finally { setHosting(false); }
  };
  if (creating) return <CharacterCreator initialName={fatherName} fresh={Boolean(selected)} onClose={() => { setCreating(false); setResume(Boolean(savedCharacterJob() || pendingCharacterUpload()) && !selected); }} onSample={() => { setSelected(null); setCreating(false); setResume(Boolean(savedCharacterJob() || pendingCharacterUpload())); }} onReady={pack => { setSelected(pack); setFatherName(pack.name); save('fh-father-name', pack.name); setResume(false); setCreating(false); setPhotoError(''); }} />;
  return <div className="landing">
    <header className="site-header"><Brand /><nav><a href="#how-to-play">How to play <ArrowDown size={14} /></a><span className="pill"><span className="live-dot" /> A VERY UNSERIOUS GAME</span></nav></header>
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="tiny-star">✳</span> A GOVERNMENT-SIZED SCREW-UP</div>
          <h1><span className="named-headline" style={{ fontSize: father.name.length > 12 ? ".65em" : undefined }}>One {father.name}.</span>All chaos.<br /><em>Oh, shit.</em><span className="headline-star">✴</span></h1>
          <p className="hero-description">{father.name} put witchcraft in a time machine. It made him everyone’s problem.<br className="desktop-break" /> You’re the agent sent to clean up the shitshow.</p>
          <form className="start-form" onSubmit={submit}>
            <div className="personal-dad"><button type="button" className="photo-start" onClick={() => setCreating(true)}>{selected ? <Dad character={father} expression={1} /> : <Upload size={22} />}<span><strong>{selected ? `${father.name} is ready` : resume ? `Continue making ${father.name}` : `Use ${father.name}’s photo`}</strong><small>{selected ? 'Six faces. Extremely questionable intentions.' : resume ? 'His progress is saved. Pick up where you left off.' : 'Turn him into the actual troublemaker.'}</small></span><ArrowRight size={17} /></button>{selected && <button type="button" className="sample-switch" onClick={() => { setSelected(null); setResume(false); rememberCharacterJob(null); setPhotoError(''); }}>Use sample Balaji instead</button>}</div>
            {photoError && <p role="alert" className="photo-warning">{photoError}</p>}
            <label htmlFor="father-name">WHO’S THE WITCH-SCIENTIST?</label>
            <div className="father-field"><span>Dr.</span><input id="father-name" name="fatherName" autoComplete="off" maxLength={32} value={fatherName} onChange={e => setFatherName(e.target.value)} required /></div>
            <label htmlFor="player-name">WHAT SHOULD WE CALL YOU, AGENT?</label>
            <div className="start-fields"><input id="player-name" name="name" autoComplete="given-name" placeholder="Your name" maxLength={24} value={name} onChange={e => setName(e.target.value)} required /><button className="button primary" type="submit" disabled={hosting}>{hosting ? 'Creating…' : 'Create hunt'} <ArrowRight size={20} /></button></div>
            <button type="button" className="text-button solo-link" disabled={hosting || !name.trim() || !fatherName.trim()} onClick={() => onStart(name.trim(), father)}>Play solo <ArrowRight size={14} /></button><div className="start-note"><Check size={14} /> No signup. No gaming skills. Just suspicious instincts.</div>
          </form>
          <div className="hero-stats"><span><Home size={17} /><b>5</b> rooms</span><span><Search size={17} /><b>1</b> sack</span><span><Clock3 size={17} /><b>2</b> minutes</span></div>
        </div>
        <div className="hero-art" aria-label={`Wanted poster for ${father.name}`}>
          <div className="scribble scribble-top">peer review: absolutely not <span>↴</span></div>
          <div className="poster-back" />
          <article className="wanted-poster">
            <div className="tape" /><div className="poster-topline"><span>BUREAU OF TEMPORAL NONSENSE</span><span>CASE No. 001</span></div>
            <div className="wanted-title">WANTED FOR<br />ILLEGAL SCIENCE</div>
            <div className="portrait-stage"><div className="portrait-grid" /><Dad character={father} /><span className="portrait-bubble">“I see no flaws<br />in my work.”</span></div>
            <div className="poster-name">{father.name}<span>Dr. is a self-awarded title.</span></div>
            <p>Illegal copies. Absolutely no impulse control.<br />May be hiding in your commode.</p>
            <div className="poster-stamp">TOO MANY {father.name.toUpperCase()}S · 0 PERMITS</div>
          </article>
          <div className="little-label"><span>✳</span><div>GOVERNMENT EQUIPMENT<strong>One sack. Budget cuts.</strong></div></div>
          <span className="art-star star-one">✳</span><span className="art-star star-two">✧</span>
        </div>
      </section>
      <section className="how-section" id="how-to-play"><div className="how-heading"><span className="eyebrow">YOUR EXTREMELY BRIEF TRAINING</span><h2>Anyone can hunt {father.name}.</h2><p>Yes, even that friend who never plays games.</p></div>
        <div className="how-grid">
          <article><div className="how-icon"><Footprints size={27} /><span>01</span></div><h3>Tap. Take a little walk.</h3><p>Tap the floor to wander through the house. Every doorway is a new bad alibi.</p></article>
          <article><div className="how-icon green"><DoorOpen size={27} /><span>02</span></div><h3>Be a little suspicious.</h3><p>Check the furniture. Open the lids. That pickle jar might contain an upside-down {father.name}.</p></article>
          <article><div className="how-icon yellow"><MousePointer2 size={27} /><span>03</span></div><h3>See {father.name}? Tap {father.name}.</h3><p>One giant hammer. Into the sack. Catch as many as you can before your two minutes run out.</p></article>
        </div>
      </section>
    </main>
    <footer className="site-footer"><Brand /><p>Made for laughs. And mildly embarrassed fathers.</p><span>FIVE AGENTS. ONE BAD IDEA.</span></footer>
  </div>;
}
