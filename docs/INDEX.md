# 目录与文档索引

本机工作区固定为Documents/Codex/mahjong-wushuang。先读其00-接手入口.md和CURRENT.json；本仓库是其中source-public。若你是在其他电脑独立克隆此Git仓库，则按android-delivery-pipeline.md创建工程外本地配置，不假定存在维护者的本机目录。

当前源码与公开GitHub工程是同一份仓库；本地未提交修改不等于GitHub已发布。私人输入、签名、构建产物均在仓库外。本机源码已物理迁入固定工作区，历史旧路径不再是构建或备份恢复依赖，不要据此新建第二份源码。

| 问题 | 现行文档 |
|---|---|
| 技能库、表情、角色的增删改与用户数据边界 | [AI维护教程](AI-MAINTENANCE.md) |
| 构建、校验、媒体和错误定位 | [统一Android管线](android-delivery-pipeline.md) |
| NFC编号和兼容 | [NFC代码](nfc-card-codes.md) |
| 本地单机供牌、人机模式、开局设置与暂停 | [本地虚拟麻将](local-virtual-play.md) |
| 表情与本机素材库 | [表情库](emote-library.md)、[表情添加](../data/EMOTES.md) |
| 技能卡维护（AI 单入口） | [SKILLS.md](../data/SKILLS.md) |
| 技能演出机制 | [技能体验](skill-experience.md)、[音乐播放器](music-player.md) |
| 历史实现与视觉修改依据 | beta编号、日期编号文档，仅按对应版本解释 |

本机当前状态、真实绝对路径、安装包哈希、遗留项与存储规则统一放在固定工作区入口中；本仓库说明保持可移植，不把私人文件或维护者本机配置提交GitHub。
