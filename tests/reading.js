// The complaint this suite exists for: reading a bar correctly and tapping it
// with ordinary, short taps used to score 0% — every onset landed, but every
// note failed the sustain floor (40% of a 1034ms quarter = a 414ms hold, when a
// natural tap is ~150ms). Green must be reachable by reading well, not by
// holding notes like an organist.
//
// The other half of the job: it must still be possible to fail. If mashing a
// steady stream scores green, the trainer means nothing.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const stub=`(function(){let t=0;
function osc(){const o={_f:0,type:'',frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},start(){},stop(){}};return o;}
function gain(){return{gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
function filt(){return{type:'',Q:{value:0},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}
class AC{constructor(){this.state='running';this.baseLatency=0;this.destination=gain();}
get currentTime(){return t;}resume(){return Promise.resolve();}
createOscillator(){return osc();}createGain(){return gain();}createBiquadFilter(){return filt();}
createBufferSource(){return{buffer:null,connect(){return this;},start(){},stop(){}};}
createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}
get sampleRate(){return 48000;}}
window.AudioContext=AC;window.__advance=d=>{t+=d;};const mem={};
window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};})();`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Play the bar that is actually on screen. `holdMs` is how long each tap is
// held; `jitterMs` is how far off the beat it lands, alternating early/late.
// `spam` ignores the notation entirely and taps a steady stream of eighths.
async function play({holdMs=150, jitterMs=0, spam=false}={}){
  const dom=new JSDOM(html.replace('<script>','<script>'+stub),
    {runScripts:'dangerously',pretendToBeVisual:true});
  const w=dom.window,d=w.document;
  await sleep(300);
  const G=id=>d.getElementById(id);
  const pad=G('pad');
  const down=()=>pad.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:700}));
  const up=()=>pad.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:700}));
  const bpm=Number(G('bpmVal').textContent), U=12, spu=(60/bpm)/U;

  // recover the notated onsets from the rendered noteheads
  const svg=d.querySelector('#score svg');
  const PAD_L=16, SPAN=320-16-20, BAR=48;
  const heads=[...svg.querySelectorAll('ellipse')].map(e=>+e.getAttribute('cx')).sort((a,b)=>a-b);
  const notated=heads.map(x=>Math.round(((x-PAD_L)/SPAN)*BAR));
  const onsets = spam ? [0,6,12,18,24,30,36,42] : notated;

  down(); up();                                   // begin
  await sleep(50);
  w.__advance(4*U*spu + 0.12);                    // through the count-in
  await sleep(40);

  let cursor=0;
  for(let k=0;k<onsets.length;k++){
    const target=onsets[k]*spu + (k%2 ? jitterMs/1000 : -jitterMs/1000);
    const step=Math.max(0.03, target-cursor);
    w.__advance(step); cursor+=step;
    down();
    // never hold past the next onset, or we would be measuring onset error
    const gap=(((onsets[k+1] ?? BAR)-onsets[k])*spu)*0.9;
    const hold=Math.max(0.005, Math.min(holdMs/1000, gap));
    w.__advance(hold); cursor+=hold;
    up();
  }
  w.__advance(40); await sleep(90);
  const g=w.__lastGrade;
  const cls=d.getElementById('padPct').className;
  return {pct:g.pct, hits:g.hits, sustain:g.sustain, notes:notated.length,
          green:/great/.test(cls), red:/medium/.test(cls)};
}

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};

  console.log('=== an ordinary tap is not a mistake ===');
  // 150ms is a normal finger tap. It is nowhere near a quarter note, and that
  // is fine — the note was read and placed correctly.
  for(const holdMs of [120, 150, 250, 400]){
    const r = await play({holdMs});
    console.log(`  held ${String(holdMs+'ms').padEnd(6)} → ${String(r.pct+'%').padStart(4)}  onsets ${r.hits}  sustain ${r.sustain}`);
    ok(r.green, `a ${holdMs}ms tap on a correct read scores green (${r.pct}%)`);
  }

  console.log('\n=== reading well beats tapping precisely ===');
  for(const jitterMs of [60, 120]){
    const r = await play({holdMs:150, jitterMs});
    console.log(`  ±${String(jitterMs+'ms').padEnd(6)} → ${String(r.pct+'%').padStart(4)}  onsets ${r.hits}`);
    ok(r.green, `still green when every tap is ±${jitterMs}ms off the beat (${r.pct}%)`);
  }

  console.log('\n=== but it is still possible to fail ===');
  const stab = await play({holdMs:30});
  console.log(`  stabbing        → ${stab.pct}%  sustain ${stab.sustain}`);
  ok(!stab.green, `stabbing every note is not green (${stab.pct}%)`);

  const spam = await play({holdMs:150, spam:true});
  console.log(`  ignoring the page → ${spam.pct}%  onsets ${spam.hits} of ${spam.notes} notated`);
  ok(!spam.green, `tapping a steady stream regardless of what is written is not green (${spam.pct}%)`);

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
