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
  const svg = doc.querySelector('#score svg');
  ok(!!svg, 'score SVG rendered');
  ok(doc.querySelectorAll('#score svg ellipse').length > 0, 'noteheads present');
  ok(!!doc.getElementById('ph'), 'playhead element exists');
  ok(doc.getElementById('lvTxt').textContent.includes('Level 1'), 'level 1 shown');
  ok(doc.getElementById('padMain').textContent === 'Begin', 'pad idle label');

  // ---- XML well-formedness of every level's notation ----
  console.log('\n=== SVG well-formedness across all levels & many patterns ===');
  const { XMLSerializer } = window;
  let badXml = 0, checked = 0, glyphStats = {};
  const up = doc.getElementById('up');
  const fresh = doc.getElementById('nextBtn');

  for(let lv=1; lv<=10; lv++){
    for(let n=0; n<60; n++){
      fresh.dispatchEvent(new window.MouseEvent('click', {bubbles:true}));
      const s = doc.querySelector('#score svg');
      if(!s){ badXml++; continue; }
      const str = new window.XMLSerializer().serializeToString(s);
      // reparse strictly as XML — catches malformed paths/attrs
      const p = new window.DOMParser().parseFromString(str, 'application/xml');
      if(p.getElementsByTagName('parsererror').length){ badXml++; }
      // no NaN / undefined leaking into coordinates
      if(/NaN|undefined|Infinity/.test(str)) badXml++;
      checked++;
      glyphStats['lv'+lv] = (glyphStats['lv'+lv]||0) + s.querySelectorAll('ellipse').length;
    }
    if(lv < 10) up.dispatchEvent(new window.MouseEvent('click', {bubbles:true}));
  }
  ok(badXml === 0, `all ${checked} rendered scores are valid XML with clean coords (bad: ${badXml})`);

  // ---- geometry sanity: nothing drawn outside the viewBox ----
  console.log('\n=== geometry ===');
  const s = doc.querySelector('#score svg');
  const vb = s.getAttribute('viewBox').split(' ').map(Number);
  let outOfBounds = 0;
  s.querySelectorAll('ellipse').forEach(e => {
    const cx = +e.getAttribute('cx');
    if(cx < 0 || cx > vb[2]) outOfBounds++;
  });
  ok(outOfBounds === 0, 'all noteheads inside viewBox');
  ok(vb[3] > 0, 'viewBox height positive: ' + vb[3]);

  // ---- interaction: begin an attempt, tap, finish ----
  console.log('\n=== attempt lifecycle ===');
  const pad = doc.getElementById('pad');
  const down = doc.getElementById('down');
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
    ok(doc.getElementById('up').disabled, 'level buttons locked during run');

    // advance the fake clock through count-in into the pattern
    window.__advance(4.6);
    setTimeout(() => {
      ok(pad.dataset.m === 'play', 'reached play mode (mode=' + pad.dataset.m + ')');
      const phOpacity = doc.getElementById('ph').getAttribute('opacity');
      ok(phOpacity === '0', 'playhead hidden during an attempt (show-me only)');
      window.__advance(0.4); pd(); pd();               // a couple of taps
      window.__advance(20);                            // run past the end
      setTimeout(() => {
        ok(pad.dataset.m === 'idle', 'returned to idle (mode=' + pad.dataset.m + ')');
        ok(!doc.getElementById('up').disabled, 'level buttons unlocked after run');
        ok(doc.getElementById('res').classList.contains('on'), 'result panel shown');
        ok(doc.getElementById('rHits').textContent.includes('/'), 'hits reported: ' + doc.getElementById('rHits').textContent);
        const lane=[...doc.querySelectorAll('#score svg rect')].filter(r=>{
          const h=+r.getAttribute('height'); const y=+(r.getAttribute('y')||0);
          return h>3&&h<6&&y>60;});
        ok(lane.length > 0, `per-note feedback lane drawn (${lane.length} bars)`);

        console.log('\n' + (fails === 0 ? '=== ALL CHECKS PASSED ===' : '=== ' + fails + ' FAILURES ==='));
        process.exit(fails ? 1 : 0);
      }, 60);
    }, 60);
  }, 60);
}, 120);
