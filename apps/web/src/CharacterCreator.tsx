import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, LoaderCircle, RotateCcw, ShoppingBag, Sparkles } from 'lucide-react';
import { DEFAULT_SKIN, EXPRESSIONS, type CharacterJobView, type CharacterPack, type CharacterServiceConfig, type Expression } from '@father-hunter/game-core';
import { Brand, Dad } from './components';
import { FatherArt } from './FatherArt';
import { PhotoCrop, type CropHandle } from './PhotoCrop';
import { CharacterApiError, characterAction, characterConfig, createCharacterJob, getCharacterJob, pendingCharacterUpload, recoverCharacterUpload, rememberCharacterJob, savedCharacterJob, uploadKey } from './character-api';
import { hideoutSvg, sackSvg, svgUri } from './game/art';
import './character-creator.css';

const labels: Record<Expression, string> = { serious: 'Definitely a statue', grin: 'Terrible idea brewing', laugh: 'Zero shame', giggle: 'Found his own joke', bonked: 'Oh. Consequences.', dizzy: 'Sack passenger' };
const tones = ['#f0c7a0', '#dfac80', '#c99164', '#a87048', '#865437', '#623f2d'];
const activeStatus = (job: CharacterJobView | null) => job && ['uploading', 'queued', 'generating'].includes(job.status);

function DadShowcase({ father }: { father: CharacterPack }) {
  const [catchTime, setCatchTime] = useState(-1);
  useEffect(() => {
    if (catchTime < 0) return;
    const start = performance.now();
    const timer = setInterval(() => { const elapsed = performance.now() - start; setCatchTime(elapsed > 1500 ? -1 : elapsed); }, 30);
    return () => clearInterval(timer);
  }, [catchTime < 0]);
  const caught = catchTime >= 0, bonked = catchTime > 220, bagging = catchTime > 520;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const progress = bagging ? Math.min(1, (catchTime - 520) / 600) : 0;
  return <div className="dad-showcase">
    <article><svg viewBox="0 0 190 240" role="img" aria-label={`${father.name} laughing inside a wardrobe`}>
      <image href={svgUri(hideoutSvg('wardrobe', true))} x="5" y="49" width="180" height="180" />
      <g transform="translate(46 63) scale(.6)" className="preview-giggle"><FatherArt father={father} pose="cramped" mood="laugh" /></g>
      <image href={svgUri(hideoutSvg('wardrobe', true, true))} x="5" y="49" width="180" height="180" />
    </svg><span>Private giggle chamber</span></article>
    <article><svg viewBox="0 0 190 240" role="img" aria-label={`${father.name} posing seriously as Liberty`}>
      <path d="M80 0H110L187 225H3Z" fill="#f3d47a" opacity=".38" /><ellipse cx="95" cy="220" rx="78" ry="14" fill="#d4c39b" />
      <g transform="translate(26 14) scale(.86)"><FatherArt father={father} pose="liberty" mood="serious" /></g>
      <path d="M40 207H148V222H40Z" fill="#969f83" />
    </svg><span>“National monument.”</span></article>
    <article><button type="button" className="preview-catch" aria-label="Preview Dad getting caught" disabled={caught} onClick={() => setCatchTime(0)}>
      <svg viewBox="0 0 190 240" aria-hidden="true">
        <g transform={reduced ? 'translate(10 16) scale(.82)' : `translate(${10 + progress * 107} ${16 + progress * 155}) scale(${.82 * (1 - progress)})`} opacity={progress >= 1 ? 0 : 1}>
          <FatherArt father={father} pose={caught ? 'caught' : 'stand'} mood={bonked ? 'dizzy' : 'giggle'} />
        </g>
        {caught && catchTime < 520 && <><path d="M28 158L68 134" stroke="#875b35" strokeWidth="8" strokeLinecap="round" /><path d="M66 124L71 112M77 130L91 126M74 142L85 150" stroke="#e96948" strokeWidth="4" /></>}
        <image href={svgUri(sackSvg)} x="91" y="153" width="89" height="89" />
        {progress >= 1 && <text x="137" y="189" textAnchor="middle" fontSize="23" fill="#52725d" fontWeight="bold">+1</text>}
      </svg>
      <span><ShoppingBag size={14} />{caught ? 'Express delivery.' : 'Tap to test the sack'}</span>
    </button></article>
  </div>;
}

export function CharacterCreator({ initialName, fresh = false, onReady, onClose, onSample }: { initialName: string; fresh?: boolean; onReady(father: CharacterPack): void; onClose(): void; onSample(): void }) {
  const [name, setName] = useState(initialName), [job, setJob] = useState<CharacterJobView | null>(null);
  const [jobId, setJobId] = useState<string | null>(() => fresh || pendingCharacterUpload() ? null : savedCharacterJob());
  const [pendingUpload, setPendingUpload] = useState(Boolean(pendingCharacterUpload()));
  const [config, setConfig] = useState<CharacterServiceConfig | null>(null), [busy, setBusy] = useState(false), [photoReady, setPhotoReady] = useState(false);
  const [error, setError] = useState(''), [connectionError, setConnectionError] = useState(''), [skin, setSkin] = useState(DEFAULT_SKIN);
  const [imageReady, setImageReady] = useState(false), [imageError, setImageError] = useState(false), [imageReload, setImageReload] = useState(0);
  const crop = useRef<CropHandle | null>(null), submission = useRef<{ photo: Blob; name: string; key: string } | null>(null), alive = useRef(true), title = useRef<HTMLHeadingElement>(null), loadedNameFor = useRef<string | null>(null);
  const onPhotoReady = useCallback(() => { setPhotoReady(true); submission.current = null; }, []);
  useEffect(() => {
    alive.current = true; title.current?.focus();
    characterConfig().then(setConfig).catch(() => setConfig({ available: false, testMode: false, maxUploadBytes: 10 * 1024 * 1024, message: 'The photo lab is offline. You can still play with sample Balaji.' }));
    return () => { alive.current = false; };
  }, []);
  const recoverUpload = useCallback(async () => {
    setBusy(true); setError('');
    try {
      const next = await recoverCharacterUpload();
      if (!alive.current) return;
      if (next) { loadedNameFor.current = next.id; setName(next.name); setJob(next); setJobId(next.id); }
      setPendingUpload(false);
    } catch (fault) { if (alive.current) setError((fault as Error).message); }
    finally { if (alive.current) setBusy(false); }
  }, []);
  useEffect(() => { if (pendingUpload) void recoverUpload(); }, [recoverUpload]);
  useEffect(() => {
    if (!jobId) return;
    let stopped = false, timer: ReturnType<typeof setTimeout>; const controller = new AbortController();
    const poll = async () => {
      try {
        const next = await getCharacterJob(jobId, controller.signal);
        if (stopped) return;
        if (loadedNameFor.current !== next.id) { loadedNameFor.current = next.id; setName(next.name); }
        setJob(next); setConnectionError('');
        if (['uploading', 'queued', 'generating'].includes(next.status)) timer = setTimeout(poll, 1800);
      } catch (fault) {
        if (stopped) return;
        if (fault instanceof CharacterApiError && [404, 410].includes(fault.status)) {
          rememberCharacterJob(null); setJobId(null); setJob(null); setError(fault.message); return;
        }
        setConnectionError((fault as Error).message); timer = setTimeout(poll, 3500);
      }
    };
    void poll();
    return () => { stopped = true; controller.abort(); clearTimeout(timer); };
  }, [jobId, job?.status]);
  useEffect(() => { if (job?.preview) setSkin(job.preview.palette?.skin ?? DEFAULT_SKIN); }, [job?.baseRevision, job?.id]);
  const atlas = job?.preview?.atlas;
  useEffect(() => {
    setImageReady(false); setImageError(false);
    if (!atlas) return;
    let current = true; const image = new Image(); image.src = `${atlas}&reload=${imageReload}`;
    image.decode().then(() => { if (current) setImageReady(true); }).catch(() => { if (current) setImageError(true); });
    return () => { current = false; };
  }, [atlas, imageReload]);

  const act = async (action: 'approve' | 'retry' | 'finalize', expression?: Expression) => {
    if (!job || busy) return;
    setBusy(true); setError('');
    try {
      const next = await characterAction(job.id, action, action === 'finalize' ? { name: name.trim(), skin } : { baseRevision: job.baseRevision, expression });
      if (!alive.current) return;
      setJob(next);
      if (action === 'finalize' && next.preview) onReady(next.preview);
    } catch (fault) { if (alive.current) setError((fault as Error).message); }
    finally { if (alive.current) setBusy(false); }
  };
  const generate = async () => {
    if (!crop.current || busy || !name.trim()) return;
    setBusy(true); setError('');
    try {
      if (!submission.current || submission.current.name !== name.trim()) submission.current = { photo: await crop.current.exportPhoto(), name: name.trim(), key: uploadKey() };
      const { photo, name: uploadedName, key } = submission.current;
      const next = await createCharacterJob(photo, uploadedName, key);
      rememberCharacterJob(next.id);
      if (!alive.current) return;
      setJob(next); setJobId(next.id); setPendingUpload(false);
    } catch (fault) { if (alive.current) { setError((fault as Error).message); setPendingUpload(Boolean(pendingCharacterUpload())); } }
    finally { if (alive.current) setBusy(false); }
  };
  const reset = () => { setJob(null); setJobId(null); setPendingUpload(false); rememberCharacterJob(null); setPhotoReady(false); setError(''); setConnectionError(''); submission.current = null; };
  const pack = job?.preview ? { ...job.preview, name: name.trim() || job.name, palette: { skin }, atlas: `${job.preview.atlas}&reload=${imageReload}` } : null;
  const working = activeStatus(job), base = job?.status === 'awaiting_approval';
  const complete = job?.completed.length === 6, finalPreview = complete && !working;
  const step = !job || (!job.baseApproved && !base) ? 0 : base ? 1 : 2;
  const displayName = name.trim() || 'Dad';
  return <div className="character-lab">
    <header className="lab-header"><Brand onClick={onClose} /><button type="button" className="text-button" onClick={onClose}><ArrowLeft size={17} /> Back to the hunt</button></header>
    <main className="lab-main">
      <ol className="lab-steps" aria-label="Create your Dad"><li aria-current={step === 0 ? 'step' : undefined}><b>{step > 0 ? <Check size={15} /> : '1'}</b> The evidence</li><li aria-current={step === 1 ? 'step' : undefined}><b>{step > 1 ? <Check size={15} /> : '2'}</b> Is that him?</li><li aria-current={step === 2 ? 'step' : undefined}><b>3</b> Unleash Dad</li></ol>
      <div className="lab-heading"><span className="eyebrow">BUREAU OF QUESTIONABLE TRANSFORMATIONS</span><h1 ref={title} tabIndex={-1}>{base ? 'Recognize this menace?' : finalPreview ? 'Same Dad. Worse decisions.' : working ? `Creating Dr. ${displayName}…` : 'Give Dad a terrible idea.'}</h1><p>{base ? 'Check the likeness before we give him five more reasons to embarrass himself.' : finalPreview ? 'One face. Six moods. Absolutely no supervision.' : working ? 'His dignity is being carefully misplaced. Your progress is saved.' : 'One photo becomes your very own lungi-wearing witch-scientist.'}</p></div>
      {config?.testMode && <p className="lab-notice">Test preview: uses the bundled Balaji artwork. No AI calls or charges.</p>}
      {(error || connectionError) && <div role="alert" className="lab-error">{error || connectionError}</div>}
      {pendingUpload && <section className="lab-loading" role="status"><LoaderCircle className={busy ? 'spinning' : ''} /><p>Finding Dad’s upload. His receipt may have gone missing.</p><button className="button primary" type="button" disabled={busy} onClick={() => { void recoverUpload(); }}>Find saved upload</button><button className="text-button" type="button" disabled={busy} onClick={reset}>Choose another photo</button></section>}
      {!job && !jobId && !pendingUpload && <section className="lab-create-grid">
        <div className="lab-card"><PhotoCrop handle={crop} onReady={onPhotoReady} onError={setError} /><label className="lab-name">Dad’s name<div className="father-field"><span>Dr.</span><input aria-label="Dad’s name" value={name} onChange={e => setName(e.target.value)} maxLength={32} autoComplete="off" /></div></label><button type="button" className="button primary lab-primary" disabled={!photoReady || !name.trim() || !config?.available || busy} onClick={() => { void generate(); }}>{busy ? <LoaderCircle className="spinning" size={18} /> : <Sparkles size={18} />} {busy ? 'Sending Dad to the lab…' : 'Make my Dad'}</button>{config && !config.available && <p className="lab-notice">{config.message}</p>}</div>
        <aside className="lab-brief"><span className="case-stamp">TOP SECRET. VERY STUPID.</span><h2>Your Dad.<br />A deeply bad influence.</h2><ul><li><b>Recognizable first.</b> His actual face, hair and glasses. Plus a worrying amount of confidence.</li><li><b>You get the first look.</b> Approve his face before the rest of the expressions are made.</li><li><b>Then the chaos.</b> Laughing in cupboards. Posing as public property. Into the sack.</li></ul><p>Keep one face in the crop. Good light helps.<br />You can change his name later.</p><span className="lab-retention">Photo removed when your Dad pack is ready. Dad pack available for 24 hours.</span></aside>
      </section>}
      {jobId && !job && <div className="lab-loading" role="status"><LoaderCircle className="spinning" /><p>Finding Dad’s saved paperwork…</p><button className="text-button" type="button" onClick={reset}>Choose a new photo</button></div>}
      {working && <section className="lab-progress" role="status" aria-live="polite"><div className="lab-orbit">{pack ? <Dad character={pack} expression={1} /> : <Sparkles size={55} />}<span className="orbit-star">✳</span></div><h2>{job?.baseApproved ? 'Teaching him bad behaviour.' : 'Drawing a familiar troublemaker.'}</h2><p>{job?.baseApproved ? `${job.completed.length} of 6 expressions ready` : 'First, one recognizable face. You approve it next.'}</p><div className="face-progress">{EXPRESSIONS.map(expression => <span key={expression} className={job?.completed.includes(expression) ? 'done' : job?.currentExpression === expression ? 'active' : ''} aria-label={`${expression}: ${job?.completed.includes(expression) ? 'ready' : 'waiting'}`}>{job?.completed.includes(expression) ? <Check size={17} /> : <span />}</span>)}</div><small>This can take a few minutes. Leaving this screen won’t restart it.</small></section>}
      {job && !working && (base || finalPreview) && pack && <section className="lab-review">
        {imageError && <div role="alert" className="lab-error">Dad’s preview could not load. <button type="button" onClick={() => setImageReload(value => value + 1)}>Reload preview</button></div>}
        {base ? <div className="likeness-compare"><figure>{job.sourceUrl && <img src={job.sourceUrl} alt="Your cropped reference photo" />}<figcaption>Before the experiment</figcaption></figure><figure className="likeness-dad"><svg viewBox="0 0 180 240" role="img" aria-label={`${displayName} in his lungi`}><g transform="translate(10 10)"><FatherArt father={pack} /></g></svg><figcaption>After one terrible idea</figcaption></figure></div> : <><DadShowcase father={pack} /><div className="expression-grid">{EXPRESSIONS.map((expression, index) => <article key={expression}><Dad character={pack} expression={index} /><span>{labels[expression]}</span>{job.status !== 'ready' && job.retryableExpressions.includes(expression) && <button type="button" className="face-redo" aria-label={`Redraw ${expression} face`} disabled={busy} onClick={() => { void act('retry', expression); }}><RotateCcw size={12} /> Redraw</button>}</article>)}</div></>}
        <details className="palette-adjust"><summary>Adjust body colour</summary><div className="skin-options">{[...new Set([job.preview?.palette?.skin ?? DEFAULT_SKIN, ...tones])].map(tone => <button type="button" key={tone} style={{ background: tone }} aria-label={`Body colour ${tone}`} aria-pressed={skin === tone} onClick={() => setSkin(tone)} />)}<label>Custom<input aria-label="Custom body colour" type="color" value={skin} onChange={e => setSkin(e.target.value)} /></label></div></details>
        {job.error && <p role="alert" className="lab-error">{job.error.message} Your previous preview is still available.</p>}
        <div className="lab-actions">{base ? <><button type="button" className="button primary" disabled={busy || !imageReady} onClick={() => { void act('approve'); }}>That’s him. Make him worse. <ArrowRight size={18} /></button>{job.retryableExpressions.includes('grin') && <button type="button" className="text-button" disabled={busy} onClick={() => { void act('retry', 'grin'); }}><RotateCcw size={15} /> Redraw his face</button>}</> : <><label className="lab-final-name">Dad’s name<input aria-label="Final Dad name" value={name} maxLength={32} onChange={e => setName(e.target.value)} /></label><button type="button" className="button primary" disabled={busy || !imageReady || !name.trim()} onClick={() => { if (job.status === 'ready') onReady({ ...pack, name: name.trim() }); else void act('finalize'); }}>Use this Dad <ArrowRight size={18} /></button></>}<button type="button" className="text-button" disabled={busy} onClick={reset}>Choose another photo</button></div>
      </section>}
      {job?.error && !working && !finalPreview && <section className="lab-failure"><div className="lab-failure-icon">!</div><h2>Dad’s experiment hit a snag.</h2><p role="alert">{job.error.message}</p><p>{job.completed.length > 0 ? `${job.completed.length} completed ${job.completed.length === 1 ? 'face is' : 'faces are'} saved.` : job.sourceUrl ? 'Your photo is saved. No need to upload it again.' : 'Choose the photo again when you’re ready.'}</p>{job.error.canRetry && <button type="button" className="button primary" disabled={busy} onClick={() => { void act('retry', job.currentExpression ?? 'grin'); }}>Retry this face <RotateCcw size={16} /></button>}<button type="button" className="text-button" disabled={busy} onClick={reset}>Choose another photo</button></section>}
      <footer className="lab-footer"><button type="button" className="text-button" onClick={onSample}>Play with sample Balaji</button><span>One photo. A whole houseful of Dad.</span></footer>
    </main>
  </div>;
}
