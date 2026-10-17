> 维护入口与目录规范见 [文档索引](INDEX.md)。本机路径以固定工作区配置为准，不从历史日期目录复制新工程。

# Android 统一构建与交付检查

2026-10-14，beta39 / code88。本文取代旧教程中拼接构建命令、修改历史私人 stage 的做法。覆盖重构计划第 0～3 批；批量素材编辑器、编号登记、图片转换预览、自动缓存键与跨设备素材协商仍待后续实施。

## 1. 一次配置，一个入口

需要 Node.js（已验收 24.19.0，必须支持 `node:module.registerHooks`）、Python **3.12+**、JDK21、Android SDK/Build Tools、支持 libx264 的 FFmpeg。先在源码目录执行 `pnpm install --frozen-lockfile`；工具会检查安装锁与源码锁一致。

把 `config/build-local.example.json` 复制到**工程外**，填入本机路径和预期签名证书 SHA-256。示例中的占位证书不能用于打包。`buildRoot` 必须是源码目录之外的独立目录；不用历史 stage，也不覆盖旧产物。`minimumVersionCode` 填已交付的最高 code，新包必须更高。当前已交付beta39为88；重建当前版本与发布下一版本需区分。

公开与私人使用两份本地配置。公开配置不能包含 `privateBundle`；私人配置增加 `privateBundle`，指向工程外冻结的 `bundle.json`。该内容包只提供素材及对应数据声明，不能覆盖代码或测试。

```powershell
$env:MAHJONG_PYTHON = 'D:/tools/python/python.exe'
pnpm android:apk --config 'D:/local/mahjong-public.json' --profile public
pnpm android:apk --config 'D:/local/mahjong-private.json' --profile private
```

也可直接运行 `node scripts/android-build.mjs` 加相同参数。旧 `scripts/build-android.ps1 -Config ... -Profile private` 只是转发，最终运行同一个入口；旧 `-LosslessPngPython/-CinematicPython` 参数已移除，不再存在遗漏压缩的快捷打包路径。Python 路径默认取 `python`，可用上面的环境变量指定。

当前交付管线使用 `clean :app:assembleDebug`，并严格要求最终证书匹配配置。原兼容签名必须来自本机已有的签名环境；工具不会生成或替换密钥，不读取/记录密码。不要改成任意新证书来绕过核验。直接运行 Gradle 产生的文件是开发中间产物，不能据此标为“已验收交付”。

## 2. 每次运行的资料

`<buildRoot>/<UTC时间>-<profile>-<随机标识>/`：

| 项目 | 用途 |
| --- | --- |
| owner.json | 生成目录归属；不自动清理其他目录 |
| input-manifest.json | 实际脏工作区快照的全部文件哈希，不依赖 Git HEAD |
| private-input/ | 本次私人声明和文件的独立副本；仅私人运行存在 |
| stage/ | 当前源码副本，按声明组合私人内容；仅 node_modules 共用已校验的依赖安装 |
| reports/build-inputs.json | 配置、素材、源码、工具与依赖锁的指纹 |
| reports/core/results.json | 每一个核心/渲染测试的结果、退出码与独立日志 |
| reports/content-contract.json | 公开或私人素材策略、数量和数字名称警告 |
| reports/*.{stdout,stderr}.log、*.json | 每步的分流日志、真实退出码、耗时和输出校验 |
| reports/cinematic-compression.json、png-lossless.json | 当前输入对应的影片与PNG加工记录 |
| reports/web-ledger.json、apk-web-ledger.json | 网页全量文件与 APK 预期网页文件的逐字节哈希 |
| reports/apk-verification.json | 签名、证书、包名/版本、对齐、结构、原生类、CRC、全量资源与体积结果 |
| build-report.json | 本次总结果；失败或中断也保留失败状态 |
| delivery/mahjong-wushuang.apk | 只在全部检查通过后出现；不会覆盖上次成功包 |

源码在快照复制过程中发生变化会失败；复制完成后使用固定快照。构建过程中不得手工修改 stage，否则交付前哈希检查会失败。失败后修复源码或配置，重新运行到新目录；不要在旧 stage 改两行继续，也不要修改报告里的 `passed`。

三种计数口径：预缓存条目不含清单自身；网页运行资源另含 `precache-manifest.json`；APK再加两个空的 `cordova.js/cordova_plugins.js`。编译器的 `.assetsignore` 和 `.vite/manifest.json` 是另列的构建元数据，Android不收录；其他未声明隐藏文件会被拒绝。

重复构建的完整 Web 清单一致性尚未通过验收：框架随机编号和打包依赖排序会改变脚本名称及引用。固定 generateBuildId/deploymentId 的试验引起 CSS 素材路径错误，已撤回；不得把这项试验重新开启或宣称已经实现确定性构建。每次交付仍分别验证当次冻结源码、最终资源清单及 APK 内全部资源，不能将这种单次完整性验证当作跨次清单一致。第3批因此仍有该验收项待完成。

并发构建时，视频缓存按内容键加操作系统文件锁；共享 node_modules 内的 Capacitor 原生项目也共享构建输出，因此原生 clean/assemble 阶段使用依赖目录锁串行执行。进程退出会释放锁，微小的锁文件保留，避免删除锁文件后产生双重锁。不要另开旧脚本绕过管线并发执行 Gradle clean。

## 3. 测试与失败定位

```powershell
pnpm test:core
python -m unittest discover -s tests/build -p 'test_*.py'
python tools/build/content_contract.py --root . --profile public --report .tmp/public-contract.json
```

核心测试在公开和私人版使用完全相同的文件。每个文件独立进程执行，包含最后的渲染套件；首个失败不跳过其他文件，最终仍返回非零。公开版的8张通用SVG、无私人歌曲/素材由公开契约检查；私人契约对照内容声明、文件哈希和NFC身份。不要在私人 stage 把断言改成“数量至少8”。

原生命令的 stderr 只是诊断日志。退出码非零、启动失败、超时、缺输出才会判失败；即使输出含“success/Verifies”也不能抵销真实失败。PowerShell 5.1 与 7 都不需要全局 `Continue`。Java 的 `JDK_JAVA_OPTIONS` 诊断会保留；需要本机管道路径设置时使用本地配置的 `jdkJavaOptions`，不要为了隐藏警告清空它。

失败后先看 `build-report.json` 和失败步骤的 stderr/stdout。没有 `delivery` 就没有本次可交付包。体积超限先检查分组报告、实际新增内容、电影优化和结构差异；不要直接改大阈值来消除红灯。

## 4. 独立核验一个 APK

使用该次构建输出的**独立预期资源清单**，不能从待检 APK 自己提取清单再称为“与源码一致”。

```powershell
node scripts/android-verify.mjs --apk 'D:/build/delivery/mahjong-wushuang.apk' --config 'D:/build/reports/verification-config.json' --ledger 'D:/build/reports/apk-web-ledger.json' --report 'D:/checks/recheck.json'
```

PowerShell 入口也接受 `-Apk/-Config/-Ledger/-Report` 四个参数。SDK 对中文文件路径的限制由验证器内部的临时同哈希副本处理，原 APK 不改名、不修改。只解析真实 ZIP 结构；签名块、文件头、描述符、合法对齐不算残留。ZIP64、多盘、加密或不支持的结构明确失败。新交付要求未归属区间为零。

历史包诊断可以单独设置调查预算，但必须标记为历史检查，不能借此放宽当前 profile。beta37 的175,340字节区间与 beta38 的零区间是历史实测结果，不等于重现了早前423MB事件。

## 5. 当前素材与版本边界

`config/public-content.json` 是已核对的公开素材归属/哈希及表情、NFC、卡面基线。公开源码引入新图、替图、改公开声明或修改 sw.js 时，先审核真实差异，再更新对应的基线条目。不能把私人 stage 扫描结果写成公开基线；不能删掉这道契约来让构建通过。

私人 `bundle.json` 暂时承担冻结输入：`emoteMode: replace` 明确替换公开表情表；`files` 为相对工程路径、大小和SHA-256；`nfcOverrides` 必须同时匹配 code、skillId、action，只能改媒体字段；`artAdditions` 只能增加没有重名key的卡面。已有ID不重排，不把公开8张和私人101张直接相加。005默认二代刹那、006兼容、140普通技能的语义保持。

私人表情现由工作区Manage-Emotes.ps1维护，唯一操作说明见[表情维护](../data/EMOTES.md)。旧公开8张SVG已删除；构建契约拒绝孤儿表情文件。

验证构建显式传 `--validation`（工作区入口为 `-Validation`），允许复用当前code但不低于配置最低code；完整校验顺序不变。版本名增加-validation，报告purpose为validation，归档工具拒绝将其登记为正式交付。默认交付仍要求code严格大于最低code。

版本仍需同步 `package.json`、`android/app/build.gradle` 的 versionName/versionCode、`public/sw.js` 缓存编号及公开基线；管线核对前两者，私人后缀仅在 stage 生成。`catalogRevision` 仅真实技能迁移才更改。单一 release.json、内容驱动缓存与缓存激活保护属于后续第4～5批，本文不把它们标为已完成。

## 6. 回退

修改前必须备份真实源码和私人输入，并读回校验。交付附本批限定文件的修改前后哈希；定点恢复必须先确认没有后续修改，再保存恢复前快照。不要整体覆盖脏工作区，不清理用户保存数据。按2026-10-15用户要求，只保留当前交付和必要回退资料；旧产物可在依赖核验后清理，不再永久累积历史完整工程。

已经安装更高 versionCode 时，不卸载降级；需要把旧行为源码构建为更高 code、同签名的新包。浏览器与工具核验不等于Android实机覆盖安装、NFC贴卡或双设备LAN验收。


## 工作区与空间约束（2026-10-16）

本机固定工作区的03-维护与打包.md和04-备份与清理规则.md为操作入口。Build-Android.ps1一次只构建指定的public或private，不自动双版打包。工具路径相对于本地JSON所在目录解析；源码不依赖维护者旧日期目录。

管线在复制前计算空间预算（最低10 GiB，按源码及私人输入规模增加），限制2份未处理构建，并检查2 GiB缓存上限。构建、归档和清理以buildRoot/.build.lock串行执行，不能通过另设buildRoot绕过本机保留规则。超过限制不自动删除现场。

本机Manage-Storage.ps1提供预览、验收归档、临时目录清理和登记过期包清理。APK复核和复制核验通过后才更新CURRENT.json；各渠道保留当前与上一可用版。未知文件、异常链接、未归档成品或未标记排查完成的失败构建会阻止删除。Backup-Files.ps1只备份实际修改文件，恢复前核对修改后哈希以保护后续编辑。工作区工具位于Git仓库外，单独克隆本仓库的开发者仍需自行管理归档和备份。
