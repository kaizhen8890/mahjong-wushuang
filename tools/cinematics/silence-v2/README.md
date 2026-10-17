# 寂静之地 v2 制作源

2026-10-04。6.4 秒，30 fps，横屏 1600×1000 / 竖屏 1000×1600。应用另加 800 ms 透明回桌。

在来稿“巨门封界、碎裂声波”的构思上重新制作程序化场景。模型、材质与音轨由这里的脚本生成，没有依赖外部贴图、音频采样、角色或私人雀魂素材。来稿原片仅在本地交付包 reference 目录用于对照，不放进项目公开素材目录。

## 内容与制作参数

- `build_scene.py`：建立独立场景，固定随机种子，横竖分别设定相机。门体运动、声波受压、碎裂与减速均烘成关键帧。
- `render_saved.py`：渲染已保存场景。正式成片为 EEVEE、64 samples、100% 尺寸、AgX。PNG 帧编号 0000–0191；Blender 时间轴编号 1–192。
- `make_audio.py`：生成 48 kHz、立体声、24-bit WAV。为抵消 AAC 压缩的短尾，PCM 提前 40 ms 收声；最终解码 MP4 在 4.7 秒后也逐样本为零。
- `encode.py`：H.264 High 4.1 / yuv420p / BT.709 / AAC / faststart；生成两向 MP4、封面与文件校验清单。
- `preview.html`：本地预览影片、规则题字及原片对照，不模拟正式牌桌。
- 两份 `.blend` 为可编辑场景。播放速度与模型显示不依赖视频文件；声音单独保存在 media/intro-sound.wav。

依赖：Blender 4.5.x、Python 3（numpy、Pillow）、带 libx264 的 FFmpeg。下面在交付包根目录执行，`blender` / `python` / `ffmpeg` 代表本机程序路径。

```text
blender -b --python source/build_scene.py -- --out scenes --orientation landscape --scale 100 --samples 64
blender -b --python source/build_scene.py -- --out scenes --orientation portrait --scale 100 --samples 64
blender -b scenes/silence-landscape.blend --python source/render_saved.py -- --out frames/landscape --scale 100 --samples 64
blender -b scenes/silence-portrait.blend --python source/render_saved.py -- --out frames/portrait --scale 100 --samples 64
python source/make_audio.py --out media
python source/encode.py --frames frames --out media --ffmpeg ffmpeg
```

渲染脚本为续跑方便会跳过已有同名 PNG。修改场景后必须指定一个新的 frames 目录，避免混用旧帧。构建脚本会清空新启动 Blender 进程里的场景并覆盖指定 out 内同名制作源；使用新的输出目录可保留旧版。

## 时间轴

0–2.05 秒：低机位门轨近景拉到门体，门体克服阻力闭合。
2.05–4.7 秒：三层不同大小的光学压力波传播、折叠，从同一网格分离为碎片；门体最后锁死。
4.7 秒：声音归零，碎片减速悬停，封印保持完整。
5.15–6.4 秒：碎片缓慢消散；5.5 秒起由应用叠加题字，影片不烧录 UI 文案。
6.4–7.2 秒：应用视频层淡出，透明封印按真实牌桌中央位置收拢。

## 应用接入边界

资源路径：`public/cinematics/silence/v2/`。对应 `lib/silence-cinematic.ts`、`app/components/silence-cinematic.tsx` 和 CSS，经现有 `ExperiencePresentation` 分发。

只消费 Host 已存储的环境 / 违规事件。跳过、失败、隐藏页面、播放完成不修改任何分数或规则。实体计分、虚拟 Host 权威及暗牌边界沿用已有逻辑。手机端与减少动态效果设置使用简短静态提示；全片在主机展示。违规反馈无声，目标读取 Host 事件的玩家 ID。

已知文案差异：旧卡库的说明与发动事件 label 仍写“向牌桌支付 3000”。实际引擎是场外扣分；新版标题与环境提示使用正确的“违规场外扣 3,000 点”。本次没有为动画改写卡库或基础引擎。
