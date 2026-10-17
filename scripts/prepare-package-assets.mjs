import { readdir, readFile, realpath, unlink, rmdir } from 'node:fs/promises';
import path from 'node:path';

// Keep archived renders in public/ and the production project. Only trim the
// Android package's generated web directory; current revisions are selected by the cinematic routes.
const obsolete = ['/cinematics/discord/v1', '/cinematics/astral-judgement/v1', '/cinematics/wushuang-coin/v1', '/cinematics/wushuang-coin/v2'];
const root = await realpath(path.resolve('dist/client'));
async function files(directory) {
  const result = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, item.name);
    if (item.isSymbolicLink()) throw new Error(`Unexpected asset symlink: ${absolute}`);
    if (item.isDirectory()) result.push(...await files(absolute));
    else result.push(absolute);
  }
  return result;
}
// Refuse to drop a revision if current code starts referencing it again.
for (const directory of ['app', 'lib', 'data']) {
  for (const file of await files(path.resolve(directory))) {
    if (!/\.(tsx?|css|json)$/.test(file)) continue;
    const content = await readFile(file, 'utf8');
    if (obsolete.some(prefix => content.includes(prefix))) throw new Error(`Archived movie referenced by ${file}`);
  }
}
let bytes = 0;
let count = 0;
for (const prefix of obsolete) {
  const directory = path.resolve(root, '.' + prefix);
  if (!directory.startsWith(root + path.sep)) throw new Error('Asset path escaped generated output');
  let actual;
  try { actual = await realpath(directory); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (actual !== directory) throw new Error('Unexpected asset directory link');
  for (const file of await files(directory)) {
    bytes += (await readFile(file)).length;
    await unlink(file);
    count++;
  }
  // These revision directories contain only flat rendered delivery files.
  await rmdir(directory);
}
console.log(`Excluded ${count} archived cinematic files (${bytes} bytes). Source assets preserved.`);
