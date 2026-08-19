const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname+'/../index.html','utf8');

// Audio stub that RECORDS what got scheduled, so we can prove that an attempt
// plays no reference notes while "show me" does.
const stub = `
(function(){
  let t = 0;
  window.__log = { osc:0, starts:[], stops:[] };
  function osc(){
    const o = {
      _f:0, type:'',
      frequency:{ set value(v){o._f=v;}, get value(){return o._f;},
                  setValueAtTime(){}, exponentialRampToValueAtTime(){} },
      connect(){return this;},
      start(at){ window.__log.osc++; window.__log.starts.push({at, f:o._f}); },
      stop(at){ window.__log.stops.push(at); },
    };
    return o;
  }
  function gain(){ const g={ gain:{value:0,setValueAtTime(){},
    exponentialRampToValueAtTime(){}, cancelScheduledValues(){} },
    connect(){return this;} }; return g; }
  function filt(){ return { type:'', Q:{value:0},
    frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
    connect(){return this;} }; }
  class AC {
    constructor(){ this.state='running'; this.baseLatency=0.01; this.destination=gain(); }
    get currentTime(){ return t; }
    resume(){ return Promise.resolve(); }
    createOscillator(){ return osc(); }
    createGain(){ return gain(); }
    createBiquadFilter(){ return filt(); }createBufferSource(){return{buffer:null,connect(){return this;},start(){},stop(){}};}createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}get sampleRate(){return 48000;}
  }
  AC.prototype.createBufferSource = function(){
    return { buffer:null, connect(){return this;},
             start(at){ window.__hats.push(at); }, stop(){} };
  };
  AC.prototype.createBuffer = function(c,l){
    return { getChannelData(){ return new Float32Array(l); } };
  };
  Object.defineProperty(AC.prototype,'sampleRate',{get(){return 48000;}});
  window.__hats = [];
  window.AudioContext = AC;
  window.__advance = d => { t += d; };
  window.__now = () => t;
  const mem={}; window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};
})();
`;

const dom = new JSDOM(html.replace('<script>','<script>'+stub),
  {runScripts:'dangerously', pretendToBeVisual:true});
const win = dom.window, doc = win.document;

let fails = 0;
const ok = (c,m) => { if(!c){fails++;console.log('  FAIL '+m);} else console.log('  ok   '+m); };
const ev = (el,type) => el.dispatchEvent(new win.MouseEvent(type,{bubbles:true,cancelable:true}));
const key = (type,code) => win.dispatchEvent(new win.KeyboardEvent(type,{code,bubbles:true,cancelable:true}));

setTimeout(() => {
  const pad = doc.getElementById('pad');
  const svg = () => doc.querySelector('#score svg');

  console.log('=== beams are actually drawn (level 3 teaches them) ===');
  for(let i=0;i<2;i++) ev(doc.getElementById('lvUp'),'click');   // to level 3
  // hunt for a pattern containing a beam group (level 1 favours eighth pairs)
  let beamFound = false, tries = 0, beamRects = 0;
  while(!beamFound && tries < 60){
    ev(doc.getElementById('nextBtn'),'click');
    // a beam is a <rect> that is wide and thin, sitting above the staff line
    const rects = [...svg().querySelectorAll('rect')].filter(r => {
      const w = +r.getAttribute('width'), h = +r.getAttribute('height');
      return w > 8 && h > 2 && h < 6;      // beam: wide, ~3.4 tall
    });
    beamRects = rects.length;
    if(beamRects > 0) beamFound = true;
    tries++;
  }
  ok(beamFound, `beam rects rendered (found ${beamRects} after ${tries} patterns)`);
  const label = doc.getElementById('hear').textContent.trim();
  ok(label === 'Show me', `button renamed to "Show me" (got "${label}")`);

  console.log('\n=== ATTEMPT: reference notes must NOT sound ===');
  win.__log.starts.length = 0;
  win.__advance(1);
  ev(pad,'pointerdown'); ev(pad,'pointerup');   // begin attempt
  setTimeout(() => {
    // count-in is now a hi-hat (noise buffer), so no oscillators at all should
    // be scheduled during an attempt — any oscillator means a pitched
    // reference note leaked through.
    const pitched = win.__log.starts.length;
    ok(pitched === 0, `no pitched reference notes during an attempt (${pitched} oscillators)`);
    ok(win.__hats.length > 0, `hi-hat metronome scheduled (${win.__hats.length} hits)`);

    win.__advance(4.6);   // into the pattern
    setTimeout(() => {
      ok(pad.dataset.m === 'play', 'in play mode');

      console.log('\n=== cursor hidden during attempt ===');
      const phAttempt = doc.getElementById('ph').getAttribute('opacity');
      ok(phAttempt === '0', `playhead hidden while attempting (opacity=${phAttempt})`);

      console.log('\n=== held tap sustains, release stops it ===');
      const before = win.__log.stops.length;
      ev(pad,'pointerdown');
      const afterPress = win.__log.stops.length;
      ok(afterPress === before, 'pressing schedules no stop yet — note is sustaining');
      ok(pad.classList.contains('hit'), 'pad shows held state while finger is down');
      win.__advance(0.5);            // hold for half a second
      ev(pad,'pointerup');
      ok(win.__log.stops.length > afterPress, 'releasing stops the note');
      ok(!pad.classList.contains('hit'), 'held state cleared on release');

      // keyboard should behave the same
      key('keydown','Space');
      ok(pad.classList.contains('hit'), 'space held sustains too');
      key('keyup','Space');
      ok(!pad.classList.contains('hit'), 'space release stops');

      win.__advance(30);
      setTimeout(() => {
        ok(pad.dataset.m === 'idle', 'returned to idle');

        console.log('\n=== SHOW ME: reference notes DO sound + cursor shows ===');
        win.__log.starts.length = 0;
        ev(doc.getElementById('hear'),'click');
        setTimeout(() => {
          const n = win.__log.starts.length;
          ok(n > 8, `rhythm playback scheduled beyond the count-in (${n} oscillators)`);
          win.__advance(4.6);
          setTimeout(() => {
            const phShow = doc.getElementById('ph').getAttribute('opacity');
            ok(phShow !== '0', `playhead visible in show-me (opacity=${phShow})`);
            const main = doc.getElementById('padMain').textContent;
            ok(/show me/i.test(main), `pad reads "${main}" during show-me`);
            console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
            process.exit(fails?1:0);
          }, 60);
        }, 60);
      }, 60);
    }, 60);
  }, 60);
}, 150);
