import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { EmotePicker } from '../app/components/emote-picker';
import { GAME_EMOTES } from '../lib/emotes';

const html = renderToStaticMarkup(<EmotePicker send={async () => true} />);
assert.ok(html.includes('管理 / 导入'), 'Import entry remains available with an empty catalog');
if (GAME_EMOTES.length === 0) {
  assert.ok(html.includes('这个分类还没有表情'));
  assert.ok(!html.includes('<img'), 'No sample image is silently reintroduced');
} else {
  assert.ok(html.includes('<img'), 'Private profiles still render bundled emotes');
}
console.log('PASS emote picker: empty catalog guidance and import entry, private catalog rendering');
