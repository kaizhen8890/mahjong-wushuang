# 麻将无双 · 神社命运掷币 · 影片 v1.0.0

离线 Blender 3D 动画。13 秒，30 fps；空中连续翻转从 3.0 秒到 9.5 秒，共 6.5 秒。
横屏 1600×1000、竖屏 1000×1600，各有正面与反面结局。H.264 High 4.1 / yuv420p / AAC 48 kHz 双声道，faststart。

本次制作对象是动画素材与独立预览。应用仍为 1.1.0-beta.8；没有发布新 APK、增加未确定效果的卡牌、改变保存数据或上线新的稀有度规则。

## 分镜

| 时间 | 内容 |
| --- | --- |
| 0–2 秒 | 夜间神社、朱红鸟居、石灯笼依次亮起；向中央祭台推进 |
| 2–3 秒 | 厚重金属硬币升起，近看铭文、浮雕与滚花边缘 |
| 3–9.5 秒 | 连续 6.5 秒空中翻转；升空光丝、绕拍、神社远景、最高点与下降 |
| 9.5–10.14 秒 | 撞击、金属回弹、冲击波、体积尘雾、石屑与火星 |
| 10.14–11 秒 | 摇摆逐渐停止，镜头转为俯视 |
| 11–13 秒 | 正面「麻将无双」金纹 / 反面「四风」银纹；最后完整展示硬币 |

正反面前 286 帧使用相同开场。两个结局在同一时点首次撞击、停稳及揭晓，避免时长提前泄露结果。各自的完整 MP4 不需要在设备上拼接视频。

## 素材

`public/cinematics/wushuang-coin/v1/`：

- `heads-landscape.mp4`、`heads-portrait.mp4`：正面。
- `tails-landscape.mp4`、`tails-portrait.mp4`：反面。
- 同名 JPG：结束帧海报。
- `manifest.json`：尺寸、帧率、时点、对应关系、文件哈希、音轨峰值与来源。

所有几何、材质、镜头、运动、颗粒与合成音效来自本目录脚本。字体复用项目的 `public/fonts/Wushuang-Jianghu.ttf`。没有下载外部模型或商业音效。制作随机种子仅用于布景和粒子分布，与游戏掷币结果无关。

## 后续接入规则

1. 先由现有 Host 权威机制接受发动请求、生成结果、保存结果与规则效果；随后把该结果交给展示层。
2. 沿用现有单币映射：`faces[0] === 1` → `heads`；`faces[0] === 0` → `tails`。必须检查是 `coin` 且只有一个有效币面。多枚硬币不能简单套用这段演出。
3. 影片与预览都不生成随机结果。客户端不得选择结果、上传种子或用视频结束回调执行计分。
4. 在开始播放时锁定横竖版本，途中旋转不能重播或重新掷币。
5. 11.25 秒可显示「正面／反面」，实际效果使用已保存结果的 `label` / `description` 动态排版；不要烧录分值、玩家名或卡牌规则。
6. 实际效果尚未由用户提供。不要自行假定一面获胜、一面失败，或添加扣分、奖励、和牌规则。
7. 跳过、播放失败、退后台与断线恢复都只能改变展示。需要独立保留结果记录，不能因缺少视频导致结果丢失或重复生效。
8. 如果房间需要共同悬念，应额外约定 Host 的揭晓时间与手机显示时机。当前素材制作没有新增此同步协议。
9. 未来增加「无双」稀有度时再配置专属入口；它应在史诗之上，具体卡牌类型和规则另行确定。

## 重制

需要 Blender 4.5 LTS、Python（NumPy、Pillow）和 FFmpeg。从项目根执行，路径自行指定：

```sh
blender -b --python tools/cinematics/wushuang-coin/build_scene.py -- --out WORK/landscape-heads
blender -b WORK/landscape-heads/wushuang-coin-heads.blend --python tools/cinematics/wushuang-coin/render_variant.py -- --out WORK/portrait-heads --portrait
blender -b WORK/landscape-heads/wushuang-coin-heads.blend --python tools/cinematics/wushuang-coin/render_variant.py -- --out WORK/landscape-tails --result tails --start 287
blender -b WORK/landscape-heads/wushuang-coin-heads.blend --python tools/cinematics/wushuang-coin/render_variant.py -- --out WORK/portrait-tails --portrait --result tails --start 287
python tools/cinematics/wushuang-coin/encode.py --source WORK --output public/cinematics/wushuang-coin/v1 --ffmpeg FFMPEG
node tools/cinematics/wushuang-coin/serve.mjs
```

浏览器预览：`http://127.0.0.1:5199`。可选横竖屏与固定正反面样片、播放暂停、静音、重播与全屏。预览不访问应用存档，也不模拟计分。

`build_scene.py --preview --scale 60 --samples 24` 生成关键帧；`--frames 1,144,292,365` 指定帧；`--start` / `--end` 可补渲染。`render_variant.py` 复用基础场景重新烘焙镜头和结局；不要拿竖屏工程当基础横屏工程。

`encode.py` 校验每段 390 帧，并为反面影片硬链接同方向前 286 帧。音效按同一时间轴合成，声音内嵌影片；正反面都有独立的收尾音色。完整 PNG 序列、WAV 与 `.blend` 留在 APK 之外。

## 验证范围

2026-10-03 已完成：

- 四段成片逐一完整解码，均为 390 帧、13.0 秒，尺寸、H.264 格式和双声道 AAC 音轨正确。
- Chrome 四段自然播放到结束，本机本次记录均为 390 帧、0 丢帧、无媒体错误；两种预览尺寸均无横向或纵向页面溢出。
- 揭晓前不出现结果字幕，揭晓后的正反面标签正确；重播、暂停、静音和切换版本通过。
- 轨迹验证为 6.5 秒连续正向翻转，共 6.3 圈；末尾稳定在各自指定币面。
- 两个结局每种方向前 286 张源帧哈希相同，最终画面不同；八个交付素材的哈希与 manifest 一致。
- 原规则、计分、遥控命令、随机判定、个人快照、技能卡库、表情库及应用版本的八个基线文件哈希未改变。

检查脚本：`audit_motion.py`、`audit_media.py`、`test-browser.mjs`。记录位于工作区 `outputs/wushuang-coin-v1/` 的 `motion-audit.json`、`media-audit.json`、`browser-audit.json`、`protected-source-audit.json`。

桌面浏览器检查不能代替 Android 真机验收；本次没有打包、安装或清除应用数据。实际卡牌效果与应用内演出触发尚未接入。
