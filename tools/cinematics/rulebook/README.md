# 规则怪谈 · 禁典重订

安卓 `1.1.0-beta.2` 的环境卡演出。电脑用 Blender 离线渲染；平板播放 MP4，叠加跟随书页透视的真实声明役种。

## 表现与时序

| 时间 | 画面与声音 |
| --- | --- |
| 0–2.5 秒 | 近景掠过厚重皮革禁典，纸页受风翻动，旧字碎片升起；纸张摩擦与低沉环境声 |
| 1.7–3.15 秒 | 墨迹沿纸面侵入，悬空重印蓄势 |
| 3.167 秒 | 铜印砸落、朱墨与纸尘迸开、短暂红光；低频撞击与衰减金属共振 |
| 3.75–5.05 秒 | 墨线收拢，书页浮现本次声明的役种与“固定 5 番” |
| 5.05–6.3 秒 | 视频淡出，回到牌桌确认声明，演出结束 |

横屏 1600×1000、竖屏 1000×1600，30 fps，各 168 帧／5.6 秒。视频使用 H.264、yuv420p、AAC 双声道 48 kHz、faststart。声音内嵌并与画面共用时间轴，无需另开音频定时器。

## 制作来源与工程

`prepare_textures.py` 用程序噪声、绘图与项目已有 `Wushuang-Jianghu.ttf` 字体制作纸张和敕印纹理。字体权利沿用项目既有记录。`build_scene.py` 创建三维皮革封面、分层纸页、黄铜包角、翻页铰链、漆印、黑墨、纸片、墨滴、浮尘、石桌与书架，包含灯光、阴影、体积雾和景深。`encode.py` 合成原创纸声、低频、金属回响和气流。没有新增外部模型、人物或音频素材。

Blender 文件已打包纹理。大工程与帧序列只留在制作目录，不打入 APK。

## 重制步骤

从项目根目录运行，按本机环境提供 Blender 4.5 LTS、Python（NumPy、Pillow）与 FFmpeg。

```sh
python tools/cinematics/rulebook/prepare_textures.py --out ./work/rulebook-render/textures --font public/fonts/Wushuang-Jianghu.ttf
blender -b --python tools/cinematics/rulebook/build_scene.py -- --out ./work/rulebook-render/landscape --textures ./work/rulebook-render/textures
blender -b --python tools/cinematics/rulebook/build_scene.py -- --out ./work/rulebook-render/portrait --textures ./work/rulebook-render/textures --portrait
python tools/cinematics/rulebook/encode.py --ffmpeg PATH_TO_FFMPEG --source ./work/rulebook-render --public public/cinematics/rulebook/v1
```

添加 `--preview` 只渲染第 34、97、130 帧。修改镜头、页面尺寸、文字区域或播放时序后，必须重新导出 `text-anchors.json` 并运行编码脚本更新两份锚点及校验清单，不要仅替换 MP4。

## 动态文字与应用边界

- `lib/rulebook-cinematic.ts` 从已确认环境事件读取声明役种，并计算纸面的四角投影。素材不写死役种，不读取现实手牌。
- `app/components/rulebook-cinematic.tsx`、`.css` 负责视频、纸面书写与返回牌桌后的声明。
- `app/hooks/use-cinematic-playback.ts` 管理视频时钟、音量、背景音乐压低与恢复、跳过、自动播放回退、异常退出；没有计分或环境生效回调。
- `app/components/skill-experience.tsx` 复用既有去重队列，只路由 `kind=environment / environment=yaku` 的事件。
- 手机与减少动态效果模式不解码成片。暗夜、切换环境和进入后台取消演出。旧快照／恢复不重播。
- 旋转时保持同一视频和时钟，按 `object-fit:contain` 重算文字投影，避免裁去规则文字。连续 3.5 秒停滞或加载失败时显示声明并退出。

役种固定 5 番取代原番、其他役种可叠加；仍由原有 Host 规则和结算负责。视频结束或被跳过不修改任何对局状态。

## 预览与验证

```sh
node tools/cinematics/rulebook/serve.mjs
node scripts/run-tests.mjs tests/rulebook-cinematic.test.ts tests/skill-experience.test.ts tests/witch-cinematic.test.ts
node tools/cinematics/rulebook/test-browser.mjs
```

预览地址 `http://127.0.0.1:5189/tools/cinematics/rulebook/preview.html`，可选择实际役种。开发预览不会写入玩家存档。

浏览器检查需要 Playwright 与本机 Chrome，独立运行环境可用 `PLAYWRIGHT_MODULE` 指定模块路径。测试覆盖横竖屏实际解码、最长役名、动态投影、旋转、跳过、快照去重、环境替换、暗夜、手机反馈、减少动态效果、静音、自动播放失败及停滞。浏览器结果不代表安卓真机验证。

未来扩展其他环境，继续分开视频资源与权威状态；只由已保存事件驱动表现。
