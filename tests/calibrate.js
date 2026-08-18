// Simulate the reported problem: player is ACCURATE, but audio output is late
// by a fixed amount the browser never reports. Calibration must converge and
// stop penalising them.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');

const stub = `
(function(){
  let t=0;
  window.__hats=[]; window.__piano=[];
  function osc(){const o={_f:0,type:'',
    frequency:{set value(v){o._f=v;},get value(){return o._f;},
      setValueAtTime(){},exponentialRampToValueAtTime(){}},
    connect(){return this;},start(){},stop(){}};return o;}
  function gain(){const g={gain:{value:0,setValueAtTime(){},
    exponentialRampToValueAtTime(){},cancelScheduledValues(){}},
    connect(){return this;}};return g;}
  function filt(){return{type:'',Q:{value:0},
    frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
    connect(){return this;}};}
  function bufsrc(){return{buffer:null,connect(){return this;},
    start(at){window.__hats.push(at);},stop(){}};}
  class AC{
    constructor(){this.state='running';this.baseLatency=0.008;this.destination=gain();}
    get currentTime(){return t;}
    resume(){return Promise.resolve();}
    createOscillator(){return osc();}
    createGain(){return gain();}
    createBiquadFilter(){return filt();}
    createBufferSource(){return bufsrc();}
    createBuffer(ch,len){return{length:len,getChannelData(){return new Float32Array(len);}};}
    get sampleRate(){return 48000;}
  }
  window.AudioContext=AC; window.__advance=d=>{t+=d;}; window.__now=()=>t;
  const mem={};
  window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};
})();
`;

const dom=new JSDOM(html.replace('<script>','<script>'+stub),
  {runScripts:'dangerously',pretendToBeVisual:true});
const win=dom.window,doc=win.document;
const pad=()=>doc.getElementById('pad');
const pev=t=>pad().dispatchEvent(new win.MouseEvent(t,{bubbles:true,cancelable:true}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const HIDDEN_LATENCY = 0.095;   // 95ms the browser refuses to report

// Play the pattern PERFECTLY, but every tap lands HIDDEN_LATENCY late because
// that's when the player actually hears the beat.
async function perfectAttempt(){
  const U=12, spu=(60/58)/U;
  win.__advance(0.5);
  pev('pointerdown'); pev('pointerup');          // begin
  await sleep(50);

  // read the notated pattern straight out of the SVG feedback-free render:
  // instead, reconstruct from note x positions is fragile — so just play a
  // steady stream of quarters, which is exactly level 1.
  win.__advance(4*U*spu + 0.12 + HIDDEN_LATENCY);
  await sleep(40);
  for(let i=0;i<4;i++){
    pev('pointerdown');
    win.__advance(12*spu*0.9);                   // hold ~ a full quarter
    pev('pointerup');
    win.__advance(12*spu*0.1);
  }
  win.__advance(25);
  await sleep(90);
  return {
    pct: parseInt(doc.getElementById('rPct').textContent),
    bias: doc.getElementById('rBias').textContent,
    cal: doc.getElementById('rCal').textContent,
    sustain: doc.getElementById('rSus').textContent,
    onsets: doc.getElementById('rHits').textContent,
  };
}

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};
  await sleep(300);

  console.log('=== hi-hat metronome ===');
  win.__hats.length=0;
  win.__advance(0.5);
  pev('pointerdown'); pev('pointerup');
  await sleep(60);
  const hats = win.__hats.length;
  console.log('  hat hits scheduled:', hats);
  // 4 count-in beats + 4 beats per bar of pattern (level 1 = 1 bar) = 8
  ok(hats >= 8, `metronome continues through the attempt, not just count-in (${hats} >= 8)`);
  win.__advance(40); await sleep(80);

  console.log('\n=== calibration converges on a hidden 95ms latency ===');
  const runs=[];
  for(let i=0;i<4;i++){
    const r = await perfectAttempt();
    runs.push(r);
    console.log(`  attempt ${i+1}: score ${r.pct}%  onsets ${r.onsets}  bias ${r.bias}  cal ${r.cal}`);
    // dismiss the next-button state between attempts (but keep the last one
    // so we can assert it appeared)
    if(i < 3){
      doc.getElementById('nextBtn').dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
    }
    await sleep(30);
  }

  const firstBiasMs = Math.abs(parseInt(runs[0].bias)) || 0;
  const lastBiasMs  = Math.abs(parseInt(runs[runs.length-1].bias)) || 0;
  ok(lastBiasMs < firstBiasMs,
     `measured bias shrinks as it calibrates (${firstBiasMs}ms → ${lastBiasMs}ms)`);
  ok(lastBiasMs <= 30, `final bias is small (${lastBiasMs}ms <= 30ms)`);
  ok(runs[runs.length-1].pct >= runs[0].pct,
     `score improves or holds for an accurate player (${runs[0].pct}% → ${runs[runs.length-1].pct}%)`);
  const calNum = parseInt(runs[runs.length-1].cal);
  ok(calNum > 40, `learned a meaningful latency offset (${calNum}ms)`);

  console.log('\n=== next button appears after success ===');
  const nb = doc.getElementById('nextBtn');
  console.log('  forward arrow highlighted:', nb.classList.contains('suggest'),
              ' last score:', runs[runs.length-1].pct+'%');
  ok(runs[runs.length-1].pct < 80 || nb.classList.contains('suggest'),
     'forward arrow highlighted as suggested next move after success');

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
