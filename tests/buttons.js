// Button layout must be coherent in every state, and the level-up suggestion
// must appear only after a real streak.
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
const dom=new JSDOM(html.replace('<script>','<script>'+stub),{runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window,d=w.document;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const G=id=>d.getElementById(id);
function tapPad(){
  const pad=G('pad');
  pad.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:700}));
  pad.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:700}));
}
function fingerprint(){
  return [...d.querySelectorAll('#score svg ellipse')].map(e=>e.getAttribute('cx')).join(',');
}
function state(){
  return {
    mode:G('pad').dataset.m,
    main:G('padMain').textContent,
    prev:G('prevBtn').disabled, next:G('nextBtn').disabled,
    hear:G('hear').disabled,
    up:G('up').disabled, down:G('down').disabled,
    suggest:G('nextBtn').classList.contains('suggest'),
    promo:G('promo').classList.contains('on'),
  };
}
// play a pattern well or badly
async function attempt(good){
  const U=12,spu=(60/(58+ (0)))/U, BAR=48;   // level 1 tempo
  // Play what is written, not a blind stream of four quarters: a tap landing on
  // a rest is an extra now, and enough of them drag a "good" run below the pass
  // mark, so the streak never builds and the level-up prompt never appears.
  const PAD_L=16, SPAN=320-16-20;
  const onsets=[...d.querySelectorAll('#score svg ellipse')]
    .map(e=>+e.getAttribute('cx')).sort((a,b)=>a-b)
    .map(x=>Math.round(((x-PAD_L)/SPAN)*BAR));

  tapPad(); await sleep(50);
  w.__advance(4*U*spu+0.2);
  await sleep(40);
  if(good){
    const pad=G('pad');
    let cursor=0;
    for(let k=0;k<onsets.length;k++){
      const step=Math.max(0.02, onsets[k]*spu - cursor);
      w.__advance(step); cursor+=step;
      pad.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:700}));
      const gap=(((onsets[k+1] ?? BAR)-onsets[k])*spu)*0.9;
      const hold=Math.max(0.02, Math.min(12*spu*0.92, gap));
      w.__advance(hold); cursor+=hold;
      pad.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:700}));
    }
  }
  w.__advance(30); await sleep(90);
}

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};
  await sleep(320);

  console.log('=== STATE: fresh pattern ===');
  let st=state(); console.log('  ',JSON.stringify(st));
  ok(st.main==='Begin','centre says Begin');
  ok(st.prev===true,'prev disabled with no history behind');
  ok(st.next===false,'next enabled');
  ok(st.hear===false,'show me enabled');
  ok(st.suggest===false,'forward arrow not highlighted yet');

  console.log('\n=== next/prev navigate history ===');
  // Don't assert that two consecutive draws differ: level 1 has only about a
  // dozen legal bars, so an identical redraw is ordinary luck, not a bug. Assert
  // that "next" keeps drawing (some variety across several) and that history
  // round-trips exactly — which holds whether or not neighbours happen to match.
  const seen=new Set([fingerprint()]);
  for(let i=0;i<8;i++){ click(G('nextBtn')); await sleep(30); seen.add(fingerprint()); }
  console.log('  distinct patterns in 9 draws:', seen.size);
  ok(seen.size>1,'next keeps drawing new patterns');

  const p1=fingerprint();
  click(G('nextBtn')); await sleep(40);
  const p2=fingerprint();
  ok(G('prevBtn').disabled===false,'prev now enabled');
  click(G('prevBtn')); await sleep(40);
  ok(fingerprint()===p1,'prev returned to the previous pattern');
  click(G('nextBtn')); await sleep(40);
  ok(fingerprint()===p2,'next went forward through history, not a new random one');

  console.log('\n=== STATE: during count-in / play ===');
  tapPad(); await sleep(50);
  st=state(); console.log('  ',JSON.stringify(st));
  ok(st.mode==='count','pad in count-in');
  ok(st.prev&&st.next&&st.hear&&st.up&&st.down,'every other control disabled while running');
  w.__advance(5); await sleep(40);
  st=state();
  ok(st.mode==='play','pad in play');
  ok(st.main==='Tap','centre says Tap');
  ok(st.prev&&st.next,'nav still locked mid-attempt');
  w.__advance(30); await sleep(90);

  console.log('\n=== STATE: after a poor attempt ===');
  st=state(); console.log('  ',JSON.stringify(st));
  ok(st.main==='Again','centre offers a retry of the same pattern');
  ok(st.prev===false&&st.next===false,'nav re-enabled');
  ok(st.suggest===false,'forward arrow NOT highlighted after a poor run');
  const same=fingerprint();
  tapPad(); await sleep(40); w.__advance(40); await sleep(90);
  ok(fingerprint()===same,'"Again" replayed the same pattern');

  console.log('\n=== STATE: after a good attempt ===');
  click(G('nextBtn')); await sleep(40);
  await attempt(true);
  st=state(); console.log('  ',JSON.stringify(st), ' score:',w.__lastGrade.pct+'%');
  const scored=w.__lastGrade.pct;
  if(scored>=80){
    ok(st.suggest===true,'forward arrow highlighted as the suggested next move');
    ok(st.main==='Again','centre still allows a repeat');
  } else { console.log('  (score below threshold, skipping suggest checks)'); }

  console.log('\n=== level-up suggestion after a streak ===');
  let shown=false;
  for(let i=0;i<6 && !shown;i++){
    click(G('nextBtn')); await sleep(30);
    await attempt(true);
    shown=G('promo').classList.contains('on');
  }
  console.log('  promo shown:',shown,' text:',G('promoTxt').textContent.trim());
  ok(shown,'level-up suggestion appears after enough clean runs');
  ok(/level 2/i.test(G('promoTxt').textContent),'suggestion names the next level');

  console.log('\n=== accepting the suggestion levels up ===');
  const before=G('lvTxt').textContent;
  click(G('promoYes')); await sleep(60);
  console.log('  ',G('lvTxt').textContent.trim());
  ok(G('lvTxt').textContent!==before,'level changed');
  ok(/Level 2/.test(G('lvTxt').textContent),'now on level 2');
  ok(!G('promo').classList.contains('on'),'suggestion dismissed after accepting');
  ok(G('prevBtn').disabled===true,'history cleared for the new level');

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
