# 断序杂音 · 紫蓝碎界

动画素材版本 1.0.0。8 秒、30 fps，横屏 1600×1000 和竖屏 1000×1600 分别构图。
美术依据用户提供的「断序杂音」卡面：紫蓝错位晶体、青白斩光、交叉光带和保护晶壁。

## 内容与边界
- 两张象征性攻击代价卡消散，晶体空间展开，巨剑蓄力，斩断攻击轨迹，晶片重组为己方保护。
- 无神社。原始 Blender 几何、材质、镜头和程序合成立体声音轨。
- 视频没有玩家身份、现实手牌、角色图或随机判定，不执行任何游戏规则。
- 此次为动画素材制作；游戏内四张神卡的代价确认与新规则开发仍是独立未完成工作。
- 动画 v1.0.0 不改变应用版本。没有打包或安装 APK，没有执行本版 Android 真机测试。

## 交付
public/cinematics/discord/v1/ 包含横竖屏 effect-*.mp4、海报和 manifest.json。
工作区 outputs/discord-v1/成片 包含副本、联系图和可直接打开的预览.html。
预览 6.8 秒起的两个名牌是衔接示意，并非当前游戏玩家或已接入游戏。

## 后续接入
主机确认神卡发动后播放。6.8 秒起用实时己方名牌坐标承接紫蓝光带，8 秒还原牌桌。
画面与声音共用视频时间；跳过、切后台、卸载和失败应统一停止声音；演出不影响主机已保存状态。
因实体麻将卡面作用是禁止敌方用己方弃牌荣和及吃碰杠，不应渲染成伤害、扣分或全场禁止鸣牌。

## 重建
Blender 4.5.9，Python numpy/Pillow，FFmpeg。
blender -b --python tools/cinematics/discord/build_scene.py -- --out <work/discord-v1/landscape> --samples 64
竖屏附加 --portrait。关键帧用 --frames 90,131,195 --scale 60。
denoise.py --source <work/discord-v1/landscape>（竖屏同理）
encode.py --source <work/discord-v1> --output <public/cinematics/discord/v1> --delivery <成片> --ffmpeg <ffmpeg.exe>
场景文件、原始及降噪逐帧 PNG 和 48 kHz 立体声 WAV 保存在 work/discord-v1。

## 本版验证
最终 MP4 已完整解码核对，各 8 秒、240 帧，无解码错误。
桌面 Chrome 离线完整播放：两个方向均 0 掉帧，暂停和静音控制、结尾名牌示意正常。
审核报告保存在 outputs/discord-v1/media-audit.json 与 browser/audit.json。
这些是桌面媒体验证，不是游戏内接入或安卓真机测试。
