/* Synthesize the native alarm sound (res/raw/chimes.wav) — a warm bell
   arpeggio that matches the in-app "Chimes" ringtone. Dependency-free.
   Run AFTER `npm run android:add` so the android/ project exists. */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'android', 'app', 'src', 'main', 'res', 'raw');

if (!existsSync(join(root, 'android'))) {
  console.error('✗ android/ not found. Run `npm run android:add` first, then re-run this.');
  process.exit(1);
}

const RATE = 44100;
const DUR = 4.2;                       // seconds
const N = Math.floor(RATE * DUR);
const buf = new Float32Array(N);

// a gentle ascending/descending bell phrase
const seq = [523.25, 659.25, 783.99, 1046.5, 880, 659.25];
const gap = 0.42;                      // seconds between strikes

const bell = (startT, freq) => {
  const start = Math.floor(startT * RATE);
  const life = Math.floor(1.9 * RATE); // each note rings ~1.9s
  for (let i = 0; i < life && start + i < N; i++) {
    const t = i / RATE;
    const env = Math.exp(-t * 2.3);    // exponential decay
    const s =
      Math.sin(2 * Math.PI * freq * t) * 0.6 +
      Math.sin(2 * Math.PI * freq * 2.76 * t) * 0.24; // shimmering partial
    buf[start + i] += s * env * 0.5;
  }
};

seq.forEach((f, i) => bell(i * gap, f));

// soft fade-out on the tail so the loop point is clean
const fade = Math.floor(0.25 * RATE);
for (let i = 0; i < fade; i++) buf[N - 1 - i] *= i / fade;

// normalize to avoid clipping
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(buf[i]));
const norm = peak > 0 ? 0.92 / peak : 1;

// 16-bit PCM mono WAV
const bytesPerSample = 2;
const dataLen = N * bytesPerSample;
const out = Buffer.alloc(44 + dataLen);
out.write('RIFF', 0);
out.writeUInt32LE(36 + dataLen, 4);
out.write('WAVE', 8);
out.write('fmt ', 12);
out.writeUInt32LE(16, 16);            // fmt chunk size
out.writeUInt16LE(1, 20);             // PCM
out.writeUInt16LE(1, 22);             // mono
out.writeUInt32LE(RATE, 24);
out.writeUInt32LE(RATE * bytesPerSample, 28);
out.writeUInt16LE(bytesPerSample, 32);
out.writeUInt16LE(16, 34);            // bits per sample
out.write('data', 36);
out.writeUInt32LE(dataLen, 40);
for (let i = 0; i < N; i++) {
  const v = Math.max(-1, Math.min(1, buf[i] * norm));
  out.writeInt16LE(Math.round(v * 32767), 44 + i * bytesPerSample);
}

mkdirSync(rawDir, { recursive: true });
const file = join(rawDir, 'chimes.wav');
writeFileSync(file, out);
console.log(`✶ wrote ${file} (${(out.length / 1024).toFixed(0)} KB)`);
