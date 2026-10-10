// Captures the microphone, downsamples to 16 kHz mono and posts Int16 PCM
// chunks of 40 ms (640 samples) — the format Gemini Live expects.
class MicCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / 16000;
    this.pos = 0;
    this.buf = new Int16Array(640);
    this.n = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (; this.pos < ch.length; this.pos += this.step) {
      const s = Math.max(-1, Math.min(1, ch[Math.floor(this.pos)]));
      this.buf[this.n++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.n === this.buf.length) {
        this.port.postMessage({ pcm: this.buf.buffer }, [this.buf.buffer]);
        this.buf = new Int16Array(640);
        this.n = 0;
      }
    }
    this.pos -= ch.length;
    return true;
  }
}
registerProcessor('mic-capture', MicCapture);
