'use client';
/* oxlint-disable next/no-img-element -- Existing offline card art. */
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Dices,
  ShieldCheck,
  Sparkles,
  Star,
  Swords,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { godCardCost } from '@/lib/god-card-cost';
import { nfcCardArtwork, type NfcCard } from '@/lib/nfc-cards';
import type { ControllerCommand, SkillDuration } from '@/lib/lan-protocol';
import type { CoinDecision } from '@/lib/skill-random';
import './god-skill-workbench.css';
import { CharacterAvatar } from './character-picker';
import type { CharacterChoice } from '@/lib/characters';

type Activation = Extract<
  ControllerCommand,
  { kind: 'skill.activate' }
>['input'];
interface Props {
  card: NfcCard;
  actorName: string;
  targets: { id: string; name: string; active: boolean; enemy: boolean; character?: CharacterChoice; wind?: string }[];
  disabled?: boolean;
  close: () => void;
  activate: (input: Activation) => Promise<void>;
}
const themes: Record<
  number,
  { title: string; lead: string; detail: string; cost: string }
> = {
  42: {
    title: '断绝敌意，\n护佑同阵。',
    lead: '本局守护 · 己方阵营',
    detail: '敌方不能荣和己方，也不能用己方打出的牌吃、碰或杠。',
    cost: '攻',
  },
  43: {
    title: '以宿星为令，\n裁定一手。',
    lead: '指定敌方 · 本局掌控',
    detail:
      '每次对方弃牌前，可先公开其最多两张未公开手牌，再指定一张手牌打出。',
    cost: '团',
  },
  44: {
    title: '问天一掷，\n万象为剑。',
    lead: '决策硬币 · 两种命运',
    detail:
      '正面：每次摸牌额外抽取五张技能卡。反面：明示一张「飞」牌，按卡面规则作为任意牌使用。',
    cost: '单',
  },
};
export function GodSkillWorkbench({
  card,
  actorName,
  targets,
  disabled,
  close,
  activate,
}: Props) {
  const [cost, setCost] = useState(false),
    [target, setTarget] = useState(''),
    [decision, setDecision] = useState<CoinDecision>(),
    [duration, setDuration] = useState<SkillDuration>('hand'),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const locked = useRef(false),
    [activationId] = useState(() => crypto.randomUUID());
  const theme = themes[card.id],
    price = godCardCost(card);
  const validTarget =
    card.id !== 43 ||
    targets.some((p) => p.id === target && p.active && p.enemy);
  const ready =
    !!price &&
    cost &&
    validTarget &&
    (card.id !== 44 || !!decision) &&
    !disabled &&
    !busy;
  useEffect(() => {
    const back = (e: Event) => {
      e.preventDefault();
      if (!locked.current) close();
    };
    window.addEventListener('mahjong:native-back', back);
    return () => window.removeEventListener('mahjong:native-back', back);
  }, [close]);
  if (!theme || !price) return null;
  async function submit() {
    if (!ready || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      await activate({
        cardId: card.id,
        activationId,
        wushuangCostConfirmed: true,
        targetPlayerIds: card.id === 43 ? [target] : [],
        duration,
        faceDown: false,
        coinDecision: card.id === 44 ? decision : undefined,
        effectText: note.trim() || card.effectDescription,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '发动尚未确认，请重试');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  const Icon = card.id === 42 ? ShieldCheck : card.id === 43 ? Star : Swords;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked.current) close();
      }}
    >
      <DialogContent
        nativeBack={false}
        positioning="custom"
        className={'god-workbench god-card-' + card.id}
        showCloseButton={false}
      >
        <header className="god-header">
          <button
            type="button"
            aria-label="返回"
            disabled={busy}
            onClick={close}
          >
            <ArrowLeft />
          </button>
          <div>
            <DialogTitle>{card.name}</DialogTitle>
            <DialogDescription>{actorName} · 专属发动</DialogDescription>
          </div>
          <Icon className="god-seal" />
        </header>
        <div className="god-body">
          <section className="god-hero">
            <div>
              <small>{theme.lead}</small>
              <h2>{theme.title}</h2>
              <p>{theme.detail}</p>
            </div>
            {nfcCardArtwork(card) && (
              <img src={nfcCardArtwork(card)!} alt={card.name} />
            )}
          </section>
          <div className="god-config">
            <section className="god-cost">
              <label>
                <input
                  type="checkbox"
                  checked={cost}
                  disabled={busy}
                  onChange={(e) => setCost(e.target.checked)}
                />
                <span>
                  <strong>两张「{theme.cost}」已交出</strong>
                  <small>仅作为代价，代价卡效果不发动</small>
                </span>
                <span className="god-cost-tokens" aria-hidden="true">
                  {theme.cost}　{theme.cost}
                </span>
              </label>
            </section>
            {card.id === 43 && (
              <section className="god-targets">
                <h3>选择一名敌方玩家</h3>
                <div>
                  {targets
                    .filter((p) => p.active && p.enemy)
                    .map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        disabled={busy}
                        aria-pressed={target === p.id}
                        onClick={() => setTarget(p.id)}
                      >
                        <CharacterAvatar choice={p.character} /><span><strong>{p.name}</strong><small>{p.wind ? `${p.wind}家 · ` : ''}敌方</small></span>
                      </button>
                    ))}
                </div>
                {!targets.some((p) => p.active && p.enemy) && (
                  <p>当前没有可选的敌方玩家。</p>
                )}
              </section>
            )}
            {card.id === 44 && (
              <section className="god-decisions">
                <h3>录入实体结果，或交给硬币</h3>
                <div>
                  {(['heads', 'tails', 'toss'] as const).map((face) => (
                    <button
                      type="button"
                      key={face}
                      disabled={busy}
                      aria-pressed={decision === face}
                      onClick={() => setDecision(face)}
                    >
                      <span className={'god-coin god-coin-' + face}>
                        {face === 'toss' ? (
                          <Dices />
                        ) : face === 'heads' ? (
                          '正'
                        ) : (
                          '反'
                        )}
                      </span>
                      <strong>
                        {face === 'heads'
                          ? '正面'
                          : face === 'tails'
                            ? '反面'
                            : '掷币'}
                      </strong>
                      <small>
                        {face === 'heads'
                          ? '额外抽取技能卡'
                          : face === 'tails'
                            ? '明示「飞」牌'
                            : '随机判定与演出'}
                      </small>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {card.id === 42 && (
              <section className="god-effect">
                <ShieldCheck />
                <div>
                  <h3>为己方展开守护</h3>
                  <p>发动后保留本局效果记录，实体牌桌按卡面规则执行。</p>
                </div>
              </section>
            )}
            <details className="god-details">
              <summary>查看完整规则与调整</summary>
              <p>{card.effectDescription}</p>
              <label>
                持续范围
                <select
                  value={duration}
                  disabled={busy}
                  onChange={(e) => setDuration(e.target.value as SkillDuration)}
                >
                  <option value="hand">本局有效</option>
                  <option value="once">单次结算</option>
                  <option value="match">整场有效</option>
                  <option value="manual">手动解除</option>
                </select>
              </label>
              <label>
                补充说明
                <textarea
                  value={note}
                  maxLength={500}
                  disabled={busy}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="选填，记录本次约定"
                />
              </label>
            </details>
            {error && (
              <p className="god-error" role="alert">
                {error}
              </p>
            )}
            {disabled && (
              <p className="god-error">
                当前暂不可发动，请检查对局状态或连接。
              </p>
            )}
          </div>
        </div>
        <footer className="god-footer">
          <div>
            <small>代价与条件确认</small>
            <strong>
              {!cost
                ? '请确认实体代价'
                : !validTarget
                  ? '请选择敌方玩家'
                  : card.id === 44 && !decision
                    ? '请选择硬币结果'
                    : '准备就绪'}
            </strong>
          </div>
          <button
            type="button"
            className="god-submit"
            disabled={!ready}
            onClick={() => void submit()}
          >
            <Sparkles />
            {busy ? '等待牌桌确认…' : '确认发动'}
            <ChevronRight />
          </button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
