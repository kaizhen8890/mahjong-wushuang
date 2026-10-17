> 维护入口与目录规范见 [文档索引](INDEX.md)。本机路径以固定工作区配置为准，不从历史日期目录复制新工程。

# 麻将无双：给后续 AI 的维护教程

核对：2026-10-14。适用基线：源码 1.1.0-beta.39、Android versionCode 88、离线缓存 v45。以后仍以实际代码、测试和用户最新要求为准。历史交接中的计划、建议、未完成项不是当前开发授权。

## 1. 接手、备份和不可破坏的边界

1. 先阅读固定工作区00-接手入口.md和本仓库docs/INDEX.md，确认唯一源码入口source-public及本次任务，查看 Git 工作区状态，保留已有修改。不要 reset、clean，或拿旧压缩包覆盖整个工程。
2. 修改前备份真实文件，包括非 Git 跟踪文件。排除依赖、构建目录和缓存，不跟随目录链接。记录相对路径、字节数、SHA-256；读回压缩包逐项核对。备份放固定工作区backups，日常优先备份本次修改文件，不逐批永久复制完整工程。
3. 源码备份不是用户数据备份。不要卸载App、清空WebView、localStorage/IndexedDB或应用数据来解决升级问题。验证迁移使用隔离测试档。
4. 搜索数据、调用方、路由和测试后再修改。改说明文字不等于实现规则；换素材不等于授权重写引擎。
5. 交付包含修改说明、验证记录、APK版本/包名/签名/哈希、未实测项及定点回退方法。

必须保留：

- Android是当前唯一开发平台，历史iOS工程不属于任务。
- 实体对局由平板Host保存和裁定，手机只发请求；虚拟日麻牌山、暗牌、随机、摸打与结算由虚拟Host权威处理。不得把Host全量状态、其他人的暗手或暗置卡名发给客户端。
- beta36修复的阵营自摸：队友免付，敌方普通份额不重新摊派。维护素材时不要覆盖回旧计分代码。
- 神卡代价只扣一次；巫女裁决直接点头像，不额外确认。其余神卡现有手动执行边界是已接受设计，不自行补自动结算。
- 手机技能选择三列，稀有度普通→稀有→史诗→无双，同类型相邻；类型含单、团、攻、陷、环、神。和牌录入保持紧凑，不恢复大量滑动的大牌按钮。
- 公开工程不附带内置表情，data/emotes.json保持空数组，public/emotes不放随包图片。私人雀魂表情、NFC歌曲/封面/歌词、特别卡面、私人APK只在隔离构建和本地交付目录，不能混入公开GitHub。

## 2. 按任务找文件

| 任务 | 入口 |
| --- | --- |
| 内置技能、迁移 | data/skill-cards.json；lib/skill-catalog.ts；lib/mahjong.ts；tests/skill-catalog.test.ts |
| 技能编辑与导入导出 | app/components/mahjong-console.tsx；skill-library-panels.tsx；data-management-dialog.tsx |
| 卡面/变体 | public/skill-cards/manifest.json；lib/skill-art.ts；app/components/skill-catalog-picker.tsx |
| 技能执行 | lib/remote-command.ts；lib/skill-experience.ts；lib/skill-random.ts；lib/god-card-cost.ts及对应测试 |
| NFC | data/nfc-card-registry.json；lib/nfc-registry.ts；lib/nfc-code-catalog.ts；app/components/nfc-code-library.tsx、nfc-card-scanner.tsx、nfc-launcher.tsx |
| 表情 | data/emotes.json；lib/emotes.ts、emote-library.ts、emote-media.ts、emote-transfer.ts |
| 角色 | public/characters/manifest.json；lib/characters.ts、character-transfer.ts；app/components/character-picker.tsx |
| 背景、音乐 | public/art；app/sakura-theme.css；data/riichi-music.json；app/hooks/use-game-audio.ts |
| 影片 | public/cinematics；lib/*-cinematic.ts；app/components/*cinematic*.tsx |
| 打包与交付 | scripts/android-build.mjs、tools/build；docs/android-delivery-pipeline.md；tools/packaging |

省略目录的相邻文件位于同一目录。先用rg确认文件是否移动，不凭旧路径新建重复模块。

## 3. 技能库：增加、修改、删除

2026-10-16：常规技能维护优先使用 [SKILLS.md](../data/SKILLS.md) 的单入口工具。下文手动改注册表属于开发者内部说明，不是维护 AI 的操作步骤。

### 3.1 本机自定义

技能库→新增技能卡/编辑资料→保存，只改变本机数据，不改源码默认库。新卡通常取当前库最大ID+1并标记custom:true。可导出JSON给其他设备导入。

**导入技能库替换整份库，不是追加。** 添加少量卡时先导出现有完整库，在副本合并、核对ID后再导入。只有一张卡的JSON会替换原库，不能直接当作增量包使用。

编辑器接受PNG/JPEG/WebP，上限1,500,000字节，以data URL保存，不自动缩图。先压缩图片，避免localStorage容量耗尽。删除前导出：UI删除移除库、手牌、牌库和弃牌堆引用，不代表清理所有在场效果。导入替换与内置退役有独立清理逻辑，分别检查。

### 3.2 内置卡结构与变更流程

当前42张内置卡，最大ID44；23关税政策、38反伤刺甲已退役。不要复用退役ID，不按数组位置重新编号。

最小示意（45是否可用必须重新核对，此例不授权新增）：

```json
{
  "id": 45,
  "name": "新技能名称",
  "rarity": "普通",
  "type": { "code": "单", "name": "单体增益", "guide": "写清作用范围" },
  "effectDescription": "明确时机、合法目标、数值、持续时间和结束条件。",
  "flavorText": "风味文字",
  "summary": "简短概述",
  "artwork": "/cards/art/new-skill.webp"
}
```

参考同类卡补timing、targeting、constraints、stackability、factionAndMode、ambiguities。structuredEffects是资料描述，不能当通用规则引擎；新字段不会自动加减分。内置卡不要标custom。

操作顺序：

1. 备份后修改JSON，固定ID和规范名称。
2. 添加插画、完整卡面和manifest映射，核对cardId/name/src。
3. 决定新安装和旧保存库分别如何获得变更；不是改JSON就能覆盖旧库。
4. 增卡时登记固定NFC身份；改名时搜索名称分支，包括环境、神卡、影片、NFC及测试。
5. 用隔离旧档验证用户删卡、ID碰撞、用户卡面、手牌/效果引用和导出再导入。
6. 验证平板技能库、手机三列选择、抽卡、资料详情和扫码路径。

需要真正新增效果时，单独实现Host命令、目标验证、一次性代价、随机结果、撤销、结束清理、快照和暗置过滤；手机不能提供可信随机结果。

### 3.3 迁移陷阱

当前catalogRevision为2026-10-03-gen2，与APK版本分开管理。本批只加NFC代码页，没有改技能定义，不提高catalogRevision。

migrateSkillLibrary当前行为：

- 无保存库或空库时用随包库。
- 移除非custom退役卡，保留custom。
- revision等于当前值、或特殊历史值2026-10-01时，不覆盖旧卡文字。
- 其他旧版本仅更新updatedCardIds，保留用户artwork及已有randomRule。
- revision不同时补addedCardIds里缺失的卡，不覆盖碰撞ID。

**未来不能只改日期并照抄迁移数组**：可能重复补回用户主动删除的卡、覆盖用户文字，或被历史分支跳过。需要明确逐版本迁移和测试。

retireSkillReferences会移除退役手牌/牌库/弃牌堆，效果置resolved，环境引用清空，保留分数和历史；custom同ID有保护。删内置卡不等于直接从JSON移掉就完事。

### 3.4 卡面与变体

data/skill-cards.json的artwork是资料插画/用户选择；完整卡面由public/skill-cards/manifest.json管理。条目常含key、cardId、name、src、width、height；PDF提取项另有page/crop，不给手工新图伪造PDF来源。

skillCardArt默认取首个匹配ID；SkillCardArt同时核对名称并保留显式变体/自定义图。变体name应完全同名或以“技能名 空格”起头。调默认图须核对所有调用方，不能只改一个artwork。

遥控端只解析已知内置图，不信任远端任意图片地址。不要为换图绕过这条边界。私人二代刹那只在私人暂存；NFC005默认该图、006兼容，公开包用可公开旧卡面回退。

## 4. NFC代码、写卡与扩展

入口：实体计分台→技能库→NFC代码。UI和导出读同一注册表，不另写页面手工表。目前44条身份覆盖42张技能。

| 代码 | 对应内容 |
| --- | --- |
| MW-001 | 麻将无双，技能41 |
| MW-002 | 断序杂音，技能42 |
| MW-003 | 宿星审判，技能43 |
| MW-004 | 听天问剑，技能44 |
| MW-005 | 刹那特别音乐卡，私人版默认二代 |
| MW-006 | 005兼容入口 |
| MW-101…140中已登记项 | 其他内置技能；123/138不存在，140为普通刹那技能 |

普通卡本批按100+skillId分配后固化进JSON；这不是运行时规则。以后先查完整表，不按排序重新编号。

写NDEF **URL/URI记录**：例如 `mahjongwushuang://card/v1/MW-005`，放第一条。不能选Text、裸005/裸MW-005，不能加https、参数、片段、末尾斜线。App查询复制但不直接写卡，无需锁死芯片。

**beta37已授权重编号**：旧002刹那→005；旧003断序→002；旧004宿星→003；旧005问剑→004；001/006不变。旧002～005标签要重写，设备统一版本。同一旧URI没有原卡意图，不能自动迁移。此例不授权未来继续复用旧码。

新增固定身份：

1. 先确保内置卡的skillId+skillName固定，选择未使用/未退役保留的三位代码。
2. 登记code/name/uri/action/skillId/skillName，普通卡action为skill；音乐变体保留场景路由。
3. 同步测试、注册表revision、lib/nfc-code-catalog.ts导出revision和迁移提示，以及[完整代码表](nfc-card-codes.md)。
4. 本机custom、改名或ID冲突卡不会自动获得代码。若需支持它们，先明确跨设备固定登记/随包方案，不生成扫不出的假码。
5. 测删除/改名/碰撞、未知URI、缺图缺音、前台/外部唤起、主机选人/手机绑定、夜间/关闭无双/本局结束。

扫码只进入准备页，不自动付款或结算。断序/宿星前台对局走技能，外部唤起可走音乐；005/006是音乐身份，140是普通技能。公开包缺私人音源为预期。媒体只允许App本地白名单，不接受标签携带任意URL、分数、命令或玩家权限。历史UID绑定键mahjong-wushuang:nfc-bindings:v1不是主路由，不擅自删除。

## 5. 表情包维护

### 私人随包表情

日常添加、换图、改名、退役、快检与回退统一使用工作区 `Manage-Emotes.ps1`。唯一操作说明见 [表情维护](../data/EMOTES.md)。不要再手改 bundle 的 emotes/files 或自行找空号；公开表情库仍为空。

### App内自定义表情

表情选择器→管理→导入静态图/表情包，可分类收藏。个人内容优先用此流程，无需重打APK。

- PNG/JPEG/WebP输入≤12,000,000字节、4,000万像素；最长边缩到384，WebP质量0.88，成品≤262,144字节。
- ID为x-加SHA-256前60位，仍校验完整哈希，不改成内置数字ID。
- 本机≤500项、50分类，分类30字符、标签40字符；单次包≤80项、28,000,000字节，format为musou.emotes、version1。按分类拆包可避开80项限制。
- 导出个人包包含自定义项，不含随包内置图。移出会清库条目、收藏与最近记录，不等于立即抹掉全部媒体缓存。
- localStorage的mahjong-emote-library:v1是元数据，IndexedDB的mahjong-emote-media:v1是图片，只备份前者不足以恢复图片。

自定义媒体在认证房间按需传输，校验分块、大小、尺寸与哈希；收到的缓存不自动加入个人库。不取消限制、不接收任意远端图片地址、不清角色库来回收表情空间。

## 6. 人物、头像和立绘

### 内置角色

public/characters/manifest.json的characters条目：

```json
{ "id": "new-character", "name": "新角色", "avatar": "/characters/new-character/avatar.png", "portrait": "/characters/new-character/portrait.png" }
```

稳定小写ID，不占custom:前缀；添加两张图片后验证选角、头像、立绘、横竖屏与长名字。

当前8个角色claude/deepseek/gemini/glm/gpt/grok/kimi/qwen。默认四座deepseek/claude/gpt/gemini，删默认角色会使lib/characters.ts初始化报错；须先定义替代和迁移。

内置选择校验id+name完全一致。直接改名会使旧选择失效并回退默认，不能假设只改显示名无影响。

### 自定义角色

选角→导入自己的角色，填名称/头像/立绘，保存或导出单角色包。

- 名称1～36字符，ID为custom:UUID，图片用完整SHA-256引用。
- 输入≤12MB、宽高各≤5000；头像裁剪256×256，立绘按比例缩入900×1200，WebP质量0.84，每图≤1,500,000字节。
- 不自动抠图，需要透明立绘先离线制作透明PNG/WebP。
- 包format为mahjong-wushuang.character、version1，文件≤4.5MB，含角色信息及头像/立绘MIME/base64；导入校验解码大小/尺寸/哈希。
- IndexedDB的mahjong-wushuang.characters.v1中characters存选择、media存图片。对局JSON只含引用，不替代角色包备份。
- 删除角色记录不盲删图片，旧局可能仍引用同一媒体；清理前调查引用。

联网采用受限分块传输，校验类型、字节数、尺寸、哈希和超时。内置角色依赖双方随包资源，自定义才需传图。验证两设备、断线重连、缺图回退。

## 7. 其他素材、音乐和动画

先搜引用。public路径引用时不带public前缀，例如public/art/mahjong-pattern.svg在页面用/art/mahjong-pattern.svg。优先复用现有背景/完整卡面。保留母版，删旧素材前核对代码、manifest、私人覆盖层和离线打包，不仅看当前页面。

立直曲目看data/riichi-music.json和use-game-audio；NFC私人音乐放隔离副本注册表。音源只允许/audio/nfc下mp3/m4a/mp4/ogg/wav；封面/歌词也走本地白名单。MP4音源无需强转MP3。新增后核对标题、作者、封面、歌词时间轴、缺资源、暂停/切歌/返回/后台及音乐优先级，详见[music-player.md](music-player.md)。

影片在独立目录/manifest中，通常含横竖屏、海报、字节数、SHA-256，部分还有anchor和关键时间。默认卡面和影片是不同入口：

1. 找lib里对应cinematic路由和组件，确认方向/正反/效果分支。
2. 制作新副本，更新manifest哈希/大小/时长/触发点/定位，保留母版可回退。
3. 验证跳过、失败、返回、后台、旋转、重复网络事件；不重复扣代价/结算。
4. 同时测预览和Host真实事件；预览成功不代表实战路径正确。
5. 只压缩打包副本的现役电影，不批量处理所有MP4（NFC/立直MP4可能纯音源）。

## 8. Android打包教程

本机固定工作区优先运行根目录Check-Workspace.ps1和Build-Android.ps1；本机配置在config，临时构建在temp/builds。下方D:/示例仅供其他电脑独立克隆配置，不是本机现行路径。

beta39起使用[统一构建与交付管线](android-delivery-pipeline.md)。该文包含工具要求、本机配置、公开/私人命令、日志、独立核验和回退；旧逐批 work 脚本只供历史查阅。

```powershell
pnpm install --frozen-lockfile
pnpm test:core
$env:MAHJONG_PYTHON = 'D:/tools/python/python.exe'
pnpm android:apk --config 'D:/local/mahjong-private.json' --profile private
```

公开配置去掉 privateBundle 并使用 `--profile public`。不要继续维护或复制旧私人 stage：从当前源码生成新stage，私人只提供已冻结的内容声明/文件。核心测试不作私人补丁，数量和素材归属由各自契约检查。

公开素材被修改时，审核差异后更新 config/public-content.json 对应字段与哈希；私人内容永远不进入此基线。私人覆盖必须按 code/skillId/action 匹配，媒体字段以外不允许覆盖。005/006使用二代刹那，140保持普通技能；不再重复执行beta37的重编号迁移。

版本目前仍同步 package.json、android/app/build.gradle、public/sw.js 和公开基线；code须高于已交付最高值。不要为加素材改变 catalogRevision。后续第4批才收敛成单一release.json，第5批才更改离线缓存算法；尚未完成的计划不能写成当前功能。

每次新目录中完整运行测试、类型检查、网页构建、PNG优化、电影压缩、离线清单、Capacitor同步、Gradle clean/assemble和签名/哈希/结构检查。压缩报告不覆盖当前内容或同步后资源变化均失败；只有全通过才出现 delivery。

签名密钥保留在本机已有环境，预期证书由配置明确指定；管线不打印密码或更换密钥。当前产物为debug私人APK，不冒充公开发布版。已授权私人交付不代表公开发布授权。

交付记录包名、versionName/code、证书与最终APK SHA-256，同时明确Android覆盖安装、贴卡、复制粘贴、双设备LAN、断网重启是否实测。不要用浏览器成功代替Android真机结果。

## 9. 验证、故障定位与回退

| 修改类型 | 最低检查 |
| --- | --- |
| 技能 | 新安装/旧revision、用户删卡/改名/卡面/custom碰撞、退役引用、导入覆盖、抽牌排序和暗牌边界 |
| NFC | 固定映射/唯一性/全卡覆盖/006兼容、未知URI、缺图缺音、搜索复制导出、复制失败提示、合法身份和禁止自动发动 |
| 表情/角色 | 导入预览保存/取消/非法包、导出再导入、上限、两端/缺图回退、删除后旧引用 |
| 动画/音乐 | 横竖屏、预览与真实触发、分支、跳过/失败/后台、播放优先级、重复事件不重复结算 |
| APK | 全核心、类型、相关lint、最终dist真实页面、包内资源与哈希、私有隔离、签名版本对齐、回退只读核验 |

入口node scripts/test-core.mjs包含核心测试及牌桌渲染检查；定位可用node scripts/run-tests.mjs tests/具体文件.test.ts。浏览器用合成档，禁止操作用户真实保存。UI看成品截图：平板横竖屏，共用NFC/遥控兼顾320px窄手机和横屏，无横向溢出、按钮可触达、返回保留资料。不注入不同CSS后声称成品合格。

常见问题：

- 改了JSON旧用户没变化：检查保存库与revision迁移，不清用户数据。
- 卡面没变：查插画/完整卡面/显式变体/私人覆盖层四个入口及名称匹配。
- 私人音乐或二代图丢失：查隔离覆盖层、路径、白名单和最终APK资源，不把私人文件复制进公开工程修复。
- 手机表情/人物不一致：核对两端版本、内置ID映射、自定义媒体哈希/传输。
- 升级安装失败：核对包名、code和签名，不能要求先卸载作为默认处理。
- UI还是旧的：检查是否构建当前源码、sync正确、离线cache已递增、APK哈希正确。

回退：每批记录修改前后哈希，默认只读检查。当前文件不同于该批结束哈希说明有后续修改，立即停止并人工合并。执行前再备份当前文件，只恢复本批涉及文件；新文件也先核对哈希再移走。不整包覆盖、不清依赖/用户数据/目录链接。

设备已安装更高code时，用备份源码重建行为相同但code更高、签名一致的包，验证兼容覆盖；不卸载或强降级。实体NFC标签是独立物理修改，源码回退不还原标签；beta37编号回退须同时核对各设备版本与标签。

## 10. 交给下一位AI的执行模板

> 核对当前代码与本文资料，用户最新要求优先；只完成指定内容。修改前备份并逐文件核验，保留已有工作区改动和应用资料。区分本机内容、公开随包内容和私人覆盖层；不要把文案当规则引擎。保持实体计分、虚拟Host权威、暗牌边界和Android范围。完成后执行相称测试，构建核验APK，提供维护说明、变更记录和定点回退入口，明确未完成的真机检查；不擅自公开发布私人文件。
