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
interface Preferences { sound: boolean; reducedMotion: boolean }

export default function App() {
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
  return round ? <Round key={round.seed} name={round.name} seed={round.seed} father={round.father} preferences={preferences} togglePreference={setPreference} onLeave={() => setRound(null)} onReplay={() => start(round.name, round.father, true)} /> : <Landing onStart={start} />;
}

function Landing({ onStart }: { onStart: (name: string, father: CharacterPack) => void }) {
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
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (selected?.expiresAt && selected.expiresAt <= Date.now()) { setPhotoError('This Dad has expired. Choose another photo or switch to sample Balaji.'); return; }
    if (name.trim() && fatherName.trim()) onStart(name.trim(), father);
  };
  if (creating) return <CharacterCreator initialName={fatherName} fresh={Boolean(selected)} onClose={() => { setCreating(false); setResume(Boolean(savedCharacterJob() || pendingCharacterUpload()) && !selected); }} onSample={() => { setSelected(null); setCreating(false); setResume(Boolean(savedCharacterJob() || pendingCharacterUpload())); }} onReady={pack => { setSelected(pack); setFatherName(pack.name); save('fh-father-name', pack.name); setResume(false); setCreating(false); setPhotoError(''); }} />;
  return <div className="landing">
    <header className="site-header"><Brand /><nav><a href="#how-to-play">How to play <ArrowDown size={14} /></a><span className="pill"><span className="live-dot" /> A VERY UNSERIOUS GAME</span></nav></header>
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="tiny-star">✳</span> A GOVERNMENT-SIZED SCREW-UP</div>
          <h1>One dad.<br />All chaos.<br /><em>Oh, shit.</em><span className="headline-star">✴</span></h1>
          <p className="hero-description">Dad put witchcraft in a time machine. It made him everyone’s problem.<br className="desktop-break" /> You’re the detective sent to clean up the shitshow.</p>
          <form className="start-form" onSubmit={submit}>
            <div className="personal-dad"><button type="button" className="photo-start" onClick={() => setCreating(true)}>{selected ? <Dad character={father} expression={1} /> : <Upload size={22} />}<span><strong>{selected ? 'Your Dad is ready' : resume ? 'Continue making your Dad' : 'Use your dad’s photo'}</strong><small>{selected ? 'Six faces. Extremely questionable intentions.' : resume ? 'His progress is saved. Pick up where you left off.' : 'Turn him into the actual troublemaker.'}</small></span><ArrowRight size={17} /></button>{selected && <button type="button" className="sample-switch" onClick={() => { setSelected(null); setResume(false); rememberCharacterJob(null); setPhotoError(''); }}>Use sample Balaji instead</button>}</div>
            {photoError && <p role="alert" className="photo-warning">{photoError}</p>}
            <label htmlFor="father-name">WHO’S THE WITCH-SCIENTIST?</label>
            <div className="father-field"><span>Dr.</span><input id="father-name" name="fatherName" autoComplete="off" maxLength={32} value={fatherName} onChange={e => setFatherName(e.target.value)} required /></div>
            <label htmlFor="player-name">WHAT SHOULD WE CALL YOU, DETECTIVE?</label>
            <div className="start-fields"><input id="player-name" name="name" autoComplete="given-name" placeholder="Your name" maxLength={24} value={name} onChange={e => setName(e.target.value)} required /><button className="button primary" type="submit">Let’s find dad <ArrowRight size={20} /></button></div>
            <div className="start-note"><Check size={14} /> No signup. No gaming skills. Just suspicious instincts.</div>
          </form>
          <div className="hero-stats"><span><Home size={17} /><b>5</b> rooms</span><span><Search size={17} /><b>1</b> sack</span><span><Clock3 size={17} /><b>3</b> minutes</span></div>
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
            <div className="poster-stamp">TOO MANY DADS · 0 PERMITS</div>
          </article>
          <div className="little-label"><span>✳</span><div>GOVERNMENT EQUIPMENT<strong>One sack. Budget cuts.</strong></div></div>
          <span className="art-star star-one">✳</span><span className="art-star star-two">✧</span>
        </div>
      </section>
      <section className="how-section" id="how-to-play"><div className="how-heading"><span className="eyebrow">YOUR EXTREMELY BRIEF TRAINING</span><h2>Anyone can hunt a dad.</h2><p>Yes, even that friend who never plays games.</p></div>
        <div className="how-grid">
          <article><div className="how-icon"><Footprints size={27} /><span>01</span></div><h3>Tap. Take a little walk.</h3><p>Tap the floor to wander through the house. Every doorway is a new bad alibi.</p></article>
          <article><div className="how-icon green"><DoorOpen size={27} /><span>02</span></div><h3>Be a little suspicious.</h3><p>Check the furniture. Open the lids. That pickle jar might contain an upside-down dad.</p></article>
          <article><div className="how-icon yellow"><MousePointer2 size={27} /><span>03</span></div><h3>See dad? Tap dad.</h3><p>One comic whack. Into the sack. Catch as many as you can before your three minutes run out.</p></article>
        </div>
      </section>
    </main>
    <footer className="site-footer"><Brand /><p>Made for laughs. And mildly embarrassed fathers.</p><span>SOLO WARM-UP</span></footer>
  </div>;
}

function Round({ name, seed, father, preferences, togglePreference, onLeave, onReplay }: { name: string; seed: string; father: CharacterPack; preferences: Preferences; togglePreference: (key: keyof Preferences) => void; onLeave: () => void; onReplay: () => void }) {
  const [session] = useState(() => new LocalHuntSession(name, seed, Date.now, false, father));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const story = state.case;
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false), [bagged, setBagged] = useState(0);
  const [toast, setToast] = useState(''), [mapOpen, setMapOpen] = useState(false), [leaving, setLeaving] = useState(false), [help, setHelp] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const preferencesRef = useRef(preferences); preferencesRef.current = preferences;
  const showToast = useCallback((text: string) => { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3400); }, []);
  const feedback = useCallback((result: ActionResult) => {
    if (result.kind === 'hint' || result.kind === 'error') showToast(result.message);
  }, [showToast]);
  const bridge = useMemo<GameBridge>(() => ({ session, movement: { x: 0, y: 0 }, inputEnabled: true, reducedMotion: preferences.reducedMotion, feedback, ready: () => setReady(true), bonk: () => playSound('bonk', preferencesRef.current.sound), bagged: count => { setBagged(count); playSound('catch', preferencesRef.current.sound); }, failed: setError }), [session, feedback]);
  bridge.reducedMotion = preferences.reducedMotion;
  const latestActivity = state.activity[0];
  useEffect(() => {
    if (latestActivity?.kind === 'search') playSound('open', preferencesRef.current.sound);
  }, [latestActivity?.id, showToast]);
  useEffect(() => { if (accepted && ready) session.start(); }, [accepted, ready, session]);
  useEffect(() => {
    const timer = setInterval(() => session.tick(), 150);
    const visibility = () => { session.tick(); bridge.movement = { x: 0, y: 0 }; };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); clearTimeout(toastTimer.current); document.removeEventListener('visibilitychange', visibility); session.dispose(); };
  }, [session, bridge]);
  useEffect(() => { if (state.player.score > 0) { const timer = setTimeout(() => setCoachDismissed(true), 6500); return () => clearTimeout(timer); } }, [state.player.score]);
  const room = HOUSE.rooms.find(r => r.id === state.player.roomId)!;
  const ended = state.status === 'finished' || state.status === 'expired';
  const resultsVisible = ended && bagged >= state.player.score;
  bridge.inputEnabled = ready && accepted && !ended && !leaving && !help && !mapOpen;
  useEffect(() => {
    if (accepted && !resultsVisible && !leaving && !help && !mapOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    (dialog?.querySelector<HTMLButtonElement>('[data-autofocus]:not(:disabled)') ?? dialog?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !ended) { setHelp(false); setLeaving(false); setMapOpen(false); }
      if (event.key !== 'Tab' || !dialog) return;
      const buttons = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')];
      const first = buttons[0], last = buttons.at(-1);
      if (!dialog.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [accepted, ready, resultsVisible, leaving, help, mapOpen]);
  const coach = state.player.score > 0 ? 'In the bag. Keep checking the other rooms.' : state.opened.some(id => state.targets.some(t => t.kind === 'hidden' && t.slotId === id)) ? 'Tap the face. Your detective will walk over and bag him.' : state.player.roomId !== 'hall' ? 'Tap furniture to check inside. If a face peeks out, tap it.' : 'That statue under the spotlight looks suspicious. Tap him; your detective walks over.';
  const navigate = (point: Point) => { bridge.navigate?.(point); setMapOpen(false); };

  return <div className={`hunt-shell ${preferences.reducedMotion ? 'reduced-motion' : ''}`}>
    <header className="hunt-header" inert={!accepted}><Brand onClick={() => setLeaving(true)} /><div className="hunt-title">{story.title} <span>SOLO HUNT</span></div><div className="settings">
      <button className="icon-button" aria-label={preferences.sound ? 'Mute sound' : 'Enable sound'} aria-pressed={preferences.sound} onClick={() => { unlockSound(); togglePreference('sound'); }}>{preferences.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
      <button className="icon-button motion-button" aria-label="Reduce animation" aria-pressed={preferences.reducedMotion} onClick={() => togglePreference('reducedMotion')}><Waves size={19} /></button>
      <button className="icon-button" aria-label="How to play" onClick={() => setHelp(true)}><HelpCircle size={19} /></button>
      <button className="icon-button leave-button" aria-label="Leave hunt" onClick={() => setLeaving(true)}><X size={19} /></button>
    </div></header>
    <main className="hunt-main" inert={!accepted}>
      <div className="hunt-topline"><div><span className="eyebrow">OPERATION: FIND YOUR FATHER</span><h1>He’s in here. <em>Somewhere.</em></h1></div><p>Check the obvious. Then check the embarrassing.</p></div>
      <div className="hunt-layout">
        <section className="play-area" aria-label="Hunt">
          <div className="hud"><div className={`hud-stat timer ${state.endsAt - state.now < 60000 ? 'urgent' : ''}`}><Clock3 /><span><small>TIME LEFT</small><strong>{formatTime(state.endsAt - state.now)}</strong></span></div><div className="hud-stat your-score"><ShoppingBag /><span><small>BAGGED</small><strong>{bagged}</strong></span></div><button className="map-toggle icon-button" aria-label="Open house map" onClick={() => setMapOpen(true)}><Map size={21} /></button></div>
          <div className="game-frame">
            <GameCanvas bridge={bridge} />
            <div className="room-chip"><Home size={15} /><span>{room.name}</span></div>
            {!ready && <div className="game-loading"><Dad character={father} expression={1} /><h2>{error ? 'A little technical hiccup.' : 'Checking under the furniture…'}</h2><p>{error || `${father.name} is finding some deeply questionable hiding spots.`}</p>{error && <button className="button primary" onClick={() => location.reload()}>Try again</button>}</div>}
            {ready && accepted && !coachDismissed && !ended && <div className={`coach ${state.player.roomId === 'hall' && state.player.score === 0 ? 'opening-coach' : ''}`}><Sparkles size={17} /><p>{coach}</p><button className="icon-button" aria-label="Dismiss guidance" onClick={() => setCoachDismissed(true)}><X size={15} /></button></div>}
            {toast && !ended && <div className="toast" role="status">{toast}</div>}
            {ready && accepted && !ended && <><Joystick onMove={point => { bridge.movement = point; }} /><button className="inspect-button" aria-label="Check nearby furniture" onClick={() => bridge.inspect?.()}><Search size={22} /><span>CHECK</span></button></>}
          </div>
          <div className="game-caption"><span><MousePointer2 size={15} /> Tap to walk · Tap things to check · Tap dads to bag</span><span className="keyboard-note"><kbd>W A S D</kbd> also works</span></div>
        </section>
        {mapOpen && <button className="map-backdrop" aria-label="Close map" onClick={() => setMapOpen(false)} />}
        <aside className={`case-file ${mapOpen ? 'is-open' : ''}`} role={mapOpen && !ended ? 'dialog' : undefined} aria-modal={mapOpen && !ended ? true : undefined} aria-labelledby="case-file-title"><div className="case-file-heading"><span className="eyebrow" id="case-file-title">YOUR CASE FILE</span><button className="map-close icon-button" aria-label="Close map" onClick={() => setMapOpen(false)}><X size={19} /></button></div>
          <div className="suspect"><div className="suspect-photo"><Dad character={father} expression={1} /></div><div><small>PERSON OF INTEREST</small><h2>{father.name}</h2><p>Witch-scientist. Zero impulse control.</p></div></div>

          <div className="map-heading"><span>THE HOUSE</span><small>Tap a room to walk there</small></div><HouseMap snapshot={state} navigate={navigate} />
          <div className="map-key"><span className="player-dot" /> You are here <span>·</span> {room.name}</div>
          <div className="bag-summary" aria-live="polite"><ShoppingBag size={27} /><div><strong>{bagged} in the sack</strong><span>{bagged === 0 ? 'Suspiciously roomy government sack.' : 'Getting heavier. Still portable.'}</span></div></div>
          <button className="hint-button" disabled={state.now - state.lastCatchAt < HINT_MS || ended} onClick={() => feedback(session.hint())}><Lightbulb size={17} /> A tiny hint?<ArrowRight size={16} /></button><p className="hint-note">Room hints unlock after 20 seconds without a catch.</p>
        </aside>
      </div>
    </main>
    {!accepted && <CaseIntro story={story} father={father} ready={ready} error={error} sound={preferences.sound} reducedMotion={preferences.reducedMotion} toggleSound={() => { unlockSound(); togglePreference('sound'); }} toggleMotion={() => togglePreference('reducedMotion')} onStart={() => setAccepted(true)} onLeave={onLeave} />}
    {resultsVisible && <div className="modal-backdrop"><section className="result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><span className="eyebrow">{state.finishReason === 'complete' ? 'CASE CLOSED. SACK FULL.' : 'CONTAINMENT WINDOW CLOSED.'}</span><Dad character={father} expression={state.finishReason === 'complete' ? 4 : 5} /><h2 id="result-title">{state.finishReason === 'complete' ? 'Case closed. Sack full.' : state.player.score >= 6 ? 'Dad’s worst nightmare.' : 'A suspicious beginning.'}</h2><p>{state.finishReason === 'complete' ? 'A house cleared of idiots. One very unhappy sack. The government calls that a promotion.' : 'Your shift is over. The government would like its sack back.'}</p><div className="result-stats"><div><strong>{state.player.score}</strong><span>COPIES BAGGED</span></div><div><strong>{formatTime(Math.min(state.now, state.endsAt) - state.startedAt)}</strong><span>TIME SPENT SNOOPING</span></div></div><div className="result-player"><Trophy size={19} /><span><strong>{state.player.name}</strong> caught {state.player.score} {father.name}{state.player.score === 1 ? '' : 's'} in {state.finishReason === 'complete' ? formatTime(state.now - state.startedAt) : '3 minutes'}.</span></div><button className="button primary" onClick={onReplay}>Take another case <ArrowRight size={19} /></button><button className="text-button" onClick={onLeave}><ArrowLeft size={15} /> Back to the notice board</button></section></div>}
    {leaving && !ended && <div className="modal-backdrop"><section className="small-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title"><h2 id="leave-title">Let dad get away?</h2><p>This hunt will end. You can always start another investigation.</p><button className="button primary" onClick={() => setLeaving(false)}>Keep looking</button><button className="text-button" onClick={onLeave}>Leave this hunt</button></section></div>}
    {help && !ended && <div className="modal-backdrop"><section className="small-modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button modal-close" aria-label="Close help" onClick={() => setHelp(false)}><X /></button><span className="eyebrow">DETECTIVE TRAINING, AGAIN</span><h2 id="help-title">Just tap. Be curious.</h2><p><Footprints /> Tap the floor or a room on the map to walk there.</p><p><DoorOpen /> Tap furniture to check it. Open lids. Investigate weird corners.</p><p><MousePointer2 /> See a face? Tap it. Your detective walks over and bags him, even if he ducks away.</p><div className="help-note">The timer keeps ticking while you investigate. Keyboard arrows, WASD, and the joystick work too.</div><button className="button primary" onClick={() => setHelp(false)}>Got it. Where’s dad? <ArrowRight size={18} /></button></section></div>}
  </div>;
}
