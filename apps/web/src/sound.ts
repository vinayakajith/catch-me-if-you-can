let context: AudioContext | undefined;
export function unlockSound() {
  try { context ??= new AudioContext(); void context.resume(); } catch { /* Sound is optional. */ }
}
export function playSound(kind: 'catch' | 'open', enabled: boolean) {
  if (!enabled) return;
  unlockSound();
  if (!context) return;
  const ctx = context;
  const notes = kind === 'catch' ? [392, 523, 659, 784] : [180, 240];
  notes.forEach((frequency, index) => {
    const oscillator = ctx.createOscillator(), gain = ctx.createGain();
    const start = ctx.currentTime + index * .075;
    oscillator.type = kind === 'catch' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.15, start + .1);
    gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.09, start + .012); gain.gain.exponentialRampToValueAtTime(.001, start + .2);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(start); oscillator.stop(start + .21);
  });
}
