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
    createOscillator(){return node();}createGain(){return node();}createBiquadFilter(){return node();}createBufferSource(){return{buffer:null,connect(){return this;},start(){},stop(){}};}createBuffer(c,l){return{getChannelData(){return new Float32Array(l);}};}get sampleRate(){return 48000;}}
  window.AudioContext=AC;
  const mem={}; window.storage={get:async k=>mem[k]?{key:k,value:mem[k]}:null,
    set:async(k,v)=>{mem[k]=v;return{key:k,value:v}}};
})();
`;
const dom = new JSDOM(html.replace('<script>','<script>'+stub),
  {runScripts:'dangerously', pretendToBeVisual:true});
const win = dom.window, doc = win.document;

// Force specific bars so we can inspect each glyph type deliberately.
// Re-implement the model pieces the renderer needs, then call the page's
// renderer by driving it through repeated "New" until we see what we want.
setTimeout(async () => {
  const wanted = [
    // [label, predicate on the serialized svg]
    ['eighth-pairs',  s => (s.match(/<rect/g)||[]).length >= 2],
    ['with-rests',    s => /path d="M/.test(s)],
  ];

  const fresh = doc.getElementById('nextBtn');
  const up = doc.getElementById('lvUp');
  const shots = [];

  // sample a few levels: 1 (eighths+quarters), 6 (sixteenths), 7 (triplets), 8 (half notes)
  const targets = [6,6,6];
  let lv = 1;
  for(const t of targets){
    while(lv < t){ up.dispatchEvent(new win.MouseEvent('click',{bubbles:true})); lv++; }
    fresh.dispatchEvent(new win.MouseEvent('click',{bubbles:true}));
    const svg = doc.querySelector('#score svg');
    let str = new win.XMLSerializer().serializeToString(svg);
    // inline the CSS variables so the standalone SVG rasterizes correctly
    // no substitution: colours are already literal
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const full = `<svg xmlns="http://www.w3.org/2000/svg" width="${vb[2]*3}" height="${vb[3]*3}"
      viewBox="${svg.getAttribute('viewBox')}">
      <rect width="100%" height="100%" fill="#ffffff"/>${str.replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'')}</svg>`;
    const out = `/home/claude/lv${t}.png`;
    await sharp(Buffer.from(full)).png().toFile(out);
    shots.push(out);
    console.log('rendered level ' + t + ' → ' + out);
  }
  // stack them into one contrast sheet
  const metas = await Promise.all(shots.map(p => sharp(p).metadata()));
  const W = Math.max(...metas.map(m=>m.width));
  const H = metas.reduce((s,m)=>s+m.height+12,0);
  await sharp({create:{width:W,height:H,channels:3,background:'#d0d0d0'}})
    .composite(shots.map((p,i)=>({input:p,left:0,top:metas.slice(0,i).reduce((s,m)=>s+m.height+12,0)})))
    .png().toFile(__dirname+'/sheet.png');
  console.log('contact sheet → /home/claude/sheet.png');
}, 150);
