'use client';
/* oxlint-disable next/no-img-element -- Local offline album artwork, rendered within a CSS record mask. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ArrowLeft,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Repeat2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  nfcAudioSource,
  nfcCoverSource,
  type NfcIdentity,
} from '@/lib/nfc-registry';
import {
  localLyricsSource,
  lyricIndex,
  musicTime,
  parseLrc,
  type LyricCue,
} from '@/lib/music-lyrics';
import { gameMusicDirector } from '@/app/hooks/use-game-audio';
import './music-player.css';

/** Self-contained transport: another NFC music identity supplies metadata and local audio/LRC. */
export function MusicPlayer({
  identity,
  close,
}: {
  identity: NfcIdentity;
  close: () => void;
}) {
  const src = nfcAudioSource(identity);
  const cover = nfcCoverSource(identity);
  const [failedSource, setFailedSource] = useState('');
  const unavailable = !src || failedSource === src;
  useEffect(() => src ? gameMusicDirector().hold() : undefined, [src]);
  const [coverFailed, setCoverFailed] = useState(false);
  const lyricsViewport = useRef<HTMLDivElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(
    null,
  );
  const attachAudio = useCallback((element: HTMLAudioElement | null) => {
    audio.current = element;
    setAudioElement(element);
  }, []);
  const [playing, setPlaying] = useState(false),
    [time, setTime] = useState(0),
    [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8),
    [muted, setMuted] = useState(false),
    [loop, setLoop] = useState(false);
  const [message, setMessage] = useState(''),
    [cues, setCues] = useState<LyricCue[]>([]);
  const [lyricState, setLyricState] = useState<
    'missing' | 'loading' | 'ready' | 'error'
  >('missing');
  const titleParts = (identity.trackTitle || identity.name).split(' / ');
  const index = lyricIndex(cues, time),
    lyricSrc = localLyricsSource(identity.lyricsSrc);
  const progress = duration ? Math.min(100, (time / duration) * 100) : 0;

  const play = () => {
    const element = audio.current;
    if (!element) return;
    void element.play().catch(() => setMessage('轻触播放键，继续聆听'));
  };
  const seek = (seconds: number) => {
    if (!audio.current || !Number.isFinite(duration) || !duration) return;
    const target = Math.max(0, Math.min(duration, seconds));
    audio.current.currentTime = target;
    setTime(target);
  };

  useEffect(() => {
    const element = audio.current;
    if (!element || !src) return;
    let alive = true,
      attempted = false;
    const visible = () => {
      if (document.hidden) {
        element.pause();
        return;
      }
      if (attempted) return;
      attempted = true;
      void element.play().catch(() => {
        if (!alive) return;
        if (document.hidden) attempted = false;
        else setMessage('轻触播放键，开始聆听');
      });
    };
    visible();
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive = false;
      element.pause();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [src, audioElement]);
  useEffect(() => {
    if (audio.current) {
      audio.current.volume = volume;
      audio.current.muted = muted;
      audio.current.loop = loop;
    }
  }, [volume, muted, loop, audioElement]);
  useEffect(() => {
    // oxlint-disable-next-line react/react-compiler -- Reset the external lyric request when its source changes.
    setCues([]);
    if (!lyricSrc) {
      setLyricState('missing');
      return;
    }
    const controller = new AbortController();
    setLyricState('loading');
    void fetch(lyricSrc, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error('lyrics');
        const parsed = parseLrc(await response.text());
        if (!parsed.some((cue) => cue.text)) throw Error('empty lyrics');
        if (!controller.signal.aborted) {
          setCues(parsed);
          setLyricState('ready');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setLyricState('error');
      });
    return () => controller.abort();
  }, [lyricSrc]);
  useEffect(() => {
    const viewport = lyricsViewport.current;
    if (!viewport || !cues.length) return;
    const center = () => {
      const active = viewport.querySelector<HTMLElement>('.is-current');
      if (!active) return;
      const row = active.getBoundingClientRect();
      const frame = viewport.getBoundingClientRect();
      const top =
        viewport.scrollTop +
        row.top -
        frame.top -
        (viewport.clientHeight - row.height) / 2;
      const jump = Math.abs(top - viewport.scrollTop) > viewport.clientHeight;
      viewport.scrollTo({
        top: Math.max(0, top),
        behavior:
          jump || matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
      });
    };
    center();
    const observer = new ResizeObserver(center);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [index, cues]);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        positioning="custom"
        className="mp-dialog"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">
          {titleParts[0]} · 音乐播放器
        </DialogTitle>
        <DialogDescription className="sr-only">
          曲绘唱片播放器，支持暂停、进度、音量、循环与双语同步歌词。
        </DialogDescription>
        <div className="mp-room">
          <header className="mp-room-header">
            <button
              type="button"
              className="mp-back"
              onClick={close}
              aria-label="关闭音乐播放器"
            >
              <ArrowLeft size={18} />
              <span>返回</span>
            </button>
          </header>
          <main className={`mp-cabinet ${playing ? 'is-playing' : ''}`}>
            <i className="mp-screw mp-screw-tl" aria-hidden="true" />
            <i className="mp-screw mp-screw-tr" aria-hidden="true" />
            <i className="mp-screw mp-screw-bl" aria-hidden="true" />
            <i className="mp-screw mp-screw-br" aria-hidden="true" />
            <div className="mp-main">
              <section
                className="mp-deck-section"
                aria-label="曲绘唱片与播放控制"
              >
                <div className="mp-disc-deck">
                  <div className="mp-deck-top">
                    <div className="mp-power">
                      <i />
                      <span>{unavailable ? '音源不可用' : playing ? '正在播放' : '静候聆听'}</span>
                    </div>
                    <span>STEREO</span>
                  </div>
                  <div className="mp-platter">
                    <div className="mp-record-spin">
                      {cover && !coverFailed ? (
                        <img
                          className="mp-record-art"
                          src={cover}
                          alt={`${titleParts[0]}曲绘`}
                          onError={() => setCoverFailed(true)}
                        />
                      ) : (
                        <div className="mp-record-fallback" aria-hidden="true">
                          <span>♪</span>
                        </div>
                      )}
                      <span className="mp-record-grooves" aria-hidden="true" />
                    </div>
                    <div className="mp-disc-sheen" aria-hidden="true" />
                    <span className="mp-spindle" aria-hidden="true" />
                  </div>
                  <div className="mp-deck-floor">
                    <span>HIGH FIDELITY</span>
                    <span className="mp-tape-label">
                      {titleParts[1] || titleParts[0]}
                    </span>
                    <span>33 ⅓</span>
                  </div>
                </div>
                <div className="mp-transport">
                  <button
                    type="button"
                    className="mp-small-key"
                    disabled={unavailable || !duration}
                    onClick={() => seek(time - 10)}
                    aria-label="后退十秒"
                  >
                    <RotateCcw size={19} />
                    <small>10</small>
                  </button>
                  <div className="mp-play-housing">
                    <button
                      type="button"
                      className="mp-play-key"
                      disabled={unavailable}
                      aria-label={playing ? '暂停' : '播放'}
                      onClick={() =>
                        playing ? audio.current?.pause() : play()
                      }
                    >
                      {playing ? (
                        <Pause fill="currentColor" size={27} />
                      ) : (
                        <Play fill="currentColor" size={27} />
                      )}
                    </button>
                    <span>{playing ? 'PAUSE' : 'PLAY'}</span>
                  </div>
                  <button
                    type="button"
                    className="mp-small-key"
                    disabled={unavailable || !duration}
                    onClick={() => seek(time + 10)}
                    aria-label="前进十秒"
                  >
                    <RotateCw size={19} />
                    <small>10</small>
                  </button>
                </div>
              </section>
              <section className="mp-listening" aria-label="曲目与同步歌词">
                <div className="mp-track-heading">
                  <h1>{titleParts[0]}</h1>
                  <p>
                    {titleParts[1]}
                    {identity.artist && <span> · {identity.artist}</span>}
                  </p>
                </div>
                <div className="mp-lyrics-glass">
                  <div
                    ref={lyricsViewport}
                    className="mp-lyrics-window"
                    aria-label="中日双语同步歌词"
                  >
                    {lyricState === 'ready' ? (
                      <div className="mp-cues">
                        <div
                          className={`mp-intro ${index < 0 ? 'is-current' : ''}`}
                          aria-label="前奏"
                        >
                          ···
                        </div>
                        {cues.map((cue, cueIndex) => (
                          <button
                            type="button"
                            key={cue.time}
                            className={`mp-cue ${index === cueIndex ? 'is-current' : ''}`}
                            disabled={unavailable || !duration}
                            aria-current={
                              index === cueIndex ? 'true' : undefined
                            }
                            onClick={() => seek(cue.time)}
                          >
                            {cue.text ? (
                              cue.text
                                .split('\n')
                                .map((line, lineIndex, lines) => (
                                  <span
                                    key={lineIndex}
                                    className={
                                      lines.length > 1 && lineIndex === 0
                                        ? 'mp-cue-original'
                                        : 'mp-cue-translation'
                                    }
                                  >
                                    {line}
                                  </span>
                                ))
                            ) : (
                              <span className="mp-interlude">···</span>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="mp-lyric-empty">
                        {lyricState === 'loading'
                          ? '正在载入歌词'
                          : lyricState === 'error'
                            ? '歌词暂时无法载入'
                            : '此曲暂无歌词'}
                      </div>
                    )}
                  </div>
                </div>
                <div className="mp-scrubber">
                  <input
                    type="range"
                    min="0"
                    max={duration || 1}
                    step="0.1"
                    value={Math.min(time, duration || 1)}
                    disabled={unavailable || !duration}
                    aria-label="播放进度"
                    aria-valuetext={`${musicTime(time)}，共 ${musicTime(duration)}`}
                    onChange={(e) => seek(Number(e.target.value))}
                    style={{ '--mp-progress': `${progress}%` } as CSSProperties}
                  />
                  <div>
                    <span>{musicTime(time)}</span>
                    <span>{musicTime(duration)}</span>
                  </div>
                </div>
                <div className="mp-mix">
                  <button
                    type="button"
                    className="mp-loop"
                    aria-label="单曲循环"
                    aria-pressed={loop}
                    disabled={unavailable}
                    onClick={() => setLoop(!loop)}
                  >
                    <Repeat2 size={18} />
                    <span>单曲循环</span>
                    <i />
                  </button>
                  <div className="mp-volume">
                    <button
                      type="button"
                      onClick={() => setMuted(!muted)}
                      aria-label={muted ? '取消静音' : '静音'}
                      disabled={unavailable}
                    >
                      {muted || volume === 0 ? (
                        <VolumeX size={19} />
                      ) : (
                        <Volume2 size={19} />
                      )}
                    </button>
                    <input
                      type="range"
                      aria-label="音量"
                      disabled={unavailable}
                      min="0"
                      max="1"
                      step=".01"
                      value={muted ? 0 : volume}
                      onChange={(e) => {
                        setMuted(false);
                        setVolume(Number(e.target.value));
                      }}
                    />
                    <span>
                      {muted
                        ? '00'
                        : Math.round(volume * 100)
                            .toString()
                            .padStart(2, '0')}
                    </span>
                  </div>
                </div>
                {(!src || message) && (
                  <output className="mp-status">
                    {!src ? '当前版本未包含此曲音源，暂时无法播放。可以返回后选择其他卡片。' : message}
                  </output>
                )}
              </section>
            </div>
          </main>
        </div>
        {src && (
          // oxlint-disable-next-line jsx-a11y/media-has-caption -- Supplied bilingual lyrics are displayed as synchronized interactive text.
          <audio
            ref={attachAudio}
            src={src}
            preload="auto"
            onLoadedMetadata={(e) => { setFailedSource('');
              setDuration(
                Number.isFinite(e.currentTarget.duration)
                  ? e.currentTarget.duration
                  : 0,
              );
            }}
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onPlaying={() => {
              setPlaying(true);
              setMessage('');
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => {
              setPlaying(false);
              setFailedSource(src);
              setDuration(0);
              setMessage('音源暂时无法播放，请返回后重新碰卡尝试。');
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
