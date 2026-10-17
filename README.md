# 麻将无双

同一套 Android 应用中的实体日本麻将计分台与虚拟日麻。实体模式由平板保存并裁定唯一的对局状态，手机通过同一 Wi-Fi 加入房间遥控自己的操作；虚拟模式由房间 Host 管理牌山、暗牌、摸打与结算，并向各设备发送各自可见的局面。

当前版本为 **1.1.0-beta.45 / Android code94**（2026-10-17）。手机加入页移除步骤条、压缩空状态，并将加入按钮固定在底部；保留 NFC 代码库和阵营自摸队友免付修复。改动与验证范围见 [beta45 发布说明](docs/release-beta45.md)，安装包见 [GitHub Releases](https://github.com/kaizhen8890/mahjong-wushuang/releases)。构建产物不提交源码。仓库不包含运行产生的数据或先前使用的第三方表情图片。表情发送和应用内导入功能保留；公开版不附带任何内置表情图片，初始表情清单为空。添加自己的图片请看 [表情添加教程](data/EMOTES.md)。

## 使用方式

安装同一版本的 APK 到平板和手机。启动后选择实体麻将或虚拟麻将；实体麻将可选择牌桌主机或手机遥控。LAN 房间需要设备处于同一 Wi-Fi，访客网络的设备隔离可能阻止连接。牌桌及角色等本机资料保存在各设备本地；更换或卸载应用前，请先使用应用内导出功能备份。

实体计分台记录点数、立直、和牌、技能效果、流局与历史。手机只接收其遥控所需的快照，点数和结算仍由平板计算。虚拟麻将支持单机和 LAN 对局，平面桌面与 3D 桌面共用同一局面。技能卡资料位于 `data/skill-cards.json`，用户自行导入的角色和配置仍由应用本机保存。

后续 AI 请先阅读 [目录与文档索引](docs/INDEX.md)，再阅读 [AI 后期维护教程](docs/AI-MAINTENANCE.md)，再按任务查看具体模块。技能库内的「NFC 代码」可查阅全部内置技能的写入地址；[当前 NFC 编号表与旧卡迁移](docs/nfc-card-codes.md) 与注册表同步。

## 从源码运行与构建

Node.js 已核验 24.19.0（必须支持 registerHooks）、pnpm。Android 交付另需 Python3.12+、JDK21、SDK/Build Tools 与带 libx264 的 FFmpeg。完整配置与失败定位见 [统一 Android 交付管线](docs/android-delivery-pipeline.md)。

```powershell
pnpm install --frozen-lockfile
pnpm test:core
pnpm android:apk --config 'D:/local/mahjong-public.json' --profile public
```

先按 `config/build-local.example.json` 在工程外建立本机配置，填写真实工具路径、预期证书和已交付最高 versionCode。私人配置另指向工程外的 `privateBundle`，使用 `--profile private`；公开配置拒绝接收私人输入。旧 PowerShell 入口仅转发：`scripts/build-android.ps1 -Config ... -Profile public`。

每次在独立目录冻结真实源码，执行核心/配置/故障测试、网页构建、PNG与电影加工、清单、同步、干净Android打包和完整APK核验。通过后才生成 `<buildRoot>/<本次编号>/delivery/mahjong-wushuang.apk`。没有 delivery 就没有本次正式交付；不要从失败目录手工捡中间 APK。源代码和旧产物不覆盖，用户数据不处理。

开发网页仍使用 `pnpm dev` 或 `pnpm build`。公开源码不包含原签名密钥；换电脑产生的新调试证书不能直接覆盖旧安装。统一管线目前校验并交付同签名的 debug APK；直接 Gradle 命令属于开发中间产物，不替代交付关卡。

覆盖安装需要相同包名、相同签名以及更高的 `versionCode`。当前管线保留原签名并核验这些条件，尚未完成本版本的真机覆盖安装验证。自行构建兼容升级包时，请按交付管线文档在工程外提供原密钥及签名配置；不要把密钥或密码提交到仓库。

代码测试入口：

```powershell
node scripts/run-tests.mjs tests/virtual-emotes.test.ts
node scripts/run-tests.mjs tests/virtual-room.test.ts tests/virtual-room-recovery.test.ts
node scripts/run-table-tests.mjs
```

## 平台范围

当前开发只针对 Android，iOS 历史工程未完成 Xcode/真机验收，用户已明确暂不处理。[iOS 历史说明](docs/ios-development.md) 仅供以后参考，不是当前开发任务。

中央实体对局台专供平板，布局验收仅平板横竖屏；风位位于姓名左侧。手机遥控器、共用 NFC 与音乐页面仍支持手机。

## 表情与素材

内置表情清单位于 `data/emotes.json`，图片位于 `public/emotes/`，源码添加方式见 [data/EMOTES.md](data/EMOTES.md)。本轮开发还支持在应用内导入静态表情、分类、收藏、最近使用和表情包导入导出；自定义图片在同房间按需同步。使用、容量、存储及验证范围见 [表情库说明](docs/emote-library.md)。

## 技能体验开发

实体无双模式新增六张环境卡的手动辅助、暗夜极暗操作、审判与开箱演出，以及可配置的硬币／骰子／轮盘判定。单枚硬币支持实体正反录入或游戏内掷币，四神卡已有代价确认与专属准备页，麻将无双接入智能算番与本局结算；虚拟麻将规则引擎保持原有权威边界。实现细节、扩展入口及真机验收清单见 [技能体验说明](docs/skill-experience.md)。

上述功能已包含在当前源码中，历史 v1.0 APK 不包含这些后续改动。实体 LAN 协议为 8，平板与手机需要安装同一新版本。

NFC 固定代号、常驻扫描与系统唤起见 [NFC 指引](docs/nfc-card-codes.md)，三首私人歌曲及歌词/曲绘见 [播放器说明](docs/music-player.md)。公开源只保留媒体通道，私人资源仅注入隔离构建。环境前奏和神卡主题前奏在3D影片之前播放，详见 [前奏记录](docs/cinematic-prelude-beta23.md)。

当前弹窗改进与验证边界见 [beta30记录](docs/ui-dialogs-beta30.md)，手机三列选卡、流局和加扣点见 [beta29记录](docs/ui-dialogs-beta29.md)，技能和和牌页面见 [beta28记录](docs/ui-dialogs-beta28.md)，第一批玩家与备份页面见 [beta27记录](docs/ui-dialogs-beta27.md)，平板风位见 [beta26记录](docs/player-wind-marks-beta26.md)。智能算番视觉导入已有评估，用户要求暂缓，等再次提出才开发。

请仅公开自己有权分发的角色、技能卡、音效及其他图片素材。本仓库没有附加全项目开源许可证；素材权利请按各自来源确认。
