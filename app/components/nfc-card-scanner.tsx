'use client';
/* oxlint-disable next/no-img-element -- Bundled offline card artwork. */
import { useEffect, useRef, useState } from 'react';
import { ScanLine, ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { nativeNfc, type NfcTransport, type NfcOpenRequest } from '@/lib/nfc-native';
import { nfcCardArtwork, type NfcCard } from '@/lib/nfc-cards';
import { identifyNfcUri, nfcSkill, nfcHasMusic, type NfcIdentity } from '@/lib/nfc-registry';
import './nfc-card-scanner.css';
import { MusicPlayer } from './music-player';
export interface NfcScannerProps {
  cards: readonly NfcCard[];
  onPrepare: (cardId: number, actorId?: string) => void;
  canPrepare: boolean;
  disabled?: boolean;
  players?: { id: string; name: string; active: boolean }[];
  transport?: NfcTransport;
  allowMusic?: boolean;
}
export function NfcScannerButton(props: NfcScannerProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="nfc-entry"
        disabled={props.disabled}
        onClick={() => setOpen(true)}
      >
        <ScanLine size={18} />
        扫描卡牌
      </button>
      {open && <NfcCardScanner {...props} close={() => setOpen(false)} />}
    </>
  );
}
/** Mounted once per game surface, even while another tab is visible. */
export function NfcIntentTarget(props: NfcScannerProps) {
  const [request, setRequest] = useState<{ uri: string; key: number }>();
  useEffect(() => {
    const accept = (event: Event) => {
      if (event.defaultPrevented) return;
      const detail = (event as CustomEvent<NfcOpenRequest | string>).detail;
      const request = typeof detail === 'string' ? { uri: detail } : detail;
      setRequest(undefined);
      // An Android NDEF launch from outside the app opens music even if a table was left open.
      if (request.origin === 'external') {
        try { if (nfcHasMusic(identifyNfcUri(request.uri))) return; } catch { /* Show the normal invalid-card message. */ }
      }
      event.preventDefault();
      setRequest({
        uri: request.uri,
        key: Date.now(),
      });
    };
    window.addEventListener('mahjong:nfc-open', accept);
    return () => window.removeEventListener('mahjong:nfc-open', accept);
  }, []);
  return request ? (
    <NfcCardScanner
      key={request.key}
      {...props}
      initialUri={request.uri}
      close={() => setRequest(undefined)}
    />
  ) : null;
}
export function NfcCardScanner({
  cards,
  onPrepare,
  canPrepare,
  disabled,
  players,
  transport = nativeNfc,
  allowMusic = false,
  initialUri,
  close,
}: NfcScannerProps & { initialUri?: string; close: () => void }) {
  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState('checking');
  const [message, setMessage] = useState('正在检查 NFC');
  const [identity, setIdentity] = useState<NfcIdentity>();
  const [actor, setActor] = useState('');
  const latest = useRef({
    cards,
    onPrepare,
    canPrepare,
    disabled,
    players,
    allowMusic,
    close,
  });
  useEffect(() => {
    latest.current = { cards, onPrepare, canPrepare, disabled, players, allowMusic, close };
  });
  const card = identity ? nfcSkill(identity, cards) : undefined;
  const actorValid =
    !players || players.some((p) => p.id === actor && p.active);
  useEffect(() => {
    let alive = true,
      consumed = false,
      remove: (() => Promise<void>) | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    function receive(uri: unknown) {
      try {
        if (latest.current.disabled)
          throw Error('当前对局效果期间暂不可扫描卡面，请稍后重试');
        const found = identifyNfcUri(uri);
        const current = latest.current;
        const skill = nfcSkill(found, current.cards);
        // A personal controller already knows its player. Only open the editor, never submit.
        if (
          found.action === 'skill' &&
          !(current.allowMusic && nfcHasMusic(found)) &&
          skill &&
          !current.players &&
          current.canPrepare &&
          !current.disabled
        ) {
          current.close();
          current.onPrepare(skill.id);
          return;
        }
        setIdentity(found);
        setMode('result');
        setMessage('已识别 · ' + found.name);
      } catch (e) {
        setMode('error');
        setMessage(e instanceof Error ? e.message : '读卡失败');
      }
    }
    async function begin() {
      if (initialUri) {
        receive(initialUri);
        return;
      }
      try {
        const status = await transport.status();
        if (!alive) return;
        if (!status.supported) {
          setMode('unsupported');
          setMessage(
            '此设备无法扫描 NFC，请使用支持 NFC 的 Android 手机，或继续手动选卡',
          );
          return;
        }
        if (!status.enabled) {
          setMode('disabled');
          setMessage('请先在系统设置中开启 NFC');
          return;
        }
        const handle = await transport.addListener('scan', (event) => {
          if (!alive || consumed || event.sessionId !== sessionId) return;
          consumed = true;
          if (timer) clearTimeout(timer);
          if (event.kind === 'tag') receive(event.uri);
          else {
            setMode('error');
            setMessage(event.message || '扫描已暂停，请重试');
          }
        });
        remove = () => handle.remove();
        if (!alive) {
          await remove();
          return;
        }
        await transport.start({ sessionId });
        if (!alive) {
          await transport.stop({ sessionId });
          return;
        }
        if (!consumed) {
          setMode('waiting');
          setMessage('将单张卡片贴近手机背面的 NFC 感应区');
          timer = setTimeout(() => {
            if (!alive || consumed) return;
            consumed = true;
            void transport.stop({ sessionId }).catch(() => {});
            setMode('error');
            setMessage('暂未读到卡片，请调整感应位置后重试');
          }, 20000);
        }
      } catch (e) {
        if (alive) {
          setMode('error');
          setMessage(e instanceof Error ? e.message : '扫描暂时不可用');
        }
      }
    }
    void begin();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      void transport.stop({ sessionId }).catch(() => {});
      void remove?.();
    };
  }, [transport, sessionId, initialUri]);
  useEffect(() => {
    const back = (event: Event) => {
      event.preventDefault();
      close();
    };
    window.addEventListener('mahjong:native-back', back);
    return () => window.removeEventListener('mahjong:native-back', back);
  }, [close]);
  if (identity && nfcHasMusic(identity) && !disabled && allowMusic) {
    return <MusicPlayer identity={identity} close={close} />;
  }
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) close();
      }}
    >
      <DialogContent
        positioning="custom"
        className="nfc-panel"
        showCloseButton={false}
      >
        <header className="nfc-header">
          <button type="button" aria-label="关闭 NFC 扫描" onClick={close}>
            <ArrowLeft />
          </button>
          <div>
            <DialogTitle>NFC 特别卡面</DialogTitle>
            <DialogDescription>
              {players
                ? '公共屏幕显示卡面 · 暗置卡请用个人手机'
                : '碰一碰，开启卡面的专属体验'}
            </DialogDescription>
          </div>
        </header>
        <div className="nfc-body">
          <div
            className={'nfc-status ' + (mode === 'waiting' ? 'is-waiting' : '')}
          >
            <ScanLine />
            <output>
              {disabled ? '当前对局效果期间暂不可扫描卡面' : message}
            </output>
          </div>
          {mode === 'disabled' && (
            <button
              className="nfc-secondary"
              onClick={() =>
                void transport
                  .settings()
                  .catch(() => setMessage('请手动打开系统 NFC 设置'))
              }
            >
              打开 NFC 设置
            </button>
          )}
          {identity && !disabled && (
            <section className="nfc-result">
              {(identity.artwork || (card && nfcCardArtwork(card))) && (
                <img
                  src={identity.artwork || nfcCardArtwork(card!)!}
                  alt={identity.name}
                />
              )}
              <h3>{identity.name}</h3>
              {identity.action === 'music' ? (
                <p>请返回模式选择页后扫描播放，避免打断对局音效。</p>
              ) : (
                <>
                  {card ? (
                    <details className="nfc-rule">
                      <summary>查看卡面规则</summary>
                      <p>{card.effectDescription}</p>
                    </details>
                  ) : (
                    <p>
                      当前页面不能发动这张技能卡。请返回，进入实体牌桌或连接手机遥控后重新碰卡；若已在对局中，请确认技能库仍保留此卡。
                    </p>
                  )}
                  {card && players && (
                    <label className="nfc-actor">
                      使用者
                      <select
                        aria-label="NFC 技能使用者"
                        value={actor}
                        onChange={(e) => setActor(e.target.value)}
                      >
                        <option value="">请选择实际使用者</option>
                        {players
                          .filter((p) => p.active)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {card && (
                    <button
                      className="nfc-primary"
                      disabled={!canPrepare || disabled || !actorValid}
                      onClick={() => {
                        close();
                        onPrepare(card.id, actor || undefined);
                      }}
                    >
                      进入专属发动页
                    </button>
                  )}
                  {card && (!canPrepare || disabled) && (
                    <small>
                      当前不能发动技能。请返回实体牌桌或已连接的手机遥控，确认当前允许使用技能后重新碰卡。
                    </small>
                  )}
                </>
              )}
            </section>
          )}
          {!initialUri &&
            (mode === 'disabled' || mode === 'error' || mode === 'result') && (
              <button
                className="nfc-secondary"
                onClick={() => {
                  setIdentity(undefined);
                  setActor('');
                  setMode('checking');
                  setSessionId(crypto.randomUUID());
                }}
              >
                <RefreshCw size={16} />
                {mode === 'result' ? '扫描另一张' : '重新扫描'}
              </button>
            )}
        </div>
        <footer className="nfc-footer">
          <ShieldCheck size={15} />
          <span>技能发动与结算由牌桌确认</span><button type="button" className="nfc-return" onClick={close}>返回上一页</button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
