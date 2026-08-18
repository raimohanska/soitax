// The bug: level 1 had only one usable cell, so every bar was four quarters.
// Assert every level produces a decent spread of DISTINCT patterns.
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
window.AudioContext=AC;const mem={};
window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};})();`;
const dom=new JSDOM(html.replace('<script>','<script>'+stub),{runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window,d=w.document;
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));

// fingerprint a pattern by the x positions + fill of every glyph
function fingerprint(){
  const svg=d.querySelector('#score svg');
  return [...svg.querySelectorAll('ellipse,circle,path,line')]
    .map(e=>e.tagName+':'+(e.getAttribute('cx')||e.getAttribute('x1')||e.getAttribute('d')||'').slice(0,24))
    .join('|');
}
setTimeout(()=>{
  let fails=0;
  for(let lv=1;lv<=10;lv++){
    if(lv>1) click(d.getElementById('up'));
    const seen=new Set(); const N=120;
    for(let i=0;i<N;i++){ click(d.getElementById('nextBtn')); seen.add(fingerprint()); }
    const distinct=seen.size;
    const pass = distinct >= 8;
    if(!pass) fails++;
    console.log(`level ${String(lv).padStart(2)}  distinct patterns in ${N}: ${String(distinct).padStart(3)}  ${pass?'ok':'FAIL — too repetitive'}`);
  }
  // no pattern may be empty — a bar of pure rests gives the reader nothing to do
  console.log('\n--- minimum content ---');
  let empties=0, thin=0;
  for(let lv=1;lv<=10;lv++){
    for(let i=0;i<300;i++){
      click(d.getElementById('nextBtn'));
      const heads=d.querySelectorAll('#score svg ellipse').length;
      if(heads===0) empties++;
      if(heads===1) thin++;
    }
  }
  console.log(`patterns with no notes at all: ${empties}   with only one: ${thin}`);
  if(empties>0){ fails++; console.log('FAIL — empty patterns generated'); }
  else console.log('ok — every pattern has something to play');
  console.log(fails===0?'\n=== VARIETY OK AT EVERY LEVEL ===':`\n=== ${fails} LEVELS TOO REPETITIVE ===`);
  process.exit(fails?1:0);
},300);
