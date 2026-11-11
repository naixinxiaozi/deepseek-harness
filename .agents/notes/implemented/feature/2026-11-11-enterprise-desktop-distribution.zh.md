# Agent Note: 企业品牌桌面发行版

Status: implemented

[English](2026-11-11-enterprise-desktop-distribution.md) | 中文

## Problem

桌面发行版需要自己的产品标识、企业用户名密码登录和 OpenAI 兼容企业模型代理，同时保留本地 Session。实现必须把企业行为隔离在核心包之外，以便继续合并官方 DeepSeek Harness 更新；此前桌面产品标识和账号流程是硬编码的。

## Decision

企业发行版是由 `packages/enterprise/` 私有包、经过校验的发行清单和小型桌面发行适配器组成的薄分支。未提供企业清单时，官方桌面产品仍是回退路径。

### Packages and composition

`@dsh-enterprise/dsh-enterprise-distribution` 校验产品标识、服务端点、模型目录、品牌路径和更新模式。`@dsh-enterprise/dsh-enterprise-account` 拥有企业登录。`@dsh-enterprise/dsh-enterprise` 是 profile bundle，`@dsh-enterprise/dsh-enterprise-ui-brand` 提供客户端品牌。

企业 bundle 叠加在 `dsh-base` 与 `dsh-web-app` 之后。它停用 `deepseek-account`、`llm-deepseek`、`llm-deepseek-account` 与 `ui-brand-official`；插入 `enterprise-account`；在 `llm-pi-ai` 上配置 `enterprise` 路由；把 `agent-default-model` 指向该路由；并插入 `ui-brand-enterprise`。

私有桌面 Host 将企业 bundle 声明为依赖，因此桌面 runtime 包集包含该 bundle。桌面 profile 加载使用生成的 runtime 根 manifest 作为安装锚点，使 bundle 及其依赖可见，而不把企业包加入公共 CLI 闭包。

### Enterprise login

`EnterpriseAccount` 实现现有 `DeepSeekAccount` 服务。`startSignIn` 创建带随机 nonce、期限和回环 URL 的一次性 Host 路由。现有桌面账号生命周期打开该 URL，因此 renderer 不会收到密码或 Token。

Host 提供无脚本的本地化表单。它只接受有界 URL 编码 POST，校验 nonce 和可选 Origin，设置 CSP 与 `no-store` 响应头，并拒绝 framing。Host 随后通过 HTTPS 将配置的 JSON 字段发送给企业登录端点。

企业响应通过可配置点分字段提供一个长期 Token。provider 仅在响应成功后把 Token 保存到 `ENTERPRISE_LLM_TOKEN`。取消与 disposal 会中止在途操作并移除尝试路由。登出先删除本地 Token，再执行远端撤销；撤销失败不会恢复凭据。

### Model routing

私有 profile 使用 provider `enterprise`、`api: openai-completions`、企业基础 URL、`apiKeyEnv: ENTERPRISE_LLM_TOKEN` 和清单模型目录配置 `llm-pi-ai`。`openai-responses` 仍是 pi-ai 支持的可选协议配置，但默认不选择。

聊天、标题生成、压缩、subagent 与辅助模型调用默认使用企业路由。官方模型路由已停用，因此缺少或被拒绝的企业凭据不能回退到 DeepSeek。

Session 持久化、附件、工具、agent loop 和请求序列化保持不变。真实 Loader 一轮请求验证企业 Bearer 请求、助手输出、本地 Session 持久化，以及 Token 不出现在 Session 事件中。

### Branding and packaging

桌面构建把 `DSH_DESKTOP_DISTRIBUTION` 读取为绝对清单路径。清单和所有品牌素材必须位于其目录下。`electron-builder` 从清单读取应用 ID、产品名、版权、协议名称与 scheme、图标、安装器侧栏和更新模式。

企业应用设置独立 Electron `userData` 根与 Harness home，使用自己的协议 scheme，并在更新禁用时省略自动与强制更新策略。桌面壳本地化把官方产品名替换为配置名称，欢迎页标识、应用名、菜单、About 面板、托盘文案、安装器字符串和 smoke 路径都跟随该发行身份。

客户端品牌包填充侧栏标识与名称、空白首页标识以及首屏 frame。它渲染配置的 `DSH_CLIENT_TITLE` 和产品名首字母。欢迎页以文本渲染本地化产品名，不再依赖官方文字标识素材。

### Security and failure handling

密码以及企业原始请求或响应体绝不进入日志、产品分析、renderer IPC、Session 事件、模型上下文、工具结果或崩溃报告。企业 URL 要求 HTTPS；回环 HTTP 需要显式测试配置。

登录失败使用现有账号安全错误类别。模型重试仍由现有 LLM retry policy 拥有。认证失败保持为企业路由错误，绝不选择官方 provider。

### Upstream merge guard

`pnpm run verify-enterprise-touchpoints --base <ref>` 将当前分支与 base 合并点比较，并拒绝 `scripts/enterprise/upstream-touchpoints.json` 之外的上游路径改动。只有企业包、测试、发行设计记录和明确的桌面集成文件可以新增或修改。

## Alternatives considered

**只使用配置和 API Key 表单。** 这移除登录插件，但无法提供用户名密码认证。

**编写专用企业 LLM adapter。** 这会重复实现 `llm-pi-ai` 已维护的 OpenAI 兼容传输、流式响应、工具调用、重试和图片行为。

**围绕官方 Web profile 构建独立 Electron 应用。** 这隔离更多源码，但需要独立维护窗口、托盘、更新器、安装器、签名、IPC 和桌面安全。

**先向上游提交通用白标与用户名密码支持。** 这可减少未来差异，但依赖上游产品决策，无法独立交付企业发行版。

## Testing

单元测试覆盖清单校验、URL 限制、字段与 Token 映射、拒绝时不泄露响应体、登录页响应头与转义、账号取消、凭据提交顺序、Token 解析、企业路径隔离、本地化替换、安装器品牌和上游路径策略。

真实 Loader composition 测试使用 `headless`、`llm-pi-ai`、credentials、本地 JSONL 持久化和自有 OpenAI 兼容 SSE 服务。它验证 Bearer 请求、`northstar-chat` 模型、助手输出、持久 Session 查找，以及 Token 不在 Session 事件中。

`build:artifacts`、桌面壳 bundle 和 `build:check` 在当前 checkout 通过。`test:docs` 通过。广泛 `test:gui` 运行通过 13,089 个测试，并报告四个与本次无关的既有环境失败：两个 HTTP 计时测试、一个 Windows symlink 权限测试和一个包子进程超时。

企业 staging e2e 由 `ENTERPRISE_E2E_*` 变量控制；端点或测试凭据缺失时 self-skip。

## Consequences

企业行为集中在私有包和小型桌面发行适配器中。企业模式有意停用官方模型与账号路由，并且没有自动回退。

长期 Token 没有刷新流程。轮换需要登出并重新登录。文件凭据存储只允许当前 OS 用户访问，但同一用户下的进程（包括 agent 工具）仍可读取。

仓库尚未包含无密钥录制的企业 Session snapshot 或合格的企业 staging 运行。生产图标素材、签名证书、公证、更新托管、安装产物验收以及最终 Windows/macOS 视觉验收都是当前 checkout 外部的发布输入。

客户端标识目前由产品名首字符派生。需要精确 Logo 图形的发行方必须替换组件图形，同时保留 slot 和构建期标题。
