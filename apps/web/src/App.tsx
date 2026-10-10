import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, Check, Clock3, DoorOpen, Footprints, HelpCircle, Home, Lightbulb, Map, MousePointer2, Search, Sparkles, Trophy, Volume2, VolumeX, Waves, X } from 'lucide-react';
import { HINT_MS, HOUSE, LocalHuntSession, type ActionResult, type Point } from '@father-hunter/game-core';
import { Brand, Dad, HouseMap, Joystick, formatTime } from './components';
import { GameCanvas } from './game/GameCanvas';
import type { GameBridge } from './game/HouseScene';
import { playSound, unlockSound } from './sound';

function stored(key: string, fallback: string) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } }
function save(key: string, value: string) { try { localStorage.setItem(key, value); } catch { /* Private browsing still works. */ } }
interface Preferences { sound: boolean; reducedMotion: boolean }

export default function App() {
  const [round, setRound] = useState<{ name: string; seed: string } | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(() => ({ sound: stored('fh-sound', 'true') === 'true', reducedMotion: stored('fh-motion', String(matchMedia('(prefers-reduced-motion: reduce)').matches)) === 'true' }));
  const start = (name: string, replay = false) => {
    if (preferences.sound) unlockSound();
    save('fh-name', name);
    const seed = replay ? `hunt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : new URLSearchParams(location.search).get('seed') ?? 'welcome-home';
    setRound({ name, seed });
    window.scrollTo(0, 0);
  };
  const setPreference = (key: keyof Preferences) => setPreferences(prev => { const next = { ...prev, [key]: !prev[key] }; save(key === 'sound' ? 'fh-sound' : 'fh-motion', String(next[key])); return next; });
  return round ? <Round key={round.seed} name={round.name} seed={round.seed} preferences={preferences} togglePreference={setPreference} onLeave={() => setRound(null)} onReplay={() => start(round.name, true)} /> : <Landing onStart={start} />;
}

function Landing({ onStart }: { onStart: (name: string) => void }) {
  const [name, setName] = useState(() => stored('fh-name', ''));
  const submit = (event: FormEvent) => { event.preventDefault(); if (name.trim()) onStart(name.trim()); };
  return <div className="landing">
    <header className="site-header"><Brand /><nav><a href="#how-to-play">How to play <ArrowDown size={14} /></a><span className="pill"><span className="live-dot" /> A VERY UNSERIOUS GAME</span></nav></header>
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="tiny-star">✳</span> A FAMILY-SIZED MYSTERY</div>
          <h1>Dad’s gone<br />missing.<br /><em>Again.</em><span className="headline-star">✴</span></h1>
          <p className="hero-description">One suspicious house. Twelve hidden Balajis.<br className="desktop-break" /> Find them before the tea gets cold.</p>
          <form className="start-form" onSubmit={submit}>
            <label htmlFor="player-name">WHAT SHOULD WE CALL YOU, DETECTIVE?</label>
            <div className="start-fields"><input id="player-name" name="name" autoComplete="given-name" placeholder="Your name goes here" maxLength={24} value={name} onChange={e => setName(e.target.value)} required /><button className="button primary" type="submit">Let’s find dad <ArrowRight size={20} /></button></div>
            <div className="start-note"><Check size={14} /> No signup. No gaming skills. Just suspicious instincts.</div>
          </form>
          <div className="hero-stats"><span><Home size={17} /><b>5</b> rooms</span><span><Search size={17} /><b>12</b> dads</span><span><Clock3 size={17} /><b>10</b> minutes</span></div>
        </div>
        <div className="hero-art" aria-label="Missing poster for Balaji">
          <div className="scribble scribble-top">last seen “just here” <span>↴</span></div>
          <div className="poster-back" />
          <article className="wanted-poster">
            <div className="tape" /><div className="poster-topline"><span>FAMILY NOTICE BOARD</span><span>CASE No. 001</span></div>
            <div className="wanted-title">HAVE YOU<br />SEEN THIS DAD?</div>
            <div className="portrait-stage"><div className="portrait-grid" /><Dad /><span className="portrait-bubble">“I’m literally<br />not hiding.”</span></div>
            <div className="poster-name">BALAJI<span>Age: old enough to know better</span></div>
            <p>Distinctive moustache. Questionable alibis.<br />May be hiding in your commode.</p>
            <div className="poster-stamp">12 SIGHTINGS · 0 EXPLANATIONS</div>
          </article>
          <div className="little-label"><span>☕</span><div>REWARD IF FOUND<strong>One lukewarm cup of tea.</strong></div></div>
          <span className="art-star star-one">✳</span><span className="art-star star-two">✧</span>
        </div>
      </section>
      <section className="how-section" id="how-to-play"><div className="how-heading"><span className="eyebrow">YOUR EXTREMELY BRIEF TRAINING</span><h2>Anyone can hunt a dad.</h2><p>Yes, even that friend who never plays games.</p></div>
        <div className="how-grid">
          <article><div className="how-icon"><Footprints size={27} /><span>01</span></div><h3>Tap. Take a little walk.</h3><p>Tap the floor to wander through the house. Every doorway is a new bad alibi.</p></article>
          <article><div className="how-icon green"><DoorOpen size={27} /><span>02</span></div><h3>Be a little suspicious.</h3><p>Check the furniture. Open the lids. That “plant” might have a moustache.</p></article>
          <article><div className="how-icon yellow"><MousePointer2 size={27} /><span>03</span></div><h3>See dad? Tap dad.</h3><p>Catch him, collect a point, enjoy the drama. Repeat until all dads are accounted for.</p></article>
        </div>
      </section>
    </main>
    <footer className="site-footer"><Brand /><p>Made for laughs. And mildly embarrassed fathers.</p><span>SOLO WARM-UP</span></footer>
  </div>;
}

function Round({ name, seed, preferences, togglePreference, onLeave, onReplay }: { name: string; seed: string; preferences: Preferences; togglePreference: (key: keyof Preferences) => void; onLeave: () => void; onReplay: () => void }) {
  const [session] = useState(() => new LocalHuntSession(name, seed, Date.now, false));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [toast, setToast] = useState(''), [mapOpen, setMapOpen] = useState(false), [leaving, setLeaving] = useState(false), [help, setHelp] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const preferencesRef = useRef(preferences); preferencesRef.current = preferences;
  const showToast = useCallback((text: string) => { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3400); }, []);
  const feedback = useCallback((result: ActionResult) => {
    showToast(result.kind === 'catch' ? `Balaji: “${result.message}”` : result.message);
    if (result.ok && result.kind === 'catch') playSound('catch', preferencesRef.current.sound);
  }, [showToast]);
  const bridge = useMemo<GameBridge>(() => ({ session, movement: { x: 0, y: 0 }, inputEnabled: true, reducedMotion: preferences.reducedMotion, feedback, ready: () => { session.start(); setReady(true); }, failed: setError }), [session, feedback]);
  bridge.reducedMotion = preferences.reducedMotion;
  const latestActivity = state.activity[0];
  useEffect(() => {
    if (latestActivity?.kind === 'search') { showToast(latestActivity.text); playSound('open', preferencesRef.current.sound); }
  }, [latestActivity?.id, showToast]);
  useEffect(() => {
    const timer = setInterval(() => session.tick(), 150);
    const visibility = () => { session.tick(); bridge.movement = { x: 0, y: 0 }; };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); clearTimeout(toastTimer.current); document.removeEventListener('visibilitychange', visibility); session.dispose(); };
  }, [session, bridge]);
  useEffect(() => { if (state.player.score > 0) { const timer = setTimeout(() => setCoachDismissed(true), 6500); return () => clearTimeout(timer); } }, [state.player.score]);
  const room = HOUSE.rooms.find(r => r.id === state.player.roomId)!;
  const remaining = state.targets.length - state.player.score;
  const ended = state.status === 'finished' || state.status === 'expired';
  bridge.inputEnabled = ready && !ended && !leaving && !help && !mapOpen;
  const coach = state.player.score > 0 ? 'You got him! Keep exploring. Every room has more questionable alibis.' : state.opened.some(id => state.targets.some(t => t.slotId === id)) ? 'There he is! Tap Balaji’s face to catch him and score a point.' : state.player.roomId !== 'hall' ? 'Tap furniture to check it. Look closely for little glimpses of a face.' : 'Tap a doorway to explore. The living room is a good place to start.';
  const navigate = (point: Point) => { bridge.navigate?.(point); setMapOpen(false); };

  return <div className={`hunt-shell ${preferences.reducedMotion ? 'reduced-motion' : ''}`}>
    <header className="hunt-header"><Brand onClick={() => setLeaving(true)} /><div className="hunt-title">Balaji’s very normal house <span>SOLO HUNT</span></div><div className="settings">
      <button className="icon-button" aria-label={preferences.sound ? 'Mute sound' : 'Enable sound'} aria-pressed={preferences.sound} onClick={() => { unlockSound(); togglePreference('sound'); }}>{preferences.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
      <button className="icon-button motion-button" aria-label="Reduce animation" aria-pressed={preferences.reducedMotion} onClick={() => togglePreference('reducedMotion')}><Waves size={19} /></button>
      <button className="icon-button" aria-label="How to play" onClick={() => setHelp(true)}><HelpCircle size={19} /></button>
      <button className="icon-button leave-button" aria-label="Leave hunt" onClick={() => setLeaving(true)}><X size={19} /></button>
    </div></header>
    <main className="hunt-main">
      <div className="hunt-topline"><div><span className="eyebrow">OPERATION: FIND YOUR FATHER</span><h1>He’s in here. <em>Somewhere.</em></h1></div><p>Check the obvious. Then check the embarrassing.</p></div>
      <div className="hunt-layout">
        <section className="play-area" aria-label="Hunt">
          <div className="hud"><div className={`hud-stat timer ${state.endsAt - state.now < 60000 ? 'urgent' : ''}`}><Clock3 /><span><small>TIME LEFT</small><strong>{formatTime(state.endsAt - state.now)}</strong></span></div><div className="hud-stat"><Search /><span><small>STILL HIDING</small><strong>{remaining}<i> Balajis</i></strong></span></div><div className="hud-stat your-score"><Trophy /><span><small>YOUR CATCHES</small><strong>{state.player.score}<i> / 12</i></strong></span></div><button className="map-toggle icon-button" aria-label="Open house map" onClick={() => setMapOpen(true)}><Map size={21} /></button></div>
          <div className="game-frame">
            <GameCanvas bridge={bridge} />
            <div className="room-chip"><Home size={15} /><span>{room.name}</span></div>
            {!ready && <div className="game-loading"><Dad expression={1} /><h2>{error ? 'A little technical hiccup.' : 'Checking under the furniture…'}</h2><p>{error || 'Balaji is finding some deeply questionable hiding spots.'}</p>{error && <button className="button primary" onClick={() => location.reload()}>Try again</button>}</div>}
            {ready && !coachDismissed && !ended && <div className="coach"><Sparkles size={17} /><p>{coach}</p><button className="icon-button" aria-label="Dismiss guidance" onClick={() => setCoachDismissed(true)}><X size={15} /></button></div>}
            {toast && !ended && <div className="toast" role="status">{toast}</div>}
            {ready && !ended && <><Joystick onMove={point => { bridge.movement = point; }} /><button className="inspect-button" aria-label="Check nearby furniture" onClick={() => bridge.inspect?.()}><Search size={22} /><span>CHECK</span></button></>}
          </div>
          <div className="game-caption"><span><MousePointer2 size={15} /> Tap to walk · Tap things to check · Tap dads to catch</span><span className="keyboard-note"><kbd>W A S D</kbd> also works</span></div>
        </section>
        {mapOpen && <button className="map-backdrop" aria-label="Close map" onClick={() => setMapOpen(false)} />}
        <aside className={`case-file ${mapOpen ? 'is-open' : ''}`}><div className="case-file-heading"><span className="eyebrow">YOUR CASE FILE</span><button className="map-close icon-button" aria-label="Close map" onClick={() => setMapOpen(false)}><X size={19} /></button></div>
          <div className="suspect"><div className="suspect-photo"><Dad expression={1} /></div><div><small>PERSON OF INTEREST</small><h2>Balaji</h2><p>One dad. Many bad decisions.</p></div></div>
          <div className="dad-tally" aria-label={`${state.player.score} of 12 fathers found`}>{Array.from({ length: 12 }, (_, i) => <span key={i} className={i < state.player.score ? 'caught' : ''}>{i < state.player.score ? <Check size={15} /> : <span className="mini-moustache">⌁</span>}</span>)}</div>
          <div className="map-heading"><span>THE HOUSE</span><small>Tap a room to walk there</small></div><HouseMap snapshot={state} navigate={navigate} />
          <div className="map-key"><span className="player-dot" /> You are here <span>·</span> {room.name}</div>
          <div className="activity-heading"><span className="eyebrow">FAMILY GOSSIP</span><span className="live-dot" /></div>
          <ol className="activity-list" aria-label="Recent activity">{state.activity.slice(0, 4).map(event => <li key={event.id}><span className={`activity-mark ${event.kind}`}>{event.kind === 'catch' ? <Check size={12} /> : '·'}</span><p>{event.text}</p></li>)}</ol>
          <button className="hint-button" disabled={state.now - state.lastCatchAt < HINT_MS || ended} onClick={() => feedback(session.hint())}><Lightbulb size={17} /> A tiny hint?<ArrowRight size={16} /></button><p className="hint-note">Room hints unlock after a minute without a catch.</p>
        </aside>
      </div>
    </main>
    {ended && <div className="modal-backdrop"><section className="result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><span className="eyebrow">{state.finishReason === 'complete' ? 'CASE CLOSED. DAD EXPOSED.' : 'TEA BREAK. INVESTIGATION OVER.'}</span><Dad expression={state.finishReason === 'complete' ? 4 : 5} /><h2 id="result-title">{state.finishReason === 'complete' ? 'Absolutely dad-icated.' : state.player.score >= 6 ? 'Dad’s worst nightmare.' : 'A suspicious beginning.'}</h2><p>{state.finishReason === 'complete' ? 'Twelve dads caught. Not one convincing explanation.' : `${remaining} Balajis escaped questioning. They would like to thank the furniture.`}</p><div className="result-stats"><div><strong>{state.player.score}<small>/ 12</small></strong><span>BALAJIS FOUND</span></div><div><strong>{formatTime(Math.min(state.now, state.endsAt) - state.startedAt)}</strong><span>TIME SPENT SNOOPING</span></div></div><div className="result-player"><Trophy size={19} /><strong>{state.player.name}</strong><span>{state.player.score} points</span></div><button className="button primary" onClick={onReplay}>Hide him again <ArrowRight size={19} /></button><button className="text-button" onClick={onLeave}><ArrowLeft size={15} /> Back to the notice board</button></section></div>}
    {leaving && !ended && <div className="modal-backdrop"><section className="small-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title"><h2 id="leave-title">Let dad get away?</h2><p>This hunt will end. You can always start another investigation.</p><button className="button primary" onClick={() => setLeaving(false)}>Keep looking</button><button className="text-button" onClick={onLeave}>Leave this hunt</button></section></div>}
    {help && !ended && <div className="modal-backdrop"><section className="small-modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button modal-close" aria-label="Close help" onClick={() => setHelp(false)}><X /></button><span className="eyebrow">DETECTIVE TRAINING, AGAIN</span><h2 id="help-title">Just tap. Be curious.</h2><p><Footprints /> Tap the floor or a room on the map to walk there.</p><p><DoorOpen /> Tap furniture to check it. Open lids. Investigate weird corners.</p><p><MousePointer2 /> See a face? Tap Balaji to catch him. Every dad is worth one point.</p><div className="help-note">The timer keeps ticking while you investigate. Keyboard arrows, WASD, and the joystick work too.</div><button className="button primary" onClick={() => setHelp(false)}>Got it. Where’s dad? <ArrowRight size={18} /></button></section></div>}
  </div>;
}
