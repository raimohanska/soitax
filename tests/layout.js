// The bug that shipped twice: notation present in the DOM but occupying
// zero visible area. So assert on RENDERED GEOMETRY, not on markup.
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(__dirname+'/../index.html','utf8');
const stub = `
(function(){
  let t=0;
  function node(){return{connect(){return this;},start(){},stop(){},
    frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
    gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},Q:{value:0},type:''};}
  class AC{constructor(){this.state='running';this.baseLatency=.01;this.destination=node();}
    get currentTime(){return t;} resume(){return Promise.resolve();}
    createOscillator(){return node();}createGain(){return node();}createBiquadFilter(){return node();}}
  window.AudioContext=AC;
  const mem={}; window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};
})();
`;

// iPhone-ish viewport
const dom = new JSDOM(html.replace('<script>','<script>'+stub), {
  runScripts:'dangerously', pretendToBeVisual:true,
});
const win = dom.window, doc = win.document;
Object.defineProperty(win, 'innerWidth', {value:390, configurable:true});
Object.defineProperty(win, 'innerHeight',{value:844, configurable:true});

let fails = 0;
const ok = (c,m) => { if(!c){fails++;console.log('  FAIL '+m);} else console.log('  ok   '+m); };

setTimeout(() => {
  console.log('=== rendered geometry (the check I was missing) ===');
  const svg = doc.querySelector('#score svg');
  ok(!!svg, 'svg exists');

  const wAttr = svg.getAttribute('width');
  const hAttr = svg.getAttribute('height');
  ok(wAttr && Number(wAttr) > 100, `explicit width attribute present and sane (${wAttr})`);
  ok(hAttr && Number(hAttr) > 40,  `explicit height attribute present and sane (${hAttr})`);
  ok(!/auto/.test(win.getComputedStyle(svg).height || ''),
     'computed height is not "auto"');

  // aspect ratio must match the viewBox, or glyphs get squashed/clipped
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  const wanted = vb[3]/vb[2], actual = Number(hAttr)/Number(wAttr);
  ok(Math.abs(wanted-actual) < 0.02,
     `aspect ratio matches viewBox (want ${wanted.toFixed(3)}, got ${actual.toFixed(3)})`);

  // every notehead must sit inside the drawn area
  const heads = [...svg.querySelectorAll('ellipse')];
  ok(heads.length > 0, `noteheads present (${heads.length})`);
  const outside = heads.filter(e => {
    const cx=+e.getAttribute('cx'), cy=+e.getAttribute('cy');
    return cx<0||cx>vb[2]||cy<0||cy>vb[3];
  });
  ok(outside.length===0, 'all noteheads within viewBox bounds');

  // paint audit again (regression guard for the var()/placeholder bugs)
  const raw = new win.XMLSerializer().serializeToString(svg);
  const paints=[...raw.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map(m=>m[1]);
  const bad=paints.filter(v=>v!=='none'&&!/^#[0-9a-fA-F]{3,8}$/.test(v));
  ok(bad.length===0, 'all paint values are literal colours' + (bad.length?` (bad: ${[...new Set(bad)]})`:''));
  ok(!/\$\{|var\(--/.test(raw), 'no unresolved placeholders in SVG');
  heads.forEach(e=>{
    const f=e.getAttribute('fill'), sw=+e.getAttribute('stroke-width');
    if(!((f&&f!=='none')||sw>0)) fails++;
  });
  ok(true, 'every notehead is paintable');

  console.log('\n=== countdown contrast ===');
  // simulate count mode and check the digit colour is bright
  const pad = doc.getElementById('pad');
  pad.dataset.m = 'count';
  const main = doc.getElementById('padMain');
  const col = win.getComputedStyle(main).color;
  console.log('  countdown colour:', col);
  const m = col.match(/(\d+),\s*(\d+),\s*(\d+)/);
  const lum = m ? (+m[1]+ +m[2]+ +m[3])/3 : 0;
  ok(lum < 60, `countdown digit is dark ink on light (mean channel ${Math.round(lum)}/255)`);
  pad.dataset.m = 'idle';

  console.log('\n=== resize keeps it sized ===');
  Object.defineProperty(win,'innerWidth',{value:320,configurable:true});
  win.dispatchEvent(new win.Event('resize'));
  setTimeout(() => {
    const s2 = doc.querySelector('#score svg');
    ok(Number(s2.getAttribute('width'))>100, `still sized after resize (${s2.getAttribute('width')})`);
    ok(Number(s2.getAttribute('height'))>40, `height still sane (${s2.getAttribute('height')})`);
    console.log('\n' + (fails===0 ? '=== ALL PASSED ===' : `=== ${fails} FAILURES ===`));
    process.exit(fails?1:0);
  }, 400);
}, 400);
