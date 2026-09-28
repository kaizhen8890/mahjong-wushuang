import { readdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const clientRoot = path.resolve('dist/client');

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collect(absolute));
    else if (entry.name !== 'precache-manifest.json') files.push(absolute);
  }
  return files;
}

// The native package also runs on factory WebViews. Load standards polyfills
// before Vinext hydration (layout effects are already too late).
await copyFile(path.resolve('node_modules/core-js-bundle/minified.js'), path.join(clientRoot, 'webview-compat.js'));
await copyFile(path.resolve('node_modules/core-js-bundle/LICENSE'), path.join(clientRoot, 'webview-compat-LICENSE.txt'));
for (const file of await collect(clientRoot)) {
  if (file.endsWith('.css')) {
    const css = await readFile(file, 'utf8');
    if (/(cqw|cqh|[dsl]v[hw])/.test(css) && !css.includes('/* legacy-webview-layout */')) {
      const fallback = css.replace(/(-?\d*\.?\d+)cqw/g, 'calc(var(--vm-cqw,1vw)*$1)')
        .replace(/(-?\d*\.?\d+)cqh/g, 'calc(var(--vm-cqh,1vh)*$1)').replace(/[dsl]v([hw])/g, 'v$1');
      await writeFile(file, css + '\n/* legacy-webview-layout */\n@supports not (width:1cqw){' + fallback
        + '\n.vm-stage{--vm-cqw:min(1vw,1.777778vh)}.vm-is-three .vm-stage,.vr-result{--vm-cqw:1vw;--vm-cqh:1vh}}', 'utf8');
    }
  }
  if (!file.endsWith('.html')) continue;
  const html = await readFile(file, 'utf8');
  if (!html.includes('<script src="/webview-compat.js"></script>')) {
    if (!html.includes('<head>')) throw new Error(`Missing document head: ${file}`);
    await writeFile(file, html.replace('<head>', '<head><script src="/webview-compat.js"></script>'), 'utf8');
  }
}

const assets = (await collect(clientRoot))
  .map((file) => `/${path.relative(clientRoot, file).split(path.sep).join('/')}`)
  .sort();

await writeFile(
  path.join(clientRoot, 'precache-manifest.json'),
  `${JSON.stringify({ version: 21, assets }, null, 2)}\n`,
  'utf8',
);

console.log(`Offline manifest contains ${assets.length} files.`);
