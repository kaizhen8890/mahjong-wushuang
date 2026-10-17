'use client';
/* oxlint-disable next/no-img-element -- Bundled offline card artwork uses local asset URLs. */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Dices,
  Edit3,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { YAKU, sortTiles, TILE_IDS, type Wind } from '@/lib/mahjong';
import {
  newWushuangGroup,
  scoreWushuangGroup,
  validateWushuangGroups,
  wushuangYaku,
  type WushuangGroup,
  type WushuangSession,
} from '@/lib/wushuang-session';
import type { ControllerCommand } from '@/lib/lan-protocol';
import type { CoinDecision } from '@/lib/skill-random';
import { HandCalculator } from './hand-calculator';
import { HandDisplay, MahjongTile, tileName } from './mahjong-tile';
import { CharacterAvatar } from './character-picker';
import type { CharacterChoice } from '@/lib/characters';
import './wushuang-workbench.css';

type Step = 'setup' | 'outcome' | 'groups' | 'editor' | 'target' | 'preview';
interface Seat {
  character?: CharacterChoice;
  id: string;
  name: string;
  wind: Wind;
  active: boolean;
  enemy?: boolean;
}
interface Draft {
  editorRevision?: number;
  editRevisions: Record<string, number>;
  cost: boolean;
  decision?: CoinDecision;
  targetId?: string;
  step: Step;
  editor?: WushuangGroup;
  edits: Record<string, WushuangGroup>;
  activationId: string;
}
type Props = {
  open: boolean;
  storageKey: string;
  actor: Seat & { score: number };
  targets: Seat[];
  context: Pick<WushuangSession, 'seatWind' | 'roundWind' | 'rules'>;
  session?: WushuangSession;
  deposits: number;
  disabled?: boolean;
  close: () => void;
  backToCards: () => void;
  activate: (
    decision: CoinDecision,
    targetId: string | undefined,
    activationId: string,
  ) => Promise<void>;
  send: (command: ControllerCommand) => Promise<void>;
  correct?: (face: 'heads' | 'tails') => Promise<void>;
};
const amount = (n: number) => n.toLocaleString('zh-CN');
const blank = (): Draft => ({
  cost: false,
  step: 'setup',
  edits: {},
  editRevisions: {},
  activationId: crypto.randomUUID(),
});
const faceName = (face?: string) =>
  face === 'heads' ? '正面' : face === 'tails' ? '反面' : '掷币';
const yakuNames = (ids: string[]) =>
  ids.map((id) => YAKU.find((y) => y.id === id)?.name ?? id).join(' · ');
function loadDraft(key: string): Draft {
  try {
    const saved = localStorage.getItem(key),
      value = JSON.parse(saved || 'null');
    const group = (g: WushuangGroup) =>
      g &&
      typeof g.id === 'string' &&
      Array.isArray(g.tiles) &&
      g.tiles.length <= 18 &&
      g.tiles.every(
        (t) => typeof t === 'string' && /^(?:[0-9][mps]|[1-7]z)$/.test(t),
      ) &&
      Array.isArray(g.selected) &&
      g.selected.every((id) => typeof id === 'string') &&
      typeof g.winningTile === 'string' &&
      typeof g.meldText === 'string' &&
      ['smart', 'manual'].includes(g.mode) &&
      Number.isInteger(g.fu) &&
      Number.isInteger(g.dora);
    if (
      value &&
      typeof value.activationId === 'string' &&
      value.edits &&
      typeof value.edits === 'object' &&
      Object.values(value.edits).every((g) => group(g as WushuangGroup)) &&
      (!value.editor || group(value.editor)) &&
      ['setup', 'outcome', 'groups', 'editor', 'target', 'preview'].includes(
        value.step,
      )
    )
      return { ...blank(), ...value, editRevisions: value.editRevisions ?? {} };
    if (saved) localStorage.setItem(`${key}:unreadable:${Date.now()}`, saved);
  } catch {
    /* Keep game and existing storage intact. */
  }
  return blank();
}
export function WushuangWorkbench(props: Props) {
  return <WushuangWorkbenchState key={props.storageKey} {...props} />;
}
function WushuangWorkbenchState(props: Props) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft(props.storageKey));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [storageError, setStorageError] = useState('');
  const [physicalConfirmed, setPhysicalConfirmed] = useState(false),
    [correcting, setCorrecting] = useState(false);
  const lock = useRef(false),
    body = useRef<HTMLDivElement>(null);
  const [deleted, setDeleted] = useState<WushuangGroup>();
  const session = props.session,
    ctx = session ?? props.context,
    groups = session?.groups ?? [],
    settled = session?.status === 'settled';
  const [source, setSource] = useState({
    effectId: session?.effectId,
    face: session?.face,
    revision: session?.revision,
  });
  if (
    source.effectId !== session?.effectId ||
    source.face !== session?.face ||
    source.revision !== session?.revision
  ) {
    setSource({
      effectId: session?.effectId,
      face: session?.face,
      revision: session?.revision,
    });
    setPhysicalConfirmed(false);
    if (session && source.face && source.face !== session.face) {
      setDraft({
        ...draft,
        step: 'outcome',
        editor: undefined,
        edits: {},
        editRevisions: {},
        targetId: undefined,
      });
      setDeleted(undefined);
    } else if (session && source.effectId !== session.effectId) {
      setDraft({ ...draft, step: 'outcome' });
    }
  }
  // Persistence is an external operation; report its failure without losing the in-memory draft.
  /* oxlint-disable react/react-compiler */
  useEffect(() => {
    try {
      localStorage.setItem(props.storageKey, JSON.stringify(draft));
      setStorageError('');
    } catch {
      setStorageError('草稿暂未保存到本机，请保持此页面打开');
    }
  }, [draft, props.storageKey]);
  /* oxlint-enable react/react-compiler */
  const step = settled
    ? 'outcome'
    : session
      ? draft.step === 'setup'
        ? 'setup'
        : draft.step
      : draft.step === 'setup'
        ? 'setup'
        : 'setup';
  const setStep = (next: Step) => {
    setError('');
    setDraft((d) => ({ ...d, step: next }));
  };
  const back = () => {
    if (lock.current) return;
    if (settled) {
      props.close();
      return;
    }
    if (step === 'editor') {
      setStep('groups');
      return;
    }
    if (step === 'preview') {
      setStep(session?.face === 'heads' ? 'groups' : 'target');
      return;
    }
    if (step === 'groups' || step === 'target') {
      setStep('outcome');
      return;
    }
    if (step === 'outcome') {
      setStep('setup');
      return;
    }
    props.backToCards();
  };
  const backRef = useRef(back);
  useEffect(() => {
    backRef.current = back;
  });
  useEffect(() => {
    if (!props.open) return;
    const nativeBack = (event: Event) => {
      event.preventDefault();
      backRef.current();
    };
    window.addEventListener('mahjong:native-back', nativeBack);
    return () => window.removeEventListener('mahjong:native-back', nativeBack);
  }, [props.open]);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [step]);
  const run = async (action: () => Promise<void>) => {
    if (lock.current || props.disabled) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成，请重试');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const update = async (
    nextGroups: WushuangGroup[],
    targetId = session?.targetId,
    revision = session?.revision,
  ) => {
    if (!session) throw Error('尚未收到牌桌确认的硬币结果');
    await props.send({
      kind: 'wushuang.update',
      effectId: session.effectId,
      revision: revision!,
      groups: nextGroups,
      targetId,
    });
  };
  const edit = (group?: WushuangGroup) => {
    const key = group?.id ?? 'new',
      saved = draft.edits[key] ?? group ?? newWushuangGroup();
    setDraft((d) => ({
      ...d,
      editor: saved,
      editorRevision: d.edits[key]
        ? (d.editRevisions[key] ?? session?.revision)
        : session?.revision,
      step: 'editor',
    }));
    setError('');
  };
  const changeEditor = (patch: Partial<WushuangGroup>) =>
    setDraft((d) => {
      if (!d.editor) return d;
      const redDelta = patch.tiles
        ? patch.tiles.filter((t) => t[0] === '0').length -
          d.editor.tiles.filter((t) => t[0] === '0').length
        : 0;
      const editor = {
          ...d.editor,
          ...patch,
          dora: patch.dora ?? Math.max(0, d.editor.dora + redDelta),
        },
        key = groups.some((g) => g.id === editor.id) ? editor.id : 'new';
      return {
        ...d,
        editor,
        edits: { ...d.edits, [key]: editor },
        editRevisions: {
          ...d.editRevisions,
          [key]: d.editorRevision ?? session?.revision ?? 0,
        },
      };
    });
  let results: ReturnType<typeof validateWushuangGroups> = [],
    groupError = '';
  try {
    results = validateWushuangGroups(ctx, groups);
  } catch (e) {
    groupError = (e as Error).message;
  }
  const basePoints =
    session?.face === 'tails'
      ? ctx.seatWind === '东'
        ? 36000
        : 24000
      : results.reduce((n, r) => n + r.points, 0);
  const total = basePoints + props.deposits * 1000;
  const target = props.targets.find(
    (t) => t.id === (session?.targetId ?? draft.targetId),
  );
  const targetValid = Boolean(
    target?.active && target.enemy !== false && target.id !== props.actor.id,
  );
  const editor = draft.editor;
  const editConflict = Boolean(
    editor &&
    session &&
    draft.editorRevision !== undefined &&
    draft.editorRevision !== session.revision,
  );
  const previousTileCount = useRef(editor?.tiles.length ?? 0);
  useEffect(() => {
    const count = editor?.tiles.length ?? 0,
      prior = previousTileCount.current;
    previousTileCount.current = count;
    if (
      step === 'editor' &&
      editor?.mode === 'smart' &&
      count === 14 &&
      prior === 13 &&
      !editor.winningTile &&
      matchMedia('(max-width:700px)').matches
    ) {
      const frame = requestAnimationFrame(() =>
        body.current?.querySelector('.ws-analysis-panel')?.scrollIntoView({
          block: 'start',
          behavior: matchMedia('(prefers-reduced-motion:reduce)').matches
            ? 'instant'
            : 'smooth',
        }),
      );
      return () => cancelAnimationFrame(frame);
    }
  }, [editor?.tiles.length, editor?.mode, editor?.winningTile, step]);
  let editorScore: ReturnType<typeof scoreWushuangGroup> | undefined,
    editorError = '';
  if (editor)
    try {
      editorScore = scoreWushuangGroup(ctx, editor);
    } catch (e) {
      editorError = (e as Error).message;
    }
  const waiting = busy || props.disabled;
  const stageTitle = settled
    ? '结算已入账'
    : {
        setup: '代价与判定',
        outcome: '本次判定',
        groups: '组牌结算',
        editor: '智能牌型算番',
        target: '选择目标',
        preview: '结算预览',
      }[step];
  const chooseTarget = (id: string) => {
    setDraft((d) => ({ ...d, targetId: id }));
    if (session) void run(() => update(groups, id));
  };
  const targetPicker = (
    <div className="ws-targets">
      {props.targets
        .filter((t) => t.id !== props.actor.id)
        .map((t) => (
          <button
            type="button"
            key={t.id}
            aria-pressed={(session?.targetId ?? draft.targetId) === t.id}
            disabled={waiting || !t.active || t.enemy === false}
            onClick={() => chooseTarget(t.id)}
          >
            <span className="ws-target-avatar">
              <CharacterAvatar choice={t.character} />
              <i>{t.wind}</i>
            </span>
            <span>
              <strong>{t.name}</strong>
              <small>
                {!t.active
                  ? '已退出本局'
                  : t.enemy === false
                    ? '同阵营'
                    : '在局敌方'}
              </small>
            </span>
            {(session?.targetId ?? draft.targetId) === t.id && <Check />}
          </button>
        ))}
    </div>
  );
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open, details) => {
        if (!open) {
          if (lock.current) {
            details.cancel();
            return;
          }
          if (details.reason === 'escape-key') {
            details.cancel();
            backRef.current();
          } else props.close();
        }
      }}
    >
      <DialogContent nativeBack={false} positioning="custom" className="ws-workbench" showCloseButton={false}>
        <header className="ws-header">
          <button
            type="button"
            className="ws-icon-button"
            aria-label="返回上一步"
            disabled={busy}
            onClick={back}
          >
            <ArrowLeft />
          </button>
          <div>
            <DialogTitle>麻将无双</DialogTitle>
            <DialogDescription>{stageTitle}</DialogDescription>
          </div>
          <button
            type="button"
            className="ws-close"
            disabled={busy}
            onClick={props.close}
          >
            <Minus />
            <span>收起</span>
          </button>
        </header>
        <div className="ws-player-line">
          <CharacterAvatar choice={props.actor.character} />
          <span className="ws-seat-seal">{props.actor.wind}</span>
          <strong>{props.actor.name}</strong>
          <span>
            {ctx.seatWind === '东' ? '庄家' : '闲家'} · {ctx.roundWind}风场
          </span>
          {session && (
            <span className="ws-lock">
              <ShieldCheck />
              {faceName(session.face)}已记录
            </span>
          )}
        </div>
        <div className="ws-body" ref={body}>
          {(error || storageError) && (
            <p className="ws-error" role="alert">
              {error || storageError}
            </p>
          )}
          {step === 'setup' && !settled && (
            <div className="ws-stage ws-setup">
              <div className="ws-card-intro">
                <div>
                  <span className="ws-eyebrow">神卡 · 一币定乾坤</span>
                  <h2>
                    万象归手，
                    <br />
                    一掷无双。
                  </h2>
                  <p>正面重组牌池，反面指定荣和。</p>
                </div>
                <img
                  src="/skill-cards/gen2-mahjong-wushuang.png"
                  alt="麻将无双卡面"
                />
              </div>
              <label
                className={`ws-cost ${draft.cost || session ? 'is-ready' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={draft.cost || Boolean(session)}
                  disabled={waiting || Boolean(session)}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, cost: e.target.checked }))
                  }
                />
                <span>
                  <strong>四类代价已准备</strong>
                  <small>单、团、攻、陷各一张 · 仅作代价，不发动效果</small>
                </span>
                <span className="ws-cost-seals" aria-hidden="true">
                  {['单', '团', '攻', '陷'].map((c) => (
                    <i key={c}>{c}</i>
                  ))}
                </span>
              </label>
              {session ? (
                <div className="ws-locked-result">
                  <ShieldCheck />
                  <div>
                    <strong>
                      {faceName(session.face)} ·{' '}
                      {session.source === 'toss'
                        ? '游戏内掷币'
                        : '实体硬币录入'}
                    </strong>
                    <p>本次判定已保存，返回不会重新掷币或重复支付代价。</p>
                  </div>
                </div>
              ) : (
                <div className="ws-coin-choices">
                  {(['heads', 'tails', 'toss'] as const).map((face) => (
                    <button
                      type="button"
                      key={face}
                      disabled={!draft.cost || waiting}
                      aria-pressed={draft.decision === face}
                      onClick={() =>
                        setDraft((d) => ({ ...d, decision: face }))
                      }
                    >
                      <span className={`ws-coin ws-coin-${face}`}>
                        {face === 'toss' ? (
                          <Dices />
                        ) : face === 'heads' ? (
                          '正'
                        ) : (
                          '反'
                        )}
                      </span>
                      <strong>{faceName(face)}</strong>
                      <small>
                        {face === 'toss' ? '游戏内随机' : '录入实体结果'}
                      </small>
                    </button>
                  ))}
                </div>
              )}
              {!session && draft.decision === 'tails' && (
                <section className="ws-section">
                  <h3>指定一名敌方</h3>
                  {targetPicker}
                </section>
              )}
              {session?.source === 'manual' && props.correct && (
                <details className="ws-correction">
                  <summary>实体结果录错了？</summary>
                  <p>
                    主机修正会记入历史，并清空已有牌组与目标；不会再付代价。
                  </p>
                  <button
                    type="button"
                    className="ws-secondary"
                    disabled={waiting}
                    onClick={() => setCorrecting(!correcting)}
                  >
                    {correcting ? '取消修正' : '修正本次记录'}
                  </button>
                  {correcting && (
                    <button
                      type="button"
                      className="ws-secondary"
                      disabled={waiting}
                      onClick={() =>
                        void run(async () => {
                          await props.correct!(
                            session.face === 'heads' ? 'tails' : 'heads',
                          );
                          setCorrecting(false);
                          setStep('outcome');
                        })
                      }
                    >
                      确认改为{session.face === 'heads' ? '反面' : '正面'}
                    </button>
                  )}
                </details>
              )}
            </div>
          )}
          {step === 'outcome' && (
            <div className="ws-stage ws-outcome">
              <span className={`ws-coin ws-coin-${session?.face}`}>
                <span>{session?.face === 'heads' ? '正' : '反'}</span>
              </span>
              <span className="ws-eyebrow">
                {settled ? '本次结算完成' : '本次判定已保存'}
              </span>
              <h2>
                {settled
                  ? `+${amount(session?.result?.points ?? 0)}`
                  : session?.face === 'heads'
                    ? '万象归手'
                    : '一击三倍满'}
              </h2>
              <p>
                {settled
                  ? session?.face === 'heads'
                    ? '本局结束，整场分数保留。可由牌桌开始下一局。'
                    : '本次得点已入账，其余玩家继续本局。'
                  : session?.face === 'heads'
                    ? '将现实牌池组成和牌，逐组录入。每张实体牌只使用一次。'
                    : '选择一名仍在局中的敌方，按固定三倍满结算。'}
              </p>
              {!settled && (
                <div className="ws-summary-line">
                  <span>
                    {session?.face === 'heads'
                      ? `${groups.length} 组已保存`
                      : (target?.name ?? '尚未选择目标')}
                  </span>
                  <strong>{amount(basePoints)} 点</strong>
                </div>
              )}
            </div>
          )}
          {step === 'groups' && (
            <div className="ws-stage">
              <div className="ws-section-heading">
                <div>
                  <span className="ws-eyebrow">正面 · 共享牌池</span>
                  <h2>已组成的和牌</h2>
                </div>
                <span>{groups.length} 组</span>
              </div>
              <p className="ws-help">
                将已录入的实体牌移到一旁，再组成下一组。
              </p>
              {groupError && (
                <p role="alert" className="ws-error">
                  {groupError}
                </p>
              )}
              <div className="ws-group-list">
                {groups.map((g, i) => (
                  <article className="ws-group" key={g.id}>
                    <div className="ws-group-top">
                      <span className="ws-group-number">
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <strong>
                          {results[i]?.yakuman
                            ? `${results[i].yakuman} 倍役满`
                            : `${(results[i]?.han ?? 0) + g.dora} 番 ${results[i]?.fu ?? g.fu} 符`}
                        </strong>
                        <small>
                          {yakuNames(results[i]?.yaku ?? g.selected)}
                        </small>
                      </div>
                      <b>+{amount(results[i]?.points ?? 0)}</b>
                    </div>
                    {g.tiles.length > 0 && (
                      <HandDisplay tiles={sortTiles(g.tiles)} />
                    )}
                    <div className="ws-group-actions">
                      <span>
                        {g.mode === 'smart' ? '智能算番' : '现场核对'}
                        {draft.edits[g.id] ? ' · 有未保存修改' : ''}
                      </span>
                      <button
                        type="button"
                        aria-label={`编辑第${i + 1}组`}
                        disabled={waiting}
                        onClick={() => edit(g)}
                      >
                        <Edit3 />
                        编辑
                      </button>
                      <button
                        type="button"
                        aria-label={`删除第${i + 1}组`}
                        disabled={waiting}
                        onClick={() =>
                          void run(async () => {
                            await update(groups.filter((x) => x.id !== g.id));
                            setDeleted(g);
                          })
                        }
                      >
                        <Trash2 />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {deleted && (
                <div className="ws-delete-notice">
                  <span>已删除一组</span>
                  <button
                    type="button"
                    disabled={waiting}
                    onClick={() =>
                      void run(async () => {
                        await update([...groups, deleted]);
                        setDeleted(undefined);
                      })
                    }
                  >
                    <RotateCcw />
                    撤销删除
                  </button>
                </div>
              )}
              {!groups.length && (
                <div className="ws-empty">
                  <Sparkles />
                  <h3>从第一组开始</h3>
                  <p>
                    点选牌张，系统识别役种与符数。
                    <br />
                    牌组保存后在这里汇总。
                  </p>
                </div>
              )}
              <button
                type="button"
                className="ws-add"
                disabled={waiting || groups.length >= 9}
                onClick={() => edit()}
              >
                <Plus />
                {draft.edits.new ? '继续未完成牌组' : '添加牌组'}
                <ChevronRight />
              </button>
            </div>
          )}
          {step === 'editor' && editor && (
            <div className="ws-stage ws-editor">
              {editConflict && (
                <output className="ws-conflict">
                  <strong>牌桌上的牌组已更新</strong>
                  <p>
                    你的输入已保留。返回列表可查看最新记录，或核对后用当前输入继续。
                  </p>
                  <button
                    type="button"
                    className="ws-secondary"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        editorRevision: session!.revision,
                        editRevisions: {
                          ...d.editRevisions,
                          [groups.some((g) => g.id === editor.id)
                            ? editor.id
                            : 'new']: session!.revision,
                        },
                      }))
                    }
                  >
                    已核对，以当前输入继续
                  </button>
                </output>
              )}
              <div className="ws-section-heading">
                <div>
                  <span className="ws-eyebrow">
                    {groups.some((g) => g.id === editor.id)
                      ? '编辑牌组'
                      : '新牌组'}
                  </span>
                  <h2>录入组好的牌</h2>
                </div>
                <span className="ws-count">
                  {editor.tiles.length}
                  <small> / 14 张</small>
                </span>
              </div>
              <div className="ws-editor-layout">
                <div className="ws-entry-panel">
                  <div className="ws-hand-tray">
                    {editor.tiles.map((t, i) => (
                      <button
                        type="button"
                        key={`${i}-${t}`}
                        aria-label={`移除第${i + 1}张${tileName(t)}`}
                        onClick={() =>
                          changeEditor({
                            tiles: editor.tiles.filter((_, n) => n !== i),
                          })
                        }
                      >
                        <MahjongTile tile={t} />
                      </button>
                    ))}
                    {!editor.tiles.length && (
                      <p>
                        点击下方牌面录入
                        <br />
                        <small>点已录入的牌可移除</small>
                      </p>
                    )}
                  </div>
                  <div className="ws-tray-tools">
                    <span>含赤五在内，同种牌最多四张</span>
                    <button
                      type="button"
                      disabled={!editor.tiles.length}
                      onClick={() =>
                        changeEditor({ tiles: editor.tiles.slice(0, -1) })
                      }
                    >
                      <RotateCcw />
                      撤销一张
                    </button>
                  </div>
                  <div className="ws-tile-palette">
                    {['m', 'p', 's', 'z'].map((suit, si) => (
                      <div key={suit}>
                        <span>{['万', '筒', '索', '字'][si]}</span>
                        <section>
                          {sortTiles(
                            [
                              ...TILE_IDS,
                              ...(ctx.rules.akaDora ? ['0m', '0p', '0s'] : []),
                            ].filter(
                              (t) =>
                                t.endsWith(suit) &&
                                (ctx.rules.playerCount !== 3 ||
                                  !/^(?:0|[2-8])m$/.test(t)),
                            ),
                          ).map((t) => {
                            const family = (v: string) => v.replace(/^0/, '5');
                            return (
                              <button
                                type="button"
                                aria-label={`加入${tileName(t)}`}
                                key={t}
                                disabled={
                                  editor.tiles.length >= 14 ||
                                  editor.tiles.filter(
                                    (x) => family(x) === family(t),
                                  ).length >= 4 ||
                                  (t[0] === '0' && editor.tiles.includes(t))
                                }
                                onClick={() =>
                                  changeEditor({ tiles: [...editor.tiles, t] })
                                }
                              >
                                <MahjongTile tile={t} />
                              </button>
                            );
                          })}
                        </section>
                      </div>
                    ))}
                  </div>
                  <details className="ws-details">
                    <summary>宝牌与现场核对</summary>
                    <label className="ws-dora">
                      本组实际宝牌总数
                      <input
                        aria-label="本组实际宝牌总数"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={40}
                        value={editor.dora}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          changeEditor({
                            dora: Math.max(
                              0,
                              Math.min(
                                40,
                                Math.trunc(Number(e.target.value) || 0),
                              ),
                            ),
                          })
                        }
                      />
                    </label>
                    <p className="ws-help">
                      赤宝牌随牌张自动计入，其他宝牌请现场补充；不使用技能加番与加点。
                    </p>
                    <label className="ws-manual-switch">
                      <input
                        type="checkbox"
                        checked={editor.mode === 'manual'}
                        onChange={(e) =>
                          changeEditor({
                            mode: e.target.checked ? 'manual' : 'smart',
                            selected: [],
                          })
                        }
                      />
                      现场已核对，改为手动选择牌型役
                    </label>
                    {editor.mode === 'manual' && (
                      <>
                        <label className="ws-dora">
                          现场符数
                          <select
                            value={editor.fu}
                            onChange={(e) =>
                              changeEditor({ fu: Number(e.target.value) })
                            }
                          >
                            {[25, 30, 40, 50, 60, 70, 80, 90, 100, 110].map(
                              (f) => (
                                <option key={f} value={f}>
                                  {f} 符
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <div className="ws-manual-yaku">
                          {wushuangYaku.map((y) => (
                            <label key={y.id}>
                              <input
                                type="checkbox"
                                checked={editor.selected.includes(y.id)}
                                onChange={(e) =>
                                  changeEditor({
                                    selected: e.target.checked
                                      ? [...editor.selected, y.id]
                                      : editor.selected.filter(
                                          (id) => id !== y.id,
                                        ),
                                  })
                                }
                              />
                              {y.name}
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </details>
                </div>
                <div className="ws-analysis-panel">
                  {editor.mode === 'smart' && (
                    <HandCalculator
                      key={editor.id}
                      winningTileLabel="指定本组和牌张"
                      initialAnalysis={{
                        winningTile: editor.winningTile,
                        meldText: editor.meldText,
                        automatic: true,
                      }}
                      automaticOnly
                      hideMelds
                      tiles={editor.tiles}
                      closed
                      winType="ron"
                      seatWind={ctx.seatWind}
                      roundWind={ctx.roundWind}
                      selected={[]}
                      bonusHan={editor.dora}
                      openTanyao={ctx.rules.openTanyao}
                      kiriage={ctx.rules.kiriageMangan}
                      kazoe={ctx.rules.kazoeYakuman}
                      onApply={() => undefined}
                      onAnalysisChange={(a) =>
                        changeEditor({
                          winningTile: a.winningTile,
                          meldText: a.meldText,
                        })
                      }
                    />
                  )}
                  <div
                    className={`ws-live-result ${editorScore ? 'is-ready' : ''}`}
                    aria-live="polite"
                  >
                    <span>{editorScore ? '本组荣和点数' : '等待完成牌型'}</span>
                    <strong>
                      {editorScore ? amount(editorScore.points) : '—'}
                    </strong>
                    <small>
                      {editorScore
                        ? `${editorScore.yakuman ? `${editorScore.yakuman} 倍役满` : `${editorScore.han + editor.dora} 番 ${editorScore.fu} 符`} · ${ctx.seatWind === '东' ? '庄家' : '闲家'}`
                        : editorError}
                    </small>
                  </div>
                </div>
              </div>
            </div>
          )}
          {step === 'target' && (
            <div className="ws-stage">
              <div className="ws-section-heading">
                <div>
                  <span className="ws-eyebrow">反面 · 指定荣和</span>
                  <h2>一击三倍满</h2>
                </div>
                <strong className="ws-big-points">{amount(basePoints)}</strong>
              </div>
              <p className="ws-help">
                选择一名仍在局中的敌方，不需要录入手牌或役种。
              </p>
              {targetPicker}
              {!props.targets.some((t) => t.active && t.enemy !== false) && (
                <p className="ws-error">
                  当前没有合法敌方目标，请由牌桌核对参与状态。
                </p>
              )}
            </div>
          )}
          {step === 'preview' && (
            <div className="ws-stage ws-preview">
              <span className="ws-eyebrow">
                {faceName(session?.face)} · 最终核对
              </span>
              <h2>本次个人得点</h2>
              <strong className="ws-final-total">+{amount(total)}</strong>
              <div className="ws-score-path">
                <span>{amount(props.actor.score)}</span>
                <ChevronRight />
                <b>{amount(props.actor.score + total)}</b>
              </div>
              <div className="ws-breakdown">
                {session?.face === 'heads' ? (
                  groups.map((g, i) => (
                    <div key={g.id}>
                      <span>
                        第 {i + 1} 组 ·{' '}
                        {results[i]?.yakuman
                          ? '役满'
                          : `${(results[i]?.han ?? 0) + g.dora} 番 ${results[i]?.fu} 符`}
                      </span>
                      <b>+{amount(results[i]?.points ?? 0)}</b>
                    </div>
                  ))
                ) : (
                  <div>
                    <span>{target?.name} · 支付三倍满</span>
                    <b>−{amount(basePoints)}</b>
                  </div>
                )}
                <div>
                  <span>供托 · 一次领取</span>
                  <b>+{amount(props.deposits * 1000)}</b>
                </div>
              </div>
              <p className="ws-help">
                {session?.face === 'heads'
                  ? '合计只加入使用者个人点数；结束当前一局，整场保留。'
                  : '使用者标为已和牌，其余玩家继续本局。'}
                本场加点及其他技能修正不计入。
              </p>
              {session?.face === 'heads' && (
                <label className="ws-physical-confirm">
                  <input
                    type="checkbox"
                    checked={physicalConfirmed}
                    onChange={(e) => setPhysicalConfirmed(e.target.checked)}
                  />
                  <span>已核对各组使用不同实体牌，所有牌型成立</span>
                </label>
              )}
            </div>
          )}
        </div>
        <footer className="ws-footer">
          <div className="ws-footer-caption">
            <span>
              {step === 'editor'
                ? '本组得点'
                : step === 'setup'
                  ? '确认后保存本次结果'
                  : settled
                    ? '已入账'
                    : '本次合计'}
            </span>
            <strong>
              {step === 'setup'
                ? session
                  ? '判定已锁定'
                  : draft.decision
                    ? faceName(draft.decision)
                    : '请选择币面'
                : step === 'editor'
                  ? editorScore
                    ? `${amount(editorScore.points)} 点`
                    : '待完成'
                  : `${amount(settled ? (session?.result?.points ?? 0) : basePoints)} 点`}
            </strong>
          </div>
          {settled ? (
            <button type="button" className="ws-primary" onClick={props.close}>
              <Check />
              回到牌桌
            </button>
          ) : step === 'setup' ? (
            <button
              type="button"
              className="ws-primary"
              disabled={
                waiting ||
                (!session &&
                  (!draft.cost ||
                    !draft.decision ||
                    (draft.decision === 'tails' && !targetValid)))
              }
              onClick={() =>
                session
                  ? setStep('outcome')
                  : void run(async () => {
                      await props.activate(
                        draft.decision!,
                        draft.targetId,
                        draft.activationId,
                      );
                      setStep('outcome');
                    })
              }
            >
              {busy ? '正在保存…' : session ? '继续处理' : '确认发动'}
              <ChevronRight />
            </button>
          ) : step === 'outcome' ? (
            <button
              type="button"
              className="ws-primary"
              disabled={waiting}
              onClick={() =>
                setStep(session?.face === 'heads' ? 'groups' : 'target')
              }
            >
              {session?.face === 'heads' ? '开始组牌' : '选择目标'}
              <ChevronRight />
            </button>
          ) : step === 'editor' ? (
            <button
              type="button"
              className="ws-primary"
              disabled={waiting || !editorScore || editConflict}
              onClick={() =>
                void run(async () => {
                  const next = groups.some((g) => g.id === editor!.id)
                    ? groups.map((g) => (g.id === editor!.id ? editor! : g))
                    : [...groups, editor!];
                  validateWushuangGroups(ctx, next);
                  await update(
                    next,
                    session?.targetId,
                    draft.editorRevision ?? session?.revision,
                  );
                  setDraft((d) => {
                    const edits = { ...d.edits };
                    delete edits[
                      groups.some((g) => g.id === editor!.id)
                        ? editor!.id
                        : 'new'
                    ];
                    return { ...d, edits, editor: undefined, step: 'groups' };
                  });
                })
              }
            >
              <Check />
              {groups.some((g) => g.id === editor?.id)
                ? '保存修改'
                : '加入牌组'}
            </button>
          ) : step === 'preview' ? (
            <button
              type="button"
              className="ws-primary"
              disabled={
                waiting ||
                (session?.face === 'heads'
                  ? !physicalConfirmed || !groups.length || Boolean(groupError)
                  : !targetValid)
              }
              onClick={() =>
                void run(async () => {
                  await props.send({
                    kind: 'wushuang.commit',
                    effectId: session!.effectId,
                    revision: session!.revision,
                    physicalTilesConfirmed: physicalConfirmed,
                    expectedDeposits: props.deposits,
                    expectedScore: props.actor.score,
                  });
                })
              }
            >
              <ShieldCheck />
              {busy
                ? '正在入账…'
                : session?.face === 'heads'
                  ? '加分并结束本局'
                  : '确认三倍满'}
            </button>
          ) : (
            <button
              type="button"
              className="ws-primary"
              disabled={
                waiting ||
                (step === 'groups'
                  ? !groups.length || Boolean(groupError)
                  : !targetValid)
              }
              onClick={() => setStep('preview')}
            >
              结算预览
              <ChevronRight />
            </button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
