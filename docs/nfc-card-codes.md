> 维护入口与目录规范见 [文档索引](INDEX.md)。本机路径以固定工作区配置为准，不从历史日期目录复制新工程。

# NFC 代码库与写卡教程

核对：2026-10-14，beta37 / Android code86。权威表为 data/nfc-card-registry.json；App 的「实体计分台 → 技能库 → NFC 代码」可搜索、看卡面、复制完整地址和导出全部44条代码，覆盖42张内置技能。

## 写卡方法

第三方 NFC 工具选择 URL / URI 类型的 NDEF 记录，把完整地址放在第一条。不是 Text、裸编号或网页地址；不要添加 https、查询参数、片段或末尾斜线。写后读回核对，再用当前 App 测试；无需锁死标签。App 只查询/读取，不内置写卡工具。

## beta37 旧卡迁移

| 旧编号/含义 | 新编号 |
| --- | --- |
| 001 麻将无双 | 001，不变 |
| 002 刹那旧特别 | 005，统一特别入口，私人版默认二代卡面 |
| 003 断序杂音 | 002 |
| 004 宿星审判 | 003 |
| 005 听天问剑 | 004 |
| 006 刹那二代特别 | 006继续兼容005，新卡优先写005 |

旧002～005实体标签需要重写，各设备升级到同一版本。相同URI无法区分旧卡意图，不能自动兼容两种含义。本次调整是用户明确授权的例外，之后不要再擅自复用已发行代码。

## 完整写入表

普通技能代码已固化，不能因排序/稀有度/删卡重新编号；123、138为退役技能，不登记。140为普通刹那技能，005/006为特别音乐入口。

| 代码 | 卡名 | 技能ID | 类型 | 完整写入地址 |
| --- | --- | --- | --- | --- |
| MW-001 | 麻将无双 | 41 | 技能 | `mahjongwushuang://card/v1/MW-001` |
| MW-002 | 断序杂音 | 42 | 技能 | `mahjongwushuang://card/v1/MW-002` |
| MW-003 | 宿星审判 | 43 | 技能 | `mahjongwushuang://card/v1/MW-003` |
| MW-004 | 听天问剑 | 44 | 技能 | `mahjongwushuang://card/v1/MW-004` |
| MW-005 | 刹那旅程 · 特别卡 | 40 | 特别音乐 | `mahjongwushuang://card/v1/MW-005` |
| MW-006 | 刹那旅程 · 兼容入口 | 40 | 兼容005 | `mahjongwushuang://card/v1/MW-006` |
| MW-101 | 借刀杀人 | 1 | 技能 | `mahjongwushuang://card/v1/MW-101` |
| MW-102 | 祸水东引 | 2 | 技能 | `mahjongwushuang://card/v1/MW-102` |
| MW-103 | 背水一战 | 3 | 技能 | `mahjongwushuang://card/v1/MW-103` |
| MW-104 | 万箭齐发 | 4 | 技能 | `mahjongwushuang://card/v1/MW-104` |
| MW-105 | 顺手牵羊 | 5 | 技能 | `mahjongwushuang://card/v1/MW-105` |
| MW-106 | 釜底抽薪 | 6 | 技能 | `mahjongwushuang://card/v1/MW-106` |
| MW-107 | 破釜沉舟 | 7 | 技能 | `mahjongwushuang://card/v1/MW-107` |
| MW-108 | 飞升天堂 | 8 | 技能 | `mahjongwushuang://card/v1/MW-108` |
| MW-109 | 魔女审判 | 9 | 技能 | `mahjongwushuang://card/v1/MW-109` |
| MW-110 | 暗夜之战 | 10 | 技能 | `mahjongwushuang://card/v1/MW-110` |
| MW-111 | 寂静之地 | 11 | 技能 | `mahjongwushuang://card/v1/MW-111` |
| MW-112 | 宝箱猎人 | 12 | 技能 | `mahjongwushuang://card/v1/MW-112` |
| MW-113 | 规则怪谈 | 13 | 技能 | `mahjongwushuang://card/v1/MW-113` |
| MW-114 | 偶氮玉红 | 14 | 技能 | `mahjongwushuang://card/v1/MW-114` |
| MW-115 | 立直仙人 | 15 | 技能 | `mahjongwushuang://card/v1/MW-115` |
| MW-116 | 御风之使 | 16 | 技能 | `mahjongwushuang://card/v1/MW-116` |
| MW-117 | 哈耶克的大手 | 17 | 技能 | `mahjongwushuang://card/v1/MW-117` |
| MW-118 | 崇洋媚外 | 18 | 技能 | `mahjongwushuang://card/v1/MW-118` |
| MW-119 | 抗坏血酸 | 19 | 技能 | `mahjongwushuang://card/v1/MW-119` |
| MW-120 | 只狼 | 20 | 技能 | `mahjongwushuang://card/v1/MW-120` |
| MW-121 | 指鹿为马 | 21 | 技能 | `mahjongwushuang://card/v1/MW-121` |
| MW-122 | 镀锌方杠 | 22 | 技能 | `mahjongwushuang://card/v1/MW-122` |
| MW-124 | 优势在我 | 24 | 技能 | `mahjongwushuang://card/v1/MW-124` |
| MW-125 | 金坷垃 | 25 | 技能 | `mahjongwushuang://card/v1/MW-125` |
| MW-126 | 管中窥牌 | 26 | 技能 | `mahjongwushuang://card/v1/MW-126` |
| MW-127 | ELO机制 | 27 | 技能 | `mahjongwushuang://card/v1/MW-127` |
| MW-128 | 立直禁止 | 28 | 技能 | `mahjongwushuang://card/v1/MW-128` |
| MW-129 | Ctrl + Z | 29 | 技能 | `mahjongwushuang://card/v1/MW-129` |
| MW-130 | 名刀司命 | 30 | 技能 | `mahjongwushuang://card/v1/MW-130` |
| MW-131 | 辉月 | 31 | 技能 | `mahjongwushuang://card/v1/MW-131` |
| MW-132 | 大东亚共荣 | 32 | 技能 | `mahjongwushuang://card/v1/MW-132` |
| MW-133 | 打卡啦摸多 | 33 | 技能 | `mahjongwushuang://card/v1/MW-133` |
| MW-134 | 门前积雪 | 34 | 技能 | `mahjongwushuang://card/v1/MW-134` |
| MW-135 | 终极奉献 | 35 | 技能 | `mahjongwushuang://card/v1/MW-135` |
| MW-136 | 急速狂飙 | 36 | 技能 | `mahjongwushuang://card/v1/MW-136` |
| MW-137 | 恭喜发财 | 37 | 技能 | `mahjongwushuang://card/v1/MW-137` |
| MW-139 | 熠熠生辉 | 39 | 技能 | `mahjongwushuang://card/v1/MW-139` |
| MW-140 | 刹那旅程 · 普通技能 | 40 | 技能 | `mahjongwushuang://card/v1/MW-140` |
 
## 扫码行为与权限

普通卡和神卡在前台对局进入技能准备。主机选择合法操作者，手机使用绑定身份；扫描不自动发动、扣代价或结算。关闭无双、本局结束、夜间禁用等仍受原校验限制。

断序/宿星从App外部NDEF唤起时可进入播放器；前台对局仍走技能。005/006仅音乐身份，不进入普通刹那发动；140走普通技能。公开包不含私人歌曲，缺音源提示为预期。私人005/006均默认二代特别图；公开表保留可公开的旧特别图回退。

本机删卡、改名或custom碰撞不会改变已发行身份；未登记本机卡没有虚构代码。识别要求固定skillId+skillName且非custom。扫码页不接受标签提供任意命令、用户身份、媒体URL或分数。历史UID绑定资料仍保留，不作为主路由。

## 维护与验证

主表 data/nfc-card-registry.json；严格识别 lib/nfc-registry.ts；只读查询/最小导出 lib/nfc-code-catalog.ts；页面 app/components/nfc-code-library.tsx；原路由 nfc-launcher.tsx / nfc-card-scanner.tsx。新增代码同步测试、revision与本文，禁止仅在UI写死代码。

私人媒体从隔离旧包按skillId/action/变体合并到新表，不能复制旧表覆盖新编号。006的aliasOf是查询页兼容提示，严格URI仍单独登记006。代码表导出不含私人媒体路径或用户对局资料。

测试与打包细节见[AI维护教程](AI-MAINTENANCE.md)。桌面桥接/页面检查不等于Android实机贴卡验收；外部唤起、读写工具、前后台及多设备仍需真机核对。
