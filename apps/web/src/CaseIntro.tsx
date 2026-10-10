import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, RotateCcw, ShoppingBag, Volume2, VolumeX, Waves, X } from 'lucide-react';
import type { CaseStory, CharacterPack } from '@father-hunter/game-core';
import { Dad } from './components';
import { playSound, unlockSound } from './sound';
import './case-intro.css';

interface Props {
  story: CaseStory;
  father: CharacterPack;
  ready: boolean;
  error: string;
  sound: boolean;
  reducedMotion: boolean;
  toggleSound(): void;
  toggleMotion(): void;
  onStart(): void;
  onLeave(): void;
}

// The face always comes from the hunt's CharacterPack. Costumes, limbs, and props
// are reusable vector layers, so a new father's photo needs only one expression atlas.
function Clone({ father, expression = 0, costume = 'dad' }: { father: CharacterPack; expression?: number; costume?: 'dad' | 'scientist' | 'devil' }) {
  return <div className={`intro-clone costume-${costume}`}>
    <svg className="clone-body" viewBox="0 0 100 150" fill="none" stroke="#3d332a" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {costume === 'devil' && <path className="clone-cape" d="M45 66Q6 54 1 107L26 101 38 114 58 99" fill="#b84936" />}
      <g className="clone-leg leg-back"><path d="M47 109L44 130 27 139" stroke="#63634d" strokeWidth="13" /><path d="M27 139H16" stroke="#463e31" strokeWidth="9" /></g>
      <g className="clone-leg leg-front"><path d="M55 109L63 130 78 140" stroke="#77755a" strokeWidth="13" /><path d="M78 140H87" stroke="#463e31" strokeWidth="9" /></g>
      <g className="clone-arm arm-back"><path d="M39 71L21 89 12 74" stroke="#f0dfaf" strokeWidth="12" /><path d="M12 74L11 67" stroke="#e2a46b" strokeWidth="10" /></g>
      <path d="M37 62Q50 56 64 63L71 111Q54 120 31 111Z" fill={costume === 'scientist' ? '#fffbee' : '#f7e9be'} />
      {costume === 'scientist' && <><path d="M43 62L50 77 60 62M50 77V114" stroke="#a8b6a3" strokeWidth="2" /><path d="M56 84H67V96H56Z" stroke="#a8b6a3" strokeWidth="2" /><path d="M58 83V78M63 83V76" stroke="#d96343" strokeWidth="2" /></>}
      <g className="clone-arm arm-front"><path d="M64 74L80 89 91 72" stroke={costume === 'scientist' ? '#fffbee' : '#f0dfaf'} strokeWidth="12" /><path d="M91 72L94 65" stroke="#e2a46b" strokeWidth="10" /></g>
    </svg>
    <div className="clone-head"><Dad character={father} expression={expression} /></div>
    {costume === 'devil' && <><svg className="clone-horns" viewBox="0 0 100 45" aria-hidden="true"><path d="M22 39Q1 34 12 5L31 30M73 31L89 4Q103 32 81 39" fill="#c9553c" stroke="#4a3226" strokeWidth="3" /></svg><svg className="flying-pitchfork" viewBox="0 0 210 55" fill="none" stroke="#592f24" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 28H190" stroke="#c7723e" strokeWidth="8" /><path d="M154 7L165 28 154 49M165 28H203M150 7H182M150 49H182" stroke="#c25338" /><path d="M178 2L192 7 178 12M199 23L210 28 199 33M178 44L192 49 178 54" stroke="#c25338" /></svg></>}
  </div>;
}

function Dispatch({ father }: { father: CharacterPack }) {
  return <div className="dispatch-tableau" aria-hidden="true">
    <div className="dispatch-seal"><span>GOVERNMENT OF</span><b>✳</b><span>ABSOLUTE NONSENSE</span></div>
    <div className="dispatch-equipment"><ShoppingBag /><span>ISSUED: 1 SACK<br />BACKUP: LOL</span></div>
    <div className="dispatch-detective" />
    <div className="dispatch-stamp">CONTAIN THIS<br /><strong>SHITSHOW</strong></div>
    <div className="dispatch-lineup">{[0, 2, 3, 1, 4, 0].map((expression, i) => <div className="lineup-copy" key={i}><Dad character={father} expression={expression} /><span>0{i + 1}</span></div>)}</div>
  </div>;
}

export function CaseIntro({ story, father, ready, error, sound, reducedMotion, toggleSound, toggleMotion, onStart, onLeave }: Props) {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [sceneReady, setSceneReady] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const beat = story.beats[step], final = beat.id === 'dispatch';
  const stopped = paused || !visible || reducedMotion;
  const soundRef = useRef(sound); soundRef.current = sound;
  useEffect(() => {
    const visibility = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  useEffect(() => {
    if (stopped || final || !sceneReady) return;
    const timer = setTimeout(() => setStep(previous => Math.min(2, previous + 1)), step === 0 ? 6000 : 7000);
    return () => clearTimeout(timer);
  }, [step, stopped, final, sceneReady]);
  useEffect(() => {
    if (step === 1 && !document.hidden) playSound('chaos', soundRef.current);
  }, [step]);
  const start = () => { if (ready && !error) { if (sound) unlockSound(); onStart(); } };

  return <div className="modal-backdrop intro-backdrop"><section className={`case-intro ${stopped ? 'intro-paused' : ''} ${reducedMotion ? 'intro-still' : ''}`} role="dialog" aria-modal="true" aria-labelledby="intro-title" aria-describedby="intro-story">
    <div className="intro-topbar"><div><span className="eyebrow">THE {father.name.toUpperCase()} INCIDENT</span><small>CLASSIFIED. BADLY.</small></div><div className="intro-settings">
      {!final && !reducedMotion && <button className="icon-button" aria-label={paused ? 'Play intro' : 'Pause intro'} onClick={() => setPaused(value => !value)}>{paused ? <Play size={17} /> : <Pause size={17} />}</button>}
      <button className="icon-button" aria-label={sound ? 'Mute intro sound' : 'Enable intro sound'} aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>
      <button className="icon-button" aria-label="Reduce intro animation" aria-pressed={reducedMotion} onClick={toggleMotion}><Waves size={17} /></button>
      <button className="icon-button" aria-label="Back to start" onClick={onLeave}><X size={18} /></button>
    </div></div>
    <div key={beat.id} className={`intro-stage scene-${beat.id} ${artFailed ? 'lab-fallback' : ''}`} data-scene={beat.id} aria-hidden="true">
      {final ? <Dispatch father={father} /> : <>
        {!artFailed && <img className="lab-backdrop" src="/assets/time-machine-lab.png" alt="" onLoad={() => setSceneReady(true)} onError={() => { setArtFailed(true); setSceneReady(true); }} />}
        <div className="portal-light" />
        {step === 0 ? <><div className="scientist-path"><Clone father={father} costume="scientist" /></div><span className="science-boast">“What could<br />possibly go wrong?”</span><div className="lab-caption"><span>DADS IN: <b>01</b></span><span>DADS OUT: <b>…</b></span></div></> : <>
          <div className="clone-path clone-flyer"><Clone father={father} costume="devil" /><span className="clone-laugh">HEHEHE</span></div>
          <div className="clone-path clone-runner"><Clone father={father} expression={2} /><span className="clone-laugh">AAAA</span></div>
          <div className="clone-path clone-chaser"><Clone father={father} expression={0} /></div>
          <div className="clone-path clone-tumbler"><Clone father={father} expression={3} /></div>
          <div className="clone-path clone-bouncer"><Clone father={father} expression={0} /><span className="clone-laugh">HAHA!</span></div>
          <div className="clone-path clone-crasher"><Clone father={father} expression={2} /><span className="crash-label">BONK.</span></div>
          <div className="lab-caption"><span>DADS OUT: <b>06</b></span><span>BRAIN CELLS: <b>01</b></span></div>
        </>}
      </>}
      <span className="intro-scene-number">0{step + 1} / 03</span>
    </div>
    <div className="intro-content"><div className="intro-story" aria-live="polite" aria-atomic="true"><span className="eyebrow">{beat.kicker}</span><h2 id="intro-title">{beat.title}</h2><p id="intro-story">{beat.text}</p></div>
      {final && <div className="intro-mission"><ShoppingBag size={23} /><span><strong>Tap to walk. Check the furniture. Tap dads to bag.</strong><small>6 escaped idiots · 5 rooms · 10 minutes</small></span></div>}
      {error && <p className="intro-error" role="alert">{error}</p>}
      <div className="intro-actions">
        {error ? <button className="button primary" onClick={() => location.reload()}>Reload the house</button> : <button data-autofocus className="button primary" disabled={final && !ready} onClick={final ? start : () => setStep(previous => Math.min(2, previous + 1))}>{final ? ready ? 'Grab the sack. Start hunt.' : 'Preparing the house…' : 'Next scene'}<ArrowRight size={18} /></button>}
        {final ? <button className="text-button" onClick={() => { setStep(0); setPaused(false); }}><RotateCcw size={14} /> Watch again</button> : <button className="text-button" disabled={!ready || !!error} onClick={start}>Skip intro & hunt</button>}
      </div>
      <div className="intro-bottom"><div className="intro-progress" aria-label={`Scene ${step + 1} of 3`}>{story.beats.map((item, i) => <span className={i <= step ? 'seen' : ''} key={item.id} />)}</div><span>Your timer starts when you enter the house.</span></div>
    </div>
  </section></div>;
}
