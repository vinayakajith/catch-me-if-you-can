import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { HOUSE, type HuntSnapshot, type Point, type RoomId } from '@father-hunter/game-core';

export function Brand({ onClick }: { onClick?: () => void }) {
  return <button type="button" className="brand" onClick={onClick} aria-label="Father Hunter home"><img src="/favicon.svg" alt="" width="39" height="39" /><span>father<span className="brand-light">hunter</span><span className="brand-dot">.</span></span></button>;
}

export function Dad({ expression = 0, className = '' }: { expression?: number; className?: string }) {
  return <div role="img" aria-label={['Suspicious Balaji', 'Balaji hiding', 'Surprised Balaji', 'Caught Balaji', 'Dramatically crying Balaji', 'Defeated Balaji'][expression]} className={`dad-portrait ${className}`} style={{ backgroundPosition: `${expression % 3 * 50}% ${Math.floor(expression / 3) * 100}%` }} />;
}

const entrances: Record<RoomId, Point> = { living: { x: 610, y: 315 }, kitchen: { x: 885, y: 315 }, bedroom: { x: 270, y: 682 }, bathroom: { x: 760, y: 682 }, storeroom: { x: 1240, y: 682 }, hall: HOUSE.spawn };
const labels: Record<RoomId, string> = { living: 'LIVING', kitchen: 'KITCHEN', bedroom: 'BEDROOM', bathroom: 'BATH', storeroom: 'STORE', hall: '' };
export function HouseMap({ snapshot, navigate }: { snapshot: HuntSnapshot; navigate: (point: Point) => void }) {
  return <svg className="house-map" viewBox="0 0 1520 1110" role="group" aria-label="House map. Select a room to walk there.">
    {HOUSE.passages.map((p, i) => <rect key={`p-${i}`} x={p.x} y={p.y} width={p.w} height={p.h} fill="#e8dfc9" />)}
    {HOUSE.rooms.map(room => <g key={room.id} role="button" tabIndex={0} aria-label={`Walk to ${room.name}`} onClick={() => navigate(entrances[room.id])} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(entrances[room.id]); } }}>
      <rect x={room.x} y={room.y} width={room.w} height={room.h} rx="20" fill={room.id === snapshot.player.roomId ? '#90aa8b' : '#e8dfc9'} stroke={room.id === snapshot.player.roomId ? '#53775e' : '#bdb49b'} strokeWidth="13" />
      <text x={room.x + room.w / 2} y={room.y + room.h / 2 + 16} textAnchor="middle" fill="#595e4c" fontFamily="Arial" fontWeight="bold" fontSize="49">{labels[room.id]}</text>
    </g>)}
    <circle cx={snapshot.player.position.x} cy={snapshot.player.position.y} r="26" fill="#e86c49" stroke="#fff7df" strokeWidth="12" pointerEvents="none" />
  </svg>;
}

export function Joystick({ onMove }: { onMove: (point: Point) => void }) {
  const active = useRef<number | null>(null);
  const [thumb, setThumb] = useState<Point>({ x: 0, y: 0 });
  const update = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - rect.left - rect.width / 2, dy = e.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(dx, dy), scale = Math.min(1, 30 / Math.max(1, length));
    const point = { x: dx * scale, y: dy * scale };
    setThumb(point); onMove({ x: point.x / 30, y: point.y / 30 });
  };
  const stop = () => { active.current = null; setThumb({ x: 0, y: 0 }); onMove({ x: 0, y: 0 }); };
  return <div className="joystick" aria-label="Optional movement joystick" onPointerDown={e => { active.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); update(e); }} onPointerMove={e => { if (active.current === e.pointerId) update(e); }} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}>
    <div className="joystick-cross" /><div className="joystick-thumb" style={{ '--dx': `${thumb.x}px`, '--dy': `${thumb.y}px` } as CSSProperties} />
  </div>;
}

export function formatTime(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
