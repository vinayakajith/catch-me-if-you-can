import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Check, Copy, Map, Maximize, RotateCw, Search, ShoppingBag, Volume2, VolumeX, X } from 'lucide-react';
import { HOUSE, LocalHuntSession, createTimeMachineCase, type CharacterPack, type HuntSession, type SharedPlayer, type SharedView } from '@catch-me-if-you-can/game-core';
import { SharedClient } from './shared-client';
import { SharedSession } from './shared-session';
import { Dad, HouseMap, Joystick, formatTime } from './components';
import { GameCanvas } from './game/GameCanvas';
import { playerWitchSvg } from './game/player-art';
import { svgUri } from './game/art';
import { CaseIntro } from './CaseIntro';
import { playSound, unlockSound } from './sound';
import { roomConfig } from './room-api';
import type { GameBridge } from './game/HouseScene';
import type { Preferences } from './Round';
import './shared.css';
import { PlayerPortrait } from './PlayerPortrait';

export function PlayerBadge({ player }: { player: Pick<SharedPlayer, 'name' | 'colour' | 'avatar'> }) {
  return <div className="player-badge" style={{ borderColor: player.colour }}><img src={svgUri(playerWitchSvg(player.colour))} alt="" />{player.avatar && <img className="player-face" src={player.avatar} alt={`${player.name}’s game face`} onError={e => { e.currentTarget.style.display = 'none'; }} />}</div>;
}
function fullScreen() {
  unlockSound();
  if (!document.fullscreenElement && document.documentElement.requestFullscreen) void document.documentElement.requestFullscreen().then(() => {
    const orientation = screen.orientation as ScreenOrientation & { lock?: (mode: string) => Promise<void> };
    void orientation.lock?.('landscape').catch(() => {});
  }).catch(() => {});
}
export function SharedRoomPage({ id, preferences, togglePreference, onHome, onCreate }: { id: string; preferences: Preferences; togglePreference(key: keyof Preferences): void; onHome(): void; onCreate(): void }) {
  const [client] = useState(() => new SharedClient(id));
  const { view, connected, error: connectionError } = useSyncExternalStore(client.subscribe, client.getSnapshot);
  const [name, setName] = useState(() => { try { return localStorage.getItem('fh-name') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [story, setStory] = useState(false), [practice, setPractice] = useState(false);
  const [artReady, setArtReady] = useState(false);
  const [invite, setInvite] = useState(`${location.origin}/r/${id}`), [copied, setCopied] = useState(false);
  const inviteInput = useRef<HTMLInputElement>(null);
  useEffect(() => { void client.initialize(); return () => client.dispose(); }, [client]);
  useEffect(() => { let active = true; if (view?.me && view.father) void client.prepare().then(() => { if (active) setArtReady(true); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [client, view?.me, view?.father?.atlas]);
  useEffect(() => { let active = true; roomConfig().then(c => { if (active) setInvite(`${c.shareOrigin}/r/${id}`); }).catch(() => {}); return () => { active = false; }; }, [id]);
  const action = async (kind: 'start' | 'ready' | 'rematch' | 'leave', ready?: boolean) => {
    setBusy(true); setError(''); try { if (kind === 'ready' && ready) { await client.prepare(); setArtReady(true); } await client.request({ kind, ready }); if (kind === 'leave') onHome(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  if (!view) return <main className="shared-loading"><h1>Opening the house…</h1><p role="status">{connectionError}</p><button onClick={onHome}>Back</button></main>;
  const me = view.players.find(p => p.id === view.me), host = view.hostId === view.me;
  if (view.round && me?.roundId === view.round.id && ['countdown', 'playing', 'results'].includes(view.phase)) return <SharedPlay key={view.round.id} client={client} view={view} preferences={preferences} togglePreference={togglePreference} onHome={onHome} onCreate={onCreate} onRematch={() => void action('rematch')} error={error} />;
  if (practice && view.father && me) return <Practice father={view.father} name={me.name} preferences={preferences} onDone={() => setPractice(false)} />;
  return <main className="shared-lobby">
    <div className="lobby-top"><span>CATCH ME IF YOU CAN</span><button aria-label="Leave room" className="icon-button" onClick={onHome}><X /></button></div>
    <div className="lobby-layout"><section className="lobby-case"><span className="eyebrow">ONE HOUSE · FIVE WITCHES · ZERO DIGNITY</span><h1>The {view.room.fatherName}<br /><em>incident.</em></h1>
      {view.father && <Dad character={view.father} expression={view.father.expressions.laugh} />}
      <p>{view.room.fatherName} had one job: stir the witch’s potion. He climbed into her time machine instead. Now twenty of him are loose. Bring a hammer. Leave your standards.</p>
      <div className="lobby-rules"><b>2 minutes</b><b>20 {view.room.fatherName}s</b><b>First catch wins</b></div>
      <button className="text-button" onClick={() => setStory(true)} disabled={!view.father}>Watch the incident ↗</button>
    </section><section className="lobby-crew">
      {view.phase === 'closed' ? <><h2>This room has closed.</h2><p>Game faces are no longer available. The scores stay for 24 hours.</p><Scores view={view} final /><button className="button primary" onClick={onCreate}>Create the next disaster</button></> : !me ? <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await client.join(name); try { localStorage.setItem('fh-name', name); } catch {} } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
        <h2>Who’s holding the hammer?</h2><label htmlFor="join-name">Your name</label><input id="join-name" value={name} onChange={e => setName(e.target.value)} maxLength={24} required autoComplete="given-name" placeholder="Your name" /><button className="button primary" disabled={busy || view.room.playerCount >= 5}>{view.room.playerCount >= 5 ? 'All five seats are taken' : busy ? 'Joining…' : 'Join the crew'}</button>
      </form> : <>
        <div className="crew-title"><h2>The crew</h2><span>{view.players.length}/5</span></div>
        <div className="crew-list">{view.players.map(p => <div key={p.id} className="crew-member"><PlayerBadge player={p} /><span><b>{p.name}{p.id === me.id ? ' · you' : ''}</b><small>{p.id === view.hostId ? 'HOST · ' : ''}{!p.connected ? 'Reconnecting' : p.ready ? 'Ready to bonk' : 'Getting ready'}</small></span><i style={{ background: p.ready && p.connected ? '#70dd96' : '#82768f' }} /></div>)}</div>
        <PlayerPortrait roomId={id} player={me} />
        <div className="lobby-training"><p>New here? One tap is all you need.</p><button className="button secondary" onClick={() => setPractice(true)}>Try one catch</button></div>
        {view.phase === 'lobby' ? <><button className="button primary ready-button" disabled={busy || !connected} onClick={() => { if (!me.ready) fullScreen(); void action('ready', !me.ready); }}>{busy && !artReady ? 'Loading the house…' : me.ready ? '✓ Ready · tap to undo' : 'I’m ready'}</button>
          {host ? <button className="button start-button" disabled={busy || !connected || view.players.filter(p => p.connected).length < 2 || view.players.some(p => p.connected && !p.ready)} onClick={() => void action('start')}>Start the hunt</button> : <p className="waiting-note">{view.players.find(p => p.id === view.hostId)?.name ?? 'The host'} starts when everyone is ready.</p>}</> : <p className="waiting-note">A hunt is running. Your seat is saved for the next round.</p>}
        <div className="shared-invite"><label htmlFor="shared-invite">Invite your friends · {formatTime(view.room.expiresAt - client.time())} until this room closes</label><div><input id="shared-invite" readOnly ref={inviteInput} value={invite} onFocus={e => e.currentTarget.select()} /><button className="icon-button" aria-label="Copy invite" onClick={async () => { try { await navigator.clipboard.writeText(invite); setCopied(true); } catch { inviteInput.current?.select(); } }}>{copied ? <Check /> : <Copy />}</button></div></div>
      </>}
      {(error || connectionError) && <p role="status" className="shared-error">{error || connectionError}</p>}
    </section></div>
    {story && view.father && <CaseIntro father={view.father} story={createTimeMachineCase(view.father.name, me?.name ?? 'You')} ready error="" sound={preferences.sound} reducedMotion={preferences.reducedMotion} toggleSound={() => togglePreference('sound')} toggleMotion={() => togglePreference('reducedMotion')} onStart={() => setStory(false)} onLeave={() => setStory(false)} />}
  </main>;
}
function Scores({ view, final = false }: { view: SharedView; final?: boolean }) {
  const scores = final ? view.lastScores : view.players.filter(p => p.roundId === view.round?.id).sort((a, b) => b.score - a.score);
  return <ol className="shared-scores" aria-label={final ? 'Final scores' : 'Live leaderboard'}>{scores.map((p, i) => <li key={p.id}><span>{i + 1}</span><i style={{ background: p.colour }} /><b>{p.name}{p.id === view.me ? ' (you)' : ''}</b><strong>{p.score}</strong></li>)}</ol>;
}
function SharedPlay({ client, view, preferences, togglePreference, onHome, onCreate, onRematch, error }: { client: SharedClient; view: SharedView; preferences: Preferences; togglePreference(key: keyof Preferences): void; onHome(): void; onCreate(): void; onRematch(): void; error: string }) {
  const [session] = useState(() => new SharedSession(client));
  const ended = view.phase === 'results', top = view.lastScores[0]?.score ?? 0, winners = view.lastScores.filter(p => p.score === top).map(p => p.name);
  const [settled, setSettled] = useState(false);
  useEffect(() => { if (ended) { const timer = setTimeout(() => setSettled(true), 1400); return () => clearTimeout(timer); } }, [ended]);
  return <Arena session={session} preferences={preferences} togglePreference={togglePreference} players={() => client.getSnapshot().view?.players ?? []} onBack={onHome} notice={view.events.at(-1)?.text ?? ''} noticeAt={view.events.at(-1)?.at ?? 0} side={<Scores view={view} />}>
    {ended && settled && <div className="shared-overlay"><section className="shared-result" role="dialog" aria-modal="true" aria-label="Hunt results"><span className="eyebrow">THE SACKS HAVE BEEN WEIGHED</span><h1>{top === 0 ? `${view.room.fatherName} wins. Somehow.` : winners.length > 1 ? 'A gloriously stupid tie.' : `${winners[0]} cleaned house.`}</h1><p>{top ? `${winners.join(' & ')} caught ${top} ${view.room.fatherName}s in ${formatTime(Math.min(120000, (view.round!.finishedAt ?? view.round!.endsAt) - view.round!.startedAt))}. Put that on a CV.` : 'Twenty men. Five rooms. Not a single productive employee.'}</p><Scores view={view} final />{view.hostId === view.me ? <button className="button primary" onClick={onRematch}>Back to lobby · rematch</button> : <p>Waiting for the host to open the next round.</p>}<button className="text-button" onClick={onCreate}>Your turn. Create the next disaster →</button>{error && <p role="alert">{error}</p>}</section></div>}
  </Arena>;
}
function Practice({ father, name, preferences, onDone }: { father: CharacterPack; name: string; preferences: Preferences; onDone(): void }) {
  const [session] = useState(() => {
    const base = new LocalHuntSession(name, 'practice', Date.now, true, father).checkpoint();
    base.snapshot.targets = [{ kind: 'hidden', id: 'practice-statue', slotId: 'living-statue', claimedBy: null, claimedAt: null }];
    base.snapshot.player.position = { x: 450, y: 440 }; base.snapshot.player.roomId = 'living';
    return LocalHuntSession.restore(base, Date.now);
  });
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
  return <Arena session={session} preferences={preferences} togglePreference={() => {}} onBack={onDone} practice><div className="practice-instruction" role="status">{state.player.score ? <><strong>That’s it. One tap, one sack.</strong><button className="button primary" onClick={onDone}>Back to my crew</button></> : <><strong>Tap the statue under the spotlight.</strong><span>You walk over and catch him automatically. Try it.</span><button className="text-button" onClick={onDone}>Back to lobby</button></>}</div></Arena>;
}
function Arena({ session, preferences, togglePreference, players, onBack, notice = '', noticeAt = 0, side, children, practice = false }: { session: HuntSession; preferences: Preferences; togglePreference(key: keyof Preferences): void; players?: () => SharedPlayer[]; onBack(): void; notice?: string; noticeAt?: number; side?: React.ReactNode; children?: React.ReactNode; practice?: boolean }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot), prefs = useRef(preferences); prefs.current = preferences;
  const [ready, setReady] = useState(false), [error, setError] = useState(''), [label, setLabel] = useState('Catch'), [map, setMap] = useState(false), [feedback, setFeedback] = useState('');
  const [rotated, setRotated] = useState(false), [now, setNow] = useState(session.time()); const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const peers = useRef(players); peers.current = players;
  const bridge = useMemo<GameBridge>(() => ({ session, movement: { x: 0, y: 0 }, reducedMotion: preferences.reducedMotion, inputEnabled: true,
    ...(players ? { players: () => peers.current?.() ?? [] } : {}), ready: () => setReady(true), failed: setError, actionLabel: setLabel,
    feedback: r => { if (r.message) { setFeedback(r.message); clearTimeout(feedbackTimer.current); feedbackTimer.current = setTimeout(() => setFeedback(''), 2600); } },
    bonk: () => playSound('bonk', prefs.current.sound), bagged: (_, restored) => { if (!restored) playSound('catch', prefs.current.sound); },
  }), [session]);
  bridge.reducedMotion = preferences.reducedMotion; bridge.inputEnabled = ready && state.status === 'playing' && state.connection !== 'reconnecting' && !map;
  useEffect(() => { const t = setInterval(() => setNow(session.time()), 100); return () => { clearInterval(t); clearTimeout(feedbackTimer.current); session.dispose(); }; }, [session]);
  const countdown = Math.max(0, Math.ceil((state.startedAt - now) / 1000));
  return <div className="shared-arena" onContextMenu={e => e.preventDefault()} onDragStart={e => e.preventDefault()}>
    <GameCanvas bridge={bridge} />
    <div className="arena-hud"><span className={state.endsAt - now < 30000 ? 'time-urgent' : ''}>{practice ? 'PRACTICE' : countdown ? 'GET READY' : formatTime(state.endsAt - now)}</span><span><ShoppingBag size={16} />{state.player.score}</span><span>{state.targets.filter(t => !t.claimedBy).length} left</span><button aria-label="Open house map" onClick={() => setMap(true)}><Map size={18} /></button><button aria-label={preferences.sound ? 'Mute sound' : 'Enable sound'} onClick={() => { unlockSound(); togglePreference('sound'); }}>{preferences.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button aria-label="Full screen" onClick={fullScreen}><Maximize size={18} /></button><button aria-label="Back to lobby" onClick={onBack}><X size={18} /></button></div>
    <div className="arena-room">{HOUSE.rooms.find(r => r.id === state.player.roomId)?.name}</div>
    <div className="arena-notice" role="status">{state.connection === 'reconnecting' ? state.connectionMessage : (feedback || (now - noticeAt < 4000 ? notice : ''))}</div>
    {!practice && state.player.score === 0 && !notice && !feedback && <p className="arena-coach">Tap a face to catch. Tap furniture to open. We do the walking.</p>}
    {!rotated && <button className="rotate-note" onClick={() => setRotated(true)}><RotateCw size={17} /> Turn your phone sideways for more room · dismiss</button>}
    <aside className="arena-board">{side}</aside>
    <Joystick onMove={point => { bridge.movement = point; }} />
    <button className="arena-action" disabled={!bridge.inputEnabled} onClick={() => bridge.inspect?.()}><Search size={20} /><span>{label}</span></button>
    {!ready && <div className="shared-overlay"><p role="status">{error || 'Opening the house…'}</p>{error && <button onClick={() => location.reload()}>Reload</button>}</div>}
    {ready && countdown > 0 && <div className="shared-countdown" role="status"><strong>{countdown}</strong><span>Twenty {state.father.name}s. Make it embarrassing.</span></div>}
    {map && <div className="shared-overlay"><section className="arena-map" role="dialog" aria-modal="true" aria-label="Choose a room"><h2>Tap a room. We’ll walk there.</h2><HouseMap snapshot={state} navigate={point => { setMap(false); bridge.navigate?.(point); }} /><button className="button secondary" onClick={() => setMap(false)}>Back to the house</button></section></div>}
    {children}
  </div>;
}
