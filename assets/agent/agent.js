/* ===========================================================
   Ayesha — voice assistant for the account opening form.

   Flow (our code runs the conversation; AI only hears, understands, speaks):

     mic ─► transcriber (gemini-3.5-transcribe-live) ─► customer's words
                                                           │
                   /api/understand (fast model) ─► { intent, values, reply }
                                                           │
            conversation controller (this file) ─► FormAPI fills / moves on
                                                           │
             what to say ─► /api/speak (fixed voice, cached) ─► avatar + speaker

   - She asks exactly the field on screen, one at a time, and speaks once
     per customer turn — no improvising, skipping ahead or repeating.
   - Typed fields are read back (spelled by code) and filled only after "yes".
   - Each section ends with a review before moving on.
   - Half-duplex: the mic is only listened to while Ayesha is silent.
   - Realistic talking face: a Beyond Presence avatar (lip-synced video via
     LiveKit). If it is unavailable she carries on by voice, with her photo.
   =========================================================== */

const Form = window.FormAPI;
const WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

/* ============================== UI ============================== */
const ICON = {
  wave: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="10" width="2.4" height="4" rx="1.2"/><rect x="7" y="7" width="2.4" height="10" rx="1.2"/><rect x="11" y="4" width="2.4" height="16" rx="1.2"/><rect x="15" y="7" width="2.4" height="10" rx="1.2"/><rect x="19" y="10" width="2.4" height="4" rx="1.2"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18"/></svg>',
  speaker: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>',
  speakerOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="m17 9 5 6M22 9l-5 6"/></svg>',
  hang: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 9c-3.2 0-6.2.9-8.6 2.5-.6.4-.8 1.2-.5 1.9l1.2 2.3c.3.6 1.1.9 1.7.6l2.6-1.1c.5-.2.8-.8.7-1.3l-.3-1.8c2-.6 4.4-.6 6.4 0l-.3 1.8c-.1.5.2 1.1.7 1.3l2.6 1.1c.6.3 1.4 0 1.7-.6l1.2-2.3c.3-.7.1-1.5-.5-1.9C18.2 9.9 15.2 9 12 9z"/></svg>',
  send: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg>'
};

document.body.insertAdjacentHTML('beforeend', `
<div class="ay-launcher" id="ayLauncher">
  <div class="ay-greet">Hi, I'm Ayesha, UBL's account opening guide. How can I help you today?</div>
  <div class="ay-card">
    <button class="ay-thumb" id="ayOpen" aria-label="Talk to Ayesha"><img src="assets/avatar/ayesha.jpg" alt="Ayesha"></button>
    <form class="ay-card-body" id="ayQuick" autocomplete="off">
      <textarea id="ayQuickText" rows="2" placeholder="Talk to our agent Ayesha" aria-label="Message Ayesha"></textarea>
      <button type="button" class="ay-card-mic" id="ayQuickMic" aria-label="Talk to Ayesha by voice">${ICON.wave}</button>
    </form>
  </div>
</div>
<aside class="ay-panel" id="ayPanel" aria-label="Ayesha assistant">
  <div class="ay-stage" id="ayStage">
    <img class="ay-photo" src="assets/avatar/ayesha.jpg" alt="">
    <video class="ay-face" id="ayFaceVideo" autoplay playsinline muted></video>
    <audio id="ayFaceAudio" autoplay></audio>
    <div class="ay-loading" id="ayLoading" hidden><span></span>Connecting to Ayesha…</div>
    <div class="ay-ctrls">
      <button class="ay-btn" id="aySpk" aria-label="Mute speaker">${ICON.speaker}</button>
      <button class="ay-btn ay-hang" id="ayEnd" aria-label="End conversation">${ICON.hang}</button>
    </div>
    <div class="ay-status" id="ayStatus"><i></i><span>Offline</span></div>
    <div class="ay-name"><b>Ayesha</b><small>UBL Digital Assistant</small></div>
  </div>
  <div class="ay-chat" id="ayChat"></div>
  <form class="ay-input" id="ayForm" autocomplete="off">
    <input id="ayText" placeholder="Type your message…" aria-label="Message">
    <button type="submit" class="ay-send" aria-label="Send">${ICON.send}</button>
    <button type="button" class="ay-micbtn" id="ayMic" aria-label="Microphone">${ICON.micOff}</button>
  </form>
</aside>`);

const $ = id => document.getElementById(id);
const ui = {
  launcher: $('ayLauncher'), stage: $('ayStage'), loading: $('ayLoading'),
  faceVideo: $('ayFaceVideo'), faceAudio: $('ayFaceAudio'),
  status: $('ayStatus'), chat: $('ayChat'), text: $('ayText'), mic: $('ayMic'), spk: $('aySpk')
};

function setStatus(kind, label) {
  ui.status.dataset.kind = kind;
  ui.status.querySelector('span').textContent = label;
}

/* ============================ Chat ============================ */
function bubble(cls, text = '') {
  const b = document.createElement('div');
  b.className = 'ay-msg ' + cls;
  b.textContent = text;
  ui.chat.appendChild(b);
  ui.chat.scrollTop = ui.chat.scrollHeight;
  return b;
}
const note = (text, cls = '') => bubble('ay-note ' + cls, text);

// Transcripts can contain non-speech markers like "<noise>" or "{pause}".
function clean(text) {
  return romanize(String(text || '')).replace(/<[^>]*>|\{[^}]*\}|\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

// The transcriber sometimes writes spoken Urdu in Hindi (Devanagari) script;
// convert it to Roman Urdu so it reads like the rest of the chat.
const DV = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o' };
const DM = { 'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o' };
const DC = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh',
  'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y',
  'र': 'r', 'ल': 'l', 'व': 'w', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h'
};
const NUKTA = { 'क': 'q', 'ख': 'kh', 'ग': 'gh', 'ज': 'z', 'फ': 'f', 'ड': 'r', 'ढ': 'rh' };
function romanize(text) {
  if (!/[ऀ-ॿ]/.test(text)) return text;
  return text.replace(/[ऀ-ॿ]+/g, word => {
    const ch = [...word]; let out = '';
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (DC[c]) {
        const first = i === 0;
        let r = DC[c];
        if (ch[i + 1] === '़') { r = NUKTA[c] || r; i++; }               // nukta: ज़ → z
        const nx = ch[i + 1];
        if (nx === '्') { out += r; i++; }                              // virama: no vowel
        else if (DM[nx]) { out += r + DM[nx]; i++; }
        else if (i + 1 >= ch.length || (!first && DC[nx] && DM[ch[i + 2]])) out += r;   // silent inherent vowel
        else out += r + 'a';
      } else if (DV[c]) out += DV[c];
      else if (c === 'ं' || c === 'ँ') out += 'n';                 // anusvara / chandrabindu
      else if (c === '।') out += '.';                                   // danda
    }
    return out;
  });
}

// The customer's words from the transcriber: a live "interim" guess that
// keeps being refined, then "final" text. One bubble per utterance.
const said = {
  el: null, final: '', interim: '',
  show() {
    if (!this.el) this.el = bubble('ay-user');
    this.el.textContent = clean(this.final + ' ' + this.interim);
    this.el.classList.toggle('ay-interim', !!this.interim);
    ui.chat.scrollTop = ui.chat.scrollHeight;
  },
  onInterim(t) { this.interim = t; this.show(); },
  onFinal(t) { this.final += ' ' + t; this.interim = ''; this.show(); },
  text() { return clean(this.final); },
  reset() {
    if (this.el) { this.el.classList.remove('ay-interim'); if (!this.el.textContent) this.el.remove(); }
    this.el = null; this.final = this.interim = '';
  }
};

function reviewCard(section, rows) {
  const card = bubble('ay-review');
  card.innerHTML = `<b>Please check — ${section}</b><dl></dl>`;
  rows.forEach(r => {
    const [label, ...rest] = r.split(': ');
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = rest.join(': ');
    card.querySelector('dl').append(dt, dd);
  });
  ui.chat.scrollTop = ui.chat.scrollHeight;
}
Form.onReview(reviewCard);

/* ======================== Audio engine ======================== */
// The page's own audio engine: microphone capture, and playing her voice
// directly if the realistic face is unavailable. Created on the first click
// (browsers only allow audio after the user interacts).
let audioCtx = null, outGain = null;
function audio() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    outGain = audioCtx.createGain();
    outGain.connect(audioCtx.destination);
  }
  return audioCtx;
}
// Pictures saved by earlier versions are no longer used.
try { ['ayesha-thumb', 'ayesha-thumb-face', 'ayesha-thumb-v2', 'ayesha-thumb-v2-face'].forEach(k => localStorage.removeItem(k)); } catch { }

/* ============== Beyond Presence (realistic face) ============== */
// The server creates a private LiveKit room with a Beyond Presence avatar in
// it. The page joins the room as "ayesha" and streams each sentence of her
// voice to the avatar (LiveKit's standard avatar protocol: a byte stream on
// topic "lk.audio_stream", 24 kHz PCM16 — no resampling needed). The avatar
// publishes lip-synced video + audio back, which plays in the panel.
const bey = {
  room: null, active: false, talking: false, starting: null, avatar: null, avatarId: null,
  writer: null,          // byte stream for the sentence being spoken
  chain: Promise.resolve(),
  sentUntil: 0           // estimated end of the audio sent so far (performance.now ms)
};
const BEY_DELAY_MS = 600;

function startBey() {
  bey.starting ||= (async () => {
    let room;
    try {
      const r = await fetch('/api/bey', { method: 'POST' });
      if (r.status === 409) { bey.disabled = true; return false; }   // switched off on purpose (voice only)
      if (!r.ok) return false;                         // not configured
      const { url, token, avatarIdentity, avatarId } = await r.json();
      const { Room, RoomEvent } = await import('livekit-client');
      room = new Room({ adaptiveStream: true, dynacast: true });   // video sized to the panel, paused when hidden
      const videoReady = new Promise(resolve => {
        room.on(RoomEvent.TrackSubscribed, (track, _pub, p) => {
          if (p.identity !== avatarIdentity) return;
          if (track.kind === 'video') { track.attach(ui.faceVideo); watchVideo(track, room); resolve(); }
          else track.attach(ui.faceAudio);
        });
      });
      room.on(RoomEvent.ParticipantDisconnected, p => { if (p.identity === avatarIdentity) beyEnded(room); });
      room.on(RoomEvent.Disconnected, () => beyEnded(room));
      // The avatar reports when it actually starts/finishes speaking.
      room.registerRpcMethod('lk.playback_started', async () => { bey.talking = true; return ''; });
      room.registerRpcMethod('lk.playback_finished', async () => { bey.talking = false; return ''; });
      await room.connect(url, token);
      await Promise.race([videoReady, new Promise((_, no) => setTimeout(() => no(new Error('avatar did not join')), 25000))]);
      Object.assign(bey, { room, avatar: avatarIdentity, avatarId, active: true, talking: false, writer: null, chain: Promise.resolve(), sentUntil: 0 });
      ui.faceAudio.muted = muted;
      ui.stage.classList.add('face');
      return true;
    } catch (e) {
      console.warn('[ayesha] Beyond Presence unavailable:', e.message || e);
      try { await room?.disconnect(); } catch { }
      return false;
    } finally {
      bey.starting = null;
    }
  })();
  return bey.starting;
}

// Video meter: every 5 s, how smoothly the avatar video is arriving and
// playing. Kept in window.ayeshaVideoStats (and the console) for diagnosis:
// low fps / packet loss = network; dropped frames with good fps = this PC.
function watchVideo(track, room) {
  let prev = null;
  const timer = setInterval(async () => {
    if (bey.room !== room) return clearInterval(timer);
    try {
      const report = await track.getRTCStatsReport();
      report?.forEach(s => {
        if (s.type !== 'inbound-rtp' || s.kind !== 'video') return;
        const dt = prev ? (s.timestamp - prev.timestamp) / 1000 : 0;
        const stats = {
          resolution: `${s.frameWidth}x${s.frameHeight}`,
          receivedFps: Math.round(s.framesPerSecond || 0),
          droppedFrames: s.framesDropped || 0,
          packetsLost: s.packetsLost || 0,
          jitterMs: Math.round((s.jitter || 0) * 1000),
          kbps: dt ? Math.round((s.bytesReceived - prev.bytesReceived) * 8 / dt / 1000) : null,
          freezes: s.freezeCount || 0
        };
        prev = s;
        window.ayeshaVideoStats = stats;
        console.info('[ayesha] avatar video', JSON.stringify(stats));
        fetch('/api/video-stats', { method: 'POST', body: JSON.stringify({ ...stats, tabVisible: !document.hidden }) }).catch(() => { });
      });
    } catch { }
  }, 5000);
}

function beyEnded(room) {
  if (room && bey.room !== room) return;
  const wasActive = bey.active;
  Object.assign(bey, { room: null, active: false, talking: false, writer: null });
  ui.stage.classList.remove('face');
  // Session ended mid-conversation: she carries on by voice (with her photo); try the video again shortly.
  if (wasActive && conv.active) setTimeout(() => { if (conv.active && !bey.active) startFace(); }, 5000);
}

function stopBey() {
  const room = bey.room;
  beyEnded(room);
  try { room?.disconnect(); } catch { }
}

// One byte stream per sentence; writes are chained so they stay in order.
function beyPush(pcm24) {
  const room = bey.room, bytes = new Uint8Array(pcm24.buffer.slice(pcm24.byteOffset, pcm24.byteOffset + pcm24.byteLength));
  if (!bey.writer) {
    bey.writer = room.localParticipant.streamBytes({
      name: 'AUDIO_' + Date.now(), topic: 'lk.audio_stream',
      destinationIdentities: [bey.avatar], attributes: { sample_rate: '24000', num_channels: '1' }
    });
  }
  const w = bey.writer;
  bey.chain = bey.chain.then(async () => (await w).write(bytes)).catch(() => { });
  bey.sentUntil = Math.max(bey.sentUntil, performance.now()) + pcm24.length / 24;
}
function beyFlush() {                                 // end of the sentence
  const w = bey.writer;
  bey.writer = null;
  if (w) bey.chain = bey.chain.then(async () => (await w).close()).catch(() => { });
}
function beyClear() {
  const w = bey.writer;
  bey.writer = null;
  bey.sentUntil = 0;
  bey.talking = false;
  if (w) w.then(x => x.close()).catch(() => { });
  if (bey.room) bey.room.localParticipant.performRpc({ destinationIdentity: bey.avatar, method: 'lk.clear_buffer', payload: '' }).catch(() => { });
}

// Realistic face: Beyond Presence. Without it she continues by voice, with her photo.
async function startFace() {
  return startBey();
}
const faceActive = () => bey.active;

/* ======================== Audio output ======================== */
let playUntil = 0;                 // audioCtx time when queued speech ends
const playing = new Set();
// +150 ms covers a short room echo.
const speaking = () => bey.active
  ? bey.talking || performance.now() < bey.sentUntil + BEY_DELAY_MS
  : !!audioCtx && audioCtx.currentTime < playUntil + 0.15;

// pcm: Int16Array, 24 kHz mono
function play(pcm) {
  if (!pcm.length) return;
  if (bey.active) { beyPush(pcm); return; }          // the realistic face speaks it
  const ctx = audio();
  const buf = ctx.createBuffer(1, pcm.length, 24000);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(outGain);                               // → speakers (voice-only mode)
  playUntil = Math.max(playUntil, ctx.currentTime + 0.05);
  src.start(playUntil);
  playUntil += buf.duration;
  playing.add(src);
  src.onended = () => playing.delete(src);
}
let speechGen = 0;                 // bumped to cancel anything still being spoken
function stopAudio() {
  speechGen++;
  playing.forEach(s => { try { s.stop(); } catch { } });
  playing.clear();
  playUntil = 0;
  if (bey.active) beyClear();
}

let muted = false;
ui.spk.onclick = () => {
  muted = !muted;
  ui.faceAudio.muted = muted;
  if (outGain) outGain.gain.value = muted ? 0 : 1;
  ui.spk.innerHTML = muted ? ICON.speakerOff : ICON.speaker;
  ui.spk.classList.toggle('off', muted);
};

/* ===================== Ayesha's voice (TTS) ===================== */
// Every sentence is synthesised once by the server in the same fixed voice
// and kept in memory, so repeated sentences play instantly. Standard
// sentences (no personal data) are also saved on the server's disk, so they
// never use Google's voice quota (10 requests/minute per model) again.
// The server only ever sends audio its voice guard has verified as Ayesha's
// voice; when it can't (status 422/503) she stays silent rather than risk another voice.
const voice = new Map();   // text -> { chunks: Int16Array[], done: Promise }

function voiceFor(text, background = false, persist = FIXED.has(text)) {
  if (voice.has(text)) return voice.get(text);
  const entry = { chunks: [], listeners: new Set(), samples: 0, finished: false };
  entry.done = (async () => {
    const r = await fetch('/api/speak', { method: 'POST', body: JSON.stringify({ text, persist, background }) });
    if (!r.ok) throw Object.assign(new Error('voice ' + r.status), { status: r.status });
    const reader = r.body.getReader();
    let carry = null;                                 // odd byte split across network chunks
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let bytes = value;
      if (carry) { bytes = new Uint8Array(carry.length + value.length); bytes.set(carry); bytes.set(value, carry.length); carry = null; }
      if (bytes.length % 2) { carry = bytes.slice(-1); bytes = bytes.slice(0, -1); }
      const pcm = new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
      entry.chunks.push(pcm);
      entry.samples += pcm.length;
      entry.listeners.forEach(fn => fn(pcm));
    }
    entry.finished = true;
    entry.listeners.forEach(fn => fn(null));          // "no more audio" (wakes anyone waiting)
  })();
  entry.done.catch(() => voice.delete(text));         // allow a retry later
  voice.set(text, entry);
  return entry;
}

// Speak one sentence: plays whatever is already synthesised, then streams the rest.
// A sentence still being generated first waits for a small head start of
// audio, so playback never catches up with generation and stalls mid-word.
const PREBUFFER_SAMPLES = 24000 * 0.8;               // 0.8 s at 24 kHz

function headStart(entry) {
  if (entry.finished || entry.samples >= PREBUFFER_SAMPLES) return Promise.resolve();
  return new Promise(resolve => {
    const check = () => { if (entry.finished || entry.samples >= PREBUFFER_SAMPLES) { entry.listeners.delete(check); resolve(); } };
    entry.listeners.add(check);
    entry.done.catch(() => { entry.listeners.delete(check); resolve(); });
  });
}

async function speakText(text, gen) {
  const out = pcm => { if (pcm && gen === speechGen) play(pcm); };   // silently drop if cancelled
  for (let attempt = 0; attempt < 2; attempt++) {
    const entry = voiceFor(text);
    await headStart(entry);
    if (gen !== speechGen) return;
    entry.chunks.forEach(out);
    entry.listeners.add(out);
    try { return await entry.done; }
    catch (e) { if (attempt || e.status === 422) throw e; }   // e.g. a background fetch was refused: retry as a live request
    finally { entry.listeners.delete(out); }
  }
}

// Say something: one chat bubble, spoken as ONE clip. Short bits like
// "Thank you." are never voiced alone: a second of speech is too little for
// the voice guard to prove it is Ayesha's voice. A clip made only of
// standard sentences is saved on the server's disk once it passes the check.
const spoken = parts => parts.join(' ');
async function say(...parts) {
  parts = parts.map(p => String(p || '').trim()).filter(Boolean);
  if (!parts.length) return;
  const text = spoken(parts);
  bubble('ay-agent', text);
  voiceFor(text, false, parts.every(p => FIXED.has(p)));
  const gen = speechGen;
  try { await speakText(text, gen); } catch (e) { console.warn('[ayesha] voice failed', e); }
  if (gen === speechGen && bey.active) beyFlush();      // end of this sentence for the avatar
}

// Wait until she has finished talking (used before listening again).
const doneSpeaking = () => new Promise(r => { const t = setInterval(() => { if (!speaking()) { clearInterval(t); r(); } }, 60); });

/* ===================== What Ayesha says ===================== */
// Every sentence exists in English and in Roman Urdu (Urdu written in English
// letters: the voice pronounces it correctly and the chat shows the same text).
// She speaks whichever language the customer last spoke in (conv.lang).
const TEXT = {
  en: {
    greeting: "Hello, I'm Ayesha from UBL. I'll fill in this form for you as we talk. You can speak to me in English or Urdu.",
    acks: ['Thank you.', 'Great.', 'Got it.', 'Perfect.'],
    great: 'Great.',
    sure: 'Sure.',
    noProblem: 'No problem.',
    sorryAbout: 'Sorry about that.',
    didntCatch: "Sorry, I didn't catch that.",
    problem: 'Sorry, I had a problem there. Could you say that again?',
    helpHere: "I'm here to help you open your account.",
    whichDetail: 'Which detail would you like to change?',
    noProblemWhichDetail: 'No problem. Which detail would you like to change?',
    noPhoto: "I can't see the photo yet. Please click the highlighted box and choose a photo.",
    tickTerms: 'Please tick the terms and conditions box and press Submit Application when you are ready.',
    checkField: 'Please check the highlighted field on screen.',
    final: 'Everything is filled in. Please review your application, tick the terms and conditions box, and press Submit Application.',
    submitted: 'Your application has been submitted. Thank you for choosing UBL!',
    standby: "No problem, take your time. I'm right here if you'd like any help.",
    resume: "Sure, let's continue from here.",
    askAgain: 'Of course, let me ask that again.',
    review: (section, list) => `Before we move on, let me confirm your ${section.toLowerCase()}: ${list}. Is everything correct?`,
    ask: label => `Please tell me your ${label.toLowerCase()}.`,
    err: {
      cnic: "Sorry, a CNIC number has 13 digits and I didn't get all of them.",
      tel: 'Sorry, a mobile number should be 11 digits starting with zero three.',
      date: "Sorry, I didn't catch a valid date.",
      email: "Sorry, that doesn't sound like a complete email address.",
      option: "Sorry, that isn't one of the options."
    },
    q: {
      banking: 'Would you like Ameen, which is Islamic Shariah-compliant banking, or Conventional banking?',
      debitcard: 'Which debit card would you like: UBL Silver, UBL Gold, or UBL Platinum?',
      chequebook: 'Would you like a cheque book with this account?',
      branchCity: 'In which city would you like your branch?',
      branchName: 'Which branch would you prefer? You can see the options on screen, for example Gulberg or Model Town.',
      fullName: 'What is your full name, as it appears on your identity card?',
      cnic: 'What is your 13-digit identity card number?',
      cnicIssue: 'When was your identity card issued?',
      cnicExpiry: 'And when does it expire? If it has no expiry date, just say so.',
      dob: 'What is your date of birth?',
      fatherName: "What is your father's or husband's name?",
      motherName: "What is your mother's maiden name?",
      gender: 'What is your gender?',
      marital: 'What is your marital status: single, married, or other?',
      placeOfBirth: 'Where were you born?',
      nationality: 'What is your nationality: Pakistani, dual national, or other?',
      mobile: 'What is your mobile number?',
      email: 'What is your email address?',
      address: 'What is your residential address?',
      city: 'Which city do you live in?',
      idFront: "Please click the highlighted box and upload a clear photo of the front of your identity card. Tell me when you're done.",
      idBack: "Now please upload a photo of the back of your identity card. Tell me when you're done.",
      selfie: "Finally, please take a live selfie using the highlighted box. Tell me when you're done.",
      occupation: 'What is your occupation? For example salaried, self-employed, business owner, freelancer, or student.',
      employer: 'What is the name of your employer or business? You can say skip if it does not apply.',
      purpose: 'What will this account mainly be used for: salary, savings, business, freelance income, remittances, or something else?',
      income: 'Roughly how much money do you expect in this account each month: up to 50 thousand, 50 thousand to 2 lakh, 2 to 5 lakh, or above 5 lakh rupees?',
      kinName: 'Who would you like to nominate as your next of kin? Please tell me their name.',
      kinRelation: 'What is your relationship with them?',
      currency: 'Which currency would you like for the account: Pakistani rupees, US dollars, pounds, or euros?',
      smsAlerts: 'Would you like SMS and email alerts for your transactions?',
      estatement: 'Would you like monthly e-statements by email?',
      source: 'Lastly, how did you hear about UBL?'
    }
  },
  ur: {
    greeting: "Assalam o Alaikum, main Ayesha hoon, UBL se. Main baat karte hue aap ka form bhar doongi. Aap mujh se Urdu ya English mein baat kar sakte hain.",
    acks: ['Shukriya.', 'Bohat acha.', 'Theek hai.', 'Ji, samajh gayi.'],
    great: 'Bohat acha.',
    sure: 'Ji zaroor.',
    noProblem: 'Koi baat nahi.',
    sorryAbout: 'Maazrat chahti hoon.',
    didntCatch: 'Maaf kijiye, main samajh nahi saki.',
    problem: 'Maaf kijiye, kuch masla ho gaya. Kya aap dobara keh sakte hain?',
    helpHere: 'Main aap ka account kholne mein madad ke liye yahan hoon.',
    whichDetail: 'Aap kaun si detail tabdeel karna chahenge?',
    noProblemWhichDetail: 'Koi baat nahi. Aap kaun si detail tabdeel karna chahenge?',
    noPhoto: 'Mujhe abhi tasveer nazar nahi aa rahi. Meharbani kar ke highlighted box par click kar ke tasveer chunein.',
    tickTerms: 'Jab aap tayyar hon, to terms and conditions ka box tick kar ke Submit Application dabayein.',
    checkField: 'Meharbani kar ke screen par highlighted field check kar lein.',
    final: 'Sab kuch bhar gaya hai. Meharbani kar ke apni application dekh lein, terms and conditions ka box tick karein, aur Submit Application dabayein.',
    submitted: 'Aap ki application submit ho gayi hai. UBL chunne ka bohat shukriya!',
    standby: 'Koi baat nahi, aaram se bharein. Agar madad chahiye ho to main yahin hoon.',
    resume: 'Ji zaroor, yahan se aage barhte hain.',
    askAgain: 'Ji zaroor, main dobara poochti hoon.',
    review: (section, list) => `Aage barhne se pehle, main aap ki ${section} ki details confirm kar leti hoon: ${list}. Kya sab theek hai?`,
    ask: label => `Meharbani kar ke apna ${label} bata dijiye.`,
    err: {
      cnic: 'Maaf kijiye, CNIC number 13 digits ka hota hai, aur mujhe saare digits nahi mile.',
      tel: 'Maaf kijiye, mobile number 11 digits ka hona chahiye, jo zero teen se shuru ho.',
      date: 'Maaf kijiye, mujhe sahi tareekh samajh nahi aayi.',
      email: 'Maaf kijiye, yeh poora email address nahi lag raha.',
      option: 'Maaf kijiye, yeh options mein se nahi hai.'
    },
    q: {
      banking: 'Aap ko Ameen, yaani Islami Shariah ke mutabiq banking chahiye, ya Conventional banking?',
      debitcard: 'Aap kaun sa debit card lena chahenge: UBL Silver, UBL Gold, ya UBL Platinum?',
      chequebook: 'Kya aap ko is account ke saath cheque book chahiye?',
      branchCity: 'Aap kis shehar mein apni branch chahte hain?',
      branchName: 'Aap kaun si branch pasand karenge? Options screen par hain, jaise Gulberg ya Model Town.',
      fullName: 'Aap ka poora naam kya hai, jaisa aap ke shanakhti card par likha hai?',
      cnic: 'Aap ka 13 digit ka CNIC number kya hai?',
      cnicIssue: 'Aap ka shanakhti card kis tareekh ko issue hua tha?',
      cnicExpiry: 'Aur yeh kab expire hoga? Agar is ki koi expiry date nahi hai, to bata dijiye.',
      dob: 'Aap ki date of birth kya hai?',
      fatherName: 'Aap ke walid ya shohar ka naam kya hai?',
      motherName: 'Aap ki walida ka shaadi se pehle ka naam kya hai?',
      gender: 'Aap ki gender kya hai: male, female, ya other?',
      marital: 'Aap ki marital status kya hai: single, married, ya other?',
      placeOfBirth: 'Aap kahan paida hue thay?',
      nationality: 'Aap ki nationality kya hai: Pakistani, dual national, ya other?',
      mobile: 'Aap ka mobile number kya hai?',
      email: 'Aap ka email address kya hai?',
      address: 'Aap ke ghar ka pata kya hai?',
      city: 'Aap kis shehar mein rehte hain?',
      idFront: 'Meharbani kar ke highlighted box par click karein aur apne shanakhti card ke saamne wale hisse ki saaf tasveer upload karein. Ho jaye to mujhe bata dijiye.',
      idBack: 'Ab apne shanakhti card ki pichli taraf ki tasveer upload karein. Ho jaye to bata dijiye.',
      selfie: 'Aakhir mein, highlighted box se ek live selfie lein. Ho jaye to bata dijiye.',
      occupation: 'Aap kya kaam karte hain? Jaise salaried, self-employed, business owner, freelancer, ya student.',
      employer: 'Aap ke employer ya business ka naam kya hai? Agar yeh laagu nahi hota, to skip keh dein.',
      purpose: 'Yeh account zyada tar kis liye istemal hoga: salary, savings, business, freelance income, remittances, ya kuch aur?',
      income: 'Har mahine is account mein taqreeban kitni raqam aayegi: 50 hazaar tak, 50 hazaar se 2 lakh, 2 se 5 lakh, ya 5 lakh se zyada?',
      kinName: 'Aap kisay apna next of kin nominate karna chahenge? Un ka naam bata dijiye.',
      kinRelation: 'Un se aap ka kya rishta hai?',
      currency: 'Aap ko account kis currency mein chahiye: Pakistani rupay, US dollar, pound, ya euro?',
      smsAlerts: 'Kya aap ko transactions ke liye SMS aur email alerts chahiye?',
      estatement: 'Kya aap ko har mahine email par e-statement chahiye?',
      source: 'Aakhri sawaal: aap ko UBL ke baare mein kahan se pata chala?'
    }
  }
};
const T = () => TEXT[conv.lang] || TEXT.en;           // sentences in the language she is speaking now
// "Thank you." etc. before the next question. Each question always gets the
// same one (chosen from the question's text), so "ack + question" is a fixed
// sentence: generated once, voice-checked, then played from the server's disk.
const ACK = Symbol('ack');
const ack = () => ACK;
const ackFor = (q, t = T()) => { const a = t.acks; let h = 0; for (const c of q) h = (h * 31 + c.charCodeAt(0)) >>> 0; return a[h % a.length]; };
const question = f => T().q[f.key] || T().ask(f.label);

// Read-backs are written by code, so spelling is always quick and exact.
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const spellWord = w => w.toUpperCase().replace(/[^A-Z0-9]/g, '').split('').join('-');
const digits = s => s.split('').join(' ');
const DATE_UR = { dob: 'Aap ki date of birth', cnicIssue: 'Aap ke card ki issue date', cnicExpiry: 'Aap ke card ki expiry date' };
function readBack(p) {
  const ur = conv.lang === 'ur', v = p.display;
  const ok = ur ? 'Kya yeh sahi hai?' : 'Is that correct?';
  switch (p.kind) {
    case 'cnic': {
      const n = `${digits(v.slice(0, 5))}, ${digits(v.slice(5, 12))}, ${v.slice(12)}`;
      return ur ? `Aap ka CNIC number hai ${n}. ${ok}` : `Your CNIC number is ${n}. ${ok}`;
    }
    case 'tel': {
      const d = v.replace(/\D/g, ''), n = `${digits(d.slice(0, 4))}, ${digits(d.slice(4))}`;
      return ur ? `Aap ka mobile number hai ${n}. ${ok}` : `Your mobile number is ${n}. ${ok}`;
    }
    case 'date': {
      if (p.none) return ur ? `Yaani aap ke shanakhti card ki koi expiry date nahi hai. ${ok}` : `So your identity card has no expiry date. ${ok}`;
      const [d, m, y] = v.split('/'), when = `${+d} ${MONTHS[m - 1]} ${y}`;
      return ur ? `${DATE_UR[p.key] || p.label} ${when} hai. ${ok}` : `${p.label} is ${when}. ${ok}`;
    }
    case 'email': {
      const [local, domain = ''] = v.split('@');
      const spoken = `${local.split('.').map(spellWord).join(' dot ')} at ${domain.replace(/\./g, ' dot ')}`;
      return ur ? `Aap ka email hai ${spoken}. ${ok}` : `Your email is ${spoken}. ${ok}`;
    }
    default:
      if (['fullName', 'fatherName', 'motherName', 'kinName'].includes(p.key)) {
        const spelled = v.split(/\s+/).map(spellWord).join(', ');
        return ur ? `${v}, spelling ${spelled}. ${ok}` : `${v}, spelled ${spelled}. ${ok}`;
      }
      return ur ? `Aap ka ${p.label} maine yeh likha hai: ${v}. ${ok}` : `I have your ${p.label.toLowerCase()} as: ${v}. ${ok}`;
  }
}

function friendlyError(f, err) {
  const e = T().err;
  return e[f.kind] || (/not an option/.test(err) ? e.option : T().didntCatch);
}

/* ================== Understanding the customer ================== */
const NLU_SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', enum: ['answer', 'yes', 'no', 'question', 'change', 'back', 'repeat', 'skip', 'done', 'resume', 'other'] },
    values: { type: 'ARRAY', items: { type: 'OBJECT', properties: { key: { type: 'STRING' }, value: { type: 'STRING' } }, required: ['key', 'value'] } },
    target: { type: 'STRING' },
    reply: { type: 'STRING' },
    language: { type: 'STRING', enum: ['en', 'ur', 'neutral'] }
  },
  required: ['intent', 'language']
};
const NLU_SYSTEM = `You interpret what a bank customer just said while Ayesha, UBL's assistant, fills an account opening form with them. The customer speaks English or Urdu (often Roman Urdu, sometimes mixed with English words; the text may also arrive in Hindi/Devanagari script). The customer may make speech-recognition errors; use the screen's options to infer what they meant. Return JSON only.
language: "ur" if the customer is speaking Urdu/Roman Urdu (even mixed with English words, e.g. "mujhe Gold card chahiye"), "en" if speaking English sentences, "neutral" if the answer is only a name, number, date, email or an option word with no language clue (e.g. "Gold", "Lahore", "Zaryab Amin").
Write every reply in the customer's language: English, or Roman Urdu (Urdu in English letters, never Urdu or Hindi script) when language is "ur". Ayesha is female: in Urdu use feminine forms for her ("main madad kar sakti hoon").
intent:
- "answer": they gave value(s) for field(s) on the CURRENT screen. Put them in values with the field key from the screen. Normalise: option fields use the option text exactly as listed; dates DD/MM/YYYY; CNIC 13 digits; mobile 03XXXXXXXXX; email lowercase; names capitalised as spelled. A "no expiry" answer for an expiry date is value "none".
- "yes" / "no": a reply to Ayesha's yes/no question (confirmation, section check, cheque book, alerts...). If they say no AND give a corrected value, use "answer" with the new value.
- "question": they ask something. reply = a short, friendly, factual answer (1-2 full sentences of at least 8 words, no markdown), using the screen info and general banking knowledge. For fees or rates, say they are in UBL's Schedule of Charges. Never ask for PINs, passwords or OTPs.
- "change": they want to change an earlier answer. target = that field's key from EARLIER ANSWERS; values = the new value if they gave it (same key).
- "back": go to the previous question. "repeat": they want the question again or didn't hear. "skip": they want to skip an optional field. "done": they finished an action (e.g. uploaded a photo).
- "resume": they want Ayesha to help again / fill the form for them / continue (e.g. "help me", "can you fill the rest", "let's continue").
- "other": greetings, small talk, unclear speech. reply = one short sentence.
Urdu words to recognise: haan/ji/jee/bilkul/theek/sahi = yes; nahi/nahin/galat = no; madad = help; dobara = again; aage = next.`;

async function understand(text) {
  const st = Form.getState();
  const context = conv.mode === 'confirm' ? `Ayesha is waiting for a yes/no: is ${conv.pending.label} "${conv.pending.display}" correct?`
    : conv.mode === 'review' ? 'Ayesha read back the section and asked if everything is correct (yes/no).'
    : conv.mode === 'upload' ? 'Ayesha asked them to upload a photo and say when done.'
    : conv.mode === 'standby' ? 'The customer is filling the form by themselves; Ayesha is standing by until they ask for help.' : '';
  const prompt = [
    `CURRENT SCREEN: ${JSON.stringify({ section: st.section, question: st.question, fields: Form.screenFields() })}`,
    `EARLIER ANSWERS: ${JSON.stringify(Form.answered().map(a => ({ key: a.key, label: a.label })))}`,
    `AYESHA JUST SAID: "${conv.lastSaid}"`,
    context,
    `CUSTOMER SAID: "${text}"`
  ].filter(Boolean).join('\n');
  const r = await fetch('/api/understand', { method: 'POST', body: JSON.stringify({ system: NLU_SYSTEM, prompt, schema: NLU_SCHEMA }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'understand failed');
  return j;
}

/* ===================== Conversation controller ===================== */
// mode: 'ask' (waiting for the field on screen), 'confirm' (read-back
// yes/no), 'review' (section summary yes/no), 'upload', 'final'.
// mode 'standby': the customer took over and is filling the form by hand.
const conv = {
  active: false, busy: false, mode: 'ask', pending: null, queue: [], skipped: new Set(),
  lastSaid: '', lastQuestion: '',
  reask: null,      // recipe for the open question (see ask())
  lang: 'en',       // "en" or "ur" (Roman Urdu): follows the language the customer speaks
  askedKey: null,   // the field she is currently asking about
  turnId: 0,        // bumped when the customer takes over, to drop in-flight replies
  waiting: null     // a message typed while she was busy
};

// Say something. The last part is remembered as the open question, so after
// answering a side question she can re-ask it (without "Great." etc.).
// Ask an open question. makeQ builds it in the current language, so when she
// re-asks it later (after a side question) it comes out in the language in use then.
function ask(prefix, makeQ) {
  conv.reask = makeQ;
  const q = makeQ();
  return talk(prefix === ACK ? ackFor(q) : prefix, q);
}
const reask = () => (conv.reask ? conv.reask() : conv.lastQuestion);

async function talk(...parts) {
  parts = parts.filter(Boolean);
  conv.lastSaid = parts.join(' ');
  if (parts.length) conv.lastQuestion = parts[parts.length - 1];
  await say(...parts);
}

// The first empty field on the screen (optional ones can be skipped).
const nextField = () => Form.screenFields().find(f => !f.value && !conv.skipped.has(f.key));

// Ask whatever the screen needs next; moves on when the screen is complete.
async function askNext(prefix = '', reviewed = false) {
  conv.askedKey = null;
  for (let guard = 0; guard < 5; guard++) {
    const type = Form.screenType();
    if (type === 'submitted') { conv.mode = 'final'; return ask(prefix, () => T().submitted); }
    if (type === 'intro') { Form.next(); continue; }
    if (type === 'review') { conv.mode = 'final'; Form.highlight('terms'); return ask(prefix, () => T().final); }
    const f = nextField();
    if (f) {
      conv.mode = f.kind === 'upload' ? 'upload' : 'ask';
      conv.askedKey = f.key;
      Form.highlight(f.key);
      return ask(prefix, () => question(f));
    }
    const r = Form.next(reviewed);
    reviewed = false;
    if (r.reviewNeeded) {
      conv.mode = 'review';
      // Spoken summary: "Debit Card, UBL Silver; …" without branch codes like "- 0233".
      const list = r.summary.map(s => s.replace(/ - \d+$/, '').replace(': ', ', ')).join('; ');
      return ask(prefix, () => T().review(r.section, list));
    }
    if (r.error) return ask(prefix, () => T().checkField);
  }
}

// Uploads happen by clicking, so carry on as soon as the photo is chosen.
setInterval(() => {
  if (conv.active && !conv.busy && conv.mode === 'upload' && nextField()?.kind !== 'upload') {
    conv.busy = true;
    askNext(ack()).finally(async () => { await doneSpeaking(); becomeFree(); });
  }
}, 500);

/* ============ The customer filling the form by hand ============ */
// Real clicks/typing inside the form (Ayesha's own filling fires no browser
// events, so only the customer's actions are seen here). Once they pause:
//  - if they just clicked the answer to her question → carry on guiding;
//  - otherwise (typed themselves, moved to another step…) → stand by, and
//    pick up later from whatever the screen shows when they ask for help.
const MANUAL = '.opt, .pcard, .choice, #nextBtn, #backBtn, #beginBtn, [data-edit], input, textarea';
const manual = { timer: 0, start: null };

function onManualActivity(e) {
  if (!conv.active || !e.isTrusted || ['standby', 'upload', 'final'].includes(conv.mode)) return;
  const t = e.target;
  if (!t.closest || !t.closest('#screen') || !t.closest(MANUAL)) return;
  if (!manual.start) manual.start = { pos: Form.position(), asked: conv.askedKey, mode: conv.mode, typed: false };
  if (e.type === 'input') manual.start.typed = true;
  clearTimeout(manual.timer);
  manual.timer = setTimeout(manualSettled, 1200);
}
['click', 'input'].forEach(type => document.addEventListener(type, onManualActivity, true));

async function manualSettled() {
  const s = manual.start;
  manual.start = null;
  if (!s || !conv.active || conv.mode === 'standby') return;
  const asked = s.asked && Form.screenFields().find(f => f.key === s.asked);
  const answeredHerQuestion = !conv.busy && s.mode === 'ask' && !s.typed && s.pos === Form.position() && !!asked?.value;
  conv.turnId++;                               // drop any reply still being prepared
  stopAudio();
  clearTimeout(stt.commitTimer);
  said.reset();
  conv.busy = true;
  try {
    if (answeredHerQuestion) await askNext(ack());
    else {
      conv.mode = 'standby';
      conv.pending = null;
      conv.queue = [];
      conv.askedKey = null;
      Form.highlight('');
      await talk(T().standby);
    }
  } finally {
    await doneSpeaking();
    becomeFree();
  }
}

// Check and use values for the current screen: options are filled at once,
// typed fields are queued for a read-back.
async function useValues(values) {
  const onScreen = new Set(Form.screenFields().map(f => f.key));
  const fill = [];
  conv.queue = [];
  for (const { key, value } of values || []) {
    if (!onScreen.has(key)) continue;
    const info = Form.fieldInfo(key);
    const c = Form.checkValue(key, value);
    if (c.error) { Form.highlight(key); return talk(friendlyError(info, c.error), question(info)); }
    if (info.typed) conv.queue.push({ ...info, raw: c.none ? 'none' : value, display: c.display, none: c.none });
    else fill.push({ key, value });
  }
  if (fill.length) Form.fill(fill);
  if (conv.queue.length) return confirmNext();
  if (!fill.length) return talk(T().didntCatch, question(nextField() || { key: '', label: 'answer' }));
  return askNext(ack());
}

async function confirmNext() {
  conv.pending = conv.queue.shift();
  conv.mode = 'confirm';
  Form.highlight(conv.pending.key);
  const p = conv.pending;
  return ask('', () => readBack(p));
}

async function changeField(target, values) {
  const key = Form.fieldInfo(target) ? target : Form.answered().find(a => a.label.toLowerCase().includes(String(target || '').toLowerCase()))?.key;
  if (!key) return talk(T().whichDetail);
  Form.goTo(key);
  const v = (values || []).find(x => x.key === key);
  if (v) return useValues([v]);
  conv.mode = 'ask';
  return talk(T().sure, question(Form.fieldInfo(key)));
}

async function respond(r, text) {
  // Standing by: only come back when asked; answer questions; stay quiet otherwise.
  if (conv.mode === 'standby') {
    if (r.intent === 'resume') return askNext(T().resume);
    if (r.intent === 'answer' && r.values?.length) { conv.mode = 'ask'; return useValues(r.values); }
    if (r.intent === 'question') return talk(r.reply);
    return;
  }
  const f = nextField();
  // Yes/no questions on screen (cheque book, alerts…) arrive as yes/no.
  if (conv.mode === 'ask' && (r.intent === 'yes' || r.intent === 'no') && f && f.options?.includes('Yes')) {
    return useValues([{ key: f.key, value: r.intent === 'yes' ? 'Yes' : 'No' }]);
  }
  switch (r.intent) {
    case 'question': case 'other':
      return talk(r.reply || T().helpHere, conv.mode === 'final' ? '' : reask());
    case 'repeat': return talk(T().askAgain, reask());
    case 'change': return changeField(r.target, r.values);
    case 'back': conv.mode = 'ask'; Form.back(); return askNext();
  }
  switch (conv.mode) {
    case 'confirm':
      if (r.intent === 'yes') {
        const p = conv.pending;
        const res = Form.fill([{ key: p.key, value: p.raw, confirmed: true }]);
        conv.pending = null;
        if (res.errors.length) return talk(friendlyError(p, res.errors[0]), question(p));
        if (conv.queue.length) return confirmNext();
        return askNext(ack());
      }
      if (r.intent === 'answer' && r.values?.length) return useValues(r.values);
      conv.mode = 'ask';
      return talk(T().sorryAbout, question(conv.pending));
    case 'review':
      if (r.intent === 'yes') { conv.mode = 'ask'; return askNext(T().great, true); }
      return talk(T().noProblemWhichDetail);
    case 'upload':
      if (f && f.kind === 'upload') return talk(T().noPhoto);
      return askNext(ack());
    case 'final':
      return talk(T().tickTerms);
    default:
      if (r.intent === 'skip' && f && !f.required) { conv.skipped.add(f.key); return askNext(T().noProblem); }
      if (r.intent === 'answer') return useValues(r.values);
      return talk(T().didntCatch, reask());
  }
}

// Clear-cut answers are understood instantly in code (no model call):
// a short yes/no, or exactly one of the options on screen. Anything that
// looks like a question or is ambiguous goes to the model.
const words = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
function quickUnderstand(text) {
  const w = words(text);
  if (conv.mode === 'standby') {
    if (/\?/.test(text) || w.length > 6) return null;
    if (w.some(t => /^(continue|resume|help|fill|assist)$/.test(t))) return { intent: 'resume', language: 'en' };
    if (w.some(t => /^(madad|aage|bharein|bhar|bhariye)$/.test(t))) return { intent: 'resume', language: 'ur' };
    return null;
  }
  if (!w.length || /\?/.test(text) || /^(what|how|why|which|can|could|is|are|do|does|tell|explain|kya|kaise|kyun|kaun|kab|kahan|batayein|bataiye)$/.test(w[0])) return null;
  if (w.length <= 5) {
    if (/^(yes|yeah|yep|yup|sure|correct|right|ok|okay|absolutely|exactly)$/.test(w[0]) && !w.includes('not')) return { intent: 'yes', language: 'en' };
    if (/^(haan|han|haa|ji|jee|jii|bilkul|theek|thik|sahi|acha|achha)$/.test(w[0]) && !w.some(t => /^(nahi|nahin|nai)$/.test(t))) return { intent: 'yes', language: 'ur' };
    if (/^(no|nope|nah|wrong|incorrect)$/.test(w[0]) && w.length <= 2) return { intent: 'no', language: 'en' };
    if (/^(nahi|nahin|nai|galat|ghalat)$/.test(w[0]) && w.length <= 3) return { intent: 'no', language: 'ur' };
  }
  const f = conv.mode === 'ask' ? nextField() : null;
  if (!f || !f.options || f.options.includes('Yes') || w.length > 6) return null;
  const said = new Set(w);
  const hits = f.options.filter(o => words(o).filter(t => t.length > 2 && t !== 'ubl').some(t => said.has(t)));
  return hits.length === 1 ? { intent: 'answer', values: [{ key: f.key, value: hits[0] }], language: languageOf(w) } : null;
}

// Language of a short answer from its little words: "mujhe Gold chahiye" is
// Urdu, "I want Gold please" is English, a bare "Gold" is neutral.
const UR_WORDS = /^(mujhe|mujhay|mera|meri|mere|hai|hain|ka|ki|ke|ko|chahiye|chahie|wala|wali|wale|lena|leni|dena|karna|karein|hoon|hun|aap|aapka|yeh|woh|aur|bhi|se|mein|liye|haan|ji|nahi|nahin|theek|bilkul)$/;
const EN_WORDS = /^(i|i'd|want|would|like|the|please|my|is|it|a|an|one|take|choose|prefer|go|with|for|and)$/;
function languageOf(w) {
  const ur = w.filter(t => UR_WORDS.test(t)).length, en = w.filter(t => EN_WORDS.test(t)).length;
  return ur > en ? 'ur' : en > ur ? 'en' : 'neutral';
}

// One customer turn (spoken or typed) → one reply.
async function handle(text) {
  text = clean(text);
  if (!conv.active || !/[a-z0-9]/i.test(text)) return;
  if (conv.busy) { conv.waiting = text; return; }   // typed while she is busy: answer it next
  conv.busy = true;
  const turn = conv.turnId;
  try {
    const r = quickUnderstand(text) || await understand(text);
    if (turn !== conv.turnId) return;            // the customer took over meanwhile
    if (r.language === 'en' || r.language === 'ur') conv.lang = r.language;
    await respond(r, text);
  } catch (e) {
    console.error('[ayesha]', e);
    await say(T().problem);
  } finally {
    await doneSpeaking();
    becomeFree();
  }
}

// She is free to listen again; answer anything typed while she was busy.
function becomeFree() {
  conv.busy = false;
  const t = conv.waiting;
  conv.waiting = null;
  if (t) handle(t);
}

// Synthesise all fixed sentences in the background so they play instantly.
// Standard sentences: safe to save on disk (no personal data).
const fixedTexts = lang => {
  const t = TEXT[lang];
  return [t.greeting, ...t.acks, t.great, t.sure, t.noProblem, t.sorryAbout, t.didntCatch, t.problem, t.helpHere, t.whichDetail,
    t.noProblemWhichDetail, t.noPhoto, t.tickTerms, t.checkField, t.final, t.submitted, t.standby, t.resume, t.askAgain,
    ...Object.values(t.err), ...Object.values(t.q)];
};
const FIXED = new Set([...fixedTexts('en'), ...fixedTexts('ur')]);

// The clips she says most, exactly as say() voices them: each question with
// its acknowledgement, the question alone (first on a screen), and the
// stand-alone sentences.
const commonClips = lang => {
  const t = TEXT[lang], qs = Object.values(t.q);
  return [t.greeting, ...qs.flatMap(q => [spoken([ackFor(q, t), q]), q]), t.standby, t.final, t.submitted, t.problem,
    t.noProblemWhichDetail, t.whichDetail, t.noPhoto, t.tickTerms, t.checkField, spoken([t.great, t.final])];
};

// Warm up the common clips one at a time, as background work: the server only
// spends spare quota on this, so it can never delay a reply. Once saved on
// disk this costs nothing.
async function prefetchVoice() {
  // The language she is speaking first, then the other one.
  for (const t of new Set([...commonClips(conv.lang), ...commonClips(conv.lang === 'en' ? 'ur' : 'en')])) {
    if (!conv.active) return;
    try { await voiceFor(t, true, true).done; } catch { /* busy: fetched live when needed */ }
  }
}

/* ========================= Microphone ========================= */
const mic = { on: false, stream: null, src: null, node: null, workletReady: false };

async function micOn() {
  if (mic.on) return;
  try {
    mic.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    note('Microphone access was blocked. Allow it in the address bar, or type your messages.');
    return;
  }
  if (!mic.workletReady) { await audio().audioWorklet.addModule('assets/agent/mic-worklet.js'); mic.workletReady = true; }
  mic.src = audio().createMediaStreamSource(mic.stream);
  mic.node = new AudioWorkletNode(audio(), 'mic-capture');
  // 16 kHz PCM chunks, only while Ayesha is silent and not busy replying.
  mic.node.port.onmessage = ({ data }) => {
    if (!conv.active || conv.busy || speaking()) return;
    stt.send({ realtimeInput: { audio: { data: toBase64(data.pcm), mimeType: 'audio/pcm;rate=16000' } } });
  };
  mic.src.connect(mic.node);
  mic.on = true;
  ui.mic.classList.add('on');
  ui.mic.innerHTML = ICON.mic;
}

function micOff() {
  if (!mic.on) return;
  mic.stream.getTracks().forEach(t => t.stop());
  try { mic.src.disconnect(); mic.node.disconnect(); } catch { }
  mic.on = false;
  ui.mic.classList.remove('on');
  ui.mic.innerHTML = ICON.micOff;
}

function toBase64(buffer) {
  const u8 = new Uint8Array(buffer); let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

/* ===================== Transcriber (hearing) ===================== */
// gemini-3.5-transcribe-live turns the customer's speech into text, biased
// towards the form's vocabulary. When a sentence is final and they have
// paused briefly, it becomes one customer turn.
const stt = {
  ws: null, live: false, commitTimer: 0,
  send(msg) { if (this.live && this.ws?.readyState === 1) this.ws.send(JSON.stringify(msg)); }
};

async function sttConnect() {
  if (stt.ws || !conv.active) return;
  let cfg;
  try { cfg = await (await fetch('/api/token', { method: 'POST' })).json(); } catch { return note('Could not reach the speech service. Is "node server.js" running?'); }
  if (!cfg.token || !conv.active) return;
  const ws = stt.ws = new WebSocket(`${WS_URL}?access_token=${encodeURIComponent(cfg.token)}`);
  ws.onopen = () => ws.send(JSON.stringify({
    setup: {
      model: 'models/' + cfg.sttModel,
      generationConfig: { responseModalities: ['TEXT'] },
      // en-PK: Pakistani English, and Urdu speech comes out as Roman Urdu.
      inputAudioTranscription: { languageCodes: ['en-PK'], customVocabulary: Form.vocabulary() },
      // Decide "they stopped talking" after 300 ms of silence instead of ~1 s:
      // final text arrives ~350 ms after speech ends (measured).
      realtimeInputConfig: { automaticActivityDetection: { silenceDurationMs: 300, endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH' } }
    }
  }));
  ws.onmessage = async ev => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : await ev.data.text());
    if (m.setupComplete) { stt.live = true; return; }
    const sc = m.serverContent;
    if (sc?.interimInputTranscription?.text) { clearTimeout(stt.commitTimer); said.onInterim(sc.interimInputTranscription.text); }
    if (sc?.inputTranscription?.text) {
      said.onFinal(sc.inputTranscription.text);
      clearTimeout(stt.commitTimer);
      stt.commitTimer = setTimeout(commitUtterance, commitDelay());
    }
  };
  // Transcriber sessions last ~10 minutes: reconnect quietly while talking.
  ws.onclose = () => {
    if (stt.ws !== ws) return;
    stt.ws = null;
    stt.live = false;
    setTimeout(sttConnect, 500);
  };
}

// How long to wait after a final transcript before treating it as the whole
// answer. Numbers/dates/emails are often said in groups with pauses, so wait
// longer there; short answers (options, yes/no) go straight through.
function commitDelay() {
  const f = conv.mode === 'ask' ? nextField() : null;
  if (f && ['cnic', 'tel', 'date', 'email', 'textarea'].includes(f.kind)) return 1000;
  if (f && f.kind === 'text') return 600;     // names: "Zaryab … Amin"
  return 200;
}

function commitUtterance() {
  const text = said.text();
  said.reset();
  if (text) handle(text);
}

function sttDisconnect() {
  const ws = stt.ws;
  stt.ws = null;
  stt.live = false;
  clearTimeout(stt.commitTimer);
  ws?.close();
  said.reset();
}

/* ========================= Status chip ========================= */
setInterval(() => {
  if (!conv.active) return;
  const talking = speaking();
  ui.stage.classList.toggle('speaking', talking);
  if (talking) setStatus('speaking', 'Speaking…');
  else if (conv.busy) setStatus('connecting', 'Thinking…');
  else if (!stt.live) setStatus('connecting', 'Connecting…');
  else if (conv.mode === 'standby') setStatus('idle', 'Standing by — say "help me"');
  else setStatus(mic.on ? 'listening' : 'idle', mic.on ? 'Listening…' : 'Mic off — tap the mic or type');
}, 150);

/* ======================= Panel controls ======================= */
async function openPanel() {
  document.body.classList.add('ay-open');
  ui.launcher.classList.add('hidden');
  if (conv.active) return;
  conv.active = true;
  conv.busy = true;                       // don't listen during the greeting
  setStatus('connecting', 'Connecting…');
  const ctx = audio();                    // create/resume audio inside the click (browser rule)
  if (ctx.state !== 'running') ctx.resume().catch(() => { });
  Form.start();                           // press "Let's Begin" so the first question is on screen
  ui.loading.hidden = false;              // her photo + "Connecting to Ayesha…" while the video joins
  const faceOk = await startFace();
  ui.loading.hidden = true;
  if (!faceOk && !bey.disabled) note('Live video is unavailable right now, so Ayesha will continue by voice.');
  prefetchVoice();
  sttConnect();
  await micOn();
  try { await askNext(T().greeting); } finally { await doneSpeaking(); becomeFree(); }
}

function closePanel() {
  conv.active = false;
  conv.busy = false;
  conv.waiting = null;
  sttDisconnect();
  stopAudio();
  stopBey();                              // end the realistic-face session right away (saves minutes)
  micOff();
  Form.highlight('');
  setStatus('idle', 'Offline');
  document.body.classList.remove('ay-open');
  ui.launcher.classList.remove('hidden');
  note('Conversation ended.');
}

function sendText(text) {
  bubble('ay-user', text);
  handle(text);
}

$('ayOpen').onclick = openPanel;
$('ayQuickMic').onclick = openPanel;
$('ayEnd').onclick = closePanel;
ui.mic.onclick = () => (mic.on ? micOff() : micOn());
$('ayForm').onsubmit = e => {
  e.preventDefault();
  const t = ui.text.value.trim();
  ui.text.value = '';
  if (t) sendText(t);
};

// Typing in the launcher card opens the panel and sends the message.
const quick = $('ayQuickText');
$('ayQuick').onsubmit = async e => {
  e.preventDefault();
  const t = quick.value.trim();
  quick.value = '';
  await openPanel();
  if (t) sendText(t);
};
quick.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('ayQuick').requestSubmit(); }
});



