/* ===========================================================
   Local dev server for the UBL demo. The Gemini API key stays here;
   the browser only talks to these endpoints:

   POST /api/token       short-lived token for the live transcriber
                         (gemini-3.5-transcribe-live) — the customer's words
   POST /api/bey         LiveKit room + Beyond Presence avatar (realistic face;
                         needs BEY_API_KEY and LIVEKIT_URL/_API_KEY/_API_SECRET)
   POST /api/understand  what did the customer mean? (fast text model,
                         structured JSON answer)
   POST /api/speak       Ayesha's voice: streams 24 kHz 16-bit PCM for a text,
                         always the same voice. Every piece of audio is checked
                         by the voice guard (voice-guard/) before it is sent.

   Run:  npm install (once), then node server.js   ->  http://localhost:3000
   =========================================================== */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const voiceGuard = require('./voice-guard');

const ROOT = __dirname;
const PORT = +process.env.PORT || 3000;

// Minimal .env loader (no dependencies)
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env */ }

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) { console.error('Missing GEMINI_API_KEY in .env'); process.exit(1); }

const STT_MODEL = 'gemini-3.5-transcribe-live';
const NLU_MODEL = 'gemini-3.5-flash-lite';      // ~1 s per turn in tests
const VOICE = 'Autonoe';                        // Ayesha's one and only voice (bright, female)
const GEMINI = process.env.GEMINI_BASE || 'https://generativelanguage.googleapis.com/v1beta/models/';   // GEMINI_BASE: tests only

// Text-to-speech is limited by Google to 10 requests per minute PER MODEL on
// this key. Three TTS models (same voice) are used in order, each kept
// just under its limit, which triples capacity. Standard sentences are saved
// to disk once and never synthesised again.
const TTS_MODELS = ['gemini-3.8-flash-lite-tts', 'gemini-3.8-flash-tts', 'gemini-3.1-flash-tts-preview'];
const TTS_PER_MINUTE = 9;

// Beyond Presence: realistic talking face via a LiveKit room (preferred when configured).
// Needs BEY_API_KEY + LiveKit Cloud credentials; BEY_AVATAR_ID picks the face.
// AVATAR_VIDEO=off in .env switches the talking-face video off (voice only, no
// Beyond Presence credits used). Remove the line or set it to "on" to bring it back.
const AVATAR_VIDEO = (process.env.AVATAR_VIDEO || 'on').toLowerCase() !== 'off';
const BEY_API_KEY = process.env.BEY_API_KEY || '';
const BEY_AVATAR_ID = process.env.BEY_AVATAR_ID || '694c83e2-8895-4a98-bd16-56332ca3f449';   // default: "Nelly - Office"
const LIVEKIT_URL = process.env.LIVEKIT_URL || '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const CACHE_DIR = path.join(ROOT, 'voice-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon'
};
const BLOCKED = /(^|[\\/])(\.env|\.git|node_modules|server\.js|voice-cache|voice-guard|package(-lock)?\.json)([\\/]|$)/;

const readJson = req => new Promise((resolve, reject) => {
  let body = '';
  req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch (e) { reject(e); } });
  req.on('error', reject);
});
const sendJson = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };

// ---- /api/token: expiry is computed from Google's clock; this PC's clock is
// skewed and would otherwise produce tokens that are already expired.
async function googleNow() {
  try {
    const t = Date.parse((await fetch('https://generativelanguage.googleapis.com/', { method: 'HEAD' })).headers.get('date'));
    if (!Number.isNaN(t)) return t;
  } catch { /* fall back */ }
  return Date.now();
}
async function mintToken() {
  const now = await googleNow();
  const r = await fetch('https://generativelanguage.googleapis.com/v1alpha/auth_tokens', {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY, 'content-type': 'application/json' },
    // No bidiGenerateContentSetup here: a setup locked into the token replaces the page's own setup.
    body: JSON.stringify({ uses: 1, expireTime: new Date(now + 30 * 60e3).toISOString(), newSessionExpireTime: new Date(now + 2 * 60e3).toISOString() })
  });
  const j = await r.json();
  if (!r.ok || !j.name) throw new Error(j.error?.message || `Token request failed (${r.status})`);
  return j.name;
}

// ---- /api/bey: a private LiveKit room with a Beyond Presence avatar in it.
// The page joins as "ayesha" and streams Ayesha's voice to the avatar
// (LiveKit's standard avatar protocol); the avatar publishes lip-synced
// video + audio back into the room on Ayesha's behalf.
const b64url = v => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function livekitToken({ identity, room, now, kind, attributes }) {
  const t = Math.floor(now / 1000);
  const claims = {
    iss: LIVEKIT_API_KEY, sub: identity, name: identity, jti: identity + '-' + t,
    nbf: t - 60, exp: t + 2 * 3600,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
    ...(kind ? { kind } : {}), ...(attributes ? { attributes } : {})
  };
  const body = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url(claims);
  return body + '.' + crypto.createHmac('sha256', LIVEKIT_API_SECRET).update(body).digest('base64url');
}

async function beySession() {
  if (!AVATAR_VIDEO) { const e = new Error('Avatar video is switched off (AVATAR_VIDEO=off)'); e.status = 409; throw e; }
  if (!BEY_API_KEY || !LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    const e = new Error('Beyond Presence / LiveKit not configured'); e.status = 404; throw e;
  }
  const now = await googleNow();                       // this PC's clock is skewed; tokens use Google's time
  const room = 'ayesha-' + crypto.randomBytes(6).toString('hex');
  const me = 'ayesha', avatar = 'bey-avatar';
  const r = await fetch('https://api.bey.dev/v1/sessions', {
    method: 'POST',
    headers: { 'x-api-key': BEY_API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      transport: 'livekit', avatar_id: BEY_AVATAR_ID, url: LIVEKIT_URL,
      token: livekitToken({ identity: avatar, room, now, kind: 'agent', attributes: { 'lk.publish_on_behalf': me } })
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Beyond Presence session failed: ' + JSON.stringify(j).slice(0, 200));
  return { url: LIVEKIT_URL, token: livekitToken({ identity: me, room, now, kind: 'agent' }), avatarIdentity: avatar, avatarId: BEY_AVATAR_ID };
}

// ---- /api/understand: { system, prompt, schema } -> parsed JSON from the model
async function understand({ system, prompt, schema }) {
  const r = await fetch(GEMINI + NLU_MODEL + ':generateContent', {
    method: 'POST',
    headers: { 'x-goog-api-key': API_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0 }
    })
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Model error ${r.status}`);
  return JSON.parse(j.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
}

// ---- /api/speak: { text, persist?, background? } -> raw PCM stream
//      (24 kHz, 16-bit, little-endian, mono)
//  persist:    a standard sentence (no personal data) — save it to disk.
//  background: pre-generation — only uses spare capacity, never delays replies.
const usage = Object.fromEntries(TTS_MODELS.map(m => [m, { stamps: [], blockedUntil: 0 }]));
function freeSlots(model) {
  const u = usage[model], now = Date.now();
  u.stamps = u.stamps.filter(t => now - t < 60e3);
  return now < u.blockedUntil ? 0 : TTS_PER_MINUTE - u.stamps.length;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cacheFile = text => path.join(CACHE_DIR, crypto.createHash('sha1').update(VOICE + '|' + text).digest('hex') + '.pcm');

// Every generated clip goes through the voice guard: if it isn't Autonoe it is
// thrown away and generated again (preferring another model), up to this many times.
const VOICE_ATTEMPTS = 4;

async function speak({ text, persist, background }, res) {
  const file = persist ? cacheFile(text) : null;
  if (file && fs.existsSync(file)) {                       // saved earlier (verified then): instant, no quota used
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store', 'x-voice': 'disk' });
    return res.end(fs.readFileSync(file));
  }
  // Background work keeps 4 slots per model free for live replies.
  const reserve = background ? 4 : 1;
  const deadline = Date.now() + 25e3;
  const rejectedBy = new Set();
  for (let rejected = 0; rejected < VOICE_ATTEMPTS;) {
    const ready = TTS_MODELS.filter(m => freeSlots(m) >= reserve);
    const model = ready.find(m => !rejectedBy.has(m)) || ready[0];   // after a wrong voice, try another model first
    if (!model) {
      if (background || Date.now() > deadline) return sendJson(res, 503, { error: 'Voice is busy, try again shortly' });
      await sleep(700);                                     // a live reply waits for capacity rather than going silent
      continue;
    }
    usage[model].stamps.push(Date.now());
    const r = await fetch(GEMINI + model + ':streamGenerateContent?alt=sse', {
      method: 'POST',
      headers: { 'x-goog-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } } }
      })
    });
    if (r.status === 429) {                                 // Google says this model is out of quota: try the next one
      const body = await r.text();
      const retry = +(body.match(/"retryDelay":\s*"(\d+)/)?.[1] || 30);
      usage[model].blockedUntil = Date.now() + retry * 1000;
      console.warn(`[voice] ${model} rate-limited for ${retry}s, switching model`);
      continue;
    }
    if (!r.ok) throw new Error(`TTS error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const outcome = await guardedStream(r, res, file, text, model);
    if (outcome === 'sent' || outcome === 'aborted') return;
    if (outcome === 'short') return sendJson(res, 422, { error: 'Sentence too short to verify the voice' });
    rejectedBy.add(model);
    rejected++;
  }
  console.error(`[voice] GAVE UP after ${VOICE_ATTEMPTS} wrong-voice attempts, staying silent: "${text.slice(0, 70)}"`);
  return sendJson(res, 503, { error: 'Voice check failed' });
}

// Stream a generation to the browser, but only audio the voice guard has
// verified as Autonoe. Windows of 3 s starting every 0.5 s are checked, and
// audio is sent only once the window STARTING at it has passed: if the voice
// changed anywhere, the window starting at the change is (almost) all the
// other voice, so it fails before any of that audio leaves the server.
//   'sent'     all audio verified and sent (and saved to disk if requested)
//   'rejected' wrong voice before anything was sent: caller regenerates
//   'short'    too little speech to verify
//   'aborted'  wrong voice part-way: connection cut, the browser retries
async function guardedStream(r, res, file, text, model) {
  const WIN = voiceGuard.WINDOW * 2, GRID = 24000;          // in bytes: 3 s windows every 0.5 s
  const reader = r.body.getReader(), dec = new TextDecoder();
  let sse = '', audio = Buffer.alloc(0), sent = 0, next = 0, verified = 0;
  const fail = (v, at) => console.warn(`[voice] ${model} WRONG VOICE (${v.reason}, score ${v.score}) at ${(at / 48000).toFixed(1)}s: "${text.slice(0, 60)}"`);
  const send = end => {
    if (end <= sent) return;
    if (!res.headersSent) res.writeHead(200, { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' });
    res.write(audio.subarray(sent, end));
    sent = end;
  };
  const stop = outcome => { reader.cancel().catch(() => {}); if (sent) { res.destroy(); return 'aborted'; } return outcome; };

  for (;;) {
    const { done, value } = await reader.read();
    if (!done) {
      sse += dec.decode(value, { stream: true }).replaceAll('\r', '');
      let i;
      while ((i = sse.indexOf('\n\n')) >= 0) {
        const line = sse.slice(0, i).split('\n').find(l => l.startsWith('data: '));
        sse = sse.slice(i + 2);
        if (!line) continue;
        for (const p of JSON.parse(line.slice(6)).candidates?.[0]?.content?.parts || []) {
          if (p.inlineData?.data) audio = Buffer.concat([audio, Buffer.from(p.inlineData.data, 'base64')]);
        }
      }
    }
    // Check every full window available so far; send audio up to the next unchecked window.
    while (next + WIN <= audio.length) {
      const v = voiceGuard.checkRange(audio.subarray(next, next + WIN));
      if (v.ok) verified++;
      else if (v.reason !== 'too short to verify') { fail(v, next); return stop('rejected'); }
      // (a mostly silent window holds too little speech to judge; its neighbours cover it)
      next += GRID;
      send(next);
    }
    if (done) break;
  }
  const end = audio.length - (audio.length % 2);
  if (!end) { console.warn(`[voice] ${model} returned no audio: "${text.slice(0, 60)}"`); return 'rejected'; }
  // The last few seconds: shorter windows starting at each remaining grid
  // point (while they hold enough speech to judge)…
  for (let g = next; g < end; g += GRID) {
    const w = voiceGuard.checkRange(audio.subarray(g, end));
    if (w.reason === 'too short to verify') break;
    if (!w.ok) { fail(w, g); return stop('rejected'); }
    verified++;
  }
  // …and one window aligned to the end (reaching back if it is quiet).
  const v = voiceGuard.checkTail(audio.subarray(0, end));
  if (v.ok) verified++;
  else if (v.reason !== 'too short to verify') { fail(v, end); return stop('rejected'); }
  if (!verified) { console.warn(`[voice] too short to verify, not spoken: "${text.slice(0, 60)}"`); return stop('short'); }
  send(end);
  res.end();
  if (file && audio.length > 4800) {                        // verified throughout: safe to keep
    fs.writeFileSync(file + '.tmp', audio);
    fs.renameSync(file + '.tmp', file);
  }
  return 'sent';
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    try {
      if (url.pathname === '/api/token') return sendJson(res, 200, { token: await mintToken(), sttModel: STT_MODEL });
      if (url.pathname === '/api/understand') return sendJson(res, 200, await understand(await readJson(req)));
      if (url.pathname === '/api/bey') return sendJson(res, 200, await beySession());
      if (url.pathname === '/api/video-stats') {          // avatar video meter from the page, for diagnosis
        console.log(new Date().toISOString().slice(11, 19), '[video]', JSON.stringify(await readJson(req)));
        res.writeHead(204); return res.end();
      }
      if (url.pathname === '/api/speak') {
        const b = await readJson(req);
        return await speak({ text: String(b.text || '').slice(0, 1500), persist: !!b.persist, background: !!b.background }, res);
      }
      return sendJson(res, 404, { error: 'Unknown endpoint' });
    } catch (e) {
      console.error('[' + url.pathname + ']', e.message);
      if (!res.headersSent) sendJson(res, e.status || 502, { error: e.message }); else res.end();
      return;
    }
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(ROOT, rel));
  if (!file.startsWith(ROOT) || BLOCKED.test(path.relative(ROOT, file))) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    // no-store: the browser always loads the latest code during development.
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`UBL demo running at http://localhost:${PORT}  (understand: ${NLU_MODEL}, voice: ${VOICE} via ${TTS_MODELS.length} TTS models, transcribe: ${STT_MODEL})`));
