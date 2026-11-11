---
description: "用于桌面侧栏标识、侧栏名称、空白首页标识与会话 frame 的企业客户端品牌。"
kind: "package-reference"
---

# @dsh-enterprise/dsh-enterprise-ui-brand

[English](README.md) | 中文

## 概述

使用配置的产品名和派生首字母标识为桌面客户端提供品牌。本包填充侧栏标识与名称、空白首页品牌标识，以及一个不改变布局的会话 frame 层。企业 bundle 替换 `ui-brand-official` 时使用本包；公共 Web profile 继续使用官方素材。

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

停用官方品牌包后挂载该 client 配置行。

### 最小配置

```yaml
- id: ui-brand-enterprise
  name: '@dsh-enterprise/dsh-enterprise-ui-brand'
```

浏览器构建必须把 `DSH_CLIENT_TITLE` 设置为产品名。插件使用该公开值生成可见文本和首字母。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

声明感知的 slot 注入把侧栏占用者作为一个回滚单元安装。首屏标识与 frame 是独立占用者。Node 半部保持无行为，只用于 Loader 发现。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | slot 注册与生命周期 |
| [`src/client/Brand.tsx`](src/client/Brand.tsx) | 标识、文字标识与 frame 组件 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [企业包组](../README.zh.md)——相邻包职责。
- [官方品牌包](../../client/ui-brand-official/README.zh.md)——本包替换的 slot 填充参考。
- [侧栏](../../client/ui-sidebar/README.zh.md)——侧栏品牌槽位。
- [会话](../../client/ui-conversation/README.zh.md)——首屏标识与 frame 契约。

-----

<a id="model-experience"></a>
## 模型体验

无，因为浏览器侧品牌占用者只渲染产品标识，不增加模型输入或 Session 事件。

#### KV Cache effect

无；它不改变请求前缀。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **标识由产品名首字符派生**——需要自定义图形的部署必须增加包素材并替换组件标识。
- **`DSH_CLIENT_TITLE` 为必需值**——没有公开产品名的客户端构建会在占用者渲染时失败。
- **frame 不改变布局**——它不安装装饰动画。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
