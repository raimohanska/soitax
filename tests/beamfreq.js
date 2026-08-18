// How often does a beam actually appear, per level? Level 3 teaches beamed
// eighth pairs, so beams must be near-ubiquitous there.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const stub=`(function(){let t=0;
function osc(){const o={_f:0,type:'',frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},start(){},stop(){}};return o;}
function gain(){return{gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},cancelScheduledValues(){}},connect(){return this;}};}
function filt(){return{type:'',Q:{value:0},frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;}};}
function bufsrc(){return{buffer:null,connect(){return this;},start(){},stop(){}};}
class AC{constructor(){this.state='running';this.baseLatency=0;this.destination=gain();}
get currentTime(){return t;}resume(){return Promise.resolve();}
createOscillator(){return osc();}createGain(){return gain();}createBiquadFilter(){return filt();}
createBufferSource(){return bufsrc();}createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}
get sampleRate(){return 48000;}}
window.AudioContext=AC;const mem={};
window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};})();`;
const dom=new JSDOM(html.replace('<script>','<script>'+stub),{runScripts:'dangerously',pretendToBeVisual:true});
const w=dom.window,d=dom.window.document;
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
setTimeout(()=>{
  let fails=0;
  const isBeam=r=>{const wd=+r.getAttribute('width'),h=+r.getAttribute('height');
    return wd>8&&h>2.5&&h<5;};
  for(let lv=1;lv<=10;lv++){
    if(lv>1) click(d.getElementById('up'));
    let withBeams=0;const N=200;
    for(let i=0;i<N;i++){
      click(d.getElementById('nextBtn'));
      const rects=[...d.querySelectorAll('#score svg rect')].filter(isBeam);
      if(rects.length>0) withBeams++;
    }
    const pctB=Math.round(100*withBeams/N);
    let verdict='';
    if(lv<=2){ verdict = pctB===0?'ok (no beams expected yet)':'FAIL beams too early'; if(pctB!==0)fails++; }
    else if(lv===3){ verdict = pctB>=90?'ok (beams dominant)':'FAIL beams too rare at the level that teaches them'; if(pctB<90)fails++; }
    else { verdict = pctB>=60?'ok':'FAIL beams too rare'; if(pctB<60)fails++; }
    console.log(`level ${String(lv).padStart(2)}  patterns with beams: ${String(pctB).padStart(3)}%   ${verdict}`);
  }
  console.log(fails===0?'\n=== BEAM PROGRESSION OK ===':`\n=== ${fails} FAILURES ===`);
  process.exit(fails?1:0);
},300);
