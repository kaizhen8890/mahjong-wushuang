> 维护入口与目录规范见 [文档索引](INDEX.md)。本机路径以固定工作区配置为准，不从历史日期目录复制新工程。

# iOS 开发与验证

当前状态：首轮实现，**尚未经过 Xcode 编译、模拟器运行或真机验收**。本机为 Windows；用户目前没有 iOS 设备。本文不能作为 iOS 已适配完成的证明。

## 基线与支持范围

- Android 兼容基线：v1.0，提交 `91605c39b06443595fa4427565438d145a488049`。
- 开发分支：`ios-adaptation`。原标签、Android 原生代码与设备数据没有修改。
- Capacitor core/CLI/Android/iOS：8.5.1。Node 24.19.0、pnpm 11.19.0 是本次验证的工具版本。
- App 暂定最低 iOS/iPadOS **16.4**，兼顾 iPhone、iPad。Capacitor 的最低版本不等于本项目界面支持下限；现有 Tailwind 4 以 Safari 16.4 为支持下限，牌桌使用容器单位。若要支持更低版本，需另做 UI 兼容与实机验证。
- Bundle ID 沿用 `com.mahjongwushuang.table`，签名团队未配置。后续以用户账号实际可注册的标识为准。

## 在当前环境准备资源

在仓库根目录运行：

```text
pnpm install --frozen-lockfile
pnpm test:core
pnpm ios:prepare
pnpm ios:check
```

`ios:prepare` 依次完成类型检查、前端静态构建、离线清单生成及 Capacitor 同步。不要跳过离线清单步骤。`ios:check` 解析 Xcode 工程与 plist，核对源文件编译成员、插件注册、Swift 包链接及离线资源；它**不编译 Swift**。

工程已存在，不要再次执行 `cap add ios` 或删除 `ios/`。CLI 管理 `ios/App/CapApp-SPM/Package.swift`；本地 LanTransport 包独立链接在 Xcode 工程里，避免被同步覆盖。复制到 Mac 时不要复制 Windows 的 `node_modules`，应重新冻结安装。

## Mac 编译与本地网络测试

按当时 Capacitor 官方要求准备 Xcode 26+，确认 `xcodebuild -version` 正常，再执行：

```text
pnpm ios:prepare
pnpm ios:check
pnpm ios:build:simulator
```

该脚本先在 macOS 运行 `swift test --package-path ios/NativeTransport`，再构建无需签名的 iOS 模拟器 App，输出在 `ios/DerivedData/`。Swift 测试使用本机回环网络；如系统询问本地网络权限，需要允许测试进程。测试失败会中断构建，不会被跳过。

原生测试包括 UTF-8 字节边界、地址约束、端口冲突／重启、Foundation 独立 WebSocket 客户端与 Network.framework Host 的握手和定向回复、原生客户端状态、重复连接及二进制消息拒绝。它们目前**未执行**，也不替代 Android 真实对端、Bonjour 和完整桥接测试。

使用 Xcode 打开 `ios/App/App.xcodeproj`，选择 App scheme 和 iPhone/iPad 模拟器运行。检查首页完整模式、单机、存储、分享及方向行为。真实设备安装另需签名账号、团队及设备；模拟器 App 不能装到 iPhone。

已添加 `.github/workflows/ios-validation.yml`：开发分支推送或符合路径的 PR 会在 GitHub 的 macOS runner 上执行共享测试、资源准备、原生测试及模拟器构建。也保留手动触发入口（GitHub 通常要求工作流先存在于默认分支才展示该入口）。该工作流本次**仅写入本地，尚未推送或执行**；不会签名、上传 TestFlight 或提交 App Store。

## 原生合同与实现选择

`LanRoomPlugin` 注册名称仍为 `LanRoom`，桥接使用现有方法与事件：

| 方法 | 行为 |
| --- | --- |
| startHost / stopHost | 8765–8785 循环选端口；取消启动可显式失败；停止时关闭所有连接和广播 |
| discoverRooms / stopDiscovery | Bonjour 搜索、解析为 IPv4 地址、房间消失与清理；显式刷新重试解析失败的房间 |
| connect / disconnect | 原生客户端，支持 host+port，兼容 url/path 入参；重复连接被拒绝 |
| send / sendTo / broadcast | UTF-8 文本；兼容 text/message 及 connectionId/peerId；发送前检查大小 |

- 既有事件：`peerOpened/peerMessage/peerClosed/roomsChanged/clientState/clientMessage`。
- iOS 新增可选的 `hostState` 通知监听失败或广播失败；不修改线上麻将消息。Android 不发此通知也可继续运行。
- 本地广播类型 `_mws-mahjong._tcp.`，plist 声明不带末尾点；TXT 带 `protocol=1`。
- 网络层为 `NWListener/NWConnection + NWProtocolWebSocket`，由系统完成 HTTP Upgrade、掩码、分片重组、ping/pong；没有自制简化握手，也没有开启 skipHandshake。
- 32 KiB 接收消息上限及发送前 UTF-8 字节校验；二进制消息关闭连接。iOS 同时限制最多 8 个连接，包括握手中的连接。第 9 个连接在 TCP 层拒绝，故不承诺与 Android 的 1008 关闭码完全相同，但都不得产生新的 peerOpened。
- 握手有 30 秒超时，心跳每 20 秒执行；待 pong 超时后释放连接。所有原生状态在主队列串行维护，旧连接回调无法覆盖新客户端状态。
- Bonjour 用 NetService/NetServiceBrowser 解析。为匹配现有 Android，仅返回 IPv4 房间；IPv6-only LAN 不在本轮已承诺范围。
- 原生只转发文本和连接身份，不持有麻将状态、不执行玩家授权。现有 JS Host、校验、投影、角色哈希校验不变。
- Network.framework 原生传输不借助 WebView 的 HTTP 请求；本轮没有全局 ATS 放行。

尚需在 Mac 和真实 Android/iOS 对端验证以上合同，包括事件时序、过大帧／分片、ping/pong、连接上限、端口占用、Bonjour、权限拒绝／恢复、定向发送与停止后的残留事件。

## 屏幕、文件和生命周期

- iPhone 进入虚拟牌桌请求横屏，离开恢复允许方向；iPad 保留系统窗口方向，以支持多任务。方向受限时显示返回入口，避免困在横屏提示里。
- 两种牌桌按安全区域收缩舞台尺寸。3D 仍由现有测量与投影流程布局，保留平面回退；本轮没有实机 GPU、旋转或触摸结果。
- 实体备份／技能库／结算以及自定义角色包使用 iOS `FileExport.shareJson` 调起系统分享，可选“存储到文件”。仅接受明确操作传来的 JSON 和安全文件名，限制 32MB；分享取消视为正常结束，结束后清理本次临时目录。Android/网页继续浏览器下载。
- 文件导入仍用现有文件选择与格式校验。未新增虚拟 Host checkpoint 导出，未改存档键或容器职责。
- 虚拟 Host 在页面变为隐藏时补写 checkpoint，继续沿用现有恢复／重连流程。房主界面提示保持前台；后台持续主持不受保证。异常终止可能无法执行保存，不能以此承诺所有系统终止场景零丢失。
- 未使用后台常驻能力，也未清除任何设备数据。覆盖升级、卸载重装、音频、系统分享与 IndexedDB 保留结果均待实机。

## 当前验证结果与未完成项

Windows 已通过：冻结依赖安装、类型检查、共享 TypeScript 测试和牌桌服务端渲染测试、前端构建、离线清单、iOS 资源同步、工程结构检查。新增能力判断和文件导出测试使用桥接模拟，不能当作原生运行结果。

全仓库 lint 有 26 项既有报告，集中在 UI 基础组件、旧脚本和既有牌桌 hook 等未改动代码段；本轮新增导出／桥接代码的定向 lint 无报告。构建仍有较大前端分包警告。

必须继续完成：

1. 在 Mac 或云端 Mac 运行原生测试及 Xcode 构建，修复编译／运行问题；模拟器验证完整入口和 WKWebView。
2. 拿到真实 iPhone、iPad 与 Android，对照计划执行双向 Host、3/4 人局、Host 人机、隐藏信息和完整对局／恢复。
3. 验证本地网络首次授权、拒绝及恢复、手动 IP、睡眠／锁屏／切网、WebSocket 超限和重连。
4. 验证文件导入／导出、音频、离线重启、3D 回退、升级数据保留及最低版本布局。
5. 用项目正式应用图标／启动图替换当前 Capacitor 模板素材，复核素材分发权利；完成签名团队、版本和分发渠道配置。
6. 只有通过以上检查且取得相应发布指令，才准备可安装签名包及 TestFlight／App Store 操作。

## 官方依据

- [Capacitor iOS](https://capacitorjs.com/docs/ios)
- [本地 iOS 插件注册](https://capacitorjs.com/docs/ios/custom-code)
- [Apple WebSocket 协议选项](https://developer.apple.com/documentation/network/nwprotocolwebsocket/options)
- [Apple 接收消息大小限制](https://developer.apple.com/documentation/network/nwprotocolwebsocket/options/maximummessagesize)
- [Tailwind 浏览器兼容性](https://tailwindcss.com/docs/compatibility)
- [WebKit Safari 16 容器查询支持](https://webkit.org/blog/13152/webkit-features-in-safari-16-0/)
- [GitHub macOS runner 环境](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-Readme.md)

