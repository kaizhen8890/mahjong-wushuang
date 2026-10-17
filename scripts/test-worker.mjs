import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve('.');
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    if (specifier.startsWith('@/')) target = pathToFileURL(path.join(root, specifier.slice(2))).href;
    else if (specifier.startsWith('.')) target = new URL(specifier, context.parentURL).href;
    if (target.startsWith('file:') && !path.extname(fileURLToPath(target)) && existsSync(fileURLToPath(target) + '.ts')) target += '.ts';
    return nextResolve(target, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts')) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText };
    if (url.startsWith('file:') && url.endsWith('.json')) return { format: 'module', shortCircuit: true, source: 'export default ' + readFileSync(fileURLToPath(url), 'utf8') };
    return nextLoad(url, context);
  },
});
for (const test of process.argv.slice(2)) await import(pathToFileURL(path.resolve(test)).href);
