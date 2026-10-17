'use client';
import { useState } from 'react';
import { Copy, Download, Search, Check, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { type SkillCard } from '@/lib/mahjong';
import { nfcSkill, NFC_IDENTITIES } from '@/lib/nfc-registry';
import { nfcCodeRows, nfcCodeLabel, nfcCodeExport, unregisteredNfcCards, type NfcCodeFilter } from '@/lib/nfc-code-catalog';
import { exportJson } from '@/lib/file-export';
import { SkillCardArt } from './skill-catalog-picker';
import './nfc-code-library.css';

const FILTERS: [NfcCodeFilter, string][] = [['all', '全部'], ['skill', '技能卡'], ['music', '特别音乐'], ['alias', '兼容编号']];
export function NfcCodeLibrary({ open, onOpenChange, cards }: {
  open: boolean; onOpenChange: (open: boolean) => void; cards: readonly SkillCard[];
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<NfcCodeFilter>('all');
  const [copied, setCopied] = useState('');
  const [message, setMessage] = useState('');
  const [help, setHelp] = useState(false);
  const rows = nfcCodeRows(query, filter);
  const unregistered = unregisteredNfcCards(cards);
  async function copy(code: string, uri: string) {
    setCopied('');
    const field = document.getElementById('nfc-uri-' + code) as HTMLInputElement | null;
    try {
      try { await navigator.clipboard.writeText(uri); }
      catch {
        if (!field) throw Error('missing field');
        field.focus(); field.select(); field.setSelectionRange(0, uri.length);
        // oxlint-disable-next-line typescript/no-deprecated -- Older Android WebViews may lack the async clipboard API.
        if (!document.execCommand('copy')) throw Error('copy unavailable');
      }
      setCopied(code); setMessage(code + ' 完整写入地址已复制');
    } catch {
      field?.focus(); field?.select(); field?.setSelectionRange(0, uri.length);
      setMessage('自动复制未成功；地址已选中，请长按地址复制。');
    }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="nfc-code-dialog">
      <DialogHeader>
        <DialogTitle><Radio /> NFC 代码库</DialogTitle>
        <DialogDescription>找卡 → 复制地址 → 用 NFC 工具写入 URL 记录</DialogDescription>
      </DialogHeader>
      <div className="nfc-code-tools">
        <label className="nfc-code-search"><Search /><input autoComplete="off" aria-label="搜索 NFC 卡名或编号" placeholder="搜索卡名 / MW-005" value={query} onChange={e => setQuery(e.target.value)} />{query && <button type="button" aria-label="清除 NFC 搜索" onClick={() => setQuery('')}>清除</button>}</label>
        <div className="nfc-code-filters" aria-label="NFC 代码分类">{FILTERS.map(([key, label]) => <button type="button" key={key} aria-pressed={key === filter} onClick={() => setFilter(key)}>{label}</button>)}</div>
        <button type="button" className="nfc-code-notice" aria-expanded={help} onClick={() => setHelp(value => !value)}>旧卡 002～005 需重写 · {help ? '收起说明' : '写卡与迁移说明'}</button>
      </div>
      <div className="nfc-code-scroll">
        {help && <section className="nfc-code-help" aria-label="NFC 写卡说明">
          <h3>写入完整地址，选择 URL / URI 记录</h3>
          <ol><li>复制卡片下方的完整地址。</li><li>在 NFC 写卡工具中新增 URL / URI 类型的 NDEF 记录，放在第一条；不要添加 https，也不要选纯文本。</li><li>写入后读回核对，再用当前版本 App 扫卡测试。无需锁死标签。</li></ol>
          <p>本页用于查询和复制，App 不直接写卡。扫卡只打开准备页面，不会自动发动或扣分。</p>
          <h3>beta37 编号调整</h3>
          <p>旧 002 刹那特别 → 005；旧 003 断序 → 002；旧 004 宿星 → 003；旧 005 问剑 → 004。001 不变，006 继续兼容 005。新写刹那特别卡统一使用 005，私人包默认二代卡面；公开包使用随包可用卡面。</p>
          <p>旧编号无法自动辨认原卡意图，请重写实体标签，并让所有设备使用相同版本。普通刹那技能使用 MW-140；005 / 006 是特别音乐入口。音乐仅在允许的场景打开，公开包不含私人歌曲。</p>
        </section>}
        <p className="nfc-code-count">{rows.length} / {NFC_IDENTITIES.length} 个编号 · 覆盖全部内置技能</p>
        <div className="nfc-code-grid">{rows.map(({ identity, card }) => <article className="nfc-code-card" key={identity.code} data-code={identity.code}>
          <SkillCardArt card={{ ...card, artwork: identity.artwork ?? card.artwork }} />
          <div className="nfc-code-card-copy"><div className="nfc-code-heading"><strong>{identity.name}</strong><code>{identity.code}</code></div>
            <small>{nfcCodeLabel(identity)}{!identity.aliasOf && identity.action === 'skill' ? ` · ${card.rarity} · ${card.type.code}` : ''}</small>
            {!nfcSkill(identity, cards) && <span className="nfc-code-unavailable">本机技能已删除或改名；该编号仍对应原内置卡。</span>}
            <input id={'nfc-uri-' + identity.code} aria-label={identity.name + '完整写入地址'} readOnly value={identity.uri} onFocus={e => e.currentTarget.select()} />
            <Button variant="outline" onClick={() => { void copy(identity.code, identity.uri); }} aria-label={'复制 ' + identity.code + ' 完整写入地址'}>{copied === identity.code ? <Check /> : <Copy />}{copied === identity.code ? '已复制完整地址' : '复制写入地址'}</Button>
          </div>
        </article>)}</div>
        {!rows.length && <div className="nfc-code-empty"><p>没有找到对应的卡名或编号</p><Button variant="outline" onClick={() => { setQuery(''); setFilter('all'); }}>清除筛选</Button></div>}
        {unregistered.length > 0 && <details className="nfc-code-unregistered"><summary>{unregistered.length} 张本机卡尚未登记 NFC</summary><p>自定义、改名或编号冲突的卡不会自动获得代码。请维护者登记固定身份并重新打包后再写卡。</p><ul>{unregistered.map(card => <li key={card.id}>{card.name}</li>)}</ul></details>}
      </div>
      <div className="nfc-code-footer"><output aria-live="polite">{message || '复制的是完整地址，可直接粘贴到写卡工具。'}</output><Button variant="outline" onClick={() => { void exportJson('麻将无双-NFC代码表.json', nfcCodeExport()).then(() => setMessage('已发起代码表导出'), () => setMessage('导出失败，请重试或逐条复制。')); }}><Download /> 导出代码表</Button></div>
    </DialogContent>
  </Dialog>;
}
