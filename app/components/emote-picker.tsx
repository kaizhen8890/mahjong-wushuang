'use client';
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { Star, X } from 'lucide-react';
import { RepeatEmoteButton } from './repeat-emote-button';
import { emoteLibrary, emoteVersion, subscribeEmotes, loadEmoteLibrary, ownedEmotes, updateEmoteLibrary, rememberEmote } from '@/lib/emote-library';
const EmoteManager = lazy(() => import('./emote-manager').then(module => ({default: module.EmoteManager}))); 
import './emote-picker.css';
export function useEmoteLibrary() {
  useSyncExternalStore(subscribeEmotes, emoteVersion, () => 0);
  useEffect(() => { void loadEmoteLibrary().catch(() => undefined); }, []);
}
export function EmotePicker({ send, disabled = false, onClose }: { send: (id: string) => Promise<boolean>; disabled?: boolean; onClose?: () => void }) {
  useEmoteLibrary(); const library = emoteLibrary();
  const [category, setCategory] = useState('全部'), [manage, setManage] = useState(false), [message, setMessage] = useState('');
  const categories = ['收藏', '最近', '全部', '内置', ...library.categories];
  const all = ownedEmotes();
  const filtered = (category === '最近' ? library.recent.flatMap(id => all.filter(i => i.id === id)) : all).filter(i => category === '全部' || category === '最近' || category === '收藏' && library.favorites.includes(i.id) || category === '内置' && !i.id.startsWith('x-') || library.items.some(m => m.id === i.id && m.category === category));
  const save = (fn: Parameters<typeof updateEmoteLibrary>[0]) => { try { updateEmoteLibrary(fn); } catch { setMessage('本机空间不足，修改未保存'); } };
  return <section className="emote-library" aria-label="表情库"><header className="emote-library-tools"><button type="button" onClick={() => setManage(!manage)}>{manage ? '完成管理' : '管理 / 导入'}</button>{onClose && <button className="emote-close" type="button" aria-label="收起表情" onClick={onClose}><X aria-hidden="true" /></button>}</header>
    <div className="emote-library-body"><nav aria-label="表情分类">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>)}</nav><div className="emote-library-grid">{filtered.map(emote => <article key={emote.id}><RepeatEmoteButton emote={emote} disabled={disabled || manage} onSend={async () => { const ok = await send(emote.id); if (ok) { try { rememberEmote(emote.id); } catch { /* Sending remains usable if local storage is full. */ } } return ok; }} /><button className="emote-star" type="button" aria-label={`${library.favorites.includes(emote.id) ? '取消收藏' : '收藏'} ${emote.label}`} aria-pressed={library.favorites.includes(emote.id)} onClick={() => save(l => ({ ...l, favorites: l.favorites.includes(emote.id) ? l.favorites.filter(id => id !== emote.id) : [...l.favorites, emote.id] }))}><Star aria-hidden="true" /></button><small>{emote.label}</small>
      </article>)}{!filtered.length && <p>这个分类还没有表情。可收藏或导入图片。</p>}</div></div>
    {manage && <Suspense fallback={<output>正在打开管理页面…</output>}><EmoteManager category={category} close={() => setManage(false)} changed={setCategory} /></Suspense>}
    {message && <output className="emote-library-status">{message}</output>}
  </section>;
}
