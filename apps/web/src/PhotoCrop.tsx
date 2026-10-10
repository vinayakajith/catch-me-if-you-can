import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { RotateCcw, Upload } from 'lucide-react';

export interface CropHandle { exportPhoto(): Promise<Blob> }
async function decode(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file), image = new Image();
  try { image.src = url; await image.decode(); return image; } finally { URL.revokeObjectURL(url); }
}
async function preparePhoto(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Choose a photo under 10 MB.');
  let image: HTMLImageElement;
  try { image = await decode(file); }
  catch {
    if (!/heic|heif/i.test(file.type + file.name)) throw new Error('That photo could not open. Try a JPG, PNG or WebP.');
    try { const { heicTo } = await import('heic-to/csp'); image = await decode(await heicTo({ blob: file, type: 'image/jpeg', quality: .9 })); }
    catch { throw new Error('This HEIC photo could not convert. Choose a JPG copy, or take a fresh photo.'); }
  }
  if (Math.min(image.naturalWidth, image.naturalHeight) < 256 || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('Choose a clear photo between 256 pixels and 40 megapixels.');
  const factor = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(image.naturalWidth * factor); canvas.height = Math.round(image.naturalHeight * factor);
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas;
}

export function PhotoCrop({ handle, onReady, onError }: { handle: React.RefObject<CropHandle | null>; onReady(): void; onError(message: string): void }) {
  const [image, setImage] = useState<HTMLCanvasElement | null>(null), [loading, setLoading] = useState(false);
  const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 }), [rotation, setRotation] = useState(0);
  const preview = useRef<HTMLCanvasElement>(null), drag = useRef<{ id: number; x: number; y: number; pan: { x: number; y: number } } | null>(null), sequence = useRef(0);
  const draw = (canvas: HTMLCanvasElement) => {
    if (!image) return;
    const odd = rotation % 180 !== 0, width = odd ? image.height : image.width, height = odd ? image.width : image.height;
    const context = canvas.getContext('2d')!, size = canvas.width, scale = size / Math.min(width, height) * zoom;
    const overflowX = (width * scale - size) / 2, overflowY = (height * scale - size) / 2;
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, size, size);
    context.save(); context.translate(size / 2 + pan.x * overflowX, size / 2 + pan.y * overflowY); context.rotate(rotation * Math.PI / 180); context.scale(scale, scale);
    context.drawImage(image, -image.width / 2, -image.height / 2); context.restore();
  };
  useEffect(() => { if (preview.current) draw(preview.current); });
  useEffect(() => { if (image) onReady(); }, [image, zoom, pan.x, pan.y, rotation, onReady]);
  useEffect(() => {
    handle.current = image ? { exportPhoto: () => new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024; draw(canvas);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('The crop could not be saved. Choose the photo again.')), 'image/jpeg', .92);
    }) } : null;
    return () => { handle.current = null; };
  });
  const change = async (file?: File) => {
    if (!file) return;
    const token = ++sequence.current; setLoading(true); onError('');
    try { const next = await preparePhoto(file); if (token !== sequence.current) return; setImage(next); setZoom(1); setPan({ x: 0, y: 0 }); setRotation(0); }
    catch (error) { if (token === sequence.current) onError((error as Error).message); }
    finally { if (token === sequence.current) setLoading(false); }
  };
  const move = (event: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !image || drag.current.id !== event.pointerId) return;
    const box = event.currentTarget.getBoundingClientRect(), odd = rotation % 180 !== 0;
    const width = odd ? image.height : image.width, height = odd ? image.width : image.height, scale = box.width / Math.min(width, height) * zoom;
    const limit = (value: number) => Math.max(-1, Math.min(1, value));
    setPan({ x: limit(drag.current.pan.x + (event.clientX - drag.current.x) / Math.max(1, (width * scale - box.width) / 2)), y: limit(drag.current.pan.y + (event.clientY - drag.current.y) / Math.max(1, (height * scale - box.height) / 2)) });
  };
  return <div className="photo-crop">
    <label className={`photo-drop ${image ? 'has-photo' : ''}`}><Upload size={27} /><strong>{loading ? 'Opening a portrait photo…' : image ? 'Choose a different photo' : 'Choose a portrait photo'}</strong><span>One clear face. Include hair, ears and chin.</span><input aria-label="a portrait photo" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={loading} onChange={event => { void change(event.target.files?.[0]); event.target.value = ''; }} /></label>
    {image && <>
      <canvas ref={preview} width="600" height="600" aria-label="Photo crop preview. Drag to move the photo." onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan }; }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      <div className="crop-controls"><label>Zoom<input aria-label="Photo zoom" type="range" min="1" max="3" step=".05" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label><button type="button" className="icon-button" aria-label="Rotate photo" onClick={() => { setRotation((rotation + 90) % 360); setPan({ x: 0, y: 0 }); }}><RotateCcw size={20} /></button></div>
      <details className="crop-keyboard"><summary>Adjust crop without dragging</summary><label>Left / right<input aria-label="Horizontal photo position" type="range" min="-1" max="1" step=".02" value={pan.x} onChange={e => setPan({ ...pan, x: Number(e.target.value) })} /></label><label>Up / down<input aria-label="Vertical photo position" type="range" min="-1" max="1" step=".02" value={pan.y} onChange={e => setPan({ ...pan, y: Number(e.target.value) })} /></label></details>
    </>}
  </div>;
}
