// Verbatim render of every level — no colour substitution anywhere.
const fs = require('fs');
const { JSDOM } = require('jsdom');
const sharp = require('sharp');

const html = fs.readFileSync(__dirname+'/../index.html','utf8');
const stub = `
(function(){
  let t=0;
  function node(){return{connect(){return this;},start(){},stop(){},
    frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},
    gain:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},Q:{value:0},type:''};}
  class AC{constructor(){this.state='running';this.baseLatency=.01;this.destination=node();}
    get currentTime(){return t;} resume(){return Promise.resolve();}
    createOscillator(){return node();}createGain(){return node();}createBiquadFilter(){return node();}}
  window.AudioContext=AC;
  const mem={}; window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};
})();
`;
const dom = new JSDOM(html.replace('<script>','<script>'+stub),
  {runScripts:'dangerously', pretendToBeVisual:true});
const win = dom.window, doc = win.document;
const click = el => el.dispatchEvent(new win.MouseEvent('click',{bubbles:true}));

async function shot(tag){
  const svg = doc.querySelector('#score svg');
  const raw = new win.XMLSerializer().serializeToString(svg);

  // Strict paint audit: every fill/stroke must be a literal colour or 'none'.
  // Catches unresolved ${...} placeholders and var() in presentation attributes,
  // both of which render as nothing in a real browser.
  const paints = [...raw.matchAll(/(?:fill|stroke)="([^"]*)"/g)].map(m => m[1]);
  const badPaint = paints.filter(v =>
    v !== 'none' && !/^#[0-9a-fA-F]{3,8}$/.test(v));
  if(badPaint.length) throw new Error('invalid paint values: ' + [...new Set(badPaint)].join(', '));
  if(/\$\{|var\(--/.test(raw)) throw new Error('unresolved placeholder in SVG');

  // Every sounding note must be actually paintable: filled heads need a real
  // fill, open heads need a real stroke.
  for(const e of svg.querySelectorAll('ellipse')){
    const fill = e.getAttribute('fill'), sw = +e.getAttribute('stroke-width');
    const paintable = (fill && fill !== 'none') || sw > 0;
    if(!paintable) throw new Error('notehead would be invisible');
  }

  const vb = svg.getAttribute('viewBox');
  const [,,vw,vh] = vb.split(' ').map(Number);
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" width="${vw*2.6}" height="${vh*2.6}" viewBox="${vb}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    ${raw.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>`;
  const f = require('os').tmpdir()+`/v_${tag}.png`;
  await sharp(Buffer.from(wrapped)).png().toFile(f);
  const {data, info} = await sharp(f).raw().toBuffer({resolveWithObject:true});
  let lit=0;
  for(let i=0;i<data.length;i+=info.channels)
    if(data[i]<200||data[i+1]<200||data[i+2]<200) lit++;
  return {f, lit, heads: svg.querySelectorAll('ellipse').length, w:info.width, h:info.height};
}

setTimeout(async () => {
  const files=[]; let bad=0;
  for(let lv=1; lv<=11; lv++){
    if(lv>1) click(doc.getElementById('lvUp'));
    click(doc.getElementById('nextBtn'));
    const r = await shot('lv'+lv);
    const inkPerHead = r.heads ? Math.round(r.lit/r.heads) : 0;
    const okLv = r.lit > 300 && r.heads > 0 && inkPerHead > 40;
    if(!okLv) bad++;
    console.log(`level ${String(lv).padStart(2)}  heads:${String(r.heads).padStart(3)}  ink:${String(r.lit).padStart(6)}  ink/head:${String(inkPerHead).padStart(4)}  ${okLv?'ok':'FAIL'}`);
    files.push(r);
  }
  // contact sheet
  const W = Math.max(...files.map(f=>f.w));
  const H = files.reduce((s,f)=>s+f.h+10,0);
  await sharp({create:{width:W,height:H,channels:3,background:'#101014'}})
    .composite(files.map((f,i)=>({input:f.f,left:0,top:files.slice(0,i).reduce((s,x)=>s+x.h+10,0)})))
    .png().toFile(require('path').join(__dirname,'all-levels.png'));
  console.log(bad===0 ? '\nALL LEVELS RENDER VISIBLY' : `\n${bad} LEVELS BROKEN`);
  process.exit(bad?1:0);
}, 160);
