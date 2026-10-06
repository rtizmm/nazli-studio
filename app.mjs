import { CHORDS, STRING_NAMES, TONES, MAX_RECORD_SECONDS, MAX_EVENTS, chordNotes, strumEvents, rhythmEvents, validClip, noteName, clamp } from './music.mjs?v=90c0394fc305';
import { GuitarAudio } from './audio.mjs?v=ef148a6ce00f';
// ================================================================
// YAZILARI DEĞİŞTİRMEK İÇİN BURAYI DÜZENLEYEBİLİRSİN.
// Ekranda işlem yaptıkça değişen yazılar ve bildirimler burada.
// Sadece tırnak içlerini değiştir; soldaki anahtar isimlerini koru.
// Sabit başlıklar / açıklamalar: index.html içindeki YAZI ALANI notları.
// ================================================================
const YAZILAR = {
  "sesAcik": "Ses açık",
  "sesHata": "Ses başlatılamadı. Yeniden dene.",
  "notaSiniri": "Kayıt nota sınırına ulaştı ve kaydedildi.",
  "ritimDur": "Ⅱ Ritmi durdur",
  "ritimBasla": "▶ Ritmi başlat",
  "metronomKapat": "Metronomu kapat",
  "metronomAc": "Metronomu aç",
  "kaydiDinle": "Kaydı dinle",
  "kaydiDurdur": "Kaydı durdur",
  "kayitSaklanamadi": "Kayıt bu oturumda hazır. Saklamak için WAV olarak indir.",
  "kayitHazir": "Kaydın hazır. Dinle, döngüye al veya indir.",
  "kayitBos": "Bu kayıtta çalınmış nota yok. Birkaç tele dokunup tekrar dene.",
  "kayitBasladi": "Kayıt başladı. Teller senin.",
  "hazirlaniyor": "Hazırlanıyor…",
  "wavHazir": "WAV dosyan hazır.",
  "wavHata": "Dosya hazırlanamadı. Tekrar dene.",
  "wavIndir": "WAV indir ↗",
  "bitir": "Bitir",
  "yeniKayit": "Yeni kayıt",
  "kaydet": "Kaydet",
  "kayitAcik": "Kayıt açık · en fazla 60 saniye",
  "dongude": "Kaydın döngüde çalıyor.",
  "caliyor": "Kaydın çalıyor.",
  "saklandi": "bu tarayıcıda saklandı",
  "wavOner": "indirmek için WAV seç",
  "bosDurum": "Bir fikrin varsa, kaybolmasın.",
  "hepsiDurdu": "Tüm sesler durduruldu.",
  "sureDoldu": "60 saniye doldu. Kaydın hazır.",
  "sessizTel": "bu akorda sessiz",
  "sessiz": "sessiz"
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const audio = new GuitarAudio();
const storage = {
  read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
};
let preferences = storage.read('nazli-studio-settings-v1', {});
if (!preferences || typeof preferences !== 'object') preferences = {};
let chord = Object.hasOwn(CHORDS, preferences.chord) ? preferences.chord : 'Em';
let tone = TONES.includes(preferences.tone) ? preferences.tone : 'steel';
let bpm = Number.isFinite(preferences.bpm) ? clamp(preferences.bpm, 50, 160) : 80;
let pattern = ['simple', 'folk', 'arpeggio'].includes(preferences.pattern) ? preferences.pattern : 'simple';
const numberSetting = (name, fallback, max) => Number.isFinite(preferences[name]) ? clamp(preferences[name], 0, max) : fallback;
audio.setVolume(numberSetting('volume', .65, 1)); audio.setRoom(numberSetting('room', .2, .6));
let clipSaved = true;
let generation = 0, recording = null, clip = validClip(storage.read('nazli-studio-clip-v1', null));
let playing = false, looping = false, playbackStart = 0, playbackIndex = 0, playbackCycle = 0;
let rhythm = false, metro = false, step = 0, nextStep = 0, scheduler = null, exportBusy = false;
const visualTimers = new Set();
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3500); }
function savePreferences() { storage.write('nazli-studio-settings-v1', { chord, tone, bpm, pattern, volume: audio.volume, room: audio.room }); }
async function useAudio(action) {
  const ticket = generation;
  try { await audio.ready(); if (ticket !== generation || document.hidden) return; $('#audioStatus').textContent = YAZILAR.sesAcik; action(); }
  catch (error) { toast(error.message || YAZILAR.sesHata); }
}
function later(fn, when) {
  const id = setTimeout(() => { visualTimers.delete(id); fn(); }, Math.max(0, (when - audio.time) * 1000));
  visualTimers.add(id);
}
function animateString(index, muted = false) {
  const button = $(`[data-string="${index}"]`);
  button.classList.remove('plucked', 'muted-tap');
  void button.offsetWidth;
  button.classList.add(muted ? 'muted-tap' : 'plucked');
  setTimeout(() => button.classList.remove('plucked', 'muted-tap'), 500);
}
function playNote(event, when = audio.time, group = 'live', capture = true) {
  const note = { ...event, tone: event.tone || tone, velocity: event.velocity || .85 };
  audio.pluck(note, when, group);
  later(() => animateString(note.string), when);
  if (capture && recording) {
    const time = when - recording.start;
    if (time >= 0 && time < MAX_RECORD_SECONDS && recording.events.length < MAX_EVENTS) recording.events.push({ midi: note.midi, string: note.string, tone: note.tone, velocity: note.velocity, time });
    if (recording.events.length >= MAX_EVENTS) finishRecording(YAZILAR.notaSiniri);
  }
}
function pluck(index, velocity = .85) {
  const midi = chordNotes(chord)[index];
  if (midi === null) { animateString(index, true); return; }
  useAudio(() => playNote({ midi, string: index, velocity }, audio.time + .008));
}
function strum(direction) { useAudio(() => { const start = audio.time + .015; strumEvents(chord, direction).forEach(e => playNote({ ...e, velocity: direction === 'up' ? .72 : .88 }, start + e.offset)); }); }
function updateChord() {
  const current = CHORDS[chord], notes = chordNotes(chord);
  $('#currentChord').textContent = chord === 'open' ? '○' : chord;
  $('#currentChordName').textContent = current.name;
  $('#diagramName').textContent = current.name;
  $('#fingering').textContent = current.frets.map(f => f === null ? '×' : f).join(' · ');
  $$('.chord-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.chord === chord)));
  $$('.string').forEach((button, index) => {
    const silent = notes[index] === null;
    button.setAttribute('aria-disabled', String(silent));
    button.setAttribute('aria-label', `${index + 1}. tel ${STRING_NAMES[index]}: ${silent ? YAZILAR.sessizTel : noteName(notes[index])}`);
    button.querySelector('.string-note').textContent = silent ? '×' : noteName(notes[index]);
  });
  drawChord();
}
function chooseChord(value) { chord = value; updateChord(); savePreferences(); }
// Akor diyagramının üzerindeki yazılar music.mjs içindeki name alanlarından gelir.
function drawChord() {
  const svg = $('#chordDiagram'), ns = 'http://www.w3.org/2000/svg';
  svg.replaceChildren(); svg.setAttribute('aria-label', `${CHORDS[chord].name}: ${CHORDS[chord].frets.map(f => f === null ? YAZILAR.sessiz : f).join(', ')}`);
  const add = (tag, attrs, text) => { const node = document.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value); if (text) node.textContent = text; svg.append(node); };
  for (let i = 0; i < 6; i++) add('line', { x1: 16 + i * 16, x2: 16 + i * 16, y1: 27, y2: 111, stroke: 'var(--diagram-line)', 'stroke-width': 1 });
  for (let fret = 0; fret <= 4; fret++) add('line', { x1: 16, x2: 96, y1: 27 + fret * 21, y2: 27 + fret * 21, stroke: 'var(--diagram-line)', 'stroke-width': fret ? 1 : 3 });
  CHORDS[chord].frets.forEach((fret, index) => {
    const x = 16 + index * 16;
    if (fret === null || fret === 0) add('text', { x, y: 18, 'text-anchor': 'middle', fill: 'var(--purple)', 'font-size': 12 }, fret === null ? '×' : '○');
    else add('circle', { cx: x, cy: 27 + (fret - .5) * 21, r: 5.5, fill: 'var(--purple)' });
    add('text', { x, y: 125, 'text-anchor': 'middle', fill: 'var(--muted)', 'font-size': 8 }, STRING_NAMES[index]);
  });
}
for (let index = 0; index < 6; index++) {
  const button = document.createElement('button'); button.className = 'string'; button.type = 'button'; button.dataset.string = index;
  button.style.setProperty('--thickness', `${2.7 - index * .35}px`);
  const label = document.createElement('span'), wire = document.createElement('span'), note = document.createElement('span');
  label.className = 'string-label'; label.textContent = STRING_NAMES[index]; wire.className = 'wire'; note.className = 'string-note';
  button.append(label, wire, note);
  button.addEventListener('click', e => { if (e.detail === 0) pluck(index); });
  $('#strings').append(button);
}
for (const [value, data] of Object.entries(CHORDS).filter(([key]) => key !== 'open')) {
  const button = document.createElement('button'); button.className = 'chord-button'; button.dataset.chord = value;
  button.setAttribute('aria-label', `${value}, ${data.name}`); button.setAttribute('aria-pressed', 'false');
  const label = document.createElement('span'), shortcut = document.createElement('small'); label.textContent = value; shortcut.textContent = data.key.toUpperCase(); button.append(label, shortcut);
  button.onclick = () => chooseChord(value); $('#chords').append(button);
}
updateChord();
// Pointer capture supports both a single tap and continuous strumming. The
// interpolated indices also catch strings crossed between two pointer events.
const pointers = new Map(), strings = $('#strings');
function stringAt(clientY) { const rect = strings.getBoundingClientRect(); if (clientY < rect.top || clientY > rect.bottom) return null; return clamp(Math.floor((clientY - rect.top) / rect.height * 6), 0, 5); }
strings.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const index = stringAt(e.clientY); if (index === null) return;
  e.preventDefault(); strings.setPointerCapture(e.pointerId); pointers.set(e.pointerId, index); pluck(index);
});
strings.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const next = stringAt(e.clientY), previous = pointers.get(e.pointerId); if (next === null || next === previous) return;
  const direction = Math.sign(next - previous);
  for (let index = previous + direction; direction > 0 ? index <= next : index >= next; index += direction) pluck(index, .78);
  pointers.set(e.pointerId, next);
});
for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) strings.addEventListener(event, e => pointers.delete(e.pointerId));
$('#strumDown').onclick = () => strum('down'); $('#strumUp').onclick = () => strum('up');
$('#openStrings').onclick = () => { chooseChord('open'); strum('down'); };
$('#tone').value = tone; $('#tone').onchange = e => { tone = e.target.value; savePreferences(); };
$('#volume').value = audio.volume * 100; $('#room').value = audio.room * 100;
function updateSliders() { $('#volumeValue').textContent = `${Math.round(audio.volume * 100)}%`; $('#roomValue').textContent = `${Math.round(audio.room * 100)}%`; }
updateSliders();
$('#volume').oninput = e => { audio.setVolume(Number(e.target.value) / 100); updateSliders(); savePreferences(); };
$('#room').oninput = e => { audio.setRoom(Number(e.target.value) / 100); updateSliders(); savePreferences(); };
$('#bpm').value = bpm; $('#pattern').value = pattern;
function updateTempo() { $('#bpmBadge').textContent = `${bpm} BPM`; $('#bpmValue').textContent = bpm; }
updateTempo();
$('#bpm').oninput = e => { bpm = Number(e.target.value); updateTempo(); savePreferences(); };
$('#pattern').onchange = e => { pattern = e.target.value; savePreferences(); };
function updateTransport() {
  $('#rhythmToggle').textContent = rhythm ? YAZILAR.ritimDur : YAZILAR.ritimBasla; $('#rhythmToggle').setAttribute('aria-pressed', String(rhythm));
  $('#metroToggle').setAttribute('aria-pressed', String(metro)); $('#metroToggle').setAttribute('aria-label', metro ? YAZILAR.metronomKapat : YAZILAR.metronomAc);
}
function ensureScheduler() { if (scheduler !== null) return; nextStep = audio.time + .06; step = 0; scheduler = setInterval(schedule, 25); schedule(); }
function maybeStopScheduler() { if (rhythm || metro || playing) return; clearInterval(scheduler); scheduler = null; $$('.beat-dots i').forEach(dot => dot.classList.remove('on')); }
function stopPlayback() { playing = false; audio.stop('playback'); $('#playRecording').textContent = '▶'; $('#playRecording').setAttribute('aria-label', YAZILAR.kaydiDinle); maybeStopScheduler(); updateRecorder(); }
function schedule() {
  const now = audio.time, horizon = now + .12;
  if (rhythm || metro) {
    if (nextStep < now - .2) { nextStep = now + .04; step = 0; }
    while (nextStep < horizon) {
      const at = nextStep, currentStep = step;
      if (rhythm) rhythmEvents(pattern, step, chord).forEach(e => playNote({ ...e, velocity: pattern === 'arpeggio' ? .8 : .72 }, at + e.offset, 'rhythm'));
      if (metro && step % 2 === 0) audio.click(at, step % 8 === 0);
      if (step % 2 === 0) later(() => { if (rhythm || metro) $$('.beat-dots i').forEach((dot, i) => dot.classList.toggle('on', i === currentStep % 8 / 2)); }, at);
      nextStep += 60 / bpm / 2; step++;
    }
  }
  if (playing && clip) {
    // A delayed tab never schedules a burst of all missed loop cycles.
    if (looping && now > playbackStart + (playbackCycle + 1) * clip.duration + .2) { playbackCycle = Math.floor((now - playbackStart) / clip.duration); playbackIndex = 0; }
    let scheduled = 0;
    while (playing && scheduled < MAX_EVENTS) {
      if (playbackIndex >= clip.events.length) {
        if (looping) { if (playbackStart + (playbackCycle + 1) * clip.duration >= horizon) break; playbackCycle++; playbackIndex = 0; }
        else { if (now >= playbackStart + clip.duration + 3.5) stopPlayback(); break; }
      }
      const event = clip.events[playbackIndex], when = playbackStart + playbackCycle * clip.duration + event.time;
      if (when >= horizon) break;
      if (when >= now - .03) playNote(event, Math.max(now, when), 'playback', false);
      playbackIndex++; scheduled++;
    }
  }
}
$('#rhythmToggle').onclick = () => useAudio(() => { rhythm = !rhythm; if (!rhythm) audio.stop('rhythm'); updateTransport(); if (rhythm || metro) ensureScheduler(); maybeStopScheduler(); });
$('#metroToggle').onclick = () => useAudio(() => { metro = !metro; if (!metro) audio.stop('metro'); updateTransport(); if (rhythm || metro) ensureScheduler(); maybeStopScheduler(); });
function saveClip() { clipSaved = !!clip && storage.write('nazli-studio-clip-v1', clip); if (clip && !clipSaved) toast(YAZILAR.kayitSaklanamadi); }
function finishRecording(message) {
  if (!recording) return;
  const duration = clamp(audio.time - recording.start, .25, MAX_RECORD_SECONDS);
  const events = recording.events.filter(e => e.time < duration);
  const nextClip = validClip({ duration, events, room: recording.room }); recording = null;
  if (nextClip) { clip = nextClip; }
  if (nextClip) { saveClip(); toast(message || YAZILAR.kayitHazir); }
  else toast(YAZILAR.kayitBos);
  updateRecorder(); drawWave();
}
$('#recordToggle').onclick = () => {
  if (recording) { finishRecording(); return; }
  useAudio(() => {
    stopPlayback(); rhythm = false; metro = false; audio.stop(); updateTransport(); maybeStopScheduler();
    recording = { start: audio.time, events: [], room: audio.room };
    updateRecorder(); toast(YAZILAR.kayitBasladi);
  });
};
$('#playRecording').onclick = () => {
  if (playing) { stopPlayback(); return; }
  if (!clip || recording) return;
  useAudio(() => { rhythm = false; metro = false; audio.stop(); updateTransport(); playing = true; playbackStart = audio.time + .08; playbackIndex = 0; playbackCycle = 0; $('#playRecording').textContent = 'Ⅱ'; $('#playRecording').setAttribute('aria-label', YAZILAR.kaydiDurdur); ensureScheduler(); updateRecorder(); });
};
$('#loopToggle').onclick = () => { looping = !looping; $('#loopToggle').setAttribute('aria-pressed', String(looping)); if (playing && !looping) { playbackStart += playbackCycle * clip.duration; playbackCycle = 0; } };
$('#downloadRecording').onclick = async () => {
  if (!clip || recording || exportBusy) return;
  const snapshot = clip; exportBusy = true; updateRecorder(); $('#downloadRecording').textContent = YAZILAR.hazirlaniyor;
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    const blob = await audio.wav(snapshot), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'nazli-studio-kaydim.wav'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); toast(YAZILAR.wavHazir);
  } catch (error) { toast(error.message || YAZILAR.wavHata); }
  finally { exportBusy = false; $('#downloadRecording').textContent = YAZILAR.wavIndir; updateRecorder(); }
};
function formattedTime(seconds) { const s = Math.max(0, Math.floor(seconds)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function updateRecorder() {
  $('#recordToggle').setAttribute('aria-pressed', String(!!recording)); $('#recordLabel').textContent = recording ? YAZILAR.bitir : clip ? YAZILAR.yeniKayit : YAZILAR.kaydet;
  $('#playRecording').disabled = !clip || !!recording; $('#loopToggle').disabled = !clip || !!recording; $('#downloadRecording').disabled = !clip || !!recording || exportBusy;
  const status = recording ? YAZILAR.kayitAcik : playing ? (looping ? YAZILAR.dongude : YAZILAR.caliyor) : clip ? `${clip.events.length} nota · ${clipSaved ? YAZILAR.saklandi : YAZILAR.wavOner}` : YAZILAR.bosDurum;
  if ($('#recordStatus').textContent !== status) $('#recordStatus').textContent = status;
  const position = recording ? audio.time - recording.start : playing && clip ? (looping ? (audio.time - playbackStart) % clip.duration : Math.min(clip.duration, audio.time - playbackStart)) : clip?.duration || 0;
  $('#recordTime').textContent = formattedTime(position);
}
function stopAll(message = false) {
  generation++; if (recording) finishRecording();
  playing = false; rhythm = false; metro = false; audio.stop(); maybeStopScheduler();
  for (const id of visualTimers) clearTimeout(id); visualTimers.clear(); pointers.clear();
  $('#playRecording').textContent = '▶'; $('#playRecording').setAttribute('aria-label', YAZILAR.kaydiDinle);
  $$('.string').forEach(b => b.classList.remove('plucked', 'muted-tap')); updateTransport(); updateRecorder();
  if (message) toast(YAZILAR.hepsiDurdu);
}
$('#stopAll').onclick = () => stopAll(true);
const waveform = $('#waveform'), waveContext = waveform.getContext('2d');
function drawWave() {
  const rect = waveform.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2), width = rect.width, height = rect.height;
  if (!width || !height || !waveContext) return;
  const physicalW = Math.round(width * ratio), physicalH = Math.round(height * ratio);
  if (waveform.width !== physicalW || waveform.height !== physicalH) { waveform.width = physicalW; waveform.height = physicalH; }
  waveContext.setTransform(ratio, 0, 0, ratio, 0, 0); waveContext.clearRect(0, 0, width, height);
  const events = recording ? recording.events : clip?.events || [], duration = recording ? Math.max(5, audio.time - recording.start) : clip?.duration || 5;
  const palette = getComputedStyle(document.documentElement);
  waveContext.strokeStyle = palette.getPropertyValue('--line').trim() || '#e3dbe8'; waveContext.beginPath(); waveContext.moveTo(0, height / 2); waveContext.lineTo(width, height / 2); waveContext.stroke();
  waveContext.fillStyle = recording ? (palette.getPropertyValue('--record-ink').trim() || '#b67485') : (palette.getPropertyValue('--purple').trim() || '#8063a5');
  const bins = new Float32Array(Math.ceil(width / 4));
  for (const event of events) { const index = Math.floor(event.time / duration * (bins.length - 1)); if (index >= 0 && index < bins.length) bins[index] = Math.max(bins[index], event.velocity * (.45 + (event.midi - 40) / 70)); }
  bins.forEach((value, index) => { if (!value) return; const h = Math.max(3, value * height * .8); waveContext.fillRect(index * 4, (height - h) / 2, 2, h); });
  if (playing && clip) { const position = looping ? (audio.time - playbackStart) % clip.duration : Math.min(clip.duration, audio.time - playbackStart); waveContext.fillStyle = palette.getPropertyValue('--purple').trim() || '#8063a5'; waveContext.fillRect(clamp(position / clip.duration * width, 0, width - 1), 0, 1.5, height); }
}
if ('ResizeObserver' in window) new ResizeObserver(drawWave).observe(waveform); else window.addEventListener('resize', drawWave);
setInterval(() => { if (document.hidden) return; if (recording && audio.time - recording.start >= MAX_RECORD_SECONDS) finishRecording(YAZILAR.sureDoldu); if (recording || playing) { updateRecorder(); drawWave(); } }, 100);
updateRecorder(); drawWave();

// TEMA AYARI: görünen tema adlarını index.html'de, renkleri themes.css'te düzenle.
const TEMALAR = { lavender: '#f3f0eb', midnight: '#171922', forest: '#edf2e9', sunset: '#fbefe8' };
function applyTheme(value) {
  const theme = Object.hasOwn(TEMALAR, value) ? value : 'lavender';
  document.documentElement.dataset.theme = theme;
  $('#themeSelect').value = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', TEMALAR[theme]);
  storage.write('nazli-studio-theme-v1', theme);
  drawWave();
}
applyTheme(storage.read('nazli-studio-theme-v1', 'lavender'));
$('#themeSelect').onchange = e => applyTheme(e.target.value);
const help = $('#helpDialog');
$('#helpOpen').onclick = $('#helpFooter').onclick = () => help.showModal(); $('#helpClose').onclick = () => help.close();
help.addEventListener('click', e => { if (e.target !== help) return; const r = help.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) help.close(); });
document.addEventListener('keydown', e => {
  if (help.open || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.target.closest('input,select,textarea,[contenteditable]')) return;
  if (e.key === 'Escape') { stopAll(); return; }
  const found = Object.entries(CHORDS).find(([, c]) => c.key && c.key === e.key.toLowerCase());
  if (found) { e.preventDefault(); chooseChord(found[0]); return; }
  if (/^[1-6]$/.test(e.key)) { e.preventDefault(); pluck(Number(e.key) - 1); return; }
  if (e.key === 'ArrowDown' || (e.key === ' ' && !e.target.closest('button,a'))) { e.preventDefault(); strum('down'); }
  if (e.key === 'ArrowUp') { e.preventDefault(); strum('up'); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopAll(); });
window.addEventListener('pagehide', () => stopAll());
