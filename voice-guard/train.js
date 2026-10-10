// Trains the voice guard: node voice-guard/train.js <folder> [<folder> ...]
// Each folder holds 24 kHz 16-bit mono .pcm clips named "<Voice>_....pcm".
// Clips named Autonoe_* are Ayesha's voice; every other name is "not her".
// Writes voice-guard/autonoe.json (a logistic-regression classifier over
// both voiceprints) with a threshold above every non-Autonoe window seen.
const fs = require('fs');
const path = require('path');
const guard = require('./index.js');
const TARGET = 'Autonoe';
const OPTIONS = { l2: 0.03, steps: 600 };   // chosen by cross-validation
const MARGIN = 0.03;

// Voiceprints of every window of every clip, grouped by clip.
function collect(dirs) {
  const clips = [];
  for (const dir of dirs) for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.pcm'))) {
    const samples = guard.toFloat(fs.readFileSync(path.join(dir, f)));
    if (samples.length < guard.MIN_SPEECH) continue;
    clips.push({ name: f, me: f.startsWith(TARGET + '_'), prints: guard.windows(samples).map(guard.voiceprint) });
  }
  return clips;
}

// L2-regularised logistic regression, classes weighted equally.
function fit(clips, { l2 = 0.05, steps = 1500, rate = 0.5 } = {}) {
  const X = [], y = [];
  for (const c of clips) for (const p of c.prints) { X.push(p); y.push(c.me ? 1 : 0); }
  const d = X[0].length, n = X.length;
  const mean = Array.from({ length: d }, (_, j) => X.reduce((s, x) => s + x[j], 0) / n);
  const scale = mean.map((m, j) => Math.sqrt(X.reduce((s, x) => s + (x[j] - m) ** 2, 0) / n) || 1);
  const Z = X.map(x => x.map((v, j) => (v - mean[j]) / scale[j]));
  const pos = y.filter(Boolean).length, wPos = n / (2 * pos), wNeg = n / (2 * (n - pos));
  const w = new Float64Array(d); let b = 0;
  for (let it = 0; it < steps; it++) {
    const g = new Float64Array(d); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < d; j++) z += w[j] * Z[i][j];
      const err = (1 / (1 + Math.exp(-z)) - y[i]) * (y[i] ? wPos : wNeg);
      for (let j = 0; j < d; j++) g[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= rate * (g[j] / n + l2 * w[j]);
    b -= rate * gb / n;
  }
  return { mean, scale, weights: Array.from(w), bias: b };
}

const prob = (m, p) => { let z = m.bias; for (let j = 0; j < p.length; j++) z += m.weights[j] * (p[j] - m.mean[j]) / m.scale[j]; return 1 / (1 + Math.exp(-z)); };

module.exports = { collect, fit, prob };

if (require.main === module) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.log('usage: node voice-guard/train.js <folder> [<folder> ...]'); process.exit(1); }
  const clips = collect(dirs);
  // Threshold from 4-fold cross-validation: every clip is scored by a model
  // that never saw it, and the threshold sits above the most Autonoe-like
  // other voice with a safety margin.
  const K = 4, others = [], mine = [];
  for (let k = 0; k < K; k++) {
    const m = fit(clips.filter((_, i) => i % K !== k), OPTIONS);
    for (const c of clips.filter((_, i) => i % K === k)) for (const p of c.prints) (c.me ? mine : others).push(prob(m, p));
  }
  const model = fit(clips, OPTIONS);
  model.threshold = +Math.max(0.5, Math.min(0.97, Math.max(...others) + MARGIN)).toFixed(3);
  model.trainedOn = { autonoeClips: clips.filter(c => c.me).length, otherClips: clips.filter(c => !c.me).length, date: new Date().toISOString().slice(0, 10) };
  fs.writeFileSync(path.join(__dirname, 'autonoe.json'), JSON.stringify(model));
  console.log(`trained on ${model.trainedOn.autonoeClips} Autonoe + ${model.trainedOn.otherClips} other clips;`,
    `cross-validated: most Autonoe-like other voice ${Math.max(...others).toFixed(3)}, threshold ${model.threshold},`,
    `Autonoe windows passing ${mine.filter(p => p >= model.threshold).length}/${mine.length}`);
}
