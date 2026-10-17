# 断序杂音 · 崩界铸刃

动画素材版本 **1.1.0**。用户要求加强动效曲线、剑的形成力量、长剑细节、混乱粒子与崩坏滤镜。本版保留前版，独立输出到 `public/cinematics/discord/v2/`。

## 表现

- 8 秒、30 fps。横屏 1600×1000，竖屏 1000×1600；两个方向使用各自的剑身角度、能量轨迹和摄影机。
- 剑整体长 17.1 场景单位，刃部 13.25，分成 10 个独立装配组件。护手为多层弧翼，剑刃有菱形截面、中央槽、发光镶线和蚀刻，握柄有缠绕金属饰条与长棱形剑首。
- 装配采用加速撞合与衰减回弹；斩击采用蓄力反向预备、短暂悬停、快速释放、镜头震动和局部运动模糊。
- 密集的流动能量、冲击环、晶体、弧电、分叉裂纹、多层斩光与向外飞溅的碎片。紫蓝为主，青白刃光和洋红干扰作层次。
- 崩坏滤镜由短促色散和横向切片错位组成，只在几次铸合及斩击爆发时加强。不是全程覆盖画面的滤镜。
- 最后形成保护晶冠并弹开三次来袭；6.8 秒起保留实时己方名牌衔接窗口。
- 原创程序合成立体声音轨：逐次铸击、递进蓄势、斩前收声、空间破碎和保护反射。

## 时间轴

| 时间 | 内容 |
| --- | --- |
| 0–1.1 s | 两张象征性攻击代价卡向中心聚拢 |
| 1.38–3.03 s | 握柄、护手、五段长刃、剑尖与核心依次撞合 |
| 3.03–4.19 s | 完整剑身展示、蓄力回拉与收声 |
| 4.23–5.45 s | 快速斩出、位移色散、空间断裂、晶体抛射 |
| 5.45–6.8 s | 碎界重组为保护晶冠，弹开三次攻击 |
| 6.8–8 s | 名牌衔接窗口和收尾 |

## 重建

工具与前版相同：Blender 4.5.9、Python numpy/Pillow、FFmpeg。

```text
blender -b --python tools/cinematics/discord-v2/build_scene.py -- --out <work/discord-v2/landscape> --samples 64
blender -b --python tools/cinematics/discord-v2/build_scene.py -- --out <work/discord-v2/portrait> --portrait --samples 64
python tools/cinematics/discord-v2/encode.py --source <work/discord-v2> --output <public/cinematics/discord/v2> --delivery <成片> --ffmpeg <ffmpeg.exe>
```

关键帧检查可附加 `--frames 71,106,128,137,193 --scale 60`。
`refine_motion.py` 用于给已经完成初次渲染的本版场景补上最终运动模糊，只重渲染 118–151 帧；新建场景已包含同一套参数，不需重复执行。
片源 PNG 已在 Blender 合成器降噪，编码时附加轻量时间降噪。成片是 H.264 High 4.1、yuv420p、AAC 48 kHz 立体声，前置播放索引。

## 文件与边界

- `public/cinematics/discord/v2/`：横竖屏 MP4、海报、清单及哈希。
- 工作区 `outputs/discord-v2/成片/`：独立副本、联系图、离线预览。
- 工作区 `work/discord-v2/`：可重建的两个 `.blend`、逐帧 PNG、声音母版。
- 旧版素材和源文件哈希记录于 `outputs/discord-v2/v1-preserved-sha256.json`。
- 视频只负责表现，不包含玩家身份、实际手牌、计分或随机判定。片尾名牌为示意，默认关闭，可在预览页开启。
- 本次没有接入游戏或更改应用版本，也没有打包 APK；这不是 Android 真机测试。
- 后续接入仍需使用 Host 已确认、已保存的发动事件，播放失败、跳过、切后台应统一停止视频与声音；不能借演出修改规则或泄露隐藏信息。

## 验证记录

已完成：两条成片各完整解码 240 帧，无错误；交付副本哈希一致；旧版哈希未变。桌面 Chrome 离线完整播放均 0 掉帧，暂停、静音和名牌衔接示意通过。
报告位于工作区 `outputs/discord-v2/media-audit.json` 和 `browser/audit.json`。场景分段装配与剑体构图检查见 `scene-audit.json`。均为桌面验证，没有 Android 真机测试。
