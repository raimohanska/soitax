// A tie must be ONE sustained sound: one attack, one target, duration spanning
// both noteheads — and an arc drawn between them.
const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const stub=`(function(){let t=0;
window.__attacks=[];
function osc(){const o={_f:0,type:'',frequency:{set value(v){o._f=v;},get value(){return o._f;},setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){return this;},start(at){},stop(){}};return o;}
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
const click=el=>el.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};
  await sleep(300);

  // go to level 6 where ties live
  for(let i=0;i<5;i++) click(d.getElementById('up'));
  await sleep(50);
  console.log('  level:', d.getElementById('lvTxt').textContent.trim());

  console.log('\n=== ties get drawn ===');
  let found=false, tries=0, arcs=0;
  while(!found && tries<120){
    click(d.getElementById('nextBtn'));
    // a tie is a quadratic path with fill:none — distinct from filled glyphs
    arcs=[...d.querySelectorAll('#score svg path')].filter(p=>
      p.getAttribute('fill')==='none' && /Q/.test(p.getAttribute('d')||'')).length;
    if(arcs>0) found=true;
    tries++;
  }
  ok(found, `tie arcs rendered (${arcs} arcs after ${tries} patterns)`);

  console.log('\n=== a tie is ONE sound, not two ===');
  // find a pattern with a tie, then compare noteheads to sounding events
  let heads=0, sounds=0, guard=0;
  while(guard++ < 200){
    click(d.getElementById('nextBtn'));
    const svg=d.querySelector('#score svg');
    const tieArcs=[...svg.querySelectorAll('path')].filter(p=>
      p.getAttribute('fill')==='none' && /Q/.test(p.getAttribute('d')||'')).length;
    if(tieArcs===0) continue;
    heads=svg.querySelectorAll('ellipse').length;
    // A tie inside a bar draws one arc; a tie ACROSS the bar line draws two
    // halves (one running off the right edge, one in from the left). So count
    // logical ties, not arcs.
    let full=0, outgoing=0;
    for(const p of [...svg.querySelectorAll('path')].filter(q=>
        q.getAttribute('fill')==='none' && /Q/.test(q.getAttribute('d')||''))){
      const mm=p.getAttribute('d').match(/M([\d.\-]+)\s+[\d.\-]+\s+Q\s*[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)/);
      if(!mm) continue;
      const a=parseFloat(mm[1]), b=parseFloat(mm[2]);
      if(b > 320-20+6) outgoing++;
      else if(a < 16-6) ;                 // incoming half: pairs with an outgoing
      else full++;
    }
    var logicalTies = full + outgoing;
    // start an attempt and count how many targets grading expects
    w.__advance(1);
    const pad=d.getElementById('pad');
    pad.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,clientX:150,clientY:700}));
    pad.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:150,clientY:700}));
    await sleep(50);
    w.__advance(60);
    await sleep(90);
    const totals=w.__lastGrade.hits;   // "hit/total"
    sounds=Number(totals.split('/')[1]);
    console.log(`  noteheads: ${heads}   sounding targets: ${sounds}   tie arcs: ${tieArcs}`);
    ok(sounds < heads, `fewer sounds than noteheads — ties merged (${sounds} < ${heads})`);
    console.log(`  logical ties: ${logicalTies} (arcs drawn: ${tieArcs})`);
    ok(sounds === heads - logicalTies,
       `exactly one sound removed per tie (${heads} - ${logicalTies} = ${sounds})`);
    break;
  }
  ok(guard<200, 'found a tied pattern to test');

  console.log('\n=== every tie crosses a beat boundary ===');
  // Reconstruct tie geometry from the SVG: an arc must start at a notehead whose
  // onset+duration lands exactly on a beat line. We check it structurally by
  // sampling many patterns and verifying arc spans never sit inside one beat.
  let checked=0, insideBeat=0;
  for(let n=0;n<400;n++){
    click(d.getElementById('nextBtn'));
    const svg2=d.querySelector('#score svg');
    const arcs=[...svg2.querySelectorAll('path')].filter(p=>
      p.getAttribute('fill')==='none' && /Q/.test(p.getAttribute('d')||''));
    if(!arcs.length) continue;
    const heads=[...svg2.querySelectorAll('ellipse')]
      .map(e=>+e.getAttribute('cx')).sort((a,b)=>a-b);
    // viewBox geometry: PAD_L=16, SPAN=VW-16-20=284, bar=48 units, beat=12 units
    const PAD_L=16, SPAN=320-16-20, BAR=48, U=12;
    const toUnits=x=>((x-PAD_L)/SPAN)*BAR;
    for(const p of arcs){
      const dstr=p.getAttribute('d');
      const m=dstr.match(/M([\d.\-]+)\s+[\d.\-]+\s+Q\s*[\d.\-]+\s+[\d.\-]+\s+([\d.\-]+)/);
      if(!m) continue;
      const u1=toUnits(parseFloat(m[1])-2.5);
      const u2=toUnits(parseFloat(m[2])+2.5);
      const beat1=Math.floor(u1/U+0.001), beat2=Math.floor(u2/U+0.001);
      checked++;
      if(beat1===beat2) insideBeat++;
    }
  }
  console.log(`  tie arcs examined: ${checked}   sitting inside a single beat: ${insideBeat}`);
  ok(checked>0, 'found tie arcs to examine');
  ok(insideBeat===0, 'no tie is confined to one beat (all cross a beat line)');

  console.log('\n=== paint audit still clean ===');
  const svg=d.querySelector('#score svg');
  const raw=new w.XMLSerializer().serializeToString(svg);
  const paints=[...raw.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map(m=>m[1]);
  const bad=paints.filter(v=>v!=='none'&&!/^#[0-9a-fA-F]{3,8}$/.test(v));
  ok(bad.length===0,'all paints literal or none'+(bad.length?` (${[...new Set(bad)]})`:''));
  const vb=svg.getAttribute('viewBox').split(' ').map(Number);
  let over=0;
  svg.querySelectorAll('rect,line,ellipse,circle').forEach(e=>{
    const y=+(e.getAttribute('y')||e.getAttribute('cy')||e.getAttribute('y1')||0);
    const h=+(e.getAttribute('height')||0);
    if(y+h>vb[3]+1) over++;
  });
  ok(over===0,`nothing clipped past the bottom (${over})`);

  console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
})();
