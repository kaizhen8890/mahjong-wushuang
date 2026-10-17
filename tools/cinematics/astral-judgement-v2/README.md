# 宿星审判 · 万星齐发

独立动画素材版本 **1.1.0**，是百合星裁 v1.0.0 的强化版。按最新反馈增加满屏弹幕，光束瞬间爆发转白屏，延长白屏停留。标题保持 **华文中宋、白色字面、紫色描边**。

## 成片规格

- 10 秒、30 fps、300 帧。
- 横屏 1600×1000；竖屏 1000×1600，分别设置摄影机、弹幕覆盖和标题布局。
- 横屏标题一排四字，竖屏两行两列。
- MP4：H.264 High 4.1、yuv420p、AAC 48 kHz 立体声、192 kbps、faststart。
- Blender 4.5.9 EEVEE 离线渲染；平板只需播放视频。

## 本次变化

- 弹幕总数从 2520 增加到 10080。原有世界空间弹幕加倍到 5040 枚；另外增加 5040 枚覆盖摄影机视野的弹幕。
- 新弹幕分八组横向、纵向、斜向、顺逆旋转交错运动，补满上下、两侧和四角。它们具有不同纵深、速度、大小及紫蓝粉白色彩；中心保留少量空间识别百合与星核。
- 约 6.8 秒光束爆发，2 帧转为全白；207–245 帧保持全白，共 39 帧（1.3 秒），随后淡回星海与标题。
- 声音同步增加穿梭细节，将原持续光束声改成短促爆发及白屏中的衰减回声。
- 总时长、百合开场和华文中宋片尾不变，v1 文件保留。

## 时间轴

| 秒 | 画面 |
| --- | --- |
| 0–1.85 | 白百合从紫色群星中落下 |
| 1.85–2.55 | 星环逐层苏醒 |
| 2.55–5.7 | 满屏交错弹群与花瓣状、螺旋、纵深星矛分轮叠加 |
| 5.7–6.6 | 中心弹幕汇聚、花瓣化光；外围弹幕仍覆盖整个画面 |
| 6.6–6.8 | 短暂收声蓄势 |
| 6.8–6.87 | 光束瞬发、两帧转白 |
| 6.87–8.17 | 全白停留 1.3 秒 |
| 8.17–8.33 | 白屏消退，标题约 8.22 秒开始显现 |
| 8.33–10 | 华文中宋「宿星审判」，白面紫边，轻微回弹后收尾 |

## 文件布局

- `public/cinematics/astral-judgement/v2/`：两条 MP4、海报、manifest.json 和哈希。
- 工作区 `outputs/astral-judgement-v2/成片/`：交付副本、横竖屏联系图、离线 `预览.html`。
- 工作区 `work/astral-judgement-v2/`：两个方向的 `.blend`、逐帧 PNG、标题字形与声音 WAV。
- `outputs/astral-judgement-v2/v1-preserved-sha256.json` 记录修改前 v1 源文件和视频哈希。

## 重建

```text
python tools/cinematics/astral-judgement-v2/prepare_title.py --out <work/astral-judgement-v2/title-glyphs>
blender -b --python tools/cinematics/astral-judgement-v2/build_scene.py -- --out <work/astral-judgement-v2/landscape> --samples 64
blender -b --python tools/cinematics/astral-judgement-v2/build_scene.py -- --out <work/astral-judgement-v2/portrait> --portrait --samples 64
python tools/cinematics/astral-judgement-v2/encode.py --source <work/astral-judgement-v2> --output <public/cinematics/astral-judgement/v2> --delivery <成片> --ffmpeg <ffmpeg.exe>
```

关键画面可附加 `--frames 115,157,205,207,270 --scale 60`。编码需要 Python numpy 和 Pillow。

本次制作使用 `--reuse-from <work/astral-judgement-v1/相同方向>`：原样复用未变化的 1–75 和 251–300 帧；新渲染 76–207 与 246–250 帧；208–245 帧复用完全不透明的白屏帧 207。两个 `.blend` 均保留完整 300 帧动画，可不带该参数从头重渲染。

标题读取本机 `C:/Windows/Fonts/STZHONGS.TTF`，内部名称 STZhongsong Regular。使用精确字形贴图保持宋体笔画内孔与紫色轮廓；不附带字体文件。可通过 `--font` 指向本机安装的同款字体。

## 验证与边界

验证结果记录在工作区 `outputs/astral-judgement-v2/检查点.md` 及同目录审计报告。检查内容包含完整解码、帧数和规格、交付副本哈希、原版文件未改变、白屏时长、构图及桌面浏览器播放。

本次仅制作动画，没有接入游戏、修改计分或隐藏信息边界，没有构建 APK 或执行 Android 真机测试。动画素材版本不等于 APK 版本。光束只用于表现技能，不代表自动扣分或击败目标。
