// What does hold LENGTH cost you? Identical onsets, only the hold differs.
//
// The answer changed: everything the generator writes is a half note or shorter,
// and those all count as a click now, so tapping short is free. Only smearing a
// note far past its value is still a misread. Both trials must run on the SAME
// bar or the comparison is meaningless, hence the seeded RNG.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const stub=`
(function(){let t=0;
// deterministic pattern, so every trial reads the identical bar
let seed=12345;
Math.random=()=>{seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;};
function osc(){const o={_f:0,type:'',frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},start(){},stop(){}};return o;}
function gain(){return{gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
function filt(){return{type:'',Q:{value:0},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}
class AC{constructor(){this.state='running';this.baseLatency=0;this.destination=gain();}
get currentTime(){return t;}resume(){return Promise.resolve();}
createOscillator(){return osc();}createGain(){return gain();}createBiquadFilter(){return filt();}createBufferSource(){return{buffer:null,connect(){return this;},start(){},stop(){}};}createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}get sampleRate(){return 48000;}}
window.AudioContext=AC;window.__advance=d=>{t+=d;};
const mem={};window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};})();
`;

// hold factor: 1.0 = correct, 0.1 = staccato stabs, 3.0 = way over-held
async function trial(holdFactor){
  const dom=new JSDOM(html.replace('<script>','<script>'+stub),
    {runScripts:'dangerously',pretendToBeVisual:true});
  const win=dom.window,doc=win.document;
  const pad=()=>doc.getElementById('pad');
  const pev=(t)=>pad().dispatchEvent(new win.MouseEvent(t,{bubbles:true,cancelable:true}));
  await new Promise(r=>setTimeout(r,250));

  const U=12,spu=(60/58)/U, noteLen=12*spu, BAR=48;

  // Tap what is written. Tapping a blind stream would rack up extra taps, and
  // those are mistakes now — we would be measuring the wrong thing.
  const svg=doc.querySelector('#score svg');
  const PAD_L=16, SPAN=320-16-20;
  const onsets=[...svg.querySelectorAll('ellipse')]
    .map(e=>+e.getAttribute('cx')).sort((a,b)=>a-b)
    .map(x=>Math.round(((x-PAD_L)/SPAN)*BAR));

  win.__advance(1);
  pev('pointerdown');pev('pointerup');
  await new Promise(r=>setTimeout(r,50));
  win.__advance(4*U*spu+0.12);
  await new Promise(r=>setTimeout(r,50));

  let cursor=0;
  for(let k=0;k<onsets.length;k++){
    const step=Math.max(0.02, onsets[k]*spu - cursor);
    win.__advance(step); cursor+=step;
    pev('pointerdown');
    const hold=Math.max(0.005, noteLen*holdFactor*0.95);
    win.__advance(hold); cursor+=hold;
    pev('pointerup');
  }
  win.__advance(25);
  await new Promise(r=>setTimeout(r,90));
  return {
    pct: win.__lastGrade.pct,
    onsets: win.__lastGrade.hits,
    sustain: win.__lastGrade.sustain,
  };
}

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};

  const good = await trial(1.0);
  console.log('correct hold  :', JSON.stringify(good));
  const stab = await trial(0.08);
  console.log('staccato stabs:', JSON.stringify(stab));
  const dragged = await trial(3.4);
  console.log('held far too long:', JSON.stringify(dragged));

  const susNum = s => Number(String(s).split('/')[0]);
  const onNum  = s => Number(String(s).split('/')[0]);

  // The floor is gone on purpose: nothing the generator writes is longer than a
  // half note, and everything up to a half note now counts as a click. Tapping
  // short is how people actually play, and it is no longer a mistake.
  ok(susNum(stab.sustain) === susNum(good.sustain),
     `a short tap is as good as a full hold (${stab.sustain} vs ${good.sustain})`);
  ok(onNum(stab.onsets) > 0,
     `stabs land their onsets (${stab.onsets})`);
  ok(parseInt(stab.pct) === parseInt(good.pct),
     `and score the same (${stab.pct} vs ${good.pct})`);

  // What survives is the ceiling — smearing one note across the next, or
  // holding straight through a rest, is still a misread.
  ok(susNum(dragged.sustain) < susNum(good.sustain),
     `holding far too long is still wrong (${dragged.sustain} vs ${good.sustain})`);
  ok(parseInt(dragged.pct) < parseInt(good.pct),
     `and costs the score (${dragged.pct} vs ${good.pct})`);

  console.log('\n' + (fails===0?'=== ONLY OVER-HOLDING IS PENALISED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
