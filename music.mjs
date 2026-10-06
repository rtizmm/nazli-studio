export const TUNING = [40, 45, 50, 55, 59, 64];
export const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'e'];
// YAZI ALANI: Akorların Türkçe adını değiştirmek istersen name: yanındaki yazıyı düzenle.
// frets ve key alanları çalmayı kontrol eder; yalnızca isim için bunları değiştirme.
export const CHORDS = {
  Em: { name: 'Mi minör', frets: [0, 2, 2, 0, 0, 0], key: 'q' },
  Am: { name: 'La minör', frets: [null, 0, 2, 2, 1, 0], key: 'w' },
  C: { name: 'Do majör', frets: [null, 3, 2, 0, 1, 0], key: 'e' },
  G: { name: 'Sol majör', frets: [3, 2, 0, 0, 0, 3], key: 'r' },
  D: { name: 'Re majör', frets: [null, null, 0, 2, 3, 2], key: 't' },
  Dm: { name: 'Re minör', frets: [null, null, 0, 2, 3, 1], key: 'y' },
  F: { name: 'Fa majör', frets: [1, 3, 3, 2, 1, 1], key: 'u' },
  A: { name: 'La majör', frets: [null, 0, 2, 2, 2, 0], key: 'i' },
  open: { name: 'Açık teller', frets: [0, 0, 0, 0, 0, 0], key: '' }
};
export const TONES = ['steel', 'nylon', 'warm'];
export const MAX_RECORD_SECONDS = 60;
export const MAX_EVENTS = 1800;
export const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
export const midiFrequency = midi => 440 * 2 ** ((midi - 69) / 12);
export function noteName(midi) {
  return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
}
export function chordNotes(chord) {
  const c = CHORDS[chord] || CHORDS.Em;
  return c.frets.map((f, i) => f === null ? null : TUNING[i] + f);
}
export function strumEvents(chord, direction = 'down', spread = .026) {
  const notes = chordNotes(chord);
  const indexes = direction === 'up' ? [5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5];
  return indexes.filter(i => notes[i] !== null).map((string, j) => ({ string, midi: notes[string], offset: j * spread }));
}
export function rhythmEvents(pattern, step, chord) {
  const notes = chordNotes(chord);
  if (pattern === 'arpeggio') {
    const bass = notes.findIndex(n => n !== null);
    const string = [bass, 3, 2, 1, 5, 3, 2, 1][step % 8];
    return notes[string] === null ? [] : [{ string, midi: notes[string], offset: 0 }];
  }
  const direction = pattern === 'folk' ? ({ 0: 'down', 2: 'down', 3: 'up', 5: 'up', 6: 'down', 7: 'up' })[step % 8] : step % 2 === 0 ? 'down' : null;
  return direction ? strumEvents(chord, direction) : [];
}
export function validClip(raw) {
  if (!raw || !Number.isFinite(raw.duration) || raw.duration < .25 || raw.duration > MAX_RECORD_SECONDS || !Array.isArray(raw.events) || !raw.events.length || raw.events.length > MAX_EVENTS) return null;
  if (!raw.events.every(e => e && Number.isFinite(e.time) && e.time >= 0 && e.time < raw.duration && Number.isInteger(e.midi) && e.midi >= 40 && e.midi <= 76 && Number.isInteger(e.string) && e.string >= 0 && e.string <= 5 && Number.isFinite(e.velocity) && e.velocity > 0 && e.velocity <= 1 && TONES.includes(e.tone))) return null;
  return { duration: raw.duration, events: raw.events.map(e => ({ time: e.time, midi: e.midi, string: e.string, velocity: e.velocity, tone: e.tone })).sort((a, b) => a.time - b.time), room: Number.isFinite(raw.room) ? clamp(raw.room, 0, .6) : .2 };
}
// Fractional-delay Karplus–Strong string. The half-sample low-pass delay is
// compensated in the loop length to keep the intended pitch at each sample rate.
export function pluckSamples(midi, tone, sampleRate, seconds = 3.5) {
  const frequency = midiFrequency(midi);
  const period = sampleRate / frequency - .5;
  const length = Math.ceil(period) + 2;
  const ring = new Float32Array(length);
  const result = new Float32Array(Math.ceil(sampleRate * seconds));
  let seed = ((midi + 1) * 2654435761 + TONES.indexOf(tone) * 1013) >>> 0;
  const random = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
  let mean = 0;
  for (let i = 0; i < length; i++) { ring[i] = random() * 2 - 1; mean += ring[i]; }
  mean /= length;
  for (let i = 0; i < length; i++) ring[i] -= mean;
  const damping = tone === 'steel' ? .9975 : tone === 'nylon' ? .9945 : .991;
  let write = 0, previous = 0, lastX = 0, lastY = 0, peak = 0;
  for (let i = 0; i < result.length; i++) {
    const read = (write - period + length) % length;
    const a = Math.floor(read), fraction = read - a;
    const delayed = ring[a] * (1 - fraction) + ring[(a + 1) % length] * fraction;
    ring[write] = damping * .5 * (delayed + previous);
    previous = delayed;
    write = (write + 1) % length;
    const highpassed = delayed - lastX + .995 * lastY;
    lastX = delayed; lastY = highpassed;
    const envelope = Math.min(1, i / (sampleRate * .002), (result.length - i - 1) / (sampleRate * .035));
    result[i] = highpassed * envelope;
    peak = Math.max(peak, Math.abs(result[i]));
  }
  const scale = .8 / Math.max(peak, .01);
  for (let i = 0; i < result.length; i++) result[i] *= scale;
  return result;
}
export function encodeWav(channels, sampleRate) {
  const length = channels[0].length, count = channels.length;
  const buffer = new ArrayBuffer(44 + length * count * 2), view = new DataView(buffer);
  const str = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true); view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * count * 2, true); view.setUint16(32, count * 2, true); view.setUint16(34, 16, true); str(36, 'data'); view.setUint32(40, length * count * 2, true);
  let offset = 44;
  for (let i = 0; i < length; i++) for (const channel of channels) { const value = clamp(channel[i], -1, 1); view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true); offset += 2; }
  return buffer;
}
