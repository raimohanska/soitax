// Runs every test and prints a summary. Exit code is non-zero if any fail.
const { execFileSync } = require('child_process');

const SUITES = [
  ['run',             'attempt lifecycle'],
  ['buttons',         'control states + level-up suggestion'],
  ['flash',           'beat flash + silent mode'],
  ['tempo',           'tempo control'],
  ['slack',           'reading-focused grading'],
  ['reading',         'ordinary taps score green'],
  ['require-sustain', 'sustain genuinely required'],
  ['calibrate',       'latency self-calibration'],
  ['ties',            'tie semantics'],
  ['beamfreq',        'beam progression'],
  ['variety',         'pattern variety'],
  ['swipe',           'swipe vs tap'],
  ['behaviour',       'attempt vs show-me'],
  ['contrast',        'legibility'],
  ['layout',          'rendered geometry'],
  ['vlevels',         'all levels render'],
  ['sustain',         'feedback lane'],
  ['persist',         'settings survive a relaunch'],
  ['pwa',             'installable + offline contract'],
];

let failed = [];
for(const [file, desc] of SUITES){
  process.stdout.write(file.padEnd(18) + desc.padEnd(38));
  try{
    const out = execFileSync('node', [__dirname + '/' + file + '.js'],
      {encoding:'utf8', stdio:['ignore','pipe','pipe']});
    const last = out.trim().split('\n').pop();
    console.log(last.replace(/=/g,'').trim());
  }catch(e){
    const out = (e.stdout || '') + (e.stderr || '');
    const bad = out.split('\n').filter(l => /FAIL/.test(l));
    console.log('FAILED');
    bad.slice(0,6).forEach(l => console.log('   ' + l.trim()));
    failed.push(file);
  }
}

console.log('\n' + (failed.length
  ? failed.length + ' suite(s) failing: ' + failed.join(', ')
  : 'all suites passing'));
process.exit(failed.length ? 1 : 0);
