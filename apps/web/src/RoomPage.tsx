import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Share2, Users } from 'lucide-react';
import { ROUND_MS } from '@father-hunter/game-core';
import { Brand, Dad, formatTime } from './components';
import { RoomClient, roomConfig } from './room-api';
import { NetworkHuntSession } from './network-session';
import { Round, type Preferences } from './Round';
import { Leaderboard } from './Leaderboard';
import { useCaseTitle } from './useCaseTitle';
import './rooms.css';

export function RoomPage({ id, preferences, togglePreference, onHome, onCreate }: { id: string; preferences: Preferences; togglePreference(key: keyof Preferences): void; onHome(): void; onCreate(): void }) {
  const [client] = useState(() => new RoomClient(id));
  const { view, error: connectionError } = useSyncExternalStore(client.subscribe, client.getSnapshot);
  useCaseTitle(view?.room.fatherName);
  const [name, setName] = useState(() => { try { return localStorage.getItem('fh-name') ?? ''; } catch { return ''; } });
  const [run, setRun] = useState<NetworkHuntSession | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [share, setShare] = useState({ public: false, url: `${location.origin}/r/${id}`, lan: !['localhost', '127.0.0.1'].includes(location.hostname) }), [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { client.startPolling(); return () => client.dispose(); }, [client]);
  useEffect(() => { let alive = true; roomConfig().then(config => { if (alive) setShare({ public: config.public, url: `${config.shareOrigin}/r/${id}`, lan: config.lanAvailable }); }).catch(() => {}); return () => { alive = false; }; }, [id]);
  const enter = async () => {
    if (!view?.me || !view.father) return;
    setBusy(true); setError('');
    try {
      const resumed = view.attempt?.snapshot.status === 'playing' ? await client.resume() : undefined;
      setRun(new NetworkHuntSession(client, resumed));
    } catch (fault) { setError((fault as Error).message); } finally { setBusy(false); }
  };
  const copy = async () => {
    try { if (navigator.clipboard) await navigator.clipboard.writeText(share.url); else { input.current?.select(); if (!document.execCommand('copy')) throw new Error(); } setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { input.current?.focus(); input.current?.select(); setError('Select and copy the invite above.'); }
  };
  if (run && view?.room.status !== 'closed') return <Round key={run.viewKey} name={view!.me!.name} seed={run.getSnapshot().seed} father={view!.father!} session={run} resumed={run.resumed} room={view!} preferences={preferences} togglePreference={togglePreference} onLeave={() => { setRun(null); }} onReplay={() => setRun(new NetworkHuntSession(client))} onCreate={onCreate} />;
  return <div className="room-page"><header className="site-header"><Brand onClick={onHome} /><button className="text-button" onClick={onHome}><ArrowLeft size={16} /> Home</button></header>
    {!view ? <main className="room-loading"><span className="eyebrow">THE WITCH’S MISSING ASSISTANT</span><h1>Finding your case…</h1><p role="status">{connectionError || 'Checking the invite.'}</p></main> :
    <main className="room-lobby">
      <div className="room-brief"><span className="eyebrow">THE WITCH’S MISSING ASSISTANT · GROUP CASE</span><h1>The {view.room.fatherName}<br /><em>incident.</em></h1>
        {view.father && <div className="room-suspect"><Dad character={view.father} expression={view.father.expressions.laugh} /><span>ONE ASSISTANT.<br />ABSOLUTELY NO RESTRAINT.</span></div>}
        <p>{view.room.status === 'closed' ? `The ${view.room.fatherName} containment window is closed. These scores remain available for 24 hours.` : `Your own house. Your own hammer. The same very questionable ${view.room.fatherName}.`}</p>
        <div className="room-facts"><span><Users size={17} /> {view.room.playerCount} / 5 players</span><span>2-minute hunts</span><span>{view.room.status === 'closed' ? 'Closed' : `${formatTime(view.room.expiresAt - view.serverNow)} to close`}</span></div>
      </div>
      <section className="room-actions">
        {view.room.status === 'closed' ? <><Leaderboard view={view} final /><button className="button primary" onClick={onCreate}>Create your own game <ArrowRight size={18} /></button></> : !view.me ? <form onSubmit={async e => { e.preventDefault(); setBusy(true); setError(''); try { await client.join(name); try { localStorage.setItem('fh-name', name); } catch {} } catch (fault) { setError((fault as Error).message); } finally { setBusy(false); } }}>
          <span className="eyebrow">YOUR NAME ON THE SCOREBOARD</span><h2>Report for nonsense.</h2><p>Catch as many {view.room.fatherName}s as you can. Replay to beat your friends’ best sacks.</p>
          <label htmlFor="join-name">Your name</label><input id="join-name" maxLength={24} autoComplete="given-name" value={name} onChange={e => setName(e.target.value)} required placeholder="Your name" />
          <button className="button primary" disabled={busy || view.room.playerCount >= 5}>{view.room.playerCount >= 5 ? 'All five seats are taken' : busy ? 'Joining…' : 'Join the hunt'}<ArrowRight size={18} /></button>
        </form> : <>
          <span className="eyebrow">YOU’RE IN, {view.me.name.toUpperCase()}</span><h2>One hammer.<br />Five bad influences.</h2><p>Start whenever you’re ready. Each hunt lasts two minutes; your best score stays on the board.</p>
          <button className="button primary" onClick={() => void enter()} disabled={busy || view.attempt?.snapshot.status !== 'playing' && view.room.expiresAt - view.serverNow < ROUND_MS}>{busy ? 'Opening the case…' : view.attempt?.snapshot.status === 'playing' ? 'Resume your hunt' : view.room.expiresAt - view.serverNow < ROUND_MS ? 'Waiting for final scores' : 'Enter the house'}<ArrowRight size={18} /></button>
          <div className="invite"><label htmlFor="invite-link">BRING YOUR FRIENDS</label><div><input id="invite-link" ref={input} readOnly value={share.url} onFocus={e => e.currentTarget.select()} /><button className="icon-button" aria-label={copied ? 'Invite copied' : 'Copy invite'} onClick={() => void copy()}>{copied ? <Check size={18} /> : <Copy size={18} />}</button></div>
            <p>{share.public ? 'Send this link to your friends. Anyone with the invite can join while a seat is free.' : share.lan ? 'Open this link on the same Wi-Fi. Keep the host computer running.' : 'Connect this computer and the phones to the same Wi-Fi to share the hunt.'}</p>
            {typeof navigator.share === 'function' && <button className="text-button" onClick={() => { void navigator.share({ title: `The ${view.room.fatherName} incident`, url: share.url }).catch(() => {}); }}><Share2 size={15} /> Share invite</button>}
          </div>
          <button className="text-button" onClick={onCreate}>Create your own game <ArrowRight size={16} /></button><div className={view.attempt?.snapshot.status === 'finished' ? '' : 'lobby-desktop-board'}><Leaderboard view={view} /></div>
        </>}
        {(error || connectionError) && <p className="room-error" role="alert">{error || connectionError}</p>}
      </section>
    </main>}
  </div>;
}
