import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Clock3, DoorOpen, Footprints, HelpCircle, Home, Lightbulb, Map, MousePointer2, Search, ShoppingBag, Sparkles, Trophy, Volume2, VolumeX, Waves, X } from 'lucide-react';
import { HINT_MS, HOUSE, LocalHuntSession, type CharacterPack, type ActionResult, type Point, type HuntSession, type RoomView } from '@father-hunter/game-core';
import { Brand, Dad, HouseMap, Joystick, formatTime } from './components';
import { GameCanvas } from './game/GameCanvas';
import { CaseIntro } from './CaseIntro';
import type { GameBridge } from './game/HouseScene';
import { playSound, unlockSound } from './sound';
import { Leaderboard } from './Leaderboard';
export interface Preferences { sound: boolean; reducedMotion: boolean }

export function Round({ name, seed, father, preferences, togglePreference, onLeave, onReplay, session: suppliedSession, resumed = false, room: multiplayerRoom }: { name: string; seed: string; father: CharacterPack; preferences: Preferences; togglePreference: (key: keyof Preferences) => void; onLeave: () => void; onReplay: () => void; session?: HuntSession; resumed?: boolean; room?: RoomView }) {
  const [session] = useState(() => suppliedSession ?? new LocalHuntSession(name, seed, Date.now, false, father));
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const story = state.case;
  const [ready, setReady] = useState(false), [error, setError] = useState('');
  const [accepted, setAccepted] = useState(resumed), [bagged, setBagged] = useState(session.getSnapshot().player.score);
  const [toast, setToast] = useState(''), [mapOpen, setMapOpen] = useState(false), [leaving, setLeaving] = useState(false), [help, setHelp] = useState(false);
  const [coachDismissed, setCoachDismissed] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const preferencesRef = useRef(preferences); preferencesRef.current = preferences;
  const showToast = useCallback((text: string) => { setToast(text); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(''), 3400); }, []);
  const feedback = useCallback((result: ActionResult) => {
    if (result.kind === 'hint' || result.kind === 'error') showToast(result.message);
  }, [showToast]);
  const bridge = useMemo<GameBridge>(() => ({ session, movement: { x: 0, y: 0 }, inputEnabled: true, reducedMotion: preferences.reducedMotion, feedback, ready: () => setReady(true), bonk: () => playSound('bonk', preferencesRef.current.sound), bagged: (count, restored) => { setBagged(count); if (!restored) playSound('catch', preferencesRef.current.sound); }, failed: setError }), [session, feedback]);
  bridge.reducedMotion = preferences.reducedMotion;
  const [catchNotice, setCatchNotice] = useState('');
  const eventCursor = useRef(multiplayerRoom?.cursor ?? 0), noticeQueue = useRef<string[]>([]);
  useEffect(() => {
    if (!multiplayerRoom) return;
    for (const event of multiplayerRoom.events) if (event.id > eventCursor.current && event.playerId !== multiplayerRoom.me?.id && multiplayerRoom.serverNow - event.at < 5000 && accepted) noticeQueue.current.push(event.text);
    eventCursor.current = Math.max(eventCursor.current, multiplayerRoom.cursor); noticeQueue.current = noticeQueue.current.slice(-3);
  }, [multiplayerRoom, accepted]);
  useEffect(() => { const next = () => { setCatchNotice(noticeQueue.current.shift() ?? ''); }; const timer = setInterval(next, 2500); return () => clearInterval(timer); }, []);
  const latestActivity = state.activity[0];
  useEffect(() => {
    if (latestActivity?.kind === 'search') playSound('open', preferencesRef.current.sound);
  }, [latestActivity?.id, showToast]);
  useEffect(() => { if (accepted && ready) void Promise.resolve(session.start()).catch(fault => { setError((fault as Error).message); setAccepted(false); }); }, [accepted, ready, session]);
  useEffect(() => {
    const timer = setInterval(() => session.tick(), 150);
    const visibility = () => { session.tick(); bridge.movement = { x: 0, y: 0 }; };
    document.addEventListener('visibilitychange', visibility);
    return () => { clearInterval(timer); clearTimeout(toastTimer.current); document.removeEventListener('visibilitychange', visibility); session.dispose(); };
  }, [session, bridge]);
  useEffect(() => { if (state.player.score > 0) { const timer = setTimeout(() => setCoachDismissed(true), 6500); return () => clearTimeout(timer); } }, [state.player.score]);
  const room = HOUSE.rooms.find(r => r.id === state.player.roomId)!;
  const ended = state.status === 'finished' || state.status === 'expired';
  const resultsVisible = ended && bagged >= state.player.score && !state.pendingActions;
  bridge.inputEnabled = ready && accepted && state.connection !== 'reconnecting' && state.connection !== 'replaced' && !ended && !leaving && !help && !mapOpen;
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
  const coach = state.player.score > 0 ? 'In the bag. Keep checking the other rooms.' : state.opened.some(id => state.targets.some(t => t.kind === 'hidden' && t.slotId === id)) ? 'Tap the face. Your agent will walk over and bag him.' : state.player.roomId !== 'hall' ? 'Tap furniture to check inside. If a face peeks out, tap it.' : 'That statue under the spotlight looks suspicious. Tap him; your agent walks over.';
  const navigate = (point: Point) => { bridge.navigate?.(point); setMapOpen(false); };

  return <div className={`hunt-shell ${preferences.reducedMotion ? 'reduced-motion' : ''} ${multiplayerRoom ? 'multiplayer' : ''}`}>
    <header className="hunt-header" inert={!accepted}><Brand onClick={() => setLeaving(true)} /><div className="hunt-title">{story.title} <span>{multiplayerRoom ? 'GROUP CASE · OWN HOUSE' : 'SOLO HUNT'}</span></div><div className="settings">
      <button className="icon-button" aria-label={preferences.sound ? 'Mute sound' : 'Enable sound'} aria-pressed={preferences.sound} onClick={() => { unlockSound(); togglePreference('sound'); }}>{preferences.sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
      <button className="icon-button motion-button" aria-label="Reduce animation" aria-pressed={preferences.reducedMotion} onClick={() => togglePreference('reducedMotion')}><Waves size={19} /></button>
      <button className="icon-button" aria-label="How to play" onClick={() => setHelp(true)}><HelpCircle size={19} /></button>
      <button className="icon-button leave-button" aria-label="Leave hunt" onClick={() => setLeaving(true)}><X size={19} /></button>
    </div></header>
    <main className="hunt-main" inert={!accepted}>
      <div className="hunt-topline"><div><span className="eyebrow">OPERATION: FIND {father.name.toUpperCase()}</span><h1>He’s in here. <em>Somewhere.</em></h1></div><p>Check the obvious. Then check the embarrassing.</p></div>
      <div className="hunt-layout">
        <section className="play-area" aria-label="Hunt">
          <div className="hud"><div className={`hud-stat timer ${state.endsAt - state.now < 10000 ? 'urgent critical' : state.endsAt - state.now < 30000 ? 'urgent' : ''}`}><Clock3 /><span><small>TIME LEFT</small><strong>{formatTime(state.endsAt - state.now)}</strong></span></div><div className="hud-stat your-score"><ShoppingBag /><span><small>BAGGED</small><strong>{bagged}</strong></span></div><button className="map-toggle icon-button" aria-label="Open house map" onClick={() => setMapOpen(true)}><Map size={21} /></button></div>
          <div className="game-frame">
            <GameCanvas bridge={bridge} />
            {catchNotice && !ended && <div className="live-catch" role="status">{catchNotice}</div>}
            {state.connection && state.connection !== 'online' && <div className="connection-note" role="status">{state.connectionMessage}{state.connection === 'replaced' && <button onClick={onLeave}>Return to the case to resume here</button>}</div>}
            <div className="room-chip"><Home size={15} /><span>{room.name}</span></div>
            {!ready && <div className="game-loading"><Dad character={father} expression={1} /><h2>{error ? 'A little technical hiccup.' : 'Checking under the furniture…'}</h2><p>{error || `${father.name} is finding some deeply questionable hiding spots.`}</p>{error && <button className="button primary" onClick={() => location.reload()}>Try again</button>}</div>}
            {ready && accepted && !coachDismissed && !ended && <div className={`coach ${state.player.roomId === 'hall' && state.player.score === 0 ? 'opening-coach' : ''}`}><Sparkles size={17} /><p>{coach}</p><button className="icon-button" aria-label="Dismiss guidance" onClick={() => setCoachDismissed(true)}><X size={15} /></button></div>}
            {toast && !ended && <div className="toast" role="status">{toast}</div>}
            {ready && accepted && !ended && <><Joystick onMove={point => { bridge.movement = point; }} /><button className="inspect-button" aria-label="Check nearby furniture" onClick={() => bridge.inspect?.()}><Search size={22} /><span>CHECK</span></button></>}
          </div>
          <div className="game-caption"><span><MousePointer2 size={15} /> Tap to walk · Tap things to check · Tap {father.name}s to bag</span><span className="keyboard-note"><kbd>W A S D</kbd> also works</span></div>
        </section>
        {mapOpen && <button className="map-backdrop" aria-label="Close map" onClick={() => setMapOpen(false)} />}
        <aside className={`case-file ${mapOpen ? 'is-open' : ''}`} role={mapOpen && !ended ? 'dialog' : undefined} aria-modal={mapOpen && !ended ? true : undefined} aria-labelledby="case-file-title"><div className="case-file-heading"><span className="eyebrow" id="case-file-title">YOUR CASE FILE</span><button className="map-close icon-button" aria-label="Close map" onClick={() => setMapOpen(false)}><X size={19} /></button></div>
          <div className="suspect"><div className="suspect-photo"><Dad character={father} expression={1} /></div><div><small>PERSON OF INTEREST</small><h2>{father.name}</h2><p>Witch-scientist. Zero impulse control.</p></div></div>

          {multiplayerRoom && <Leaderboard view={multiplayerRoom} />}
          <div className="map-heading"><span>THE HOUSE</span><small>Tap a room to walk there</small></div><HouseMap snapshot={state} navigate={navigate} />
          <div className="map-key"><span className="player-dot" /> You are here <span>·</span> {room.name}</div>
          <div className="bag-summary" aria-live="polite"><ShoppingBag size={27} /><div><strong>{bagged} in the sack</strong><span>{bagged === 0 ? 'Suspiciously roomy government sack.' : 'Getting heavier. Still portable.'}</span></div></div>
          <button className="hint-button" disabled={state.now - state.lastCatchAt < HINT_MS || ended} onClick={() => { void Promise.resolve(session.hint()).then(feedback); }}><Lightbulb size={17} /> A tiny hint?<ArrowRight size={16} /></button><p className="hint-note">Room hints unlock after 20 seconds without a catch.</p>
        </aside>
      </div>
    </main>
    {!accepted && <CaseIntro story={story} father={father} ready={ready} error={error} sound={preferences.sound} reducedMotion={preferences.reducedMotion} toggleSound={() => { unlockSound(); togglePreference('sound'); }} toggleMotion={() => togglePreference('reducedMotion')} onStart={() => setAccepted(true)} onLeave={onLeave} />}
    {resultsVisible && <div className="modal-backdrop"><section className="result-card" role="dialog" aria-modal="true" aria-labelledby="result-title"><span className="eyebrow">{state.finishReason === 'complete' ? 'CASE CLOSED. SACK FULL.' : 'CONTAINMENT WINDOW CLOSED.'}</span><Dad character={father} expression={state.finishReason === 'complete' ? 4 : 5} /><h2 id="result-title">{state.finishReason === 'complete' ? 'Case closed. Sack full.' : state.player.score >= 6 ? `${father.name}’s worst nightmare.` : `${father.name} still has alibis.`}</h2><p>{state.finishReason === 'complete' ? 'A house cleared of idiots. One very unhappy sack. The government calls that a promotion.' : 'Your shift is over. The government would like its sack back.'}</p><div className="result-stats"><div><strong>{state.player.score}</strong><span>COPIES BAGGED</span></div><div><strong>{formatTime(Math.min(state.now, state.endsAt) - state.startedAt)}</strong><span>TIME SPENT SNOOPING</span></div></div><div className="result-player"><Trophy size={19} /><span><strong>{state.player.name}</strong> caught {state.player.score} {father.name}{state.player.score === 1 ? '' : 's'} in {formatTime(Math.min(state.now, state.endsAt) - state.startedAt)}.</span></div>{multiplayerRoom && <Leaderboard view={multiplayerRoom} final />}<button className="button primary" disabled={!!multiplayerRoom && multiplayerRoom.room.expiresAt - multiplayerRoom.serverNow < 120000} onClick={onReplay}>{multiplayerRoom ? 'Try to beat your sack' : 'Take another case'} <ArrowRight size={19} /></button><button className="text-button" onClick={onLeave}><ArrowLeft size={15} /> Back to the notice board</button></section></div>}
    {leaving && !ended && <div className="modal-backdrop"><section className="small-modal" role="dialog" aria-modal="true" aria-labelledby="leave-title"><h2 id="leave-title">Let {father.name} get away?</h2><p>{multiplayerRoom ? 'Your timer keeps running. You can resume this attempt from the case page.' : 'This hunt will end. You can always start another investigation.'}</p><button className="button primary" onClick={() => setLeaving(false)}>Keep looking</button><button className="text-button" onClick={onLeave}>Leave this hunt</button></section></div>}
    {help && !ended && <div className="modal-backdrop"><section className="small-modal help-modal" role="dialog" aria-modal="true" aria-labelledby="help-title"><button className="icon-button modal-close" aria-label="Close help" onClick={() => setHelp(false)}><X /></button><span className="eyebrow">AGENT TRAINING, AGAIN</span><h2 id="help-title">Just tap. Be curious.</h2><p><Footprints /> Tap the floor or a room on the map to walk there.</p><p><DoorOpen /> Tap furniture to check it. Open lids. Investigate weird corners.</p><p><MousePointer2 /> See a face? Tap it. Your agent walks over and bags him, even if he ducks away.</p><div className="help-note">The timer keeps ticking while you investigate. Keyboard arrows, WASD, and the joystick work too.</div><button className="button primary" onClick={() => setHelp(false)}>Got it. Where’s {father.name}? <ArrowRight size={18} /></button></section></div>}
  </div>;
}
