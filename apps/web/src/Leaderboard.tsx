import { Trophy } from 'lucide-react';
import type { RoomView } from '@catch-me-if-you-can/game-core';

export function Leaderboard({ view, final = false }: { view: RoomView; final?: boolean }) {
  const closed = view.room.status === 'closed', winners = view.standings.filter(p => p.rank === 1 && p.bestScore > 0);
  return <section className={`leaderboard ${final ? 'leaderboard-final' : ''}`} aria-label="Leaderboard">
    <div className="leaderboard-heading"><Trophy size={16} /><h2>{closed ? 'Final standings' : 'The sack standings'}</h2><small>{closed ? 'CASE CLOSED' : 'LIVE'}</small></div>
    <p className="leaderboard-note">{closed && winners.length ? `${winners.map(p => p.name).join(' & ')} ${winners.length > 1 ? 'share the glory' : 'wins'}. ${view.room.fatherName} loses.` : `Most ${view.room.fatherName}s in two minutes. Your best run counts.`}</p>
    <ol>{view.standings.map(player => <li key={player.id} className={player.id === view.me?.id ? 'is-you' : ''} data-player-id={player.id}>
      <span className="standing-rank">{player.rank === 1 && player.bestScore > 0 ? '♛' : player.rank}</span>
      <span className="standing-name"><strong>{player.name}{player.id === view.me?.id && <small>YOU</small>}</strong><span>{player.playing ? `${player.currentScore} this run · hunting` : player.bestScore ? 'Sack submitted' : 'Sack suspiciously empty'}</span></span>
      <span className="standing-score" aria-label={`${player.bestScore} best score`}>{player.bestScore}</span>
    </li>)}</ol>
    {!closed && <p className="leaderboard-foot">Equal catches, equal glory. Final winner when the room closes.</p>}
  </section>;
}
