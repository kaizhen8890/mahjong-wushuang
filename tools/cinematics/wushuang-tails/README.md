# 麻将无双 · 反面「神罚裁决」动画 v1.0.0

正面动画制作完毕后，按用户指令继续制作反面。6 秒 / 180 帧 / 30 fps，横屏 1600×1000，竖屏 1000×1600，均带原创双声道音效。

## 表现

从反面硬币的最后一帧继续：黑漆银饰巨型鸟居升起，封印门扇分开，立体神剑悬停在光环前，银蓝雷光汇聚，短暂停顿后神剑下坠，雷光沿地面蔓延，冲击环与石尘向外扩散。

预览里的目标角色、名牌和补充落雷由单独前景层显示；角色沿用项目既有 Claude 素材，只作展示。正式接入时按真实目标角色及名牌屏幕位置绘制，不烧录身份到影片。

## 素材与来源

- `public/cinematics/wushuang-tails/v1/effect-landscape.mp4`
- `public/cinematics/wushuang-tails/v1/effect-portrait.mp4`
- 同目录封面和 `manifest.json` 包含版本、时间点、尺寸及 SHA256。
- 原有 13 秒反面掷币与本片串接成的两份 19 秒审阅片，仅在 `outputs/wushuang-tails-v1/成片`，避免重复增大 APK。
- 神门、门扇、神剑、雷弧、光环、尘浪和粒子为原创程序化建模动画；沿用项目原神社和字体。声音为原创合成，没有外部音效采样。

## 接入边界

本次只制作动画。游戏机制、Host 判定、扣分和牌局保存未修改，不代表已经接入真实技能发动流程。素材版本独立为 1.0.0，应用版本不变，也没有重新打包 APK。

之后由 Host 已保存的反面结果选择本片。13 秒反面掷币结束后继续播放；本片 5.3 秒可启用目标前景，6 秒还原实时桌面。视频错误、跳过、切后台等行为都不能重复发动技能或重新掷币。视频和音轨共用播放时钟；卸载时应清理声音、前景粒子与播放状态。

## 重建与检查

Blender 4.5 载入同方向的 `work/wushuang-coin-v1/{方向}-tails/wushuang-coin-tails.blend` 后，运行：

```text
blender -b <反面场景.blend> --python tools/cinematics/wushuang-tails/build_scene.py -- --out <帧目录> --scale 100 --samples 40
```

竖屏加 `--portrait`；快速关键帧检查加 `--preview --scale 60 --samples 24`。场景内打包字体。

编码：`encode.py --source <work/wushuang-tails-v1> --output <public/cinematics/wushuang-tails/v1> --delivery <成片目录> --ffmpeg <ffmpeg.exe>`。

本地预览：`node tools/cinematics/wushuang-tails/serve.mjs`，localhost:5204。`test-browser.mjs` 检查桌面 Chrome 完整播放和前景层；复用正面目录 `audit_media.py` 并传 `--outcome tails` 检查全部 MP4 解码与衔接。实际检查报告在 `outputs/wushuang-tails-v1`。

当前 Android 真机、WebView、LAN 同步未测。桌面视频检查不能代替这些测试。
