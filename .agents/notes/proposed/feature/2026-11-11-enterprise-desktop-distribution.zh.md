# Agent Note: 企业品牌桌面发行版

Status: proposed

[English](2026-11-11-enterprise-desktop-distribution.md) | 中文

## Problem

桌面发行版需要使用发行方自己的产品标识、企业用户名密码登录，并通过 OpenAI 兼容的企业代理发送模型请求。会话继续保存在本地。实现还必须保留合并 DeepSeek Harness 上游更新的能力，避免反复处理散布在核心包中的改动；当前桌面壳硬编码产品标识，并使用平台专用的浏览器账号流程。

## Proposal

建立一个由私有企业 bundle 支持的薄企业发行分支。保留官方仓库为 `upstream` 远端，将企业行为放在 `packages/enterprise/*` 的私有包中，并且只修改现有的桌面发行入口。企业 bundle 叠加在 `dsh-base` 和 `dsh-web-app` 之后，因此可以替换配置行而无需修改声明这些行的包。

### Repository ownership

企业 bundle 提供一个带版本的发行清单，用于保存产品名、公司名、应用 ID、可执行文件名、URL 协议、图标、欢迎页素材、安装器字符串、企业服务 URL、模型目录、公开签名身份和更新策略。签名证书与公证凭据仍属于外部机器配置。构建期校验器会在编译或打包前拒绝缺失或冲突的值。

私有包组包含企业 bundle、企业账号 provider 和客户端品牌插件。bundle 提供一个有序 patch，用于替换 `deepseek-account`、停用 `llm-deepseek` 和 `llm-deepseek-account` 模型路由、配置 `llm-pi-ai`，并替换 `ui-brand-official`。所有企业包使用发行方私有 npm scope，不进入官方可发布包清单。

### Enterprise login

企业账号 provider 实现现有的 `DeepSeekAccount` 服务。其 `startSignIn` 操作创建一个带随机 nonce、短期期限和回环授权 URL 的一次性登录尝试。现有桌面账号生命周期打开该 URL 并读取返回的账号状态，因此桌面 renderer 不会收到密码或 Token。

Host 从回环 Web 服务器提供本地化用户名密码表单。表单只接受带尝试 nonce 的同源 POST 请求，设置严格的内容安全策略，使用 `cache-control: no-store`，并拒绝被 iframe 嵌入。Host 校验 nonce 和尝试期限，然后向配置的企业登录端点发送一次 HTTPS JSON 请求。

企业登录响应提供长期访问 Token，并可以提供安全的展示身份。provider 仅在登录响应成功后，把访问 Token 保存到凭据引用 `ENTERPRISE_LLM_TOKEN`。它绝不保存密码、授权请求体或企业原始错误响应。取消操作会在任何迟到响应能够提交凭据之前结束该尝试。

登出先删除本地 Token，再尝试配置的企业登出请求；该请求失败时不会恢复凭据。企业服务不提供的账号资料返回空结果。发行清单必须提供两个 HTTPS 账号链接，因为桌面端会校验这两个链接；账号 provider 不伪造 Platform 的资料、余额或奖励数据。

### Model routing

企业 bundle 使用私有 provider 路由名 `enterprise` 配置现有 `llm-pi-ai` 适配器。该路由使用 `api: openai-completions`、企业基础 URL、`apiKeyEnv: ENTERPRISE_LLM_TOKEN` 和企业模型目录。代理也可以支持 `openai-responses`；该协议保持为备选路由配置，不增加另一套流式实现。

默认 agent 模型指向企业路由。聊天、标题生成、压缩、子 agent 和辅助模型调用因此默认使用同一代理，除非部署显式组合另一条路由。官方 DeepSeek 模型行保持停用，缺少或拒绝企业 Token 时不能静默回退到另一 provider。

会话存储、附件存储、工具执行、agent loop 和请求序列化保持不变。企业认证和路由不增加模型可见的提示文本，也不增加新的 Session 事件。

### Branding and packaging

企业客户端插件占用 `ui-brand-official` 使用的侧边栏标识、侧边栏名称、会话主视觉标识和主视觉背景槽位。Web 构建配置选择企业客户端标题。桌面壳本地化从发行清单读取产品名，不再嵌入另一个字面量。

桌面安装包从同一清单读取企业应用 ID、可执行文件名、安装器名称、版权、协议名称、协议 scheme、托盘图标、应用图标、安装器素材和更新源。没有获批企业更新源的构建会禁用自动更新，并且不向官方更新服务发送请求。

企业应用使用独立的 Electron `userData` 目录，以及隔离的 Harness home、日志目录、协议 scheme 和单实例锁。官方 DeepSeek Harness 与企业应用可以同时安装和运行，不共享会话、凭据、设置、浏览器存储或更新器状态。

### Failure handling

登录请求具有明确期限并响应取消。失败通过现有账号登录错误码映射，不暴露原始请求或响应文本。取消、过期、格式错误或失败的登录不会留下凭据。

模型请求沿用现有重试策略处理限流、临时传输故障和服务端错误。认证失败保持为企业路由错误，绝不选择官方 provider。用户可以通过登出并重新登录替换被拒绝的长期 Token。

密码、Token、grant payload 以及企业原始请求或响应体绝不进入日志、产品分析、renderer IPC、Session 事件、模型上下文、工具结果或崩溃报告。企业服务 URL 必须使用 HTTPS。只有显式测试配置可以接受回环 HTTP。

### Data flow

登录表单把凭据提交给 Desktop Host。Host 与企业身份服务交换凭据，并把 `ENTERPRISE_LLM_TOKEN` 写入本地凭据存储。`llm-pi-ai` 为每个模型请求解析该引用，并将它作为 Bearer 凭据发送给企业代理。返回的模型流沿用现有 pi-ai 转换路径，并把普通事件追加到本地 Session 日志。

桌面壳在启动和打包时读取发行清单。企业 bundle 从经过校验的私有配置读取服务地址、模型元数据和品牌 URL。客户端品牌插件读取构建期素材和本地化产品文本；它自身不发送企业请求。

### Testing

单元测试覆盖发行清单校验、登录表单安全响应头、nonce 和尝试期限、取消竞态、HTTPS 强制、凭据提交顺序、登出顺序，以及凭据和响应体的脱敏。

真实 Loader composition 测试针对测试拥有的企业假服务挂载企业 bundle、`llm-pi-ai` 和本地 JSONL 持久化。测试验证登录请求、凭据持久化、带 Bearer Token 的 `/v1/chat/completions` 模型请求、产生的 Session 事件，以及官方 provider 路由不存在。无密钥录制的 Session snapshot 覆盖企业 profile 下的一轮模型调用和工具调用。

桌面测试验证生成的产品标识、隔离的应用和 Harness 路径、协议注册、安装器字符串、官方更新流量已禁用，以及能够与官方应用同时安装。UI 检查覆盖登录和企业外壳的浅色、深色、加载、失败、禁用和长文案状态；录制的交互演示覆盖实际登录和模型流程。

企业 staging e2e 在端点和测试凭据可用时运行，否则以明确原因 self-skip。打包验证运行聚焦测试、构建产物与构建检查、lint、文档同步，以及 Windows 和 macOS 桌面 smoke。

### Upstream merge strategy

企业分支合并 `upstream/master`，而不对已发布的企业历史执行 rebase。企业提交把自定义实现保留在 `packages/enterprise/*`，只修改桌面壳必须读取发行清单或加载企业 bundle 的现有上游文件。

受检允许清单记录企业分支可以修改的每个上游文件。仓库检查将企业分支与来自 `upstream/master` 的 merge base 比较，并拒绝企业包组和允许清单之外的上游路径改动。这样可以在发布前阻止对核心文件的意外修改。

## Alternatives considered

**只使用配置和 API Key 表单。** 这种方式不需要登录插件，但无法提供所需的用户名密码流程，并把 Token 获取工作转嫁给用户。

**编写专用企业 LLM adapter。** 这会重复实现 `llm-pi-ai` 已提供的 OpenAI 兼容序列化、流式响应、工具调用、重试和图片行为，同时增加实现风险和上游兼容工作。

**围绕官方 Web profile 构建独立 Electron 应用。** 这种方式隔离品牌和认证，但需要独立维护托盘、窗口、更新器、安装器、签名、IPC 和桌面安全行为。

**先向上游提交通用白标和用户名密码支持。** 这可能减少未来差异，但依赖上游产品决策，无法独立交付所需企业发行版。

## Acceptance criteria

全新安装显示配置的企业品牌，接受企业用户名密码，并在登录成功后打开工作区。请求结束后，密码不会出现在磁盘、日志、Session 数据、产品分析或 renderer 状态中。

有效的已保存 Token 在重启后无需再次登录即可打开工作区。缺少或被拒绝的 Token 阻止模型请求，并且绝不调用官方 provider。

聊天请求只到达配置的企业 OpenAI 兼容端点，并携带已保存的 Bearer Token。其助手流和工具调用持久化到普通本地 Session 日志，现有本地 Session 在重启后仍可读取。

企业应用拥有自己的应用 ID、协议、用户数据目录、Harness home、安装标识，以及已禁用或仅企业可用的更新策略。它可以与官方应用同时安装，不共享可写状态。

企业登出在观察到任何远端登出结果之前删除本地 Token。取消或失败的登录使应用保持登出状态。

企业分支不修改上游核心包，只修改允许清单中的桌面发行文件。上游触点检查、企业单元和 composition 测试、无密钥 snapshot、桌面打包测试、文档检查以及可用的企业 staging e2e 全部通过。

## Risks

本地凭据文件可以防御其他操作系统用户，但不能防御以同一用户运行的进程，包括 agent 工具。若部署要求长期 Token 与 agent 隔离，需要使用操作系统凭据存储 provider，而不是文件后端。

企业 Token 没有刷新流程。Token 轮换或服务端撤销后，用户需要在现有请求错误识别出认证失败后重新登录。

不同网关的 OpenAI 兼容程度不同。工具调用流、推理控制、图片支持、用量报告和输出上限都需要针对企业 staging 服务进行验收。

产品标识仍有一部分嵌入桌面安装和本地化代码。发行清单减少新增字面量并集中保存取值，但上游桌面改动仍可能引入另一个产品专用默认值，合并允许清单和桌面测试必须暴露这种变化。

生产发行需要企业控制的签名证书、公证凭据、HTTPS 更新源和受信发布基础设施。缺少这些输入的构建只能作为开发或未签名验收产物。

企业登录页和模型代理会成为安全敏感的内部控制服务。弱 TLS、宽松 CORS、代理记录 Token 或缓慢的认证端点，都可能在本地处理正确的情况下泄露凭据或阻塞桌面登录流程。
