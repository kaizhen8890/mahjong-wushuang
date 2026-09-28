# 麻将无双

同一套 Android 应用中的实体日本麻将计分台与虚拟日麻。实体模式由平板保存并裁定唯一的对局状态，手机通过同一 Wi-Fi 加入房间遥控自己的操作；虚拟模式由房间 Host 管理牌山、暗牌、摸打与结算，并向各设备发送各自可见的局面。

本仓库是 **1.0 源码发布版**，不包含 APK、运行产生的数据或先前使用的第三方表情图片。表情发送功能仍可使用，仓库内附 8 张原创通用 SVG 示例。添加自己的图片请看 [表情添加教程](data/EMOTES.md)。

## 使用方式

安装同一版本的 APK 到平板和手机。启动后选择实体麻将或虚拟麻将；实体麻将可选择牌桌主机或手机遥控。LAN 房间需要设备处于同一 Wi-Fi，访客网络的设备隔离可能阻止连接。牌桌及角色等本机资料保存在各设备本地；更换或卸载应用前，请先使用应用内导出功能备份。

实体计分台记录点数、立直、和牌、技能效果、流局与历史。手机只接收其遥控所需的快照，点数和结算仍由平板计算。虚拟麻将支持单机和 LAN 对局，平面桌面与 3D 桌面共用同一局面。技能卡资料位于 `data/skill-cards.json`，用户自行导入的角色和配置仍由应用本机保存。

## 从源码运行与构建

需要 Node.js 22.13+、pnpm。构建 Android APK 还需要 JDK 21、Android SDK 及 Android SDK Platform/Build Tools（按 `android/` 工程配置安装）。

```powershell
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm build
```

开发时运行 `pnpm dev`。Android 构建时运行：

```powershell
node scripts/build-offline-manifest.mjs
pnpm android:sync
cd android
.\gradlew.bat :app:assembleDebug
```

生成的调试 APK 位于 `android/app/build/outputs/apk/debug/app-debug.apk`。或者在 Windows 上运行 `pnpm android:apk` 完成上述检查和打包。公开源码不包含原安装包使用的签名密钥；新环境生成的调试 APK **不能直接覆盖安装**原有 1.0 APK。需要保留现有安装数据并发布升级包时，必须使用原签名密钥签名，并提高 `android/app/build.gradle` 中的 `versionCode`。

代码测试入口：

```powershell
node scripts/run-tests.mjs tests/virtual-emotes.test.ts
node scripts/run-tests.mjs tests/virtual-room.test.ts tests/virtual-room-recovery.test.ts
node scripts/run-table-tests.mjs
```

## 表情与素材

表情清单位于 `data/emotes.json`，图片位于 `public/emotes/`。实体与虚拟房间只传表情 ID，不传图片；新表情在所有设备上显示前，须将相同清单和素材一起打包。见 [data/EMOTES.md](data/EMOTES.md)。

请仅公开自己有权分发的角色、技能卡、音效及其他图片素材。本仓库没有附加全项目开源许可证；素材权利请按各自来源确认。
