// Reading is the skill. A correct READ with loose timing must pass; a wrong
// read must still fail. And ties must be able to cross the bar line.
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

function boot(){
  const dom=new JSDOM(html.replace('<script>','<script>'+stub),{runScripts:'dangerously',pretendToBeVisual:true});
  return dom.window;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// play level 1 (quarters/rests) reading correctly but sloppily by `jitter` seconds
async function trial(jitter, holdFrac){
  const w=boot(), d=w.document;
  await sleep(280);
  const G=id=>d.getElementById(id);
  const pad=G('pad');
  const down=(x=150)=>pad.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:x,clientY:700}));
  const up=(x=150)=>pad.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:x,clientY:700}));
  const bpm=Number(G('bpmVal').textContent), U=12, spu=(60/bpm)/U;

  // read the notated rhythm out of the DOM: note x positions → onsets in units
  const svg=d.querySelector('#score svg');
  const PAD_L=16, SPAN=320-16-20, BAR=48;
  const heads=[...svg.querySelectorAll('ellipse')].map(e=>+e.getAttribute('cx')).sort((a,b)=>a-b);
  const onsets=heads.map(x=>Math.round(((x-PAD_L)/SPAN)*BAR));

  down(); up();                      // begin
  await sleep(50);
  w.__advance(4*U*spu + 0.12);
  await sleep(40);
  // Level 1 is quarter notes only, so the notated value is exactly one beat.
  // (Using the gap to the next onset would mean holding through rests, which
  // is genuinely wrong playing and SHOULD fail.)
  const noteDur = U*spu;
  let cursor=0;
  for(let k=0;k<onsets.length;k++){
    const target=onsets[k]*spu + (k%2? jitter : -jitter);   // alternate early/late
    // never fire two presses within the debounce window — a real finger can't
    // release and re-press in a millisecond, and the app rightly ignores it
    const step = Math.max(0.05, target - cursor);
    w.__advance(step); cursor += step;
    down();
    // Never hold past the NEXT onset: doing so would delay the following tap
    // and we'd be measuring onset error, not sustain tolerance.
    const gap=(((onsets[k+1]??BAR)-onsets[k])*spu)*0.95;
    const hold=Math.max(0.01, Math.min(noteDur*holdFrac, gap));
    w.__advance(hold); cursor+=hold;
    up();
  }
  w.__advance(40); await sleep(90);
  return {pct:w.__lastGrade.pct, onsets:w.__lastGrade.hits,
          sus:w.__lastGrade.sustain, notes:onsets.length};
}

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};

  console.log('=== correct read, sloppy timing should PASS ===');
  for(const j of [0, 0.08, 0.15, 0.22]){
    const r=await trial(j, 0.85);
    const pass=r.pct>=80;
    if(!pass) fails++;
    console.log(`  jitter ±${(j*1000).toFixed(0).padStart(3)}ms → ${String(r.pct).padStart(3)}%  onsets ${r.onsets}  sustain ${r.sus}  ${pass?'ok':'FAIL'}`);
  }

  console.log('\n=== sloppy sustain within reason should PASS ===');
  for(const h of [0.5, 0.75, 1.0, 1.6]){
    const r=await trial(0.05, h);
    const pass=r.pct>=80;
    if(!pass) fails++;
    console.log(`  held ${(h*100).toFixed(0).padStart(4)}% of value → ${String(r.pct).padStart(3)}%  sustain ${r.sus}  ${pass?'ok':'FAIL'}`);
  }

  console.log('\n=== a genuinely wrong read must still FAIL ===');
  const stab=await trial(0.05, 0.03);        // stabbing everything staccato
  console.log(`  staccato stabs → ${stab.pct}%  sustain ${stab.sus}`);
  ok(stab.pct < 80, 'stabbing long notes still fails (sustain wrong)');

  console.log('\n=== ties across the bar line ===');
  const w=boot(), d=w.document;
  await sleep(280);
  for(let i=0;i<5;i++) d.getElementById('up').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  await sleep(40);
  console.log('  level:', d.getElementById('lvTxt').textContent.trim(),
              '| bars:', d.getElementById('meta').textContent.trim());
  let crossed=0, tries=0;
  while(crossed===0 && tries<300){
    d.getElementById('nextBtn').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
    const svg=d.querySelector('#score svg');
    // a cross-bar tie renders as an arc that runs past the barline on one row
    // and in from the left margin on the next
    const arcs=[...svg.querySelectorAll('path')].filter(p=>
      p.getAttribute('fill')==='none' && /Q/.test(p.getAttribute('d')||''));
    for(const p of arcs){
      const m=p.getAttribute('d').match(/M([\d.\-]+)\s+[\d.\-]+\s+Q\s*[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)/);
      if(!m) continue;
      const x1=parseFloat(m[1]), x2=parseFloat(m[2]);
      if(x2 > 320-20+8 || x1 < 16-8) crossed++;     // runs off an edge
    }
    tries++;
  }
  console.log(`  cross-bar tie halves found: ${crossed} (after ${tries} patterns)`);
  ok(crossed>0, 'ties can span into the next measure');

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
