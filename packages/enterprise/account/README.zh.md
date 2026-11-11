---
description: "为企业品牌桌面构建提供用户名密码登录、Host 本地表单和长期 Token 存储。"
kind: "package-reference"
---

# @dsh-enterprise/dsh-enterprise-account

[English](README.md) | 中文

## 概述

使用企业用户名和密码登录品牌桌面工作区。Host 提供本地表单，通过 HTTPS 交换密码，并且只在 `ENTERPRISE_LLM_TOKEN` 下保存返回的长期 Token。密码不会持久化。企业服务负责认证时选择本 provider；需要原平台 OAuth 端点时使用官方平台账号 provider。

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

用它替代 `dsh-deepseek-account-platform`，并配置私有企业端点。

### 最小配置

```yaml
- id: enterprise-account
  name: '@dsh-enterprise/dsh-enterprise-account'
  config:
    productName: Northstar Harness
    loginUrl: https://services.northstar.example/auth/login
    logoutUrl: https://services.northstar.example/auth/logout
    usageUrl: https://services.northstar.example/usage
    topUpUrl: https://services.northstar.example/top-up
    inferenceOrigin: https://services.northstar.example
    usernameField: username
    passwordField: password
    tokenField: access_token
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `productName` | 必需 | Host 登录页显示的产品名 |
| `loginUrl` | 必需 | 企业 JSON 登录端点 |
| `logoutUrl` | 缺省 | 可选企业 Token 撤销端点 |
| `usageUrl` | 必需 | HTTPS 账号用量页面 |
| `topUpUrl` | 必需 | HTTPS 账号充值页面 |
| `inferenceOrigin` | 必需 | 允许接收 Token 的精确 origin |
| `usernameField` | `username` | JSON 登录请求的用户名字段 |
| `passwordField` | `password` | JSON 登录请求的密码字段 |
| `tokenField` | `access_token` | 登录响应 Token 的点分路径 |
| `allowLoopbackHttp` | `false` | 只允许回环测试服务使用 HTTP |
| `requestTimeoutMs` | `30000` | 单次企业 HTTP 请求期限 |
| `attemptTimeoutMs` | `600000` | 浏览器登录尝试的最长生命周期 |

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

`startSignIn` 在 Host Web 服务器上创建一次性路由、nonce 和期限。Host 渲染不含脚本的表单，只接受有界同源 POST。交换成功后先写入凭据引用，再发布已登录状态。取消操作会中止交换并移除路由。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 账号服务、登录生命周期、Token 引用与登出 |
| [`src/protocol.ts`](src/protocol.ts) | 有界企业登录与登出请求 |
| [`src/login-page.ts`](src/login-page.ts) | 本地化无脚本表单与安全响应头 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [企业发行清单](../distribution/README.zh.md)——在启动前校验同一组端点。
- [DeepSeek 账号服务](../../credentials/deepseek-account/README.zh.md)——共享账号服务契约。
- [凭据](../../credentials/credentials-local/README.zh.md)——本地 Token 存储与引用优先级。

-----

<a id="model-experience"></a>
## 模型体验

无；企业凭据只影响 HTTP 认证，绝不进入模型提示词、Session 日志或工具结果。

#### KV Cache effect

模型请求前缀不变。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **Token 没有刷新流程**——轮换或服务端撤销后需要重新登录。
- **文件凭据存储可由同一用户读取**——要求与 Agent 隔离的部署需要操作系统凭据存储 provider。
- **认证期间登录服务必须可访问**——桌面端无法用离线凭据创建 Token。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
