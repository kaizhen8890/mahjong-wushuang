import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function runSuite(tests, reportPath = '.tmp/test-results.json') {
  const results = [];
  const folder = path.dirname(path.resolve(reportPath));
  mkdirSync(folder, { recursive: true });
  for (const [index, test] of tests.entries()) {
    const loader = test.endsWith('.tsx') ? 'scripts/run-table-tests.mjs' : 'scripts/test-worker.mjs';
    const start = Date.now();
    const result = spawnSync(process.execPath, [loader, test], {
      cwd: process.cwd(), encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
      env: process.env,
    });
    const stem = `${String(index + 1).padStart(3, '0')}-${path.basename(test)}`;
    writeFileSync(path.join(folder, `${stem}.stdout.log`), result.stdout ?? '');
    writeFileSync(path.join(folder, `${stem}.stderr.log`), result.stderr ?? '');
    const passed = !result.error && !result.signal && result.status === 0;
    results.push({ test, passed, exitCode: result.status, signal: result.signal,
      error: result.error?.message, milliseconds: Date.now() - start, logs: stem });
    console.log(`${passed ? 'PASS' : 'FAIL'} ${test}`);
    if (!passed) console.error(result.error?.message ?? result.stderr ?? result.stdout);
  }
  const report = { schemaVersion: 1, passed: results.every(r => r.passed),
    total: tests.length, failures: results.filter(r => !r.passed).length, notExecuted: [], results };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.total - report.failures}/${report.total} passed; report: ${reportPath}`);
  return report.passed ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--report');
  const report = at < 0 ? undefined : args.splice(at, 2)[1];
  if (!args.length) throw Error('Pass test files; an empty suite is not a successful run');
  process.exitCode = runSuite(args, report);
}
