import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, RotateCcw, ShoppingBag, Volume2, VolumeX, Waves, X } from 'lucide-react';
import type { CaseStory, CharacterPack, Expression } from '@father-hunter/game-core';
import type { DadPose } from './art/dad';
import { FatherArt } from './FatherArt';
import { playSound, unlockSound } from './sound';
import './case-intro.css';
import { witchSvg } from './art/witch';
import { svgUri } from './game/art';

interface Props {
  story: CaseStory; father: CharacterPack; ready: boolean; error: string; sound: boolean; reducedMotion: boolean;
  toggleSound(): void; toggleMotion(): void; onStart(): void; onLeave(): void;
}
const STARTS = [0, 3800, 7000, 11000, 15000];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const mix = (a: number, b: number, t: number) => a + (b - a) * clamp(t);

function Figure({ father, x, y, scale = 1, pose = 'run', mood = 'laugh', angle = 0, opacity = 1 }: { father: CharacterPack; x: number; y: number; scale?: number; pose?: DadPose; mood?: Expression; angle?: number; opacity?: number }) {
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(${scale})`} opacity={opacity} className="intro-dad" data-pose={pose}>
    <FatherArt father={father} pose={pose} mood={mood} />
  </g>;
}

function Lab({ father, time, step, fallback }: { father: CharacterPack; time: number; step: number; fallback: boolean }) {
  const entering = clamp((time - 4100) / 2400), walk = Math.sin(time / 75);
  const scientistX = step === 0 ? 650 : mix(650, 1050, entering);
  const scientistY = step === 0 ? 430 : mix(430, 330, entering);
  return <svg viewBox="0 0 1536 1024" className="intro-world" aria-hidden="true">
    <defs><clipPath id="portal-lip"><path d="M882 592L960 594 1190 594 1190 180 1252 184 1293 689 1084 724 879 683Z" /></clipPath></defs>
    {fallback ? <><rect width="1536" height="1024" fill="#b3976b" /><rect y="680" width="1536" height="344" fill="#98744e" /><ellipse cx="1080" cy="410" rx="157" ry="275" fill="#53b8a3" stroke="#785433" strokeWidth="42" /></> : <image href="/assets/time-machine-lab.png" width="1536" height="1024" />}
    <ellipse cx="1090" cy="410" rx={107 + Math.sin(time / 300) * 4} ry="210" fill={step >= 2 ? '#e1f4b9' : '#a4ffe9'} opacity={step >= 2 ? .12 + Math.abs(Math.sin(time / 90)) * .1 : .09} />
    <g className="intro-witch" transform={`translate(${step === 3 ? 190 : 120} 320)`}>
      <image href={svgUri(witchSvg(step < 2 ? 3 : 4))} width="280" height="385" />
      {step < 2 && <path d={`M251 215L${350 + Math.sin(time / 200) * 14} 340`} stroke="#795135" strokeWidth="12" strokeLinecap="round" />}
    </g>
    <g transform="translate(360 640)"><path d="M-40 0Q-73 141 80 152Q232 144 200 0Z" fill="#342a43" stroke="#1d2630" strokeWidth="8" /><ellipse cx="80" cy="0" rx="124" ry="34" fill="#afdf79" stroke="#594769" strokeWidth="9" />{[0, 1, 2].map(i => <circle key={i} cx={15 + i * 66} cy={-7 - Math.abs(Math.sin(time / 350 + i)) * 66} r={12 + i * 3} fill="#dbf6a8" opacity=".65" />)}<text x="80" y="91" textAnchor="middle" fontSize="25" fill="#e2c7f0">ETERNAL YOUTH</text></g>
    {step < 2 && <Figure father={father} x={scientistX} y={scientistY + (entering > 0 && entering < .98 ? walk * 3 : 0)} scale={mix(1.55, .94, entering)} pose="run" mood="grin" opacity={1 - clamp((entering - .85) / .15)} />}
    {step === 0 && <g transform="translate(545 310) rotate(-6)"><path d="M0 0H345V86H150L125 116 115 86H0Z" fill="#fff0c4" stroke="#624931" strokeWidth="4" /><text x="172" y="37" textAnchor="middle" fontSize="29" fontWeight="bold" fill="#523e2b">YOUR ONE JOB:</text><text x="172" y="71" textAnchor="middle" fontSize="29" fill="#523e2b">STIR. THE. POT.</text></g>}
    {step === 1 && <g transform="translate(930 168) rotate(4)"><rect width="265" height="62" rx="6" fill="#f8eac5" stroke="#9b432e" strokeWidth="6" /><text x="133" y="42" textAnchor="middle" fontSize="31" fontWeight="bold" fill="#9b432e">DO NOT ENTER</text></g>}
    {step >= 2 && Array.from({ length: 8 }, (_, i) => {
      const flying = i === 0, birth = flying ? 11000 : 7040 + (i - 1) * 380, t = clamp((time - birth) / 4200);
      const x = mix(1040, [-240, 80, 1470, 520, -200, 1580, 250, 1360][i], t);
      const y = mix(340, flying ? 45 : 740 + i % 3 * 70, t) - (flying ? Math.sin(t * Math.PI) * 100 : Math.abs(Math.sin(time / 100 + i)) * 16);
      return time >= birth && <Figure key={i} father={father} x={x} y={y} scale={mix(.8, flying ? 1.6 : 1.8, t)} pose={flying ? 'broom' : i === 4 ? 'cramped' : 'run'} mood={i % 2 ? 'laugh' : 'giggle'} angle={flying ? -16 : i === 4 ? t * 360 : Math.sin(time / 100 + i) * 6} />;
    })}
    {/* The doorway lip is painted over the actors from the same background, so
        entering feet visibly pass behind the machine instead of fading on the floor. */}
    {!fallback && <image href="/assets/time-machine-lab.png" width="1536" height="1024" clipPath="url(#portal-lip)" />}
    {step >= 2 && <g transform={`translate(${1050 + Math.sin(time / 90) * 8} 190)`}><path d="M-72 0L-100 -37M0 -18V-63M68 0L104 -37" stroke="#fff5b3" strokeWidth="13" strokeLinecap="round" /></g>}
    <rect x="0" y="948" width="1536" height="76" fill="#243d32" opacity=".95" /><text x="40" y="996" fill="#fbefc8" fontFamily="monospace" fontSize="25">{['PROJECT: YESTERDAY', 'DESTINATION: 1998', `ERROR: ${father.name.toUpperCase()} OVERFLOW`, 'CONTAINMENT: ABSOLUTELY FUCKED'][step]}</text>
  </svg>;
}

function Dispatch() {
  return <div className="dispatch-tableau" aria-hidden="true"><div className="dispatch-seal"><span>THE WITCH’S</span><b>✳</b><span>LAST NERVE</span></div><img className="dispatch-witch" src={svgUri(witchSvg(4))} alt="" /><div className="dispatch-equipment"><ShoppingBag /><span>1 HAMMER. 1 SACK.<br />PATIENCE: NONE.</span></div><div className="dispatch-stamp">BAG THIS<br /><strong>SHITSHOW</strong></div><div className="dispatch-deadline">02:00<span>SHE SHOULD HAVE HIRED SOMEONE ELSE.</span></div></div>;
}

export function CaseIntro({ story, father, ready, error, sound, reducedMotion, toggleSound, toggleMotion, onStart, onLeave }: Props) {
  const [clock, setClock] = useState(0), [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden), [artReady, setArtReady] = useState(false), [artFailed, setArtFailed] = useState(false);
  const step = STARTS.reduce((current, start, i) => clock >= start ? i : current, 0), beat = story.beats[step], final = step === 4;
  const stopped = paused || !visible || reducedMotion || !artReady;
  const soundRef = useRef(sound); soundRef.current = sound;
  useEffect(() => {
    let active = true;
    const images = ['/assets/time-machine-lab.png', father.atlas].map(src => new Promise<void>(resolve => {
      const img = new Image(); img.onload = () => resolve(); img.onerror = () => { if (active) setArtFailed(true); resolve(); }; img.src = src;
    }));
    Promise.all(images).then(() => { if (active) setArtReady(true); });
    return () => { active = false; };
  }, [father.atlas]);
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (stopped || final) return;
    let frame: number, previous = performance.now();
    const animate = (now: number) => { const delta = now - previous; previous = now; setClock(value => Math.min(15000, value + delta)); frame = requestAnimationFrame(animate); };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [stopped, final]);
  useEffect(() => { if (step === 2 && !document.hidden) playSound('chaos', soundRef.current); }, [step]);
  const start = () => { if (ready && !error) { if (sound) unlockSound(); onStart(); } };
  const displayTime = reducedMotion && !final ? STARTS[step] + (STARTS[step + 1] - STARTS[step]) * .68 : clock;
  return <div className="modal-backdrop intro-backdrop"><section className="case-intro" role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-story">
    <div className="intro-topbar"><div><span className="eyebrow">THE {father.name.toUpperCase()} INCIDENT</span><small>CLASSIFIED. BADLY.</small></div><div className="intro-settings">
      {!final && !reducedMotion && <button className="icon-button" aria-label={paused ? 'Play intro' : 'Pause intro'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>}
      <button className="icon-button" aria-label={sound ? 'Mute intro sound' : 'Enable intro sound'} aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
      <button className="icon-button" aria-label="Reduce intro animation" aria-pressed={reducedMotion} onClick={toggleMotion}><Waves size={17} /></button>
      <button className="icon-button" aria-label="Back to start" onClick={onLeave}><X size={18} /></button>
    </div></div>
    <div className={`intro-stage scene-${beat.id}`} data-scene={beat.id} data-clock={Math.floor(clock)}>
      {final ? <Dispatch /> : <Lab father={father} time={displayTime} step={step} fallback={artFailed} />}
      <span className="intro-scene-number">0{step + 1} / 05</span>
    </div>
    <div className="intro-content"><div className="intro-story" aria-live="polite" aria-atomic="true"><span className="eyebrow">{beat.kicker}</span><h2 id="intro-title">{beat.title}</h2><p id="intro-story">{beat.text}</p></div>
      {final && <div className="intro-mission"><ShoppingBag size={23} /><span><strong>Tap to walk. Check furniture. Tap {father.name}s to bag.</strong><small>Five rooms. Two minutes. No dignity.</small></span></div>}
      {error && <p className="intro-error" role="alert">{error}</p>}
      <div className="intro-actions">
        {error ? <button className="button primary" onClick={() => location.reload()}>Reload the house</button> : <button data-autofocus className="button primary" disabled={final && !ready} onClick={final ? start : () => setClock(STARTS[step + 1])}>{final ? ready ? 'Grab the sack. Start hunt.' : 'Preparing the house…' : 'Next scene'}<ArrowRight size={18} /></button>}
        {final ? <button className="text-button" onClick={() => { setClock(0); setPaused(false); }}><RotateCcw size={14} /> Watch again</button> : <button className="text-button" disabled={!ready || !!error} onClick={start}>Skip intro & hunt</button>}
      </div><div className="intro-bottom"><div className="intro-progress" aria-label={`Scene ${step + 1} of 5`}>{story.beats.map((item, i) => <span className={i <= step ? 'seen' : ''} key={item.id} />)}</div><span>Your timer starts when you enter the house.</span></div>
    </div>
  </section></div>;
}
