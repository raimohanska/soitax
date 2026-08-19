const fs=require('fs');const {JSDOM}=require('jsdom');const sharp=require('sharp');
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
setTimeout(async()=>{
  for(let i=0;i<5;i++) click(d.getElementById('lvUp'));
  // hunt for a pattern with a tie crossing the bar line
  let found=false;
  for(let n=0;n<300 && !found;n++){
    click(d.getElementById('nextBtn'));
    const svg=d.querySelector('#score svg');
    const arcs=[...svg.querySelectorAll('path')].filter(p=>
      p.getAttribute('fill')==='none' && /Q/.test(p.getAttribute('d')||''));
    for(const p of arcs){
      const m=p.getAttribute('d').match(/M([\d.\-]+)\s+[\d.\-]+\s+Q\s*[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)/);
      if(m && (parseFloat(m[2])>308 || parseFloat(m[1])<8)) found=true;
    }
  }
  const svg=d.querySelector('#score svg');
  const raw=new w.XMLSerializer().serializeToString(svg);
  const vb=svg.getAttribute('viewBox');const[,,vwd,vh]=vb.split(' ').map(Number);
  const wrapped=`<svg xmlns="http://www.w3.org/2000/svg" width="${vwd*3}" height="${vh*3}" viewBox="${vb}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    ${raw.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>`;
  await sharp(Buffer.from(wrapped)).png().toFile(__dirname+'/crossbar.png');
  console.log('cross-bar tie found:',found,'→ /home/claude/crossbar.png');
},300);
