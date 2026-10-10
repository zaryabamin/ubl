// Voice guard: proves a clip is spoken by Ayesha's voice (Gemini "Autonoe")
// and by nothing else, not another female voice and not a male one.
//
// Two speaker-recognition models (TitaNet + WeSpeaker, run locally, free)
// turn a few seconds of speech into voiceprints. A classifier trained on
// Autonoe vs. every other Gemini voice (autonoe.json, built by train.js)
// scores how likely the voiceprint is Autonoe's.
//
// Speech is checked in windows of WINDOW seconds: one window can only be
// trusted when it has enough speech in it, so very short clips are not
// verifiable on their own (callers speak whole sentences, never "Sure.").
const fs = require('fs');
const path = require('path');
const sherpa = require('sherpa-onnx-node');

const RATE = 24000;
const WINDOW = 3 * RATE;               // samples per verified window
const MIN_SPEECH = 1.6 * RATE;         // a clip shorter than this can't be verified
const MODELS = ['nemo_en_titanet_small.onnx', 'wespeaker_en_voxceleb_resnet34_LM.onnx'];

const extractors = MODELS.map(m => new sherpa.SpeakerEmbeddingExtractor({
  model: path.join(__dirname, m), numThreads: 2, debug: false
}));

const toFloat = pcm => {
  const s = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length >> 1), f = new Float32Array(s.length);
  for (let i = 0; i < s.length; i++) f[i] = s[i] / 32768;
  return f;
};
const unit = v => { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return Array.from(v, x => x / n); };

// 24 kHz -> 16 kHz (what the models expect), done here so the library doesn't
// log a line for every check. A light 3-tap low-pass, then interpolation.
function to16k(s) {
  const n = Math.floor(s.length * 2 / 3), out = new Float32Array(n);
  const at = i => s[Math.min(s.length - 1, Math.max(0, i))];
  const lp = i => 0.25 * at(i - 1) + 0.5 * at(i) + 0.25 * at(i + 1);
  for (let j = 0; j < n; j++) { const t = j * 1.5, i = Math.floor(t), f = t - i; out[j] = lp(i) * (1 - f) + lp(i + 1) * f; }
  return out;
}

// Voiceprint of one stretch of audio (Float32 samples at 24 kHz).
function voiceprint(samples) {
  const out = [], s16 = to16k(samples);
  for (const ex of extractors) {
    const st = ex.createStream();
    st.acceptWaveform({ sampleRate: 16000, samples: s16 });
    st.inputFinished();
    out.push(...unit(ex.compute(st)));
  }
  return out;
}

// Windows covering every sample: WINDOW long, overlapping by half,
// the last one aligned to the end. A clip shorter than WINDOW is one window.
function windows(samples) {
  if (samples.length <= WINDOW) return [samples];
  const list = [];
  for (let i = 0; i + WINDOW <= samples.length; i += WINDOW / 2) list.push(samples.subarray(i, i + WINDOW));
  if (samples.length % (WINDOW / 2)) list.push(samples.subarray(samples.length - WINDOW));
  return list;
}

// Seconds of actual speech (20 ms frames above a loudness floor).
function speechSamples(samples) {
  let n = 0;
  for (let o = 0; o + 480 <= samples.length; o += 480) {
    let e = 0; for (let i = 0; i < 480; i++) e += samples[o + i] * samples[o + i];
    if (Math.sqrt(e / 480) > 0.01) n += 480;
  }
  return n;
}

let model = null;
const MODEL_FILE = path.join(__dirname, 'autonoe.json');
function load() {
  if (!model) model = JSON.parse(fs.readFileSync(MODEL_FILE, 'utf8'));
  return model;
}

// Probability (0..1) that one window is Autonoe.
function scoreWindow(samples) {
  const { mean, scale, weights, bias } = load();
  const v = voiceprint(samples);
  let z = bias;
  for (let i = 0; i < v.length; i++) z += weights[i] * (v[i] - mean[i]) / scale[i];
  return 1 / (1 + Math.exp(-z));
}

// Check 16-bit PCM (Buffer). Returns { ok, reason, scores }.
//   ok: every window is confidently Autonoe.
function check(pcm) {
  const samples = toFloat(pcm);
  if (speechSamples(samples) < MIN_SPEECH) return { ok: false, reason: 'too short to verify', scores: [] };
  const { threshold } = load();
  const scores = windows(samples).map(w => +scoreWindow(w).toFixed(3));
  const worst = Math.min(...scores);
  return { ok: worst >= threshold, reason: worst >= threshold ? 'match' : 'voice mismatch', scores };
}

// Check one stretch of audio (16-bit PCM Buffer) as a single window.
// Returns { ok, reason, score }; reason 'too short to verify' when it is mostly silence.
function checkRange(pcm) {
  const s = toFloat(pcm);
  if (speechSamples(s) < MIN_SPEECH) return { ok: false, reason: 'too short to verify', score: null };
  const score = +scoreWindow(s).toFixed(3);
  const ok = score >= load().threshold;
  return { ok, reason: ok ? 'match' : 'voice mismatch', score };
}

// Check the latest WINDOW of a growing clip (16-bit PCM Buffer), reaching
// further back when that stretch holds too little speech to judge.
// Returns { ok, reason, score }.
function checkTail(pcm) {
  const s = toFloat(pcm);
  let start = Math.max(0, s.length - WINDOW);
  while (start > 0 && speechSamples(s.subarray(start)) < MIN_SPEECH) start = Math.max(0, start - RATE / 2);
  const w = s.subarray(start);
  if (speechSamples(w) < MIN_SPEECH) return { ok: false, reason: 'too short to verify', score: null };
  const score = +scoreWindow(w).toFixed(3);
  const ok = score >= load().threshold;
  return { ok, reason: ok ? 'match' : 'voice mismatch', score };
}

module.exports = { check, checkRange, checkTail, voiceprint, windows, toFloat, scoreWindow, RATE, WINDOW, MIN_SPEECH };
