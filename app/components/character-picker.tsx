'use client';
/* oxlint-disable next/no-img-element -- Local character art is bundled with the APK. */
import { useEffect, useRef, useState } from 'react';
import { useNativeBackLayer } from '@/app/hooks/use-native-back-layer';
import { exportJsonBlob } from '@/lib/file-export';
import { BUILTIN_CHARACTERS, CHARACTER_MEDIA_EVENT, DEFAULT_CHARACTER, builtinCharacter, characterChoice, deleteCustomCharacter, validCharacterChoice,
  normalizeCharacterImage, inspectCharacterPack, exportCharacterPack, getCharacterMedia, importCharacterPack, importCustomCharacter, listCustomCharacters, type CharacterChoice } from '@/lib/characters';
import './character-picker.css';

export const PREFERRED_CHARACTER_KEY = 'mahjong-wushuang.preferred-character.v1';
export function savedPreferredCharacter(mode: 'physical' | 'virtual' = 'virtual'): CharacterChoice | null {
  try {
    const saved = localStorage.getItem(`${PREFERRED_CHARACTER_KEY}.${mode}`);
    if (!saved) return null;
    const value: unknown = JSON.parse(saved);
    return validCharacterChoice(value) ? characterChoice(value) : null;
  } catch { return null; }
}
export function preferredCharacter(mode: 'physical' | 'virtual' = 'virtual'): CharacterChoice {
  return savedPreferredCharacter(mode) ?? DEFAULT_CHARACTER;
}
export function savePreferredCharacter(value: CharacterChoice, mode: 'physical' | 'virtual' = 'virtual') {
  localStorage.setItem(`${PREFERRED_CHARACTER_KEY}.${mode}`, JSON.stringify(value));
}

function useCharacterImage(choice: CharacterChoice | undefined, kind: 'avatar' | 'portrait') {
  const hash = kind === 'avatar' ? choice?.avatarHash : choice?.portraitHash;
  const builtin = choice ? builtinCharacter(choice.id) : undefined;
  const [source, setSource] = useState<{ hash: string; url: string } | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const listener = (event: Event) => {
      if (hash && (event as CustomEvent<string>).detail === hash) setRefresh(value => value + 1);
    };
    window.addEventListener(CHARACTER_MEDIA_EVENT, listener);
    return () => window.removeEventListener(CHARACTER_MEDIA_EVENT, listener);
  }, [hash]);
  useEffect(() => {
    if (!hash) return;
    let alive = true, url = '';
    void getCharacterMedia(hash).then(blob => {
      if (!alive || !blob) return;
      url = URL.createObjectURL(blob); setSource({ hash, url });
    }).catch(() => undefined);
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [hash, refresh]);
  return builtin?.[kind] ?? (source?.hash === hash ? source?.url ?? '' : '');
}

export function CharacterAvatar({ choice, className = '' }: { choice?: CharacterChoice; className?: string }) {
  const src = useCharacterImage(choice, 'avatar');
  return src ? <img className={`character-avatar ${className}`} src={src} alt={choice?.name || '默认角色'} />
    : <span className={`character-avatar character-avatar-fallback ${className}`} aria-label={choice?.name || '默认角色'}>{choice?.name?.slice(0, 1) || '麻'}</span>;
}
export function CharacterPortrait({ choice, className = '' }: { choice?: CharacterChoice; className?: string }) {
  const src = useCharacterImage(choice, 'portrait');
  return src ? <img className={`character-portrait ${className}`} src={src} alt={`${choice?.name || '默认角色'}立绘`} /> : null;
}

export function CharacterPicker({ value, onSelect, onClose }: {
  value?: CharacterChoice; onSelect: (character: CharacterChoice) => void; onClose: () => void;
}) {
  const [custom, setCustom] = useState<CharacterChoice[]>([]);
  const [selected, setSelected] = useState<CharacterChoice>(value ?? DEFAULT_CHARACTER);
  const [pane, setPane] = useState<'choose' | 'import'>('choose');
  const [source, setSource] = useState('图片');
  const [name, setName] = useState(''), [avatar, setAvatar] = useState<File | null>(null), [portrait, setPortrait] = useState<File | null>(null);
  const [cropX, setCropX] = useState(50), [cropY, setCropY] = useState(50), [zoom, setZoom] = useState(1);
  const [avatarPreview, setAvatarPreview] = useState(''), [portraitPreview, setPortraitPreview] = useState('');
  const [pack, setPack] = useState<{ file: File; choice: CharacterChoice; avatar: string; portrait: string } | null>(null);
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<'discard' | 'delete' | 'replace' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), busy = useRef(false);
  const dirty = Boolean(name || avatar || portrait || pack);
  const close = () => { if (!busy.current) { if (dirty) setConfirmation('discard'); else onClose(); } };
  const back = () => { if (busy.current) return; if (confirmation) setConfirmation(null); else if (pane === 'import') setPane('choose'); else close(); };
  useNativeBackLayer(() => dialog.current, back);
  useEffect(() => {
    const element = dialog.current, previous = document.activeElement;
    if (element && !element.open) element.showModal();
    return () => { element?.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { void listCustomCharacters().then(setCustom).catch(() => setError('无法读取自定义角色')); }, []);
  useEffect(() => {
    if (!avatar) return;
    let alive = true, url = '';
    const timer = window.setTimeout(() => { void normalizeCharacterImage(avatar, 'avatar', cropX, cropY, zoom).then(blob => { if (alive) { url = URL.createObjectURL(blob); setAvatarPreview(url); } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : '头像无法预览'); }); }, 100);
    return () => { alive = false; clearTimeout(timer); if (url) URL.revokeObjectURL(url); };
  }, [avatar, cropX, cropY, zoom]);
  useEffect(() => {
    if (!portrait) return;
    let alive = true, url = '';
    void normalizeCharacterImage(portrait, 'portrait').then(blob => { if (alive) { url = URL.createObjectURL(blob); setPortraitPreview(url); } }).catch(e => { if (alive) setError(e instanceof Error ? e.message : '立绘无法预览'); });
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [portrait]);
  useEffect(() => () => { if (pack) { URL.revokeObjectURL(pack.avatar); URL.revokeObjectURL(pack.portrait); } }, [pack]);
  const run = async (action: () => Promise<void>) => {
    if (busy.current) return; busy.current = true; setSaving(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : '操作失败，请重试'); }
    finally { busy.current = false; setSaving(false); }
  };
  const saveImport = (replace = false) => run(async () => {
    let choice: CharacterChoice;
    if (source === '角色包') { if (!pack) throw Error('请先选择角色包'); choice = await importCharacterPack(pack.file); }
    else { if (!avatar || !portrait) throw Error('请选择头像和全身立绘'); choice = await importCustomCharacter(name || (replace ? selected.name : ''), avatar, portrait, cropX, cropY, zoom, replace ? selected.id : undefined); }
    setCustom(previous => [...previous.filter(item => item.id !== choice.id), choice]); setSelected(choice);
    setName(''); setAvatar(null); setPortrait(null); setAvatarPreview(''); setPortraitPreview(''); setPack(null); setCropX(50); setCropY(50); setZoom(1); setPane('choose'); setConfirmation(null);
  });
  const existingPack = pack && custom.find(item => item.id === pack.choice.id);
  const ready = source === '图片' ? Boolean(name.trim() && avatarPreview && portraitPreview) : Boolean(pack);
  return <div className="character-picker-backdrop"><dialog ref={dialog} className="character-picker character-workspace" aria-modal="true" aria-label="选择角色" onCancel={event => { event.preventDefault(); back(); }}>
    <header inert={confirmation !== null}><div><small>{pane === 'choose' ? '角色库' : '本机自定义角色'}</small><h2>{pane === 'choose' ? '选择角色' : '导入自己的角色'}</h2></div><button type="button" disabled={saving} onClick={close} aria-label="关闭选角">×</button></header>
    <div className="character-workspace-content" inert={confirmation !== null}>
      {pane === 'choose' ? <div className="character-picker-body"><div className="character-choices"><div className="character-library-heading"><span>{BUILTIN_CHARACTERS.length} 位内置 · {custom.length} 位自定义</span><button type="button" disabled={saving} onClick={() => { setPane('import'); setError(''); }}>导入自己的角色</button></div><div className="character-picker-grid">{[...BUILTIN_CHARACTERS,...custom].map(character => <button key={character.id} type="button" aria-label={character.name} aria-pressed={selected.id === character.id} className={selected.id === character.id ? 'selected' : ''} disabled={saving} onClick={() => setSelected(character)}><CharacterAvatar choice={character} /><span>{character.name}</span></button>)}</div></div><div className="character-picker-preview"><div className="character-portrait-stage"><CharacterPortrait choice={selected} /></div><h3>{selected.name}</h3><p>{selected.id.startsWith('custom:') ? '本机导入' : '内置角色'} · 确认后使用</p>{selected.id.startsWith('custom:') && <div className="character-library-actions"><button type="button" disabled={saving} onClick={() => void run(async () => { await exportJsonBlob(`${selected.name.replace(/[\\/]/g, '_')}.麻将无双角色.json`, await exportCharacterPack(selected)); })}>导出角色包</button><button type="button" disabled={saving} onClick={() => setConfirmation('delete')}>删除自定义角色</button></div>}</div></div> : <div className="character-import-workspace"><nav aria-label="角色导入方式">{['图片','角色包'].map(item => <button key={item} disabled={saving} aria-pressed={source === item} onClick={() => { setSource(item); setError(''); }}>{item === '图片' ? '图片与裁切' : '已有角色包'}</button>)}</nav>{source === '图片' ? <><div className="character-import-fields"><h3>1 · 选择素材</h3><p>PNG、JPEG 或 WebP，每张不超过 12 MB，宽高不超过 5000 像素。保留背景与透明区域。</p><label>角色名<input maxLength={36} value={name} disabled={saving} onChange={e => setName(e.target.value)} /></label><label>头像<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={e => { const file = e.target.files?.[0]; if (file) { setAvatarPreview(''); setAvatar(file); setError(''); } }} /></label><label>立绘<input type="file" accept="image/png,image/jpeg,image/webp" disabled={saving} onChange={e => { const file = e.target.files?.[0]; if (file) { setPortraitPreview(''); setPortrait(file); setError(''); } }} /></label><h3>2 · 调整头像</h3><div className="character-crop-controls"><div className="character-crop-live">{avatarPreview ? <img src={avatarPreview} alt="调整中的头像预览" /> : <span>裁切预览</span>}</div>{[['头像横向位置',cropX,setCropX],['头像纵向位置',cropY,setCropY],['头像放大',zoom,setZoom]].map(([label,value,set]) => <label key={String(label)}>{String(label)}<input type="range" disabled={saving || !avatar} min={label === '头像放大' ? 1 : 0} max={label === '头像放大' ? 3 : 100} step={label === '头像放大' ? .1 : 1} value={Number(value)} onChange={e => { setAvatarPreview(''); (set as (n:number)=>void)(Number(e.target.value)); }} /></label>)}</div>{selected.id.startsWith('custom:') && <button type="button" disabled={saving || !avatarPreview || !portraitPreview} onClick={() => setConfirmation('replace')}>替换「{selected.name}」的素材</button>}</div><aside className="character-import-result"><h3>3 · 保存效果预览</h3><div className="character-crop-result">{avatarPreview ? <img src={avatarPreview} alt="头像裁切预览" /> : <span>头像</span>}</div><div className="character-portrait-result">{portraitPreview ? <img src={portraitPreview} alt="立绘预览" /> : <span>立绘</span>}</div><small>头像 256 × 256 · 立绘等比缩放</small></aside></> : <div className="character-pack-panel"><h3>先预览，再加入角色库</h3><label>选择角色包<input type="file" accept="application/json,.json" disabled={saving} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void run(async () => { setPack(null); const data = await inspectCharacterPack(file); setPack({file,choice:data.choice,avatar:URL.createObjectURL(data.avatar),portrait:URL.createObjectURL(data.portrait)}); }); }} /></label><p>麻将无双角色包，最大 4.5 MB。预览时会校验图片与资料。</p>{pack && <div className="character-pack-preview"><img src={pack.avatar} alt="角色包头像" /><img src={pack.portrait} alt="角色包立绘" /><strong>{pack.choice.name}</strong><p>{existingPack ? `将更新角色库中的「${existingPack.name}」，角色编号相同。` : '将新增 1 位自定义角色。'}</p></div>}</div>}</div>}
    </div>
    {error && <p role="alert" className="character-picker-error">{error}</p>}
    <footer inert={confirmation !== null}>{pane === 'choose' ? <><span>已选：{selected.name}</span><button type="button" className="character-primary" disabled={saving} onClick={() => { if (dirty) { setPane('import'); setError('还有未保存的导入资料；可先保存，或关闭选角时放弃。'); return; } onSelect(selected); onClose(); }}>使用这个角色</button></> : <><button type="button" disabled={saving} onClick={() => setPane('choose')}>返回选角</button><button type="button" className="character-primary" disabled={saving || !ready} onClick={() => void saveImport()}>{saving ? '正在处理…' : existingPack && source === '角色包' ? '确认更新角色包' : '加入角色库'}</button></>}</footer>
    {confirmation && <div className="character-confirm-shade"><section role="alertdialog" aria-modal="true" aria-labelledby="character-confirm-title" className="character-confirm"><CharacterAvatar choice={selected} /><h3 id="character-confirm-title">{confirmation === 'discard' ? '放弃未保存的导入资料？' : confirmation === 'delete' ? `删除「${selected.name}」？` : `替换「${selected.name}」的素材？`}</h3><p>{confirmation === 'discard' ? '尚未加入角色库的图片、裁切和名称将被放弃。' : confirmation === 'delete' ? '只从角色库移除。当前对局已经使用的头像和立绘会保留，选角确认后才更换角色。' : '新头像、立绘和填写的名称会更新此角色，保存后仍需确认选角。'}</p><button autoFocus disabled={saving} onClick={() => setConfirmation(null)}>继续保留</button><button disabled={saving} onClick={() => { if (confirmation === 'discard') onClose(); else if (confirmation === 'replace') void saveImport(true); else void run(async () => { await deleteCustomCharacter(selected.id); setCustom(items => items.filter(item => item.id !== selected.id)); setSelected(DEFAULT_CHARACTER); setConfirmation(null); }); }}>{saving ? '正在处理…' : confirmation === 'discard' ? '放弃并关闭' : confirmation === 'delete' ? '确认删除' : '确认替换'}</button>{error && <p role="alert">{error}</p>}</section></div>}
  </dialog></div>;
}
