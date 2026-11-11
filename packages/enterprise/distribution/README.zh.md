---
description: "在构建或启动前校验企业桌面产品、端点、模型目录、品牌与更新配置。"
kind: "package-library"
---

# @dsh-enterprise/dsh-enterprise-distribution

[English](README.md) | 中文

## 概述

调用方在打包或启动前校验一份企业桌面清单。成功时返回分离的配置，包含原生应用标识、企业认证、OpenAI 兼容模型代理、素材路径、profile bundle 与更新模式。无效 URL、官方应用标识、重复或缺失模型、不安全目录名与官方更新源会在桌面应用使用文件前失败。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把解析后的清单 JSON 传给 `parseEnterpriseDistribution()`。返回对象携带规范化后的超时默认值与完整模型列表。

```ts
import { parseEnterpriseDistribution } from '@dsh-enterprise/dsh-enterprise-distribution'

declare const value: unknown
const distribution = parseEnterpriseDistribution(value)
console.log(distribution.model.defaultModel)
```

格式错误的值会抛出。除测试清单显式启用回环 HTTP 外，认证与推理 URL 必须使用 HTTPS。品牌路径保持相对字符串；打包流程负责文件存在性与目录包含校验。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Zod 校验不受信任的 JSON 结构。第二阶段校验 URL origin 与路径，拒绝官方应用标识和更新主机，检查模型 id 唯一，并要求默认模型存在。运行时不会读取文件或访问企业服务。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 清单 schema 与语义校验 |
| [`src/types.ts`](src/types.ts) | 公共配置类型 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [企业包组](../README.zh.md)——相邻企业包。
- [企业发行设计](../../../.agents/notes/implemented/feature/2026-11-11-enterprise-desktop-distribution.zh.md)——桌面集成与安全决策。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **本包不打开品牌文件**——桌面打包适配器负责路径解析、常规文件检查与目录包含检查。
- **清单不携带秘密**——企业 Token 保留在 Host 凭据存储中，签名凭据保留为机器配置。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
