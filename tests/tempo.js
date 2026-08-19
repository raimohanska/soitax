const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const stub=`(function(){let t=0;window.__hats=[];
function osc(){const o={_f:0,type:'',frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},start(){},stop(){}};return o;}
function gain(){return{gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
function filt(){return{type:'',Q:{value:0},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}
class AC{constructor(){this.state='running';this.baseLatency=0;this.destination=gain();}
get currentTime(){return t;}resume(){return Promise.resolve();}
createOscillator(){return osc();}createGain(){return gain();}createBiquadFilter(){return filt();}
createBufferSource(){return{buffer:null,connect(){return this;},start(at){window.__hats.push(at);},stop(){}};}
createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}
get sampleRate(){return 48000;}}
window.AudioContext=AC;window.__advance=d=>{t+=d;};const mem={};
window.__mem=mem;
window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};})();`;
const dom=new JSDOM(html.replace('<script>','<script>'+stub),{runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window,d=w.document;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const G=id=>d.getElementById(id);

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};
  await sleep(300);

  console.log('=== tempo control exists and is big enough to hit ===');
  const up=G('bpmUp'), down=G('bpmDown');
  ok(!!up && !!down, 'tempo buttons present');
  const css=[...d.querySelectorAll('style')].map(s=>s.textContent).join('');
  const m=css.match(/\.tbtn\{[^}]*min-height:(\d+)px/);
  console.log('  tempo button min-height:', m?m[1]+'px':'not found');
  ok(m && Number(m[1])>=44, 'tempo buttons meet the 44px touch-target minimum');

  console.log('\n=== changing tempo works and sticks ===');
  const start=Number(G('bpmVal').textContent);
  console.log('  default at level 1:', start);
  click(up); click(up); await sleep(40);
  const faster=Number(G('bpmVal').textContent);
  console.log('  after 2 × faster:', faster);
  ok(faster===start+8, 'each press moves 4 BPM');
  click(down); await sleep(40);
  ok(Number(G('bpmVal').textContent)===faster-4, 'slower works too');

  console.log('\n=== tempo actually drives the metronome ===');
  const bpmNow=Number(G('bpmVal').textContent);
  w.__hats.length=0;
  const pad=G('pad');
  pad.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:700}));
  pad.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:700}));
  await sleep(60);
  const hats=w.__hats.slice(0,4);
  const gaps=[]; for(let i=1;i<hats.length;i++) gaps.push(hats[i]-hats[i-1]);
  const avg=gaps.reduce((a,b)=>a+b,0)/gaps.length;
  const expected=60/bpmNow;
  console.log(`  click spacing ${avg.toFixed(4)}s, expected ${expected.toFixed(4)}s at ${bpmNow} BPM`);
  ok(Math.abs(avg-expected)<0.002, 'metronome spacing matches the chosen tempo');
  ok(G('bpmUp').disabled && G('bpmDown').disabled, 'tempo locked during a run');
  w.__advance(60); await sleep(90);
  ok(!G('bpmUp').disabled, 'tempo unlocked after the run');

  console.log('\n=== tempo persists and survives level changes ===');
  const chosen=Number(G('bpmVal').textContent);
  click(G('lvUp')); await sleep(40);
  console.log('  after level change:', G('bpmVal').textContent);
  ok(Number(G('bpmVal').textContent)===chosen, 'user tempo is kept when the level changes');
  const saved=JSON.parse(w.__mem['soitax-v1']);
  console.log('  persisted:', JSON.stringify(saved));
  ok(saved.userBpm===chosen, 'tempo written to storage');

  console.log('\n=== limits are respected ===');
  for(let i=0;i<80;i++) click(G('bpmUp'));
  await sleep(40);
  console.log('  maxed at:', G('bpmVal').textContent);
  ok(G('bpmUp').disabled, 'cannot exceed the maximum');
  for(let i=0;i<120;i++) click(G('bpmDown'));
  await sleep(40);
  console.log('  floored at:', G('bpmVal').textContent);
  ok(G('bpmDown').disabled, 'cannot go below the minimum');

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
