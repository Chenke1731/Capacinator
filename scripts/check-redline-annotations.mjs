// L3 red-line annotation completeness check (design §5.3, v1.2):
// every red-line test() call must carry a kill-mutation comment.
// Completeness check — P3 calibration proves soundness (the mutation
// actually dies); this proves every test is annotated.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const REDLINE_DIR = 'tests/e2e/suites/redline';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

let failed = false;
const files = walk(REDLINE_DIR);
if (files.length === 0) {
  console.log('⚠️ no red-line spec files yet (P2 pending) — annotation check skipped');
  process.exit(0);
}

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // Find test( or test.todo( calls and check for kill-mutation annotation
  // in the preceding comment block or on the same line
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*test\(/.test(line) || /^\s*test\.todo\(/.test(line)) {
      // Look backwards up to 5 lines for a kill-mutation annotation
      let annotated = false;
      for (let j = Math.max(0, i - 5); j <= i; j++) {
        if (/kill-mutation:|kills:|mutation-id:/i.test(lines[j])) {
          annotated = true;
          break;
        }
      }
      if (!annotated) {
        const testTitle = line.match(/['"`]([^'"`]+)['"`]/)?.[1] || '<unknown>';
        console.error(`FAIL ${file}:${i + 1} "${testTitle}" — no kill-mutation annotation`);
        failed = true;
      }
    }
  }
}

if (failed) {
  console.error('\nRed-line tests must name the mutation that kills them (准入三问之一)');
  process.exit(1);
}
console.log(`✅ all red-line tests annotated (${files.length} files checked)`);
