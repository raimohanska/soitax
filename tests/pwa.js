// A broken manifest or worker fails silently — the app just quietly isn't
// installable. So check the install contract explicitly.
const fs=require('fs'), path=require('path');
const root=__dirname+'/..';
const html=fs.readFileSync(root+'/index.html','utf8');

let fails=0;
const ok=(c,m)=>{if(!c){fails++;console.log('  FAIL '+m);}else console.log('  ok   '+m);};

console.log('=== files present ===');
for(const f of ['index.html','manifest.webmanifest','sw.js',
                'icon-180.png','icon-192.png','icon-512.png','icon-maskable.png']){
  ok(fs.existsSync(root+'/'+f), f);
}

console.log('\n=== manifest is valid and complete ===');
let man;
try{ man=JSON.parse(fs.readFileSync(root+'/manifest.webmanifest','utf8')); ok(true,'manifest parses as JSON'); }
catch(e){ ok(false,'manifest parses as JSON: '+e.message); man={}; }
ok(man.name && man.short_name, `has name ("${man.name}") and short_name ("${man.short_name}")`);
ok(man.display==='standalone', `display is standalone (${man.display})`);
ok(!!man.start_url, `start_url set (${man.start_url})`);
ok(Array.isArray(man.icons) && man.icons.length>=2, `declares ${man.icons?man.icons.length:0} icons`);
// installability needs a 192 and a 512
const sizes=(man.icons||[]).map(i=>i.sizes);
ok(sizes.includes('192x192'),'has a 192x192 icon (required to install)');
ok(sizes.includes('512x512'),'has a 512x512 icon (required to install)');
ok((man.icons||[]).some(i=>i.purpose==='maskable'),'has a maskable icon so launcher masks do not clip it');
for(const i of man.icons||[]){
  ok(fs.existsSync(root+'/'+i.src), `icon file exists: ${i.src}`);
}

console.log('\n=== html declares the install hooks ===');
ok(/rel="manifest"/.test(html),'links the manifest');
ok(/apple-touch-icon/.test(html),'declares an apple-touch-icon for iOS');
ok(/apple-mobile-web-app-capable/.test(html),'iOS standalone meta tag present');
ok(/theme-color/.test(html),'theme-color set');
ok(/serviceWorker/.test(html),'registers a service worker');

console.log('\n=== worker registration is guarded ===');
// It must not try to register when opened as a plain file or in an app webview
ok(/https\?:\$\/\.test\(location\.protocol\)|location\.protocol/.test(html),
   'registration is gated on protocol, so the single-file version still works');
const reg=html.match(/navigator\.serviceWorker\.register\([^)]*\)([^;]*)/);
ok(reg && /catch/.test(reg[0]+html.slice(html.indexOf(reg[0]), html.indexOf(reg[0])+120)),
   'registration failure is swallowed rather than throwing');

console.log('\n=== service worker caches the whole shell ===');
const sw=fs.readFileSync(root+'/sw.js','utf8');
ok(/install/.test(sw) && /activate/.test(sw) && /fetch/.test(sw),
   'handles install, activate and fetch');
ok(/index\.html/.test(sw),'precaches the app itself');
for(const f of ['icon-192.png','icon-512.png','manifest.webmanifest']){
  ok(sw.includes(f), `precaches ${f}`);
}
ok(/caches\.match/.test(sw),'serves from cache (offline-capable)');
ok(/navigate/.test(sw),'handles navigations so a cold launch works offline');
ok(/opaque/.test(sw),'caches cross-origin responses (the web fonts)');
ok(/keys\(\)[\s\S]{0,120}delete/.test(sw),'cleans up old caches on activate');

console.log('\n=== looks deliberate without the webfonts ===');
ok(/-apple-system|BlinkMacSystemFont/.test(html),
   'system font fallback for the sans stack');
ok(/SF Mono|Menlo|Consolas/.test(html),'monospace fallback for the numerals');

console.log('\n=== single-file version still self-contained ===');
// Nothing the app NEEDS may be an external file: fonts are cosmetic, and the
// manifest/worker are optional enhancements.
const externals=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1])
  .filter(u=>!/^#|^data:/.test(u));
console.log('  external references:', externals.join(', ') || '(none)');
const required=externals.filter(u=>!/fonts\.googleapis|fonts\.gstatic|manifest|icon-/.test(u));
ok(required.length===0, `no required external assets (${required.length} found)`);

console.log('\n' + (fails===0?'=== ALL PASSED ===':`=== ${fails} FAILURES ===`));
process.exit(fails?1:0);
