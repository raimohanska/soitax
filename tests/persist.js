// `window.storage` only exists in the Claude webview. On a real phone the app
// must still remember what you chose — silent mode above all, since it is a
// deliberate setting you'd have to re-toggle every single launch otherwise.
// These runs deliberately do NOT define window.storage, so the localStorage
// fallback is the thing under test.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');

// Audio stub only — pointedly no window.storage, exactly like Safari.
const audio=`(function(){let t=0;
function osc(){const o={_f:0,type:'',frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},start(){},stop(){}};return o;}
function gain(){return{gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
function filt(){return{type:'',Q:{value:0},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}
class AC{constructor(){this.state='running';this.baseLatency=0;this.destination=gain();}
get currentTime(){return t;}resume(){return Promise.resolve();}
createOscillator(){return osc();}createGain(){return gain();}createBiquadFilter(){return filt();}
createBufferSource(){return{buffer:null,connect(){return this;},start(){},stop(){}};}
createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}
get sampleRate(){return 48000;}}
window.AudioContext=AC;window.__advance=d=>{t+=d;};})();`;

// `seed` is written to localStorage before the app script runs — that is what a
// relaunch looks like from the app's point of view.
function boot(seed){
  const pre = seed ? `localStorage.setItem('pulse-v6',${JSON.stringify(seed)});` : '';
  const dom=new JSDOM(html.replace('<script>','<script>'+audio+pre),
    {runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/'});
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};

  console.log('=== the app runs at all without window.storage ===');
  const w1=boot(null); const d1=w1.document;
  await sleep(320);
  ok(w1.storage===undefined,'window.storage genuinely absent (Safari conditions)');
  ok(d1.querySelectorAll('#score svg').length>0,'notation still renders');
  ok(/sound on/i.test(d1.getElementById('silent').textContent),'defaults to sound on');

  console.log('\n=== choices are written to localStorage ===');
  d1.getElementById('silent').dispatchEvent(new w1.MouseEvent('click',{bubbles:true}));
  await sleep(60);
  ok(/silent/i.test(d1.getElementById('silent').textContent),'toggled to silent');
  const raw=w1.localStorage.getItem('pulse-v6');
  console.log('  localStorage holds:', raw);
  ok(raw!==null,'something was actually persisted');
  const saved=JSON.parse(raw||'{}');
  ok(saved.silent===true,'silent mode written to localStorage');

  console.log('\n=== and are read back on the next launch ===');
  // This is the bug the user hit: silent had to be re-picked every launch.
  const w2=boot(raw); const d2=w2.document;
  await sleep(320);
  console.log('  toggle reads:', d2.getElementById('silent').textContent);
  ok(/silent/i.test(d2.getElementById('silent').textContent),
     'silent mode survived the relaunch');

  console.log('\n=== the rest of the state round-trips too ===');
  const w3=boot(JSON.stringify({level:4,calMs:120,streak:2,userBpm:96,silent:false}));
  const d3=w3.document;
  await sleep(320);
  console.log('  level:',d3.getElementById('lvTxt').textContent.trim(),
              ' bpm:',d3.getElementById('bpmVal').textContent);
  ok(/Level 4/.test(d3.getElementById('lvTxt').textContent),'level restored');
  ok(Number(d3.getElementById('bpmVal').textContent)===96,'chosen tempo restored');
  ok(/sound on/i.test(d3.getElementById('silent').textContent),'silent:false restored as sound on');

  console.log('\n=== a Claude-webview storage API still wins when present ===');
  // The webview provides its own storage; the fallback must not shove it aside.
  const dom=new JSDOM(html.replace('<script>','<script>'+audio+
    `const mem={};window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,
      set:async(k,v)=>{mem[k]=v;window.__usedHostStorage=true;return{key:k,value:v}}};`),
    {runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/'});
  const w4=dom.window,d4=w4.document;
  await sleep(320);
  d4.getElementById('silent').dispatchEvent(new w4.MouseEvent('click',{bubbles:true}));
  await sleep(60);
  ok(w4.__usedHostStorage===true,'host storage used in preference to localStorage');
  ok(w4.localStorage.getItem('pulse-v6')===null,'localStorage left untouched in the webview');

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
