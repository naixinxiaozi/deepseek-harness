---
description: "在企业桌面应用中替换官方账号、模型与客户端品牌配置行的私有 profile 层。"
kind: "package-bundle"
---

# @dsh-enterprise/dsh-enterprise

[English](README.md) | 中文

## 概述

企业桌面 profile 增加一个私有层，移除官方 DeepSeek 账号与模型路由，插入企业用户名密码登录，将 `llm-pi-ai` 路由到企业代理，并安装企业客户端品牌。桌面发行只在使用企业应用标识时选择该 bundle，因此不要求通过公共 profile 安装。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 安装到 profile

本包是私有包，不从公共 npm registry 安装。桌面发行在 profile bundle 列表中把 `@dsh-enterprise/dsh-enterprise` 放在 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 之后。

### 获得的能力

该层停用 `deepseek-account`、`llm-deepseek`、`llm-deepseek-account` 与 `ui-brand-official`。它插入 `enterprise-account`，在 `llm-pi-ai` 上配置 `enterprise` provider，把 `agent-default-model` 指向该路由，并插入 `ui-brand-enterprise`。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

桌面发行清单产生的 Host 环境值驱动配置行。模型元数据编码为 `llm-pi-ai` 路由目录。企业账号与品牌包分别拥有其运行时行为。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | 有序配置行停用与插入 |
| [`src/index.ts`](src/index.ts) | bundle 清单要求的无行为包入口 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [企业包组](../README.zh.md)——相邻账号、发行与品牌包。
- [Profile 组合](../../boot/app-boot/README.zh.md#profiles)——bundle 层顺序与 patch 优先级。
- [pi-ai 适配器](../../llm/llm-pi-ai/README.zh.md)——本层使用的 OpenAI 兼容模型路由。

-----

<a id="model-experience"></a>
## 模型体验

间接地，通过企业账号与 `llm-pi-ai` 配置行；这些行拥有模型可见认证效果、请求与输出。

#### KV Cache effect

该层改变活动 provider 路由；企业 provider 的请求构造决定缓存复用。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **patch 要求发行环境值**——没有桌面端提供的模型与服务环境时，直接启动 profile 是不完整的。
- **只配置一条 provider 路由**——切换到 `openai-responses` 需要替换发行清单的 `model.api`。
- **bundle 有意停用官方路由**——企业服务失败时不存在自动 provider 回退。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
