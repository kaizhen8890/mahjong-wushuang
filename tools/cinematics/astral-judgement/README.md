# 宿星审判 · 百合星裁

独立动画素材版本 **1.0.0**。按用户确认分镜制作：紫色群星宇宙、一朵白百合落下、大量弹幕、巨型光束射向镜头、白屏、四字「宿星审判」。用户最新修正：标题必须为 **华文中宋，白色字面、紫色描边**。

## 成片规格

- 10 秒、30 fps、300 帧。
- 横屏 1600×1000；竖屏 1000×1600，分别设置摄影机和标题布局。
- 横屏标题一排四字，竖屏两行两列。
- MP4：H.264 High 4.1、yuv420p、AAC 48 kHz 立体声、192 kbps、faststart。
- 材质和光影用 Blender 4.5.9 EEVEE 离线计算，运行时只需播放视频。

## 时间轴

| 秒 | 画面 |
| --- | --- |
| 0–1.85 | 白百合在紫色星海中下降；镜头跟随，花朵缓缓转动 |
| 1.85–2.8 | 星环依次苏醒，细金属刻纹与紫色光带点亮 |
| 2.8–5.7 | 花瓣状白色弹幕、紫色螺旋星珠、粉紫纵深星矛分轮叠加 |
| 5.7–6.6 | 弹幕向花心汇聚，花瓣化光，星核收缩 |
| 6.6–6.8 | 短暂收声，蓄势 |
| 6.8–7.9 | 白色主束、紫蓝螺旋外焰、向镜头传播的冲击环 |
| 7.9–8.22 | 白屏过渡 |
| 8.22–10 | 华文中宋四字标题落下并轻微回弹，白面紫边，星海重新显现 |

## 制作内容

六片曲面花瓣有厚度、细纹、次表面散射及花蕊。背景为原创程序星云与 1700 颗立体星点。
2520 枚弹幕采用三套轨迹，烘焙为可独立重开的 Blender 形态关键帧；另有 24 条缠绕光迹、95 片飘散花瓣、七层金紫星环、压缩光环、巨型主束和 18 条螺旋外焰。
光束段加入轻量运动模糊、色散、镜头震动；完整片段附原创程序合成立体声音轨。

标题使用本机安装的 `C:/Windows/Fonts/STZHONGS.TTF`。系统注册名称及字体内部名称均核对为 STZhongsong Regular。采用四张精确描边的字形贴图，避免立体宋体轮廓偏移造成笔画内孔填充。只在成片中呈现字形，**不附带或分发字体文件**；源脚本允许通过 `--font` 指向本机合法安装的同款字体。

## 文件布局

- `public/cinematics/astral-judgement/v1/`：两条 MP4、海报、manifest.json 和哈希。
- 工作区 `outputs/astral-judgement-v1/成片/`：副本、横竖屏联系图、离线 `预览.html`。
- 工作区 `work/astral-judgement-v1/`：两个方向的 `.blend`、逐帧 PNG 和声音 WAV。
- 中间草稿和关键画面保留于 `outputs/astral-judgement-v1/`；前两次标题草稿不再代表最终样式。

## 重建

```text
python tools/cinematics/astral-judgement/prepare_title.py --out <work/astral-judgement-v1/title-glyphs>
blender -b --python tools/cinematics/astral-judgement/build_scene.py -- --out <work/astral-judgement-v1/landscape> --samples 64
blender -b --python tools/cinematics/astral-judgement/build_scene.py -- --out <work/astral-judgement-v1/portrait> --portrait --samples 64
python tools/cinematics/astral-judgement/encode.py --source <work/astral-judgement-v1> --output <public/cinematics/astral-judgement/v1> --delivery <成片> --ffmpeg <ffmpeg.exe>
```

关键画面附加 `--frames 35,157,218,270 --scale 60`。需要 Python numpy 和 Pillow。
`refine_title.py` 仅用于给本次已经渲染的早期场景替换精确字形并重渲染 248–300 帧。当前完整构建脚本已经包含修正，不需要再重复精修。
`audit_scene.py` 核对花朵及标题构图、四个字和字体；`audit_media.py` 完整解码、检查规格与交付副本哈希；`test-browser.mjs` 验证桌面浏览器离线播放、静音、暂停、拖动及布局。

## 游戏边界

本次是独立动画制作；没有接入游戏、修改计分或隐藏信息边界，没有构建 APK 或执行 Android 真机测试。动画素材版本不等于 APK 版本。
视频不包含真实玩家、实体手牌或随机判定。卡面效果是指定一名敌方玩家，本局内人工辅助公开最多两张牌并指定其一张手牌打出；动画中的光束不代表扣分或击败目标。
后续接入时应由 Host 确认和保存发动状态，使用实时目标名牌衔接。播放中止、跳过和退后台应统一停止视频音频，不改变已确认规则。

## 验证记录

已完成：两个方向各 300 帧完整解码、10 秒时长及声音规格检查，无解码错误；交付副本哈希一致；原卡面未改动。
桌面 Chrome 离线完整播放均 300 帧、0 掉帧、无页面错误；暂停、静音、跳转及布局检查通过。花朵和标题边界检查、STZhongsong 字体与白面紫边检查通过。
报告位于工作区 `outputs/astral-judgement-v1/scene-audit.json`、`media-audit.json`、`browser/audit.json`。具体完成结果见该目录 `检查点.md`。上述均为桌面验证，没有 Android 真机测试。
