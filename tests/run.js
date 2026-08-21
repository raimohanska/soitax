const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname+'/../index.html', 'utf8');

// stub Web Audio + storage
const audioStub = `
(function(){
  let t = 0;
  function node(){ return {
    connect(){return this;}, start(){}, stop(){},
    frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
    gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
    Q:{value:0}, type:''
  };}
  class AC {
    constructor(){ this.state='running'; this.baseLatency=0.01; this.destination=node(); }
    get currentTime(){ return t; }
    resume(){ this.state='running'; return Promise.resolve(); }
    createOscillator(){ return node(); }
    createGain(){ return node(); }
    createBiquadFilter(){ return node(); }
  }
  window.AudioContext = AC;
  window.__advance = d => { t += d; };
  const mem = {};
  window.storage = {
    get: async k => mem[k] ? {key:k, value:mem[k]} : null,
    set: async (k,v) => { mem[k]=v; return {key:k,value:v}; },
  };
})();
`;

const dom = new JSDOM(html.replace('<script>', '<script>' + audioStub), {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
const doc = window.document;

let fails = 0;
const ok  = (c, m) => { if(!c){ fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); };

setTimeout(() => {
  console.log('\n=== boot ===');
  // Notation is rendered by abcjs, which the headless harness doesn't load, so
  // assert on the MODEL the app exposes rather than the drawn SVG.
  ok(Array.isArray(window.__onsets), 'pattern model exposed');
  ok((window.__onsets||[]).length > 0, 'sounding notes present');
  ok(doc.getElementById('lvTxt').textContent.includes('Level 1'), 'level 1 shown');
  ok(doc.getElementById('padMain').textContent === 'Begin', 'pad idle label');

  // ---- every level & many patterns generate cleanly ----
  console.log('\n=== pattern generation across all levels ===');
  let bad = 0, checked = 0;
  const up = doc.getElementById('lvUp');
  const fresh = doc.getElementById('nextBtn');

  for(let lv=1; lv<=10; lv++){
    for(let n=0; n<20; n++){
      fresh.dispatchEvent(new window.MouseEvent('click', {bubbles:true}));
      const onsets = window.__onsets;
      const abc = window.__abc || '';
      // every pattern must have something to play and produce valid ABC
      if(!Array.isArray(onsets) || onsets.length < 1) bad++;
      if(/NaN|undefined|Infinity/.test(abc) || !abc) bad++;
      checked++;
    }
    if(lv < 10) up.dispatchEvent(new window.MouseEvent('click', {bubbles:true}));
  }
  ok(bad === 0, `all ${checked} generated patterns are non-empty with clean ABC (bad: ${bad})`);

  // ---- interaction: begin an attempt, tap, finish ----
  console.log('\n=== attempt lifecycle ===');
  const pad = doc.getElementById('pad');
  const down = doc.getElementById('lvDown');
  for(let i=0;i<9;i++) down.dispatchEvent(new window.MouseEvent('click',{bubbles:true})); // back to lv1
  ok(doc.getElementById('lvTxt').textContent.includes('Level 1'), 'stepped back to level 1');

  const tap = () => {
    pad.dispatchEvent(new window.MouseEvent('pointerdown',
      {bubbles:true,cancelable:true,clientX:150,clientY:700}));
    pad.dispatchEvent(new window.MouseEvent('pointerup',
      {bubbles:true,cancelable:true,clientX:150,clientY:700}));
  };
  const pd = tap;
  pd();
  setTimeout(() => {
    ok(pad.dataset.m === 'count' || pad.dataset.m === 'play', 'entered count-in after begin (mode=' + pad.dataset.m + ')');
    ok(doc.getElementById('lvUp').disabled, 'level buttons locked during run');

    // advance the fake clock through count-in into the pattern
    window.__advance(4.6);
    setTimeout(() => {
      ok(pad.dataset.m === 'play', 'reached play mode (mode=' + pad.dataset.m + ')');
      window.__advance(0.4); pd(); pd();               // a couple of taps
      window.__advance(20);                            // run past the end
      setTimeout(() => {
        ok(pad.dataset.m === 'idle', 'returned to idle (mode=' + pad.dataset.m + ')');
        ok(!doc.getElementById('lvUp').disabled, 'level buttons unlocked after run');
        ok(doc.getElementById('padPct').classList.contains('on'), 'result shown on the pad');
        ok(window.__lastGrade.hits.includes('/'), 'hits reported: ' + window.__lastGrade.hits);

        console.log('\n' + (fails === 0 ? '=== ALL CHECKS PASSED ===' : '=== ' + fails + ' FAILURES ==='));
        process.exit(fails ? 1 : 0);
      }, 60);
    }, 60);
  }, 60);
}, 120);
