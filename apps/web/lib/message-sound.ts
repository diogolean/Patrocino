let audio: AudioContext | null = null;

function context() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audio) audio = new Ctor();
  return audio;
}

export function unlockMessageSound() {
  const current = context();
  if (current?.state === "suspended") void current.resume();
}

export async function playMessageSound() {
  const current = context();
  if (!current) return;
  if (current.state === "suspended") {
    try {
      await current.resume();
    } catch {
      return;
    }
  }
  if (current.state !== "running") return;
  const now = current.currentTime;
  [880, 1174].forEach((frequency, index) => {
    const oscillator = current.createOscillator();
    const gain = current.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const start = now + index * 0.09;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.05, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
    oscillator.connect(gain);
    gain.connect(current.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.24);
  });
}
