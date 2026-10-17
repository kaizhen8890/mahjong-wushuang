# 暗夜之战 · 原版视频与显示

应用版本 `1.1.0-beta.5`，Android versionCode `54`。使用用户提供的**未修改原版**：1600×1000，2 秒，60 帧，30 fps，H.264／AAC。原片制作工程由另一位制作者保管；本目录提供接入与预览。

## 运行流程

Host 确认并保存环境与事件后，规则立即生效。平板播放视频期间保持正常亮度，结束或跳过后显示完全不透明的纯黑画面，无文字和可见按钮，同时调用既有原生接口降低本 Activity 亮度。

手机保留原 `RemoteController` 页面、按钮和弹窗，不播放视频。原有全局极暗滤镜 `brightness(.20) grayscale(.8)` 和 Activity 亮度设置 `.01` 继续生效；没有专用暗夜操作页，也没有额外摸牌、出牌、立直、和牌按钮。环境结束后恢复原亮度。

弹窗滤镜应用在完整的视口、背景或内容上，而非高度为零的 Portal 包装层，避免 CSS 滤镜改变定位参考后让和牌弹窗、符数选择框偏出屏幕。滤镜强度不变。

平板黑屏期间，底下的牌桌与其它弹窗处于 `inert` 状态，不能误触。平板房主可在黑屏上**按住不动 3 秒**结束暗夜，鼠标／键盘预览也支持 Escape。短按、取消触摸、超过 18 像素的移动或切后台会取消长按计时。黑屏卸载后恢复原有交互与焦点。

减少动态效果模式、旧快照、重连与存档恢复直接进入暗夜，不重播视频。浏览器没有真实 Android 亮度控制能力。

新发动的条件是：已挂载的计分台收到新的夜间环境 ID，并同时收到未见过的、10 秒内的 `kind=environment / environment=night` 事件。初次快照中的事件均视为已见过；首次挂载时已生效的环境不会重播。

计分台在本机记录读取完成后才挂载 `NightMode`，避免把刚恢复的近期事件当成新发动。视频中新的快照不重启播放。切换环境、结束本局或离开页面清理旧播放器；切到后台也结束当前演出，回到仍生效的暗夜。

## 资源与表现

- 成片：`public/cinematics/night/v1/intro-landscape.mp4`
- 海报及资源校验：同目录 `poster.jpg`、`manifest.json`
- 原版成片：891813 字节
- SHA256：`cfe4427d4d8222b064f116c890bd0fb9ec0aa93283f7bd295c2a87a186a32f93`
- 竖屏使用同一横屏素材，黑色背景下 `object-fit:contain`，保留完整日蚀构图。此版本没有独立竖屏三维成片。
- 动态发动者、标题与跳过按钮由代码叠加，约 1.5–1.8 秒淡出。完整播放原始视频和音轨，不变速、不提前遮盖画面、不追加黑帧。
- 原版结束后立即进入独立的纯黑遮罩，没有从黑色片尾回闪到亮牌桌的过渡。
- 视频音量沿用音效设置，拒绝有声自动播放时尝试静音播放。连续 3.5 秒停滞或加载失败使用短反馈后进入已经生效的暗夜。

## 文件入口

| 位置 | 作用 |
| --- | --- |
| `lib/night-cinematic.ts` | 原版片长配置、新事件／恢复判定 |
| `app/hooks/use-night-intro.ts` | 在提交显示前选择演出，避免先熄光再播放 |
| `app/components/night-cinematic.tsx`、`.css` | 原版视频与动态文字 |
| `app/components/night-blackout.tsx` | 平板纯黑、屏蔽底下交互、隐藏的房主长按退出 |
| `app/components/skill-experience.tsx`、`.css` | `NightMode` 先演出后黑屏；手机只有既有极暗滤镜 |
| `app/components/mahjong-console.tsx` | 本机恢复完成后挂载，提供环境 ID、事件与既有结束环境回调 |
| `app/components/remote-controller.tsx` | 提供环境 ID 与事件，保留原操作页面 |

不修改引擎、计分、Host 命令验证、存档格式或虚拟暗牌边界。播放结束／失败／跳过只改变屏幕阶段，不重复执行卡牌规则。房主长按结束暗夜复用既有 `resolveEffect` 回调。

## 预览与检查

```sh
node tools/cinematics/night/serve.mjs
node scripts/run-tests.mjs tests/night-cinematic.test.ts tests/skill-experience.test.ts tests/remote-win.test.ts
node tools/cinematics/night/test-browser.mjs
```

预览地址：`http://127.0.0.1:5191/tools/cinematics/night/preview.html`。`?restored=1` 模拟初始恢复，`?hydrate=1` 模拟读取本机记录后挂载。`?phone=1` 使用真实 `RemoteController`、Host 命令处理和个人快照；`?phone=1&restored=1` 模拟手机恢复。预览不读取真实对局存档。

浏览器检查使用 Playwright 与本机 Chrome，可设置 `PLAYWRIGHT_MODULE` 指向工具环境模块。检查内容包括原版真实解码、亮度延后、平板纯黑与防误触、长按和移动取消、原手机 DOM 与摸牌／出牌命令、极暗和牌弹窗、快照去重、存档恢复、环境取消、旋转、手机不请求视频、减少动态效果、音量、自动播放、资源失败、停滞和后台取消。

安卓原生亮度与实际设备播放仍需真机检查；先读取 `adb devices`，不清除应用数据。
