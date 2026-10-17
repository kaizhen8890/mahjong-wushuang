# 听天问剑 · 断天三斩

独立动画素材版本 **1.0.0**。用于无双卡「听天问剑」（卡 ID 44）掷币结果确定后的发动表现。正反面分别导出，均有横屏和竖屏；每条 11 秒。

## 视觉与声音

遵循卡面赤红、冰蓝、黑白钢铁、黄字红边的设计。主角为宽厚矩形菜刀：磨痕钢面、刀刃磨削斜面、实际贯通挂孔、全龙骨握柄、深色木柄、六枚铆钉。

场景包括程序暴风云层、裂开的玄武岩原、56 条红蓝风暴主脉及分叉、18 条扭转刀气面、145 块悬浮岩屑。三次斩击分别配合多层刀光、世界切痕及 720 枚弹道火星，共 2160 枚；镜头冲击与短闪仅在斩击时出现。

声音为原创程序合成立体声，包括磨刃、金属共鸣、穿梭、三次递增的破风与撞击、裂地低频、结果音和标题落点。未使用外部影视或游戏音轨。

## 时间轴

| 秒 | 表现 |
| --- | --- |
| 0–1.2 | 刃口近景、摩擦声、镜头开始后撤 |
| 1.2–3 | 完整菜刀显现，红蓝旋流汇入，岩屑升起 |
| 3–4.44 | 菜刀缓慢抬起，压势蓄力 |
| 4.63 | 第一斩，纵向刀痕与金属冲击 |
| 5.35 | 第二斩，反向刀光和更强冲击 |
| 6.14 | 第三斩，菜刀掠近镜头，地面裂开，红蓝裂隙贯穿天地 |
| 8–9.5 | 按已确定的硬币结果展示五张卡背或一张「飞」牌 |
| 9.53–11 | 黄字红边「听天问剑」落下，余震和声音收束 |

### 两个结尾

- 正面：五张通用技能卡背依次震出并汇聚，表达本局每次摸牌额外抽取 5 张技能卡。
- 反面：一张厚麻将牌出现，四组抽象牌类符号交替汇入，最后呈现「飞」字，表达玩家明示一张现实手牌作为飞牌。

视频不选择实际卡牌、手牌或硬币结果，不模拟扣分、淘汰及代价卡效果。

## 输出

- `public/cinematics/heavens-sword/v1/effect-{heads|tails}-{landscape|portrait}.mp4`
- 同名 JPG 海报、manifest.json（版本、规格、分镜、音频峰值和 SHA-256）。
- 工作区 `outputs/heavens-sword-v1/成片/`：全部交付副本、四张联系图、预览.html、说明.md。
- 工作区 `work/heavens-sword-v1/`：四个完整 Blender 场景、逐帧 PNG、标题字形及两条 WAV。
- 原始卡面为 `public/skill-cards/gen2-heavens-sword.png`，哈希记录在 `outputs/heavens-sword-v1/reference-sha256.json`。

规格：11 秒、30 fps、330 帧；横屏 1600×1000，竖屏 1000×1600；H.264 High 4.1、yuv420p、AAC 48 kHz 双声道 192 kbps、faststart。Blender 4.5.9 EEVEE 离线渲染，每像素 48 采样。

标题沿用项目 Wushuang-Jianghu 字体，做黄色字面、红色描边。只生成五张字形 PNG，没有另行复制字体文件。

## 重建

```text
python tools/cinematics/heavens-sword/prepare_assets.py --out <work/heavens-sword-v1/glyphs>
blender -b --python tools/cinematics/heavens-sword/build_scene.py -- --out <work/heavens-sword-v1/heads-landscape> --ending heads --samples 48
blender -b --python tools/cinematics/heavens-sword/build_scene.py -- --out <work/heavens-sword-v1/heads-portrait> --ending heads --portrait --samples 48
blender -b --python tools/cinematics/heavens-sword/build_scene.py -- --out <work/heavens-sword-v1/tails-landscape> --ending tails --samples 48 --reuse-common <work/heavens-sword-v1/heads-landscape>
blender -b --python tools/cinematics/heavens-sword/build_scene.py -- --out <work/heavens-sword-v1/tails-portrait> --ending tails --portrait --samples 48 --reuse-common <work/heavens-sword-v1/heads-portrait>
python tools/cinematics/heavens-sword/encode.py --source <work/heavens-sword-v1> --output <public/cinematics/heavens-sword/v1> --delivery <成片> --ffmpeg <ffmpeg.exe>
```

可选 `--frames 28,85,142,199,266,306 --scale 55` 生成关键画面。本次反面分支先独立渲染 241–285 帧，再复用同方向正面的 1–240 和 286–330 帧；与 `--reuse-common` 的结果相同。四个场景均有完整 330 帧动画，去掉复用参数可以完整重渲染。

## 验证与后续接入

检查记录见 `outputs/heavens-sword-v1/检查点.md`。脚本覆盖四条成片完整解码、帧数与规格、文件哈希、共用片段一致性、两个结尾确有区别、原卡面保持不变、标题与结果物体构图，以及桌面浏览器完整播放/暂停/静音/跳转。

本任务只制作动画素材。未修改 app 规则、Host 权威、实体存档及隐藏信息；未构建 APK、上传 GitHub 或执行 Android 真机测试。素材版本不等于 APK 版本。

后续接入：先由 Host 确认两张「单」代价与硬币结果，再选播对应影片。代价卡效果不发动。实体手牌不能由视频或客户端推断。跳过/退后台应停止视频和音频，不能重新掷币或重复发放卡牌。结果文字和现实操作提醒宜用界面叠加，便于更改与本地化。
