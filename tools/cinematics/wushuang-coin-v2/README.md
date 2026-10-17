# 决策币 v2 · 高速残影

基于现有神社掷币 v1 重制空中旋转。币面图案、模型、场景、镜头、落地结局、13 秒总时长、11.25 秒揭晓均保留。

## 修改

- 3.0–9.5 秒由 6.3 圈提高至 52.3 圈，平均约 8.3 倍。稳定高速段为 8.03–8.60 圈/秒；两端用 0.24 秒平滑接入、退出新增转速。
- 120 Hz 关键帧烘焙，30 fps 输出。EEVEE 0.70 帧快门的真实运动模糊，加 9 / 21 / 37 ms 三层滞后的币缘残影。
- 残影强度按转速与进出场包络衰减；9.48 秒前清零，落地后恢复清晰币面。
- 音轨的掠风脉冲使用与模型同一翻转相位，投掷、撞击、回弹、结果音仍在原时点。
- 正反面的前 286 张源帧相同，随后只进入 Host 已决定的对应结局；影片不随机、不结算。

## 制作源

`build_scene.py` 是保留原模型与场景的基础构建器；`upgrade_scene.py` 读取基础 `.blend`，用 `motion.py` 改写翻转并加入残影。`render_saved.py` 生成所需帧，`encode.py` 生成四段 MP4、封面和文件清单。`audit_motion.py` 核验速度、连续翻转、结果与残影退场。

依赖 Blender 4.5.x、Python（numpy、Pillow）及 FFmpeg。源程序没有安装依赖或下载素材的步骤。新输出目录用于保护已有工程。

在仓库根目录重建横屏正面示例：

```text
blender -b --python tools/cinematics/wushuang-coin-v2/build_scene.py -- --out WORK/base-landscape-heads --save-only
blender -b WORK/base-landscape-heads/wushuang-coin-heads.blend --python tools/cinematics/wushuang-coin-v2/upgrade_scene.py -- --out WORK/landscape-heads
blender -b WORK/landscape-heads/wushuang-coin-heads.blend --python tools/cinematics/wushuang-coin-v2/render_saved.py -- --out WORK/landscape-heads/frames --start 1 --end 390 --scale 100 --samples 32
```

竖屏基础构建加 `--portrait`，反面基础构建和升级均加 `--result tails`。在仓库外运行基础构建器时，用 `--font` 指定项目字体。已交付的 `.blend` 包含字体，可直接渲染，不需要重新建模。

四个帧目录名称是 `landscape-heads`、`landscape-tails`、`portrait-heads`、`portrait-tails`，每个目录下 `frames/frame-0001.png` 至 `frame-0390.png`。编码命令：

```text
python source/encode.py --source WORK --output media --ffmpeg FFMPEG
python source/audit_motion.py --out motion-audit.json
```

此次正式成片只重渲染 89–288 帧，其余逐帧复用 v1 原始 PNG，以严格保留开场与最终币面细节。正反面只需分别渲染 287–288 帧；1–286 帧复用同方向素材。整场重渲染也可，但开启快门后环境运动可能与 v1 静帧略有区别。

渲染脚本会跳过已存在帧。修改场景后使用新的输出目录，避免把不同版本的帧混在一起。生成器会覆盖指定 out 中的同名制作源，应先备份或改用新目录。

## 应用

资源置于 `public/cinematics/wushuang-coin/v2/`。麻将无双和听天问剑都通过各自原有影片路由调用它；沿用实际已保存的单币结果。旧 v1 留在源目录，打包准备脚本仅从生成的 Android 网页目录中剔除它，避免重复带入旧片。

本次没有改 Host 随机判定、计分、暗牌、手机同步或播放完成回调。Android 仍播放普通 H.264 影片，残影在离线渲染中完成。
