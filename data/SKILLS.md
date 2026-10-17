# 技能卡维护：给执行维护任务的 AI

在固定工作区 mahjong-wushuang 运行。无需阅读源码、手工分配编号、改NFC/注册表/哈希。公开源码克隆不包含本机工具环境，需要维护者提供工作区配置。

## 1. 准备素材并明确意图

新增独立卡：
```powershell
./Manage-Skills.ps1 --prepare "设计稿.pptx的绝对路径" --pages 2 --slots 1 --action add
```
换现有技能默认完整卡面：同一命令使用 `--action replace-face`。省略 action 时为 auto：只识别候选，动作保持待定，不替用户决定新增或替换。

格式能力：图片提供完整卡面；PPTX可提取文字和卡面组，渲染可能与PowerPoint不同；PDF提供已排版页面，但可能无文字层。若用户给了同版本PDF与PPTX，可明确配对：
```powershell
./Manage-Skills.ps1 --prepare "设计稿.pdf的绝对路径" --text-source "同版本设计稿.pptx的绝对路径" --pages 2 --slots 1 --action add
```
工具使用PDF取图、PPTX取文字，检查每页卡面数量和位置并记录两份哈希。同名文件不自动配对；几何吻合也不证明规则文字相同，维护AI仍须对照候选图片。pages可填1,2或1-3；slots按每页从左到右、从上到下排序。

读取输出的 candidates.json 和图片，再编辑输出的 cards.request.json（只填设计信息）：
- action：add、replace-face、update或retire；不能留null。
- name：用户确认的完整名称。撞名时停止并明确选择；独立新卡需要用户确认独立名称，不能擅自加“二代”。当前不支持同名不同ID的新卡。
- 新卡：rarity=普通/稀有/史诗/无双，type=单/团/攻/陷/环/神，effect=完整规则，summary=短摘要，flavor=台词。没有摘要或台词可明确留空，不再把整段规则伪装成摘要。
- image：工具生成的完整卡面路径；execution保持manual。不会把规则文字变成自动结算逻辑。

候选全文在 sourceText。字体摘要在 fonts，完整定位按需读 font-details.json，带页码/形状/文字；unverified表示安装情况未确认（可能是别名），不等同证明缺字体。渲染器对整份文件的缺字体警告也不代表所选页用到了它。核对字形、标题、正文、边框完整后，将申请单顶层 reviewed 改成 true。这是维护AI的内容核对，不要求用户重复批准已说明的意图。

## 2. 检查与交付

```powershell
./Manage-Skills.ps1 --request "申请单绝对路径" --preview
```
预览执行相关测试、不修改正式文件。错误时按提示补信息，不能修改测试或注册表绕过。

按用户需要选一种执行：
- 只维护素材：同命令去掉 --preview。
- 仅验证APK：使用 --build；保持版本号，产物不是正式交付。
- 用户要求正式私人版：使用 --release；维护后直接推进版本并打正式包，**不要先执行 --build 再打一次正式包**。

正式包核对通过后，完成归档和清理：
```powershell
./Release-Android.ps1 -Profile private -Finish -Reviewed
```
该步骤更新交付记录、该渠道版本门槛，保留构建报告，清理本次临时工程。不会上传GitHub或安装手机。--release返回的APK要检查内容与报告，不把构建通过说成实机通过。

素材已保存而打包失败时，不要重复加卡或再次升版本。检查输出日志；`./Release-Android.ps1 -Profile private -Resume -Build`可恢复准备阶段中断或找回成功产物。失败构建与不完整启动记录会停下保留现场，须诊断后处理，不能另建目录绕过配额。

已维护好素材，也可独立运行 `./Release-Android.ps1 -Profile private`预览，追加 `-Build`启动正式构建。

## 3. 修改与回退

- replace-face：只填action/name/image，保留原插画、NFC与其他变体。
- update：只填要改的字段。summary/flavor使用独立文案更新，仅替换仍等于旧内置文字的字段，保留用户改写；不提高规则修订号，不因此重新添加已删卡。effect/rarity/type仍走原规则迁移。illustration为独立插画，image为完整卡面。
- retire：仅允许本工具新增卡；原有42张退役需单独开发。编号和NFC不复用。
- `./Manage-Skills.ps1 --list`列出名称；`--check`检查现状。
- `./Manage-Skills.ps1 --undo 操作编号`回退维护；检测后来修改即停止。事务备份位于backups/skill-operations。

## 边界与排错

文案更新不代表手机免更新APK；已交付包内资源变化仍需新包。旧规则迁移的历史问题未整体重写。原技能身份、Host权威与计分不变。私人素材不能通过公开技能库入口加入。

完整卡面统一宽715、保持比例、静态PNG，处理后最大2MB；不自动有损压缩小字。超限需优化输入后重试。WebP批量替换需要另行评估画质与兼容，不承诺固定压缩倍数。

UTF-8文件交给工具处理，不用PowerShell默认ANSI读取中文JSON。脚本调用覆盖Windows PowerShell 5.1；无需为了运行安装新解释器。

LibreOffice路径在config/skill-tools.local.json。预览在temp/skill-previews，事务备份在backups/skill-operations；换对话沿用固定目录，不复制日期工程。不要修改原始设计稿。

## 候选输出与测试包保留（2026-10-17）

candidates.json只放每张卡的正文、标题、图片路径及字体摘要；同一文本框的排版换行合为连续文字，详细字体引用移到font-details.json，正常维护不必读取。正文仍以设计稿为准，不能因为已有技能同名就直接拿旧规则覆盖新稿。

用户指定保留验证包时，先用`./Manage-Storage.ps1 keep-validation 构建编号`预览，再追加`--apply`独立保留APK与报告。不会自动删stage或改变正式版本；确认副本后才按需要单独清理临时构建。用户的保留要求优先于默认清理建议。
