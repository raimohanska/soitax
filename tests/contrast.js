// The bug that shipped three times: everything correct EXCEPT it assumed the
// page background was dark. The Claude iOS webview shows a light surface.
// So: render against a HOSTILE white host background and require legibility.
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

const lum = hex => {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if(!m) return null;
  const [r,g,b] = m.slice(1).map(h => parseInt(h,16)/255)
    .map(c => c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4));
  return 0.2126*r + 0.7152*g + 0.0722*b;
};
const contrast = (a,b) => {
  const la = lum(a), lb = lum(b);
  if(la===null||lb===null) return null;
  return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05);
};

let fails = 0;
const ok = (c,m) => { if(!c){fails++;console.log('  FAIL '+m);} else console.log('  ok   '+m); };

setTimeout(async () => {
  console.log('=== does the notation carry its own background? ===');
  const svg = doc.querySelector('#score svg');
  const first = svg.firstElementChild;
  ok(first && first.tagName.toLowerCase() === 'rect',
     'first SVG child is a background rect (' + (first && first.tagName) + ')');
  const panel = first && first.getAttribute('fill');
  ok(panel && /^#/.test(panel), 'panel background is a literal colour: ' + panel);

  // notation ink vs its OWN panel — this is what the user actually sees
  const inkColours = new Set();
  svg.querySelectorAll('ellipse,rect,line,path,circle').forEach(e => {
    const f = e.getAttribute('fill'), s = e.getAttribute('stroke');
    const edge = '#e3e3de';   // the panel's own hairline border, not notation
    if(f && f !== 'none' && f !== panel && f !== edge) inkColours.add(f);
    if(s && s !== 'none' && s !== edge) inkColours.add(s);
  });
  console.log('  ink colours found:', [...inkColours].join(' '));
  let worst = Infinity, worstC = null;
  for(const c of inkColours){
    const r = contrast(c, panel);
    if(r !== null && r < worst){ worst = r; worstC = c; }
  }
  ok(worst >= 3, `weakest notation contrast vs panel is ${worst.toFixed(1)}:1 (${worstC})`);
  const pl = lum(panel);
  ok(pl > 0.7, `panel is light (luminance ${pl.toFixed(2)}) — black-on-white scheme`);

  console.log('\n=== render over a HOSTILE DARK host background ===');
  const raw = new win.XMLSerializer().serializeToString(svg);
  const vb = svg.getAttribute('viewBox');
  const [,,vw,vh] = vb.split(' ').map(Number);
  // deliberately white behind it, like the iOS app
  const hostile = `<svg xmlns="http://www.w3.org/2000/svg" width="${vw*2.6}" height="${vh*2.6}" viewBox="${vb}">
    <rect width="100%" height="100%" fill="#0a0a0a"/>
    ${raw.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>`;
  await sharp(Buffer.from(hostile)).png().toFile(__dirname+'/tmp-hostile.png');

  const {data, info} = await sharp(__dirname+'/tmp-hostile.png').raw().toBuffer({resolveWithObject:true});
  // count pixels that are neither the white host nor the dark panel:
  // those are the actual glyphs, and there must be plenty of them
  let host=0, panelPx=0, glyph=0;
  for(let i=0;i<data.length;i+=info.channels){
    const r=data[i],g=data[i+1],b=data[i+2];
    if(r<40&&g<40&&b<40) host++;              // hostile dark host showing through
    else if(r>230&&g>230&&b>230) panelPx++;   // our light panel
    else glyph++;                              // ink
  }
  const total = info.width*info.height;
  console.log(`  host-white ${(100*host/total).toFixed(1)}%  panel-dark ${(100*panelPx/total).toFixed(1)}%  glyph ${(100*glyph/total).toFixed(1)}%`);
  ok(panelPx/total > 0.5, 'light panel covers the score area even on a dark host');
  ok(glyph/total > 0.01, 'glyphs are visibly painted on top of the panel');

  console.log('\n=== page chrome contrast against forced-light host ===');
  // Every text colour must survive if the host background wins.
  const shell = win.getComputedStyle(doc.querySelector('.wrap')).backgroundColor;
  ok(/rgb\(255, 255, 255\)/.test(shell),
     'app shell paints its own opaque background (' + shell + ')');
  const padBg = win.getComputedStyle(doc.getElementById('pad')).backgroundColor;
  ok(!/rgba\(0, 0, 0, 0\)/.test(padBg), 'tap pad has its own background (' + padBg + ')');

  // countdown digit
  doc.getElementById('pad').dataset.m = 'count';
  const cd = win.getComputedStyle(doc.getElementById('padMain')).color;
  console.log('  countdown colour:', cd);
  ok(/rgb\(20, 20, 24\)/.test(cd), 'countdown digit is near-black on light (' + cd + ')');

  console.log('\n' + (fails===0 ? '=== ALL PASSED ===' : `=== ${fails} FAILURES ===`));
  process.exit(fails?1:0);
}, 150);
