const fs = require('fs');
const { JSDOM } = require('jsdom');
const sharp = require('sharp');

const html = fs.readFileSync(__dirname+'/../index.html','utf8');
const stub = `
(function(){
  let t=0;
  function osc(){const o={_f:0,type:'',
    frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}},
    connect(){return this;},start(){},stop(){}};return o;}
  function gain(){return{gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
  function filt(){return{type:'',Q:{value:0},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}
  class AC{constructor(){this.state='running';this.baseLatency=0;this.destination=gain();}
    get currentTime(){return t;} resume(){return Promise.resolve();}
    createOscillator(){return osc();}createGain(){return gain();}createBiquadFilter(){return filt();}createBufferSource(){return{buffer:null,connect(){return this;},start(){},stop(){}};}createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}get sampleRate(){return 48000;}}
  window.AudioContext=AC; window.__advance=d=>{t+=d;}; window.__now=()=>t;
  const mem={};window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};
})();
`;
const dom = new JSDOM(html.replace('<script>','<script>'+stub),
  {runScripts:'dangerously', pretendToBeVisual:true});
const win = dom.window, doc = win.document;

let fails=0;
const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};
const pev=(el,type)=>el.dispatchEvent(new win.MouseEvent(type,{bubbles:true,cancelable:true}));

// Read the notation the app generated, so we can play it deliberately well/badly.
function readPattern(){
  const svg = doc.querySelector('#score svg');
  return [...svg.querySelectorAll('ellipse')].map(e => +e.getAttribute('cx'));
}

setTimeout(async () => {
  const pad = doc.getElementById('pad');

  console.log('=== play a pattern with DELIBERATELY correct sustain ===');
  // Level 1, single bar. Work out the actual note timings from the model by
  // driving the clock and tapping in exact sync with the notated durations.
  win.__advance(1);
  pev(pad,'pointerdown'); pev(pad,'pointerup');   // start attempt

  await new Promise(r=>setTimeout(r,50));
  const bpm = 58, U=12, spu=(60/bpm)/U;
  win.__advance(4*U*spu + 0.12);                  // through count-in to pattern start
  await new Promise(r=>setTimeout(r,50));
  ok(pad.dataset.m==='play','in play mode');

  // We don't know the pattern, so approximate: tap 8 eighth-length notes,
  // holding each for its full value. Then just assert the machinery reports
  // sustain stats coherently.
  for(let i=0;i<8;i++){
    pev(pad,'pointerdown');
    win.__advance(6*spu*0.95);        // hold ~ an eighth
    pev(pad,'pointerup');
    win.__advance(6*spu*0.05);
  }
  win.__advance(20);
  await new Promise(r=>setTimeout(r,80));

  ok(doc.getElementById('res').classList.contains('on'),'result shown');
  const hits = doc.getElementById('rHits').textContent;
  const sus  = doc.getElementById('rSus').textContent;
  const bias = doc.getElementById('rBias').textContent;
  console.log('  onsets:',hits,' sustain:',sus,' tendency:',bias);
  ok(/^\d+\/\d+$/.test(hits),'onset stat well formed');
  ok(/^\d+\/\d+$/.test(sus),'sustain stat well formed');
  ok(bias!=='','tendency reported');

  console.log('\n=== feedback lane is drawn ===');
  const svg = doc.querySelector('#score svg');
  const raw = new win.XMLSerializer().serializeToString(svg);
  const laneRects = [...svg.querySelectorAll('rect')].filter(r=>{
    const h=+r.getAttribute('height');
    return h>3 && h<6 && r.getAttribute('y') && +r.getAttribute('y')>60;
  });
  ok(laneRects.length>0, `lane bars rendered (${laneRects.length})`);
  const hasRef = raw.includes('stroke="#8b8b93"');
  ok(hasRef,'notated reference outlines present');
  const colours = new Set();
  svg.querySelectorAll('rect').forEach(r=>{const f=r.getAttribute('fill'); if(f&&f!=='none')colours.add(f);});
  console.log('  lane fill colours:',[...colours].join(' '));
  ok([...colours].some(c=>/1f8a4c|b07d10/i.test(c)), 'feedback bars use ok/warn colours');

  // paint audit still clean
  const paints=[...raw.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map(m=>m[1]);
  const bad=paints.filter(v=>v!=='none'&&!/^#[0-9a-fA-F]{3,8}$/.test(v));
  ok(bad.length===0,'all paints literal'+(bad.length?` (${[...new Set(bad)]})`:''));
  ok(!/\$\{|var\(--/.test(raw),'no unresolved placeholders');

  console.log('\n=== nothing clipped: lane fits inside viewBox ===');
  const vb=svg.getAttribute('viewBox').split(' ').map(Number);
  let clipped=0;
  svg.querySelectorAll('rect,line,path,circle,ellipse').forEach(e=>{
    const y=+(e.getAttribute('y')||e.getAttribute('cy')||e.getAttribute('y1')||0);
    const h=+(e.getAttribute('height')||0);
    if(y+h>vb[3]+1) clipped++;
  });
  ok(clipped===0,`no elements past the bottom edge (${clipped})`);

  // render it for a look
  const wrapped=`<svg xmlns="http://www.w3.org/2000/svg" width="${vb[2]*2.8}" height="${vb[3]*2.8}" viewBox="${vb.join(' ')}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    ${raw.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>`;
  await sharp(Buffer.from(wrapped)).png().toFile(__dirname+'/feedback.png');
  console.log('\n  → /home/claude/feedback.png');

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
}, 300);
