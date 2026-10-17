# 偶氮玉红 · 赤染炼成

安卓 `1.1.0-beta.4` / versionCode `53`。Blender 在电脑上离线渲染，平板播放 MP4，并投影本次 Host 已确认的声明数字。手机使用简短声明反馈。

## 表现

| 时间 | 画面／声音 |
| --- | --- |
| 0–1.2 秒 | 镜头掠过赤色染池，两块象牙色牌胚浮起；两声错开的瓷片轻鸣 |
| 1.2–3.17 秒 | 染流螺旋上升，牌胚逐渐赤染并靠拢；液体颗粒声和低频积聚 |
| 3.17–3.65 秒 | 牌胚合成赤玉牌印，红色液冠、染滴和火星扩散；重击与金属衰减共振 |
| 3.65–5.35 秒 | 实际声明的 1–9 投影在牌印上，镜头缓慢推近；短促晶体余响 |
| 5.35–6.55 秒 | 淡回桌面，显示数字和规则摘要，结束演出 |

横屏 1600×1000、竖屏 1000×1600；30 fps，各 180 帧／6 秒；H.264 High 4.1、yuv420p、AAC 48 kHz 双声道、faststart。竖屏有独立的镜头距离及后半段推进。声音嵌入视频，和视频使用同一播放时钟。

模型、材质、动画和声音由本项目脚本生成，未引入外部模型或音频。使用 EEVEE 的实体灯光、阴影、体积雾、景深与合成辉光；不是流体物理模拟。染流、液冠和粒子为预先设计的三维运动轨迹。字体沿用项目已有字体。

## 与规则的边界

原卡面：发动时声明 1–9；和牌时手牌含副露，每两张该数字牌追加一张宝牌，不足两张不计。本轮不修改规则、计分、遥控命令、保存格式或虚拟牌局引擎。

`lib/azoru-cinematic.ts` 只接受已有的 `kind=environment / environment=number` 事件，从 Host 已保存的 `数字 N · …` 文案读取实际声明。无法读取时显示待确认，不随机、不猜测手牌。表现组件的完成、跳过、失败都没有规则或计分回调。

沿用 `ExperiencePresentation` 的队列、快照去重和替换逻辑；恢复存档不重播，暗夜、环境替换和后台切换取消演出。沿用 `useCinematicPlayback` 的音量、背景音乐压低、自动播放回退、3.5 秒无进展检测及媒体清理。手机和减少动态效果模式不加载 MP4；失败时显示声明并退出。

`lib/rulebook-cinematic.ts` 的四角投影函数复用于赤玉牌印，源矩形为 640×960。素材不烘焙具体数字；不要将预览数字 5 写死进素材。屏幕旋转时保留原视频与时钟，以 contain 适配并重新计算文字位置。

## 重制

从项目根目录运行，提供 Blender 4.5 LTS、Python（NumPy、Pillow）和 FFmpeg：

```sh
blender -b --python tools/cinematics/azoru/build_scene.py -- --out ./work/azoru/landscape
blender -b --python tools/cinematics/azoru/build_scene.py -- --out ./work/azoru/portrait --portrait
python tools/cinematics/azoru/encode.py --ffmpeg PATH_TO_FFMPEG --source ./work/azoru --public public/cinematics/azoru/v1
```

加 `--preview` 只出第 40、102、143 帧。每次构建会保存 `azorubine.blend` 和文字区域相机投影锚点 `text-anchors.json`。修改镜头、牌印姿态、尺寸或时间轴后，应重新渲染、导出锚点和编码；单独替换视频会使文字错位。大工程和帧序列不进入 APK。

## 预览与检查

```sh
node tools/cinematics/azoru/serve.mjs
node scripts/run-tests.mjs tests/azoru-cinematic.test.ts tests/skill-experience.test.ts tests/witch-cinematic.test.ts tests/rulebook-cinematic.test.ts tests/night-cinematic.test.ts
node tools/cinematics/azoru/test-browser.mjs
```

预览：`http://127.0.0.1:5193/tools/cinematics/azoru/preview.html`。可选 1–9，使用应用内的真实表现组件，不写玩家存档。浏览器检查需要本机 Chrome 和 Playwright，可用 `PLAYWRIGHT_MODULE` 指定模块路径。

测试覆盖真实 Host 命令的九种声明、无效声明不猜测、投影适配、媒体校验、横竖屏播放、跳过、恢复去重、环境替换、暗夜取消、后台取消、手机、减少动态效果、音量、拒绝自动播放和视频失败回退。桌面检查不代表安卓真机检查。
