// Runs every test in parallel and prints a summary. Exit code is non-zero if any fail.
const { execFile } = require('child_process');

const SUITES = [
  ['run',             'attempt lifecycle'],
  ['buttons',         'control states + level-up suggestion'],
  ['flash',           'beat flash + silent mode'],
  ['tempo',           'tempo control'],
  ['slack',           'reading-focused grading'],
  ['reading',         'ordinary taps score green'],
  ['require-sustain', 'only over-holding is penalised'],
  ['calibrate',       'latency self-calibration'],
  ['variety',         'pattern variety'],
  ['swipe',           'swipe vs tap'],
  ['behaviour',       'attempt vs show-me'],
  ['persist',         'settings survive a relaunch'],
  ['pwa',             'installable + offline contract'],
];

const CONCURRENCY = 8;

function runSuite(file, desc) {
  return new Promise(resolve => {
    execFile('node', [__dirname + '/' + file + '.js'],
      {encoding:'utf8', timeout:30000, stdio:['ignore','pipe','pipe']},
      (err, stdout, stderr) => {
        const out = (stdout || '') + (stderr || '');
        const lines = out.trim().split('\n');
        const last = (lines.pop() || '').replace(/=/g,'').trim();
        const bad = lines.filter(l => /FAIL/.test(l));
        resolve({ file, desc, ok: !err, summary: last, fails: bad });
      });
  });
}

async function main() {
  const results = new Array(SUITES.length);
  let idx = 0;

  async function worker() {
    while (idx < SUITES.length) {
      const i = idx++;
      const [file, desc] = SUITES[i];
      results[i] = await runSuite(file, desc);
    }
  }

  const n = Math.min(CONCURRENCY, SUITES.length);
  await Promise.all(Array.from({length: n}, () => worker()));

  let failed = [];
  for (const r of results) {
    process.stdout.write(r.file.padEnd(18) + r.desc.padEnd(38));
    if (r.ok) {
      console.log(r.summary);
    } else {
      console.log('FAILED');
      r.fails.slice(0,6).forEach(l => console.log('   ' + l.trim()));
      failed.push(r.file);
    }
  }

  console.log('\n' + (failed.length
    ? failed.length + ' suite(s) failing: ' + failed.join(', ')
    : 'all suites passing'));
  process.exit(failed.length ? 1 : 0);
}

main();
