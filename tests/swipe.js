// Tap and swipe share the pad. Neither may trigger the other.
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

// jsdom lacks PointerEvent; MouseEvent carries clientX/clientY which is all we read
function pt(target,type,x,y){
  const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y});
  target.dispatchEvent(e);
}
function fingerprint(){
  // model-derived (abcjs owns rendering, not loaded headless)
  return w.__abc || '';
}

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};
  await sleep(150);
  const pad=d.getElementById('pad');

  console.log('=== nav controls present and labelled ===');
  const prev=d.getElementById('prevBtn'), next=d.getElementById('nextBtn');
  ok(!!prev && !!next, 'both prev and next controls exist');
  ok(/previous/i.test(prev.getAttribute('aria-label')||'') &&
     /next/i.test(next.getAttribute('aria-label')||''),
     'nav buttons carry descriptive labels');
  // level 1 only has 16 possible bars, so use a level with real variety
  for(let i=0;i<2;i++) click(d.getElementById('lvUp'));
  await sleep(40);

  console.log('\n=== swipe across the pad changes pattern, does NOT start ===');
  const before=fingerprint();
  pt(pad,'pointerdown',60,700); pt(pad,'pointerup',220,706);   // horizontal swipe
  await sleep(60);
  ok(pad.dataset.m==='idle', `swipe did not start an attempt (mode=${pad.dataset.m})`);
  ok(fingerprint()!==before, 'swipe produced a new pattern');

  console.log('\n=== tap on the pad starts, does NOT change pattern ===');
  const p2=fingerprint();
  pt(pad,'pointerdown',150,700); pt(pad,'pointerup',152,702);  // tap (tiny movement)
  await sleep(60);
  ok(pad.dataset.m==='count'||pad.dataset.m==='play', `tap started the attempt (mode=${pad.dataset.m})`);
  ok(fingerprint()===p2, 'tap left the pattern unchanged');

  // let it finish
  win_advance(30); await sleep(90);
  function win_advance(n){ w.__advance(n); }

  console.log('\n=== vertical drag is ignored (scrolling, not a swipe) ===');
  await sleep(50);
  const p3=fingerprint();
  pt(pad,'pointerdown',150,600); pt(pad,'pointerup',158,760);  // mostly vertical
  await sleep(60);
  ok(fingerprint()===p3, 'vertical drag did not change the pattern');
  ok(pad.dataset.m==='idle', 'vertical drag did not start an attempt');

  console.log('\n=== swipe outside the pad also works ===');
  const p4=fingerprint();
  const score=d.getElementById('score');
  pt(score,'pointerdown',60,400); pt(score,'pointerup',230,404);
  await sleep(60);
  ok(fingerprint()!==p4, 'swipe on the notation area advances too');

  console.log('\n=== swipe during an attempt is ignored ===');
  pt(pad,'pointerdown',150,700); pt(pad,'pointerup',151,701);   // start
  await sleep(50);
  const during=fingerprint();
  pt(pad,'pointerdown',60,700); pt(pad,'pointerup',230,704);    // try to swipe
  await sleep(50);
  ok(fingerprint()===during, 'pattern cannot change mid-attempt');

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
