import { readdirSync } from 'node:fs';
import { runSuite } from './run-tests.mjs';

const tests = readdirSync('tests').filter(name => name.endsWith('.test.ts')).sort().map(name => `tests/${name}`);
tests.push(...readdirSync('tests').filter(name => name.endsWith('.test.tsx') && name !== 'virtual-table-render.test.tsx').sort().map(name => `tests/${name}`));
tests.push('tests/virtual-table-render.test.tsx');
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--report')) throw Error('Usage: test-core.mjs [--report path]');
process.exitCode = runSuite(tests, args[1]);

