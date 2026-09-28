'use client';
/* oxlint-disable next/no-img-element -- Local character art is bundled with the APK. */
import { useEffect, useState } from 'react';
import { BUILTIN_CHARACTERS, CHARACTER_MEDIA_EVENT, DEFAULT_CHARACTER, builtinCharacter, characterChoice, deleteCustomCharacter, validCharacterChoice,
  exportCharacterPack, getCharacterMedia, importCharacterPack, importCustomCharacter, listCustomCharacters, type CharacterChoice } from '@/lib/characters';
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
  const [name, setName] = useState(''), [avatar, setAvatar] = useState<File | null>(null), [portrait, setPortrait] = useState<File | null>(null);
  const [cropX, setCropX] = useState(50), [cropY, setCropY] = useState(50), [zoom, setZoom] = useState(1);
  const [avatarPreview, setAvatarPreview] = useState(''), [portraitPreview, setPortraitPreview] = useState('');
  const [error, setError] = useState(''), [saving, setSaving] = useState(false);
  useEffect(() => { void listCustomCharacters().then(setCustom).catch(() => setError('无法读取自定义角色')); }, []);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);
  useEffect(() => () => { if (portraitPreview) URL.revokeObjectURL(portraitPreview); }, [portraitPreview]);
  const characters = [...BUILTIN_CHARACTERS, ...custom];
  const saveImport = async (replace = false) => {
    if (!avatar || !portrait) { setError('请选择头像和全身立绘'); return; }
    setSaving(true); setError('');
    try {
      const choice = await importCustomCharacter(name || (replace ? selected.name : ''), avatar, portrait, cropX, cropY, zoom, replace ? selected.id : undefined);
      setCustom(previous => [...previous.filter(item => item.id !== choice.id), choice]); setSelected(choice);
      setName(''); setAvatar(null); setPortrait(null); setAvatarPreview(''); setPortraitPreview('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导入失败'); }
    finally { setSaving(false); }
  };
  return <div className="character-picker-backdrop">
    <dialog open className="character-picker" aria-modal="true" aria-label="选择角色" onCancel={event => { event.preventDefault(); onClose(); }}>
      <header><h2>选择角色</h2><button type="button" onClick={onClose} aria-label="关闭选角">×</button></header>
      <div className="character-picker-body">
        <div className="character-picker-grid">{characters.map(character =>
          <button key={character.id} type="button" className={selected.id === character.id ? 'selected' : ''} onClick={() => setSelected(character)}>
            <CharacterAvatar choice={character} /><span>{character.name}</span>
          </button>)}</div>
        <div className="character-picker-preview"><CharacterPortrait choice={selected} /><h3>{selected.name}</h3><p>立绘用于选角和演出，头像用于牌桌名牌。</p>
          <button type="button" onClick={() => { onSelect(selected); onClose(); }}>使用这个角色</button>
          {selected.id.startsWith('custom:') && <button type="button" onClick={() => { void exportCharacterPack(selected).then(blob => {
            const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `${selected.name}.麻将无双角色.json`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }).catch(cause => setError(cause instanceof Error ? cause.message : '导出失败')); }}>导出角色包</button>}
          {selected.id.startsWith('custom:') && <button type="button" className="character-delete" onClick={() => {
            void deleteCustomCharacter(selected.id).then(() => { setCustom(previous => previous.filter(item => item.id !== selected.id)); setSelected(DEFAULT_CHARACTER); if (value?.id === selected.id) onSelect(DEFAULT_CHARACTER); });
          }}>删除自定义角色</button>}</div>
      </div>
      <details className="character-import"><summary>导入自己的角色</summary>
        <label>角色名<input maxLength={36} value={name} onChange={event => setName(event.target.value)} /></label>
        <label>头像<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0] ?? null; setAvatar(file); setAvatarPreview(file ? URL.createObjectURL(file) : ''); }} /></label>
        <label>立绘<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { const file = event.target.files?.[0] ?? null; setPortrait(file); setPortraitPreview(file ? URL.createObjectURL(file) : ''); }} /></label>
        <div className="character-crop-controls"><label>头像横向位置<input type="range" min="0" max="100" value={cropX} onChange={event => setCropX(Number(event.target.value))} /></label>
          <label>头像纵向位置<input type="range" min="0" max="100" value={cropY} onChange={event => setCropY(Number(event.target.value))} /></label>
          <label>头像放大<input type="range" min="1" max="3" step=".1" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label></div>
        {(avatarPreview || portraitPreview) && <div className="character-import-preview">{avatarPreview && <span><img src={avatarPreview} alt="头像裁切预览" style={{ objectPosition: `${cropX}% ${cropY}%`, scale: zoom }} /></span>}{portraitPreview && <img src={portraitPreview} alt="立绘预览" />}</div>}
        <button type="button" disabled={saving} onClick={() => { void saveImport(); }}>{saving ? '正在保存…' : '加入角色库'}</button>
        {selected.id.startsWith('custom:') && <button type="button" disabled={saving} onClick={() => { void saveImport(true); }}>替换当前角色素材</button>}
        <label className="character-pack-import">导入角色包<input type="file" accept="application/json,.json" onChange={event => { const file = event.target.files?.[0]; if (!file) return; setSaving(true); setError(''); void importCharacterPack(file).then(choice => { setCustom(previous => [...previous.filter(item => item.id !== choice.id), choice]); setSelected(choice); }).catch(cause => setError(cause instanceof Error ? cause.message : '角色包导入失败')).finally(() => setSaving(false)); event.target.value = ''; }} /></label>
      </details>
      {error && <p role="alert" className="character-picker-error">{error}</p>}
    </dialog>
  </div>;
}
