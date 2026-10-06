// DOM/audio stand-ins exercise the real application event handlers and scheduler.
// These state tests do not claim browser layout or audio-device coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as music from '../music.mjs';
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const source = fs.readFileSync(new URL('../app.mjs', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '');
function app(saved = {}, blocked = false) {
  let now = 0, nextId = 0;
  const all = [], ids = new Map(), timers = new Map(), state = new Map(Object.entries(saved)), emitted = [];
  const listeners = {};
  class Element {
    constructor(tag = 'div') { this.tagName = tag.toUpperCase(); this.className = ''; this.dataset = {}; this.children = []; this.textContent = ''; this.value = ''; this.style = { setProperty() {} }; this.listeners = {}; this.attributes = {}; all.push(this); }
    get classList() { return { add: (...names) => { this.className = [...new Set([...this.className.split(' '), ...names])].join(' '); }, remove: (...names) => { this.className = this.className.split(' ').filter(n => !names.includes(n)).join(' '); }, toggle: (n, on) => { on ? this.classList.add(n) : this.classList.remove(n); } }; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k]; }
    addEventListener(k, fn) { (this.listeners[k] ||= []).push(fn); }
    getBoundingClientRect() { return { top: 0, left: 0, bottom: 276, right: 300, width: 300, height: this.id === 'strings' ? 276 : 40 }; }
    querySelector(s) { return this.children.find(n => n.className.split(' ').includes(s.slice(1))) || null; }
    closest() { return null; }
    getContext() { return { setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, fillRect() {} }; }
    showModal() { this.open = true; }
    close() { this.open = false; }
    remove() {}
    click() {}
    setPointerCapture() {}
  }
  for (const match of html.matchAll(/<([a-z]+)[^>]*\bid="([^"]+)"[^>]*>/g)) { const element = new Element(match[1]); element.id = match[2]; ids.set(element.id, element); }
  const dots = Array.from({ length: 4 }, () => new Element('i'));
  const document = { hidden: false, body: new Element('body'), createElement: tag => new Element(tag), createElementNS: (_, tag) => new Element(tag), addEventListener(k, fn) { (listeners[k] ||= []).push(fn); },
    querySelector(s) { if (s.startsWith('#')) return ids.get(s.slice(1)); const m = s.match(/^\[data-string="(\d)"\]$/); if (m) return all.find(n => String(n.dataset.string) === m[1]); return null; },
    querySelectorAll(s) { if (s === '.beat-dots i') return dots; return all.filter(n => n.className.split(' ').includes(s.slice(1))); }
  };
  class GuitarAudio {
    constructor() { this.volume = .65; this.room = .2; }
    get time() { return now / 1000; }
    async ready() {}
    setVolume(v) { this.volume = v; }
    setRoom(v) { this.room = v; }
    pluck(note, when, group) { emitted.push({ ...note, when, group }); }
    stop() {}
    click() {}
    async wav() { return new Blob(['test']); }
  }
  const timer = (fn, ms, repeat) => { const id = ++nextId; timers.set(id, { fn, at: now + ms, repeat: repeat ? ms : 0 }); return id; };
  const context = vm.createContext({ ...music, GuitarAudio, document, window: { addEventListener() {} }, localStorage: { getItem(k) { if (blocked) throw Error('blocked'); return state.get(k) ?? null; }, setItem(k, v) { if (blocked) throw Error('blocked'); state.set(k, v); } }, devicePixelRatio: 1, Blob, URL, setTimeout: (fn, ms) => timer(fn, ms, false), setInterval: (fn, ms) => timer(fn, ms, true), clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id) });
  vm.runInContext(source, context);
  return { ids, state, emitted, document, async click(id) { ids.get(id).onclick(); await Promise.resolve(); await Promise.resolve(); }, key(key) { for (const fn of listeners.keydown || []) fn({ key, target: new Element(), preventDefault() {} }); }, async flush() { await Promise.resolve(); await Promise.resolve(); }, advance(ms) { const end = now + ms; while (true) { const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; now = due[1].at; if (due[1].repeat) due[1].at += due[1].repeat; else timers.delete(due[0]); due[1].fn(); } now = end; }, hide() { document.hidden = true; for (const fn of listeners.visibilitychange || []) fn(); } };
}
test('app starts, switches chords, records, persists and replays notes', async () => {
 const a = app(); assert.equal(a.ids.get('currentChord').textContent,'Em');
 a.key('t'); assert.equal(a.ids.get('currentChord').textContent,'D');
 await a.click('recordToggle'); await a.click('strumDown'); a.advance(600); await a.click('recordToggle');
 const clip=JSON.parse(a.state.get('nazli-studio-clip-v1'));assert.equal(clip.events.length,4);assert.ok(clip.duration>=.5);
 const b=app(Object.fromEntries(a.state));assert.equal(b.ids.get('playRecording').disabled,false);
 await b.click('playRecording');b.advance(600);assert.equal(b.emitted.filter(e=>e.group==='playback').length,4);
});
test('loop repeats, stopping cancels scheduled playback, blank take preserves last clip', async()=>{
 const a=app();await a.click('recordToggle');a.key('1');await a.flush();a.advance(500);await a.click('recordToggle');
 const original=a.state.get('nazli-studio-clip-v1');
 await a.click('loopToggle');await a.click('playRecording');a.advance(1550);
 assert.ok(a.emitted.filter(e=>e.group==='playback').length>=3);
 await a.click('stopAll');const count=a.emitted.length;a.advance(1000);assert.equal(a.emitted.length,count);
 await a.click('recordToggle');a.advance(500);await a.click('recordToggle');assert.equal(a.state.get('nazli-studio-clip-v1'),original);
});
test('rhythm records automatically, background transition stops it and finalizes',async()=>{
 const a=app();await a.click('recordToggle');await a.click('rhythmToggle');a.advance(1100);a.hide();
 const clip=JSON.parse(a.state.get('nazli-studio-clip-v1'));assert.ok(clip.events.length>=6);
 assert.equal(a.ids.get('recordToggle').getAttribute('aria-pressed'),'false');
 assert.equal(a.ids.get('rhythmToggle').getAttribute('aria-pressed'),'false');
 const count=a.emitted.length;a.advance(2000);assert.equal(a.emitted.length,count);
});
test('blocked storage does not break playing or misreport persistence',async()=>{
 const a=app({},true);await a.click('recordToggle');a.key('1');await a.flush();a.advance(500);await a.click('recordToggle');
 assert.equal(a.ids.get('downloadRecording').disabled,false);
 assert.ok(a.ids.get('recordStatus').textContent.includes('WAV'));
});
