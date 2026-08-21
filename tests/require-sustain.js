// Prove the grading logic: on level 1 (quarter notes), all notes are clicks so
// sustain is not required — both long holds and staccato taps should pass. This
// confirms the click behaviour for short notes.
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

async function trial(holdFactor, win, doc){
  const pad=()=>doc.getElementById('pad');
  const pev=(t)=>pad().dispatchEvent(new win.MouseEvent(t,{bubbles:true,cancelable:true}));

  const U=12,spu=(60/58)/U, BAR=48;

  // notated onsets in units, straight from the model (abcjs owns rendering)
  const onsets=(win.__onsets||[]).slice();

  pev('pointerdown');pev('pointerup');
  await new Promise(r=>setTimeout(r,50));
  win.__advance(4*U*spu+0.12);
  await new Promise(r=>setTimeout(r,50));

  const noteLen=12*spu;  // quarter note
  let cursor=0;
  for(const onset of onsets){
    const target=onset*spu;
    win.__advance(Math.max(0.005, target-cursor)); cursor=target;
    const hold=Math.max(0.005, noteLen*holdFactor);
    pev('pointerdown');
    win.__advance(hold);
    pev('pointerup');
    cursor+=hold;
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

  const dom=new JSDOM(html.replace('<script>','<script>'+stub),
    {runScripts:'dangerously',pretendToBeVisual:true});
  const win=dom.window,doc=win.document;
  await new Promise(r=>setTimeout(r,150));

  const good = await trial(1.0, win, doc);
  console.log('correct hold  :', JSON.stringify(good));
  const stab = await trial(0.08, win, doc);
  console.log('staccato stabs:', JSON.stringify(stab));

  const onNum = s => Number(String(s).split('/')[0]);
  const onDen = s => Number(String(s).split('/')[1]);

  // Both should land the same onsets (quarter notes are clicks)
  ok(onNum(good.onsets) > 0, 'correct trial lands onsets');
  ok(onNum(stab.onsets) > 0, 'staccato trial also lands onsets (clicks)');

  // Both should have identical sustain-per-onset since all notes are clicks (lo=0)
  const gSus = good.sustain, sSus = stab.sustain;
  const gSusN = Number(String(gSus).split('/')[0]);
  const gSusD = Number(String(gSus).split('/')[1]);
  const sSusN = Number(String(sSus).split('/')[0]);
  const sSusD = Number(String(sSus).split('/')[1]);
  const gRatio = gSusD ? gSusN/gSusD : 1;
  const sRatio = sSusD ? sSusN/sSusD : 1;
  ok(Math.abs(gRatio - sRatio) < 0.01,
     `sustain ratio identical for clicks (${gRatio.toFixed(2)} vs ${sRatio.toFixed(2)})`);

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
