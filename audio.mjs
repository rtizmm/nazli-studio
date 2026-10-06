import { pluckSamples, encodeWav, clamp } from './music.mjs?v=116368222768';
function impulse(context) {
  const length = Math.floor(context.sampleRate * .8), b = context.createBuffer(2, length, context.sampleRate);
  let seed = 1957;
  for (let c = 0; c < 2; c++) { const data = b.getChannelData(c); for (let i = 0; i < length; i++) { seed = (1664525 * seed + 1013904223) >>> 0; data[i] = (seed / 4294967296 * 2 - 1) * (1 - i / length) ** 3; } }
  return b;
}
function chain(context, destination, volume = .65, room = .2) {
  const input = context.createGain(), dry = context.createGain(), wet = context.createGain(), convolver = context.createConvolver(), compressor = context.createDynamicsCompressor(), master = context.createGain();
  convolver.buffer = impulse(context); dry.gain.value = 1; wet.gain.value = room * .8;
  compressor.threshold.value = -17; compressor.knee.value = 18; compressor.ratio.value = 5; compressor.attack.value = .003; compressor.release.value = .2;
  master.gain.value = volume * .72;
  input.connect(dry); dry.connect(compressor); input.connect(convolver); convolver.connect(wet); wet.connect(compressor); compressor.connect(master); master.connect(destination);
  return { input, wet, master, compressor };
}
function voice(context, graph, bank, event, when) {
  const key = `${event.midi}:${event.tone}`;
  if (!bank.has(key)) { const samples = pluckSamples(event.midi, event.tone, context.sampleRate); const buffer = context.createBuffer(1, samples.length, context.sampleRate); buffer.copyToChannel(samples, 0); bank.set(key, buffer); }
  const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain(), pan = context.createStereoPanner();
  source.buffer = bank.get(key); filter.type = 'lowpass'; filter.frequency.value = event.tone === 'steel' ? 6500 : event.tone === 'nylon' ? 3300 : 2100;
  gain.gain.value = event.velocity * .32; pan.pan.value = (event.string - 2.5) * .035;
  source.connect(filter); filter.connect(gain); gain.connect(pan); pan.connect(graph.input); source.start(when);
  return { source, gain, nodes: [source, filter, gain, pan] };
}
export class GuitarAudio {
  constructor() { this.context = null; this.graph = null; this.bank = new Map(); this.voices = new Set(); this.volume = .65; this.room = .2; }
  async ready() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) throw new Error('Bu tarayıcı ses motorunu desteklemiyor. Güncel bir tarayıcıyla tekrar dene.');
    if (!this.context) { this.context = new Audio({ latencyHint: 'interactive' }); this.graph = chain(this.context, this.context.destination, this.volume, this.room); }
    if (this.context.state !== 'running') await this.context.resume();
    if (this.context.state !== 'running') throw new Error('Ses açılamadı. Bir tele yeniden dokun.');
  }
  get time() { return this.context?.currentTime || 0; }
  setVolume(value) { this.volume = clamp(value, 0, 1); if (this.graph) this.graph.master.gain.setTargetAtTime(this.volume * .72, this.time, .02); }
  setRoom(value) { this.room = clamp(value, 0, .6); if (this.graph) this.graph.wet.gain.setTargetAtTime(this.room * .8, this.time, .03); }
  pluck(event, when = this.time, group = 'live') {
    if (!this.context) return;
    if (this.voices.size >= 48) this.stopVoice(this.voices.values().next().value);
    const v = voice(this.context, this.graph, this.bank, event, Math.max(this.time, when)); v.group = group;
    this.voices.add(v);
    v.source.onended = () => { v.nodes.forEach(n => n.disconnect()); this.voices.delete(v); };
    return v;
  }
  stopVoice(v) { if (!v) return; v.gain.gain.setTargetAtTime(0, this.time, .008); try { v.source.stop(this.time + .035); } catch {} this.voices.delete(v); }
  stop(group) { for (const v of [...this.voices]) if (!group || v.group === group) this.stopVoice(v); }
  click(when, accent) {
    const osc = this.context.createOscillator(), gain = this.context.createGain(); osc.frequency.value = accent ? 1200 : 800;
    gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(.1, when + .002); gain.gain.exponentialRampToValueAtTime(.0001, when + .04);
    osc.connect(gain); gain.connect(this.graph.compressor); osc.start(when); osc.stop(when + .045);
    const v = { source: osc, gain, nodes: [osc, gain], group: 'metro' }; this.voices.add(v); osc.onended = () => { v.nodes.forEach(n => n.disconnect()); this.voices.delete(v); };
  }
  async wav(clip) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Offline) throw new Error('Bu tarayıcı WAV indirmeyi desteklemiyor.');
    const context = new Offline(2, Math.ceil((clip.duration + 3.5) * 22050), 22050);
    const graph = chain(context, context.destination, .8, clip.room), bank = new Map();
    for (const event of clip.events) voice(context, graph, bank, event, event.time);
    const buffer = await context.startRendering();
    return new Blob([encodeWav([buffer.getChannelData(0), buffer.getChannelData(1)], buffer.sampleRate)], { type: 'audio/wav' });
  }
}
