# 宝箱猎人 · 古墓解封

Android `1.1.0-beta.6` / versionCode `55`。电脑离线制作 Blender 三维演出；平板只播放成片，并叠加发动者和规则提示。手机采用短提示。

## 分镜与声音

| 时间 | 画面与声音 |
| --- | --- |
| 0–0.8 秒 | 墓室近景，老木、暗金包边、黑玉锁心与两道链条；低频墓室气流 |
| 0.8–2.2 秒 | 镜头退开，三层锁盘错开旋转，金色箱缝逐渐亮起；棘轮与三声锁扣 |
| 2.2–3.27 秒 | 箱盖被内部光压顶开，链条开始崩断；木轴摩擦、金属断裂与蓄力 |
| 3.27–3.7 秒 | 厚重箱盖掀开，断链与锁环甩出，地面金色冲击环扩散；低频重击 |
| 3.7–5.8 秒 | 镜头绕至正面，金币、金尘与细光丝上升，金色体积光穿过墓室；金币碰响和衰减和声 |
| 5.8–6.8 秒 | 淡回牌桌，提示现实翻开所有宝牌指示器、本局四杠不流局 |

横屏 1600×1000、竖屏 1000×1600，独立镜头构图；各 192 帧／6.4 秒／30 fps。视频为 H.264 High 4.1、yuv420p，AAC 48 kHz 双声道，faststart。声音嵌入成片，与画面共用播放时钟。

模型、材质、运动轨迹和合成音轨由本项目脚本生成，未使用外部模型或音效。EEVEE 离线生成实体光照、反射、阴影、体积雾、景深及合成辉光。金币、断链、光丝是设计的轨迹，不是设备端物理模拟。木材去掉了强清漆层，避免箱盖出现硬边圆形反光。

## 规则边界

卡面为“立即翻开场内所有宝牌指示器；本局四杠流局无效”。系统无法知道现实指示器牌面，沿用人工执行和原确认操作。金币仅是演出意象，没有奖励点数、发技能卡或抽奖含义；不制作具体宝牌牌面。

- 原 Host `kind=environment / environment=treasure` 事件触发完整开箱，规则在演出前已保存生效。动画结束、跳过或播放失败都不会标记现实翻牌完成。
- 原 Host 接受 `environment.action / treasure` 后发出的 `kind=treasure` 事件，只播放一次约 1.6 秒的金色印记与短铃反馈。不会重复完整视频。
- 手机仍只能由环境发动者确认；平板沿用原房主操作。权限、去重、计分、保存格式、虚拟牌局和隐藏信息边界均未改动。
- 恢复／重连／重复快照不重播；环境替换、暗夜和切后台取消演出。影片播放中收到有效翻牌确认时，原队列会先完成／跳过影片，再给确认反馈。
- 手机和减少动态效果模式不加载视频。手机确认不播放额外铃声。平板确认铃声跟随全局音效音量，并在结束、跳过或卸载时停止。
- 沿用 `useCinematicPlayback` 的音量、背景音乐压低、有声自动播放被拒后的静音回退、3.5 秒停滞检测和媒体清理。失败回退仍提示人工翻牌。

## 文件入口

| 文件 | 用途 |
| --- | --- |
| `build_scene.py` | 场景、模型、材质、运动和横竖镜头 |
| `encode.py` | 原创合成音轨、视频、海报、确认铃声和哈希清单 |
| `lib/treasure-cinematic.ts` | 事件路由、确认状态、影片配置 |
| `app/components/treasure-cinematic.tsx`、`.css` | 播放、动态文字、确认反馈 |
| `app/components/skill-experience.tsx` | 原演出队列中路由两种宝箱事件 |
| `public/cinematics/treasure/v1/` | 两版 MP4、两张海报、确认 MP3、manifest |
| `preview.tsx` | 真实 Host 命令驱动的隔离预览，不读写玩家存档 |
| `tests/treasure-cinematic.test.ts` | 真实发动／确认、权限、快照、分数／牌山不变、资源校验 |
| `test-browser.mjs` | 实际 Chrome 播放、交互与生命周期检查 |

## 重制与预览

需要 Blender 4.5 LTS、Python（NumPy、Pillow）和 FFmpeg。从项目根运行：

```sh
blender -b --python tools/cinematics/treasure/build_scene.py -- --out ./work/treasure/landscape
blender -b --python tools/cinematics/treasure/build_scene.py -- --out ./work/treasure/portrait --portrait
python tools/cinematics/treasure/encode.py --ffmpeg PATH_TO_FFMPEG --source ./work/treasure --public public/cinematics/treasure/v1
node tools/cinematics/treasure/serve.mjs
node scripts/run-tests.mjs tests/treasure-cinematic.test.ts tests/skill-experience.test.ts
node tools/cinematics/treasure/test-browser.mjs
```

`--preview` 仅出第 18、79、103、148 帧；`--start`／`--end` 可补渲染。场景保存为 `treasure-hunter.blend`。修改镜头或材质后需重制完整帧序列和素材，避免混用旧帧。制作工程和 PNG 序列不进入 APK。

预览地址 `http://127.0.0.1:5195/tools/cinematics/treasure/preview.html`。`?restored=1` 模拟恢复；`?phone=1` 查看手机反馈。使用真实 `createGameState`、`applyRemoteControllerCommand` 和 `activeEnvironment`，演出复用应用组件。浏览器检查需本机 Chrome 与 Playwright，可通过 `PLAYWRIGHT_MODULE` 指定模块路径。

桌面检查不能替代 Android 真机的播放、音画同步与性能检查。需要设备时先读取 `adb devices`，不清除应用数据。
