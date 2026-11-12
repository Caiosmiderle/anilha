import { readPrefs } from './prefs';
/** Screen Wake Lock: keeps the screen on during a workout. Failure is silent by design. */
export function keepScreenOn(): () => void {
  let lock: { release: () => Promise<void> } | null = null;
  let stopped = false;
  const nav = navigator as Navigator & {
    wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
  };
  const acquire = async () => {
    if (stopped || !nav.wakeLock || document.visibilityState !== 'visible') return;
    try {
      lock = await nav.wakeLock.request('screen');
    } catch {
      lock = null;
    }
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void acquire();
  };
  void acquire();
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisible);
    void lock?.release().catch(() => undefined);
  };
}

let audio: AudioContext | null = null;

/** Must run inside a tap: iOS only plays sound from an unlocked AudioContext. */
export function unlockAudio(): void {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audio ??= new Ctor();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    audio = null;
  }
}

/** Short two-tone chime for the end of rest, plus vibration where it exists. */
export function restOverSignal(): void {
  const mode = readPrefs().restAlert;
  if (mode === 'silent') return;
  try {
    if (audio && mode === 'sound') {
      const now = audio.currentTime;
      [880, 1175].forEach((freq, i) => {
        const osc = (audio as AudioContext).createOscillator();
        const gain = (audio as AudioContext).createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.25, now + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.16);
        osc.connect(gain).connect((audio as AudioContext).destination);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.18);
      });
    }
  } catch {
    // Sound is a bonus, never an error.
  }
  if ('vibrate' in navigator) {
    try {
      navigator.vibrate([120, 80, 120]);
    } catch {
      // iOS Safari has no vibration.
    }
  }
}
