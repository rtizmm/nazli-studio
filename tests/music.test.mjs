import test from 'node:test';
import assert from 'node:assert/strict';
import { chordNotes, strumEvents, rhythmEvents, pluckSamples, midiFrequency, validClip, encodeWav } from '../music.mjs';

test('standard guitar chord voicings and muted strings', () => {
 assert.deepEqual(chordNotes('Em'), [40,47,52,55,59,64]);
 assert.deepEqual(chordNotes('D'), [null,null,50,57,62,66]);
 assert.deepEqual(strumEvents('Am').map(e=>e.midi), [45,52,57,60,64]);
 assert.deepEqual(strumEvents('Am','up').map(e=>e.midi), [64,60,57,52,45]);
 assert.ok(strumEvents('G').every((e,i)=>i===0||e.offset>strumEvents('G')[i-1].offset));
});
test('rhythm includes the intended offbeats and skips muted arpeggio strings', () => {
 assert.deepEqual(Array.from({length:8},(_,i)=>rhythmEvents('simple',i,'Em').length),[6,0,6,0,6,0,6,0]);
 assert.deepEqual(Array.from({length:8},(_,i)=>rhythmEvents('folk',i,'C').length),[5,0,5,5,0,5,5,5]);
 for(let i=0;i<8;i++) assert.ok(rhythmEvents('arpeggio',i,'Dm').every(e=>Number.isFinite(e.midi)));
});
test('plucked strings have audible, finite, bounded samples and decay', () => {
 for(const tone of ['steel','nylon','warm']) for(const midi of [40,57,67]) {
  const wave=pluckSamples(midi,tone,22050,3.5);
  assert.ok(wave.every(Number.isFinite));
  const rms=part=>Math.sqrt(part.reduce((a,x)=>a+x*x,0)/part.length);
  assert.ok(rms(wave.slice(400,5000))>.005);
  assert.ok(rms(wave.slice(-5000))<rms(wave.slice(400,5000)));
  assert.ok(wave.every(x=>Math.abs(x)<=.801));
 }
});
test('string pitch remains close to target at playback and export sample rates', () => {
 for(const rate of [22050,44100,48000]) for(const midi of [40,45,55,64,67]) {
  const wave=pluckSamples(midi,'steel',rate,1),target=rate/midiFrequency(midi);
  let best=-Infinity,bestLag=0;
  for(let lag=Math.floor(target*.96);lag<=Math.ceil(target*1.04);lag++) {
   let total=0,a=0,b=0;
   for(let i=Math.floor(rate*.2);i<Math.floor(rate*.5);i++){total+=wave[i]*wave[i+lag];a+=wave[i]**2;b+=wave[i+lag]**2;}
   const correlation=total/Math.sqrt(a*b);if(correlation>best){best=correlation;bestLag=lag;}
  }
  assert.ok(Math.abs(bestLag-target)/target<.012,`${midi} @ ${rate}: ${bestLag}, target ${target}`);
 }
});
test('saved recordings reject malformed, excessive and out-of-range notes', () => {
 const event={time:.1,midi:40,string:0,velocity:.8,tone:'steel'};
 const valid={duration:2,events:[event],room:.2};
 assert.ok(validClip(valid));
 assert.equal(validClip({...valid,duration:61}),null);
 assert.equal(validClip({...valid,events:[{...event,time:3}]}),null);
 assert.equal(validClip({...valid,events:[{...event,midi:200}]}),null);
 assert.equal(validClip({...valid,events:Array(1801).fill(event)}),null);
 assert.equal(validClip({duration:2,events:[]}),null);
});
test('WAV header and interleaved PCM are valid and clipped safely', () => {
 const data=encodeWav([new Float32Array([-2,0,2]),new Float32Array([.5,0,-.5])],22050),v=new DataView(data);
 assert.equal(new TextDecoder().decode(data.slice(0,4)),'RIFF');
 assert.equal(v.getUint32(24,true),22050);assert.equal(v.getUint16(22,true),2);
 assert.equal(v.getUint32(40,true),12);assert.equal(data.byteLength,56);
 assert.equal(v.getInt16(44,true),-32768);assert.equal(v.getInt16(52,true),32767);
});
