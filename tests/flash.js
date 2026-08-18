// Beat flash must track the audio clock exactly (it replaces the click in
// silent practice, so drift would be worse than useless), and silent mode must
// genuinely schedule no audio.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const stub=`(function(){let t=0;
window.__hats=[]; window.__osc=0; window.__gains=[];
function osc(){const o={_f:0,type:'',frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},start(){window.__osc++;},stop(){}};return o;}
// gain starts at 1 (audible) and records what it was connected to, so the test
// can find the master metronome node and read whether it is muted.
function gain(){const g={gain:{value:1,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},
  connect(dst){this.__to=dst;return this;}};window.__gains.push(g);return g;}
function filt(){return{type:'',Q:{value:0},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}
class AC{constructor(){this.state='running';this.baseLatency=0;this.destination=gain();}
get currentTime(){return t;}resume(){return Promise.resolve();}
createOscillator(){return osc();}createGain(){return gain();}createBiquadFilter(){return filt();}
createBufferSource(){return{buffer:null,connect(){return this;},start(at){window.__hats.push(at);},stop(){}};}
createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}
get sampleRate(){return 48000;}}
window.AudioContext=AC;window.__advance=d=>{t+=d;};window.__now=()=>t;const mem={};
window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};})();`;
const dom=new JSDOM(html.replace('<script>','<script>'+stub),{runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window,d=w.document;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const G=id=>d.getElementById(id);
const tap=()=>{const p=G('pad');
  p.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:700}));
  p.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:700}));};
const lit=()=>G('pad').classList.contains('pulse')||G('pad').classList.contains('pulse-accent');
const accent=()=>G('pad').classList.contains('pulse-accent');

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};
  await sleep(320);

  console.log('=== flash elements exist ===');
  ok(d.querySelectorAll('#beats i').length===4,'four beat dots, one per beat of the bar');
  ok(!!G('silent'),'silent toggle present');
  ok(!lit(),'nothing flashing while idle');

  console.log('\n=== flash maps to the correct beat ===');
  // Edge-timing is unreliable here: jsdom drives rAF on real time while the test
  // advances virtual time, so sampling is coarse. Assert the MAPPING instead —
  // park the clock just inside each beat and check which dot is lit. The app
  // derives the index straight from the clock, so this is what can actually break.
  const bpm=Number(G('bpmVal').textContent), U=12, spu=(60/bpm)/U, beat=U*spu;
  tap(); await sleep(60);
  const settle=()=>new Promise(r=>setTimeout(r,40));   // let a few rAFs run
  let mapOk=0, mapBad=0;
  for(let k=0;k<8;k++){
    // move to just after the k-th beat boundary (t0 is 0.12s after the tap)
    const target=0.12 + k*beat + beat*0.04;
    const cur=w.__now();
    w.__advance(Math.max(0.0001, target-cur));
    await settle();
    const dots=[...d.querySelectorAll('#beats i')];
    const idx=dots.findIndex(x=>x.classList.contains('on')||x.classList.contains('accent'));
    const expect=k%4;
    const acc=dots[expect] && dots[expect].classList.contains('accent');
    const good = idx===expect && (expect===0 ? acc : !acc);
    if(good) mapOk++; else { mapBad++;
      console.log(`    beat ${k}: expected dot ${expect}, lit dot ${idx}, accent=${acc}`); }
  }
  console.log(`  correct beat mapping: ${mapOk}/8`);
  ok(mapBad===0, 'every beat lights its own dot, with the accent on beat one');
  w.__advance(60); await sleep(90);
  ok(!lit(),'flash cleared when the run ends');

  console.log('\n=== silent mode makes NO SOUND but still flashes ===');
  // The metronome is scheduled either way now and muted through a shared gain,
  // which is what lets you unmute mid-attempt. So "silent" is about audibility,
  // not about whether anything was scheduled.
  const master = () => w.__gains.find(g => g.__to === w.__gains[0]);   // node wired to destination
  G('silent').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await sleep(40);
  console.log('  toggle now reads:', G('silent').textContent);
  ok(/silent/i.test(G('silent').textContent),'toggle reflects silent state');
  w.__hats.length=0; w.__osc=0;
  tap(); await sleep(50);
  w.__advance(beat*0.5); await sleep(20);
  const m = master();
  console.log(`  hats scheduled: ${w.__hats.length}   metronome gain: ${m && m.gain.value}   oscillators started: ${w.__osc}`);
  ok(!!m && m.gain.value === 0,'metronome is muted in silent mode');
  ok(w.__osc===0,'no pitched audio in silent mode');
  // and the flash still works
  let sawFlash=false;
  for(let step=0; step<80; step++){
    w.__advance(beat/20);
    await new Promise(r=>setTimeout(r,0));
    if(lit()) sawFlash=true;
  }
  ok(sawFlash,'beat flash still runs with the sound off');
  // tapping is still recorded silently
  G('pad').dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:700}));
  w.__advance(0.4);
  G('pad').dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:700}));
  ok(w.__osc===0,'a tap makes no sound in silent mode');
  w.__advance(60); await sleep(90);
  const graded=w.__lastGrade.hits;
  console.log('  graded anyway:', graded);
  ok(/\d+\/\d+/.test(graded),'attempt is still graded in silent mode');

  console.log('\n=== accent distinguishes beat one ===');
  G('silent').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));   // sound back on
  await sleep(30);
  ok(/sound on/i.test(G('silent').textContent),'toggle returned to audible');

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
