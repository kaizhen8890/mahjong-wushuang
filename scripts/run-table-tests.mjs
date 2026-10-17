// Isolated server-render test loader; does not launch or automate a browser.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import ts from 'typescript';
// Load React's CommonJS bridges before installing the source-only TS hooks.
import 'react';
import 'react/jsx-runtime';
import 'react-dom/server';
registerHooks({
  resolve(specifier, context, next) {
    let target = specifier.startsWith('@/') ? pathToFileURL(path.resolve(specifier.slice(2))).href
      : specifier.startsWith('.') ? new URL(specifier, context.parentURL).href : specifier;
    if (target.startsWith('file:') && !path.extname(fileURLToPath(target))) {
      for (const extension of ['.ts', '.tsx']) if (existsSync(fileURLToPath(target) + extension)) { target += extension; break; }
    }
    return next(target, context);
  },
  load(url, context, next) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url)) return { format: 'module', shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText };
    if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: '' };
    if (url.endsWith('.json')) return { format: 'module', shortCircuit: true, source: 'export default ' + readFileSync(fileURLToPath(url), 'utf8') };
    return next(url, context);
  },
});
await import(pathToFileURL(path.resolve(process.argv[2] ?? 'tests/virtual-table-render.test.tsx')).href);
