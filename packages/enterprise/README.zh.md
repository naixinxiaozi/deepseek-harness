---
description: "用于企业品牌桌面构建的私有发行包与企业适配器。"
kind: "package-group"
---

# enterprise/ — 企业品牌桌面发行包

[English](README.md) | 中文

## 概述

本组把企业特有行为保留在官方运行时包之外，提供经过校验的发行配置、企业登录 provider、替换官方账号与模型配置行的 profile bundle，以及私有客户端品牌。官方包仍使用 `@deepseek-ai` scope；这些私有包使用 `@dsh-enterprise`，只随企业品牌桌面构建发布。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)
- [开发备注](#dev-note)

-----

<a id="packages"></a>
## 包

| 包 | 职责 |
|---|---|
| [`distribution`](distribution/README.zh.md) | 校验产品标识、企业服务端点、模型目录、品牌路径与更新模式 |

<a id="related-documentation"></a>
## 相关文档

- [桌面应用](../../apps/desktop/README.zh.md)——加载企业清单并负责原生打包。
- [企业发行设计](../../.agents/notes/proposed/feature/2026-11-11-enterprise-desktop-distribution.zh.md)——所有权与安全决策。

<a id="dev-note"></a>
## 开发备注

无。
