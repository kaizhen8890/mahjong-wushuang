# 麻将无双 · 正面「万牌归一」动画 v1.0.0

6 秒，30 fps。横屏 1600×1000，竖屏 1000×1600。继承现有神社掷币正面的最后一帧，随后 420 张象征性麻将牌背升空成阵，金色「无双」显现，牌阵收束成核心，冲击环扩散，核心飞向镜头。

## 交付与边界

- 可接入影片：`public/cinematics/wushuang-heads/v1/effect-landscape.mp4`、`effect-portrait.mp4`；内含原创立体声音效。
- 同目录有封面与 `manifest.json`，记录时间点、素材版本、尺寸和 SHA256。
- 19 秒的「掷币＋效果」审阅片只保存在工作区 `outputs/wushuang-heads-v1/成片`，不放入 public，不重复增大 APK。
- `preview.html` 支持两个方向、两个剪辑、声音和独立角色衔接示意。角色示意取项目已有 DeepSeek 素材，不烧录在影片中。
- 本次只制作表现素材。没有新增卡牌结算、牌池分析、掷币逻辑、随机数或联网消息；不代表已完成游戏内接入。
- 素材版本为 1.0.0；应用版本与已有掷币资产不变。未打包 APK，未进行当前版本 Android 真机测试。

## 后续接入

Host 先保存真实正反面结果，玩家端按结果选择对应影片。此影片仅用于正面。

1. 先播放 `wushuang-coin/v1/heads-{方向}.mp4`。
2. 预加载效果片，硬币播放到尾帧后衔接本片；不能播放则直接进入原有操作流程，不能改变结果或重复结算。
3. 本片 5.3 秒起可显示演员立绘与玩家名牌；立绘和名牌保持在视频上层。效果粒子按实时名牌坐标飞行，不把玩家身份、手牌、角色或点数写进影片。
4. 6 秒结束后隐藏影片并恢复实时桌面；声音与视频共用时钟，跳过、切后台、卸载时统一停止。
5. 目标设备屏幕比例不一致时使用 contain；不要裁切判定信息。是否在多人设备同时显示，由之后的接入方案决定。

## 重建

需要 Blender 4.5、Python（NumPy、Pillow）与 FFmpeg。先载入同方向的 `work/wushuang-coin-v1/{方向}-heads/wushuang-coin-heads.blend`，再运行 `build_scene.py`。

```text
blender -b <原正面场景.blend> --python tools/cinematics/wushuang-heads/build_scene.py -- --out <帧目录> --scale 100 --samples 40
```

竖屏加 `--portrait`；预览用 `--preview --scale 60 --samples 24`。源场景保存到输出目录，字体打包在 blend 中。编码通过 `encode.py --source <work/wushuang-heads-v1> --output <public/cinematics/wushuang-heads/v1> --delivery <成片目录> --ffmpeg <ffmpeg.exe>`。

`node tools/cinematics/wushuang-heads/serve.mjs` 在 localhost:5203 启动只读预览。

## 验证

- `audit_media.py` 完整解码四个交付片，核对帧数、尺寸、音轨与衔接像素差。
- `test-browser.mjs` 验证桌面 Chrome 四个影片完整播放、声音开关和人物前景层，并保存截图与报告。
- 实際执行记录保存在工作区 `outputs/wushuang-heads-v1`。这些检查不代替 Android 真机测试。
- 最终场景使用 1024 MB 阴影池。`repair_shadows.py` 可按旧日志只补渲染受影响帧；媒体审核会核对补渲染记录，确保阴影警告已处理。
