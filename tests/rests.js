// Two quarter rests side by side are a half rest badly spelled. The generator
// merges runs of adjacent rests into one glyph, within the conventional limits:
// aligned to its own value, whole beats once it reaches a beat, and never across
// the bar midpoint. This test reads the glyphs actually drawn on the page —
// the reason the rule exists is what the reader sees, not the model.
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

// geometry mirrored from the renderer: xAt(u) = PAD_L + u/BAR*SPAN
const VW=320, PAD_L=62, PAD_R=10, SPAN=VW-PAD_L-PAD_R, BAR=48, U=12;
const unitAt = x => (x-PAD_L)/SPAN*BAR;

// One bar is one <g transform="translate(0 y)">; read every rest out of it as
// {u, dur} so adjacency can be judged in musical terms.
//
// Quarter, eighth and sixteenth rests are all traced outlines emitted by
// restGlyph() as <g transform="translate(x NOTE_MID)"><path d="..."/></g>, so
// they are told apart by the leading moveto of their outline. That is brittle
// by nature — if a glyph is ever re-traced these prefixes must be updated, and
// the guard below fails loudly rather than letting the suite pass vacuously.
const GLYPH = [
  ['M3.57', U],      // QREST   quarter
  ['M5.58', 6],      // REST8   eighth   (also drawn for a triplet-eighth rest)
  ['M6.46', 3],      // REST16  sixteenth
];

function restsPerBar(){
  const svg=d.querySelector('#score svg');
  if(!svg) return [];
  return [...svg.querySelectorAll(':scope > g[transform^="translate(0 "]')].map(g=>{
    const out=[];
    for(const gg of g.querySelectorAll('g[transform]')){
      const p=gg.querySelector('path');
      if(!p) continue;
      const dd=(p.getAttribute('d')||'').trim();
      const hit=GLYPH.find(([pre])=>dd.startsWith(pre));
      if(!hit) continue;
      const m=/translate\(([-\d.]+)/.exec(gg.getAttribute('transform'));
      if(m) out.push({u:unitAt(+m[1]), dur:hit[1]});
    }
    // half rest: the filled bar on its ledger (width 10, height 4.6)
    for(const r of g.querySelectorAll('rect')){
      if(r.getAttribute('width')!=='10' || r.getAttribute('height')!=='4.6') continue;
      out.push({u:unitAt(+r.getAttribute('x')+5), dur:U*2});
    }
    return out.sort((a,b)=>a.u-b.u);
  });
}

const near=(a,b)=>Math.abs(a-b)<0.5;

setTimeout(()=>{
  let fails=0;
  const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};

  let bars=0, halves=0;
  const seen=new Set();
  const bad=[];
  for(let lv=1;lv<=12;lv++){
    for(let n=0;n<40;n++){
      click(d.getElementById('nextBtn'));
      for(const bar of restsPerBar()){
        bars++;
        halves += bar.filter(r=>r.dur===U*2).length;
        for(const r of bar) seen.add(r.dur);
        for(let i=0;i+1<bar.length;i++){
          const a=bar[i], b=bar[i+1];
          if(!near(a.u+a.dur, b.u)) continue;      // not adjacent
          if(a.dur!==b.dur) continue;              // unequal pair: nothing to merge
          const sum=a.dur*2;
          // the merged value would have to be legal to be required
          const legal = sum<=U*2 && near(a.u%sum,0) && !(a.u<U*2 && a.u+sum>U*2);
          if(legal) bad.push(`lv${lv}: ${a.dur}+${a.dur} units at u=${a.u.toFixed(1)}`);
        }
      }
    }
    click(d.getElementById('lvUp'));
  }

  console.log('  bars inspected:', bars, ' half rests seen:', halves);
  console.log('  rest durations detected:', [...seen].sort((a,b)=>a-b).join(', ') || '(none)');
  ok(bars>100, 'inspected a meaningful number of bars');
  // If a glyph is re-traced and its prefix in GLYPH goes stale, that rest
  // becomes invisible here and every assertion below passes for the wrong
  // reason. Fail on the blindness itself rather than on its consequences.
  ok(seen.has(6) && seen.has(3),
     'eighth and sixteenth rests are still recognised on the page — if this '
     + 'fails, check the moveto prefixes in GLYPH against the outlines in index.html');
  ok(bad.length===0, 'no mergeable pair of adjacent rests left unmerged'
     + (bad.length? ' — e.g. '+bad.slice(0,4).join('; ') : ''));
  ok(halves>0, 'half rests still reach the page');

  console.log(fails? `\n=== ${fails} FAILED ===` : '\n=== rests ok ===');
  process.exit(fails?1:0);
}, 300);
