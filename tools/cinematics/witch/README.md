# 魔女审判 · 深渊法庭

第一条环境卡 3D 预渲染演出，应用版本 `1.1.0-beta.1`。安卓仅播放成片并叠加轻量界面效果。

## 制作来源

`build_scene.py` 在 Blender 4.5 LTS 中程序化创建黑曜石巨刃、分段石环、交错铁链、台阶地台、石柱、裂纹、碎石与火星。场景使用真实 3D 灯光、阴影、体积雾、景深和镜头运动。没有使用外部模型或纹理。

`encode.py` 合成自制低频、金属共振、风声、冲击与回响，并在落刃瞬间混入用户提供的现有 `skill-card-shatter.mp3`。该音效来源与授权沿用项目已有记录。新增画面没有复用卡面中的第三方人物。

## 重新渲染

在项目根目录执行；Blender、Python、FFmpeg 安装路径由当前开发环境提供，不写入项目配置。

```sh
blender -b --python tools/cinematics/witch/build_scene.py -- --out ./work/witch-render/landscape
blender -b --python tools/cinematics/witch/build_scene.py -- --out ./work/witch-render/portrait --portrait
python tools/cinematics/witch/encode.py --ffmpeg PATH_TO_FFMPEG --source ./work/witch-render --public public/cinematics/witch/v1 --shatter public/audio/skill-card-shatter.mp3
```

Python 需要 NumPy 与 Pillow。`--preview` 只输出三个关键帧；完整渲染各输出 156 帧。工程与帧序列存放在 `--out`，最终视频、海报和校验清单存放在 `public/cinematics/witch/v1`。

横屏 1600×1000、竖屏 1000×1600，均为 30 fps。开场 5.2 秒，落刃接触在 3.1 秒；裁决片段 2.1 秒，从开场第 75 帧截取，其落刃在约 0.633 秒。声音嵌入 MP4，与视频使用同一时间轴。

## 应用接入

- `lib/witch-cinematic.ts`：按事件种类选择横竖屏资源，定义返回牌桌时刻，使用旋转后实际名牌边界。
- `app/components/witch-cinematic.tsx`：视频播放、名牌冲击、退出提示、最后幸存者奖励提示、跳过与失败回退。
- `app/components/skill-experience.tsx`：原有事件去重队列。只把魔女审判开场与裁决事件转交给新播放器。
- `app/hooks/use-game-audio.ts`：视频音量服从当前音效设置，播放期间压低立直背景音乐，结束或取消后恢复。

手机保留 1.8 秒的简短反馈，不下载或解码完整演出视频。减少动态效果模式使用静态反馈。视频异常或连续 3.5 秒没有进展时回退；声音自动播放被拒绝时尝试静音播放。

旋转设备时保留正在播放的原片，不重新触发声音，按新视口调整目标名牌位置。切到后台、切换环境或开启暗夜时取消演出。重新进入房间或重复收到旧快照不重播。

最后幸存者的 +4000 提示来自已确认裁决事件的奖励说明，只展示结果；不在视频结束时修改对局状态。

## 预览与检查

```sh
node tools/cinematics/witch/serve.mjs
```

浏览器打开 `http://127.0.0.1:5187/tools/cinematics/witch/preview.html`。这是开发预览，不是产品内的新页面。

```sh
node scripts/run-tests.mjs tests/witch-cinematic.test.ts tests/skill-experience.test.ts
node tools/cinematics/witch/test-browser.mjs
```

浏览器检查需要 Playwright 和本机 Chrome；若 Playwright 来自独立运行环境，可用 `PLAYWRIGHT_MODULE` 指定模块位置。检查实际视频解码、横竖屏四方目标、重复快照、跳过、旋转、环境替换、暗夜取消、手机反馈、减少动态效果、静音、自动播放回退和资源失败。

桌面浏览器检查不代表安卓真机验证。读取 `adb devices` 后，仅对实际连接的目标进行设备检查，不清除应用数据。

## 扩展

保留每个环境自己的场景、音轨和资源子目录。新卡遵循“已保存权威事件 → 成片 → 当前名牌/文字衔接”的流程。横竖屏必须分别构图，动态人名、役种、数字和点数不烘焙到通用成片。大体积 `.blend` 和帧序列保留在制作输出目录，不装入 APK。
