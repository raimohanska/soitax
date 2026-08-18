// Prove sustain is REQUIRED: identical onsets, only the hold length differs.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const stub=`
(function(){let t=0;
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

  const U=12,spu=(60/58)/U, noteLen=12*spu;  // level 1 is quarter notes
  win.__advance(1);
  pev('pointerdown');pev('pointerup');
  await new Promise(r=>setTimeout(r,50));
  win.__advance(4*U*spu+0.12);
  await new Promise(r=>setTimeout(r,50));

  for(let i=0;i<8;i++){
    pev('pointerdown');
    win.__advance(Math.max(0.005, noteLen*holdFactor*0.95));
    pev('pointerup');
    const rest = noteLen - noteLen*holdFactor*0.95;
    win.__advance(rest>0?rest:0.001);
  }
  win.__advance(25);
  await new Promise(r=>setTimeout(r,90));
  return {
    pct: doc.getElementById('rPct').textContent,
    onsets: doc.getElementById('rHits').textContent,
    sustain: doc.getElementById('rSus').textContent,
  };
}

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};

  const good = await trial(1.0);
  console.log('correct hold  :', JSON.stringify(good));
  const stab = await trial(0.08);
  console.log('staccato stabs:', JSON.stringify(stab));

  const susNum = s => Number(String(s).split('/')[0]);
  const onNum  = s => Number(String(s).split('/')[0]);

  ok(susNum(good.sustain) > susNum(stab.sustain),
     `correct holds score better on sustain (${good.sustain} vs ${stab.sustain})`);
  ok(onNum(stab.onsets) > 0,
     `stabs still land their onsets (${stab.onsets}) — so the penalty is sustain-specific`);
  ok(parseInt(good.pct) > parseInt(stab.pct),
     `overall score requires sustain (${good.pct} vs ${stab.pct})`);

  console.log('\n' + (fails===0?'=== SUSTAIN IS REQUIRED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
