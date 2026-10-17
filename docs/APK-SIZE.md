> 维护入口与目录规范见 [文档索引](INDEX.md)。本机路径以固定工作区配置为准，不从历史日期目录复制新工程。

# Android 安装包体积管理

历史技术记录核对：2026-10-10 / beta26；当前入口见INDEX，不以此旧版本号判断现行源码。beta12 阶段仅剔除旧片并无损压 PNG；用户后来授权降低 3D 视频码率，beta24 起加入有损视频编码。旧“全部视频原字节入包”说明已不适用。

## 当前构建流程（beta39更新）

按[统一 Android 交付管线](android-delivery-pipeline.md)配置工程外环境，执行：

```powershell
pnpm android:apk --config 'D:/local/mahjong-public.json' --profile public
```

新入口执行核心/配置/故障测试、类型检查、网页构建、归档影片排除、PNG无损优化、电影压缩、离线清单、同步、干净Android构建及完整APK核验。旧可选PNG参数和逐批缓存复用脚本不再用于新交付。工具与报告在独立构建目录中，PNG报告/电影报告必须匹配实际字节。

新的体积预算由 config/build-profiles 管理，验证器另核对签名区/ZIP结构和资源集合。文件总长减压缩载荷不等于残留数据。以下 beta24/beta26 数字保留为历史测量，不当作未来素材数量或体积守卫。

## 电影副本：有损视频，保留母版

仅处理 `dist/client/cinematics` 中的现役电影；`public/cinematics` 原始视频及制作工程不改。当前29段均为30fps，保持帧率、横竖分辨率、帧数、时长和AAC音频流。H.264 High4.1/yuv420p、x264 slow、CRF25、最大5Mbps、缓冲10Mbps、faststart。总大小280,283,220 → 103,388,783字节，约减63.1%；细纹理/粒子可能有轻微损失，不叫无损。

首次编码完整解码，核对尺寸/帧数/帧率/时长及AAC数据哈希，整片SSIM低于0.92则停止。缓存按源哈希、编码配置和FFmpeg版本索引，再核对缓存哈希。包内电影 manifest 更新为编码后的哈希/大小并保留原始信息。审计分别比较母版哈希与打包副本哈希，不能要求二者相同。

刹那旅程的音源 MP4、立直音源 MP4 和其它歌曲不参与电影压缩。不得按所有 `.mp4` 批量处理。

`prepare-package-assets.mjs` 排除 discord/v1、astral-judgement/v1、wushuang-coin/v1、wushuang-coin/v2 的打包副本；源档保留，重新引用这些目录时脚本拒绝继续。现役横竖屏和正反分支均保留。

## PNG 与私人版

`lossless_png.py` 只在生成目录重压缩 IDAT，核对解压扫描行、像素、透明度、尺寸及其它块不变，属于无损优化。当前私人beta26包243份PNG共节省2,929,694字节。不要因此把同时发生的视频压缩也称为无损。

beta26 私人 APK 为243,612,100字节；该数字不代表公开版体积。98私人表情、歌曲、曲绘、歌词及特别卡面只在独立暂存加入，公开源保持8通用SVG。构建产物不提交源码，不发布私人APK。具体压缩审计与音乐衔接见 [beta24记录](cinematic-compression-and-music-beta24.md)。
