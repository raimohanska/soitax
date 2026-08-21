// Repetition checker: "next" must not hand back a pattern we already remember.
// The user-visible failure is a repeat right under your thumb (press next
// twice, see the same bar again); the subtler one is cycling between two or
// three patterns. Within a window far smaller than any level's pattern space,
// everything shown must be distinct.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const stub=`(function(){let t=0;
function osc(){const o={_f:0,type:'',frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}} ,connect(){return this;},start(){},stop(){}};return o;}
function gain(){return{gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
function filt(){return{type:'',Q:{value:0},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
class AC{constructor(){this.state='running';this.baseLatency=0;this.destination=gain();}
get currentTime(){return t;}resume(){return Promise.resolve();}
createOscillator(){return osc();}createGain(){return gain();}createBiquadFilter(){return filt();}
createBufferSource(){return{buffer:null,connect(){return this;},start(){},stop(){}};}
createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}
get sampleRate(){return 48000;}}
window.AudioContext=AC;const mem={};
window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};})();`;
const dom=new JSDOM(html.replace('<script>','<script>'+stub),{runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window,d=w.document;
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));

setTimeout(()=>{
  let fails=0;
  // Level 1 has only ~16 distinct one-bar patterns, so the all-distinct window
  // must stay comfortably inside that; consecutive checks can run longer.
  const DISTINCT_WINDOW = 8, CONSEC_N = 40;
  for(let lv=1;lv<=10;lv++){
    if(lv>1) click(d.getElementById('lvUp'));
    const seen=new Set();
    let prev=w.__abc, consecBad=0;
    seen.add(prev);
    for(let i=0;i<CONSEC_N;i++){
      click(d.getElementById('nextBtn'));
      const f=w.__abc;
      if(f===prev) consecBad++;
      if(i<DISTINCT_WINDOW) seen.add(f);
      prev=f;
    }
    const pass = consecBad===0 && seen.size===DISTINCT_WINDOW+1;
    if(!pass) fails++;
    console.log(`level ${String(lv).padStart(2)}  consecutive repeats: ${consecBad}  distinct in ${DISTINCT_WINDOW}: ${seen.size}/${DISTINCT_WINDOW+1}  ${pass?'ok':'FAIL — repeated a remembered pattern'}`);
  }
  console.log(fails===0?'\n=== NO REPEATS AT ANY LEVEL ===':`\n=== ${fails} LEVEL(S) REPEATING ===`);
  process.exit(fails?1:0);
},150);
