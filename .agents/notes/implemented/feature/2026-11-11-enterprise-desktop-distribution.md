# Agent Note: enterprise-branded desktop distribution

Status: implemented

English | [中文](2026-11-11-enterprise-desktop-distribution.zh.md)

## Problem

The Desktop distribution needs its own product identity, enterprise username-and-password login, and an OpenAI-compatible enterprise model proxy while retaining local Sessions. The implementation must keep enterprise behavior out of core packages so official DeepSeek Harness updates remain mergeable, despite Desktop product identity and account flow having previously been hardcoded.

## Decision

The enterprise distribution is a thin fork composed from private packages under `packages/enterprise/`, a validated distribution manifest, and a small Desktop distribution adapter. The official Desktop product remains the fallback when no enterprise manifest is supplied.

### Packages and composition

`@dsh-enterprise/dsh-enterprise-distribution` validates product identity, service endpoints, the model catalog, branding paths, and update mode. `@dsh-enterprise/dsh-enterprise-account` owns enterprise login. `@dsh-enterprise/dsh-enterprise` is the profile bundle, and `@dsh-enterprise/dsh-enterprise-ui-brand` supplies client branding.

The enterprise bundle layers after `dsh-base` and `dsh-web-app`. It disables `deepseek-account`, `llm-deepseek`, `llm-deepseek-account`, and `ui-brand-official`; inserts `enterprise-account`; configures the `enterprise` route on `llm-pi-ai`; points `agent-default-model` at that route; and inserts `ui-brand-enterprise`.

The Desktop runtime package set includes the enterprise bundle because the private Desktop Host declares it as a dependency. Desktop profile loading uses the generated runtime-root manifest as its installation anchor, making the bundle and its dependencies visible without adding enterprise packages to the public CLI closure.

### Enterprise login

`EnterpriseAccount` implements the existing `DeepSeekAccount` service. `startSignIn` creates a one-time Host route with a random nonce, a deadline, and a loopback URL. The existing Desktop account lifecycle opens that URL, so the renderer never receives the password or token.

The Host serves a script-free localized form. It accepts only bounded URL-encoded POST input, validates the nonce, validates a supplied Origin value, sets CSP and `no-store` headers, and refuses framing. The Host then sends the configured JSON fields to the enterprise login endpoint over HTTPS.

The enterprise response provides one long-lived token using a configurable dot-separated token field. The provider stores the token under `ENTERPRISE_LLM_TOKEN` only after the response succeeds. Cancellation and disposal abort in-flight work and remove the attempt route. Sign-out removes the local token first and performs remote revocation without restoring the credential when revocation fails.

### Model routing

The private profile configures `llm-pi-ai` with provider `enterprise`, `api: openai-completions`, an enterprise base URL, `apiKeyEnv: ENTERPRISE_LLM_TOKEN`, and the manifest model catalog. `openai-responses` remains a supported pi-ai protocol configuration but is not selected by default.

Chat, title generation, compaction, subagents, and auxiliary model calls use the enterprise route by default. The official model routes are disabled, so an absent or rejected enterprise credential cannot fall back to DeepSeek.

Session persistence, attachments, tools, the agent loop, and request serialization remain unchanged. A real Loader turn verifies the enterprise Bearer request, assistant output, local Session persistence, and absence of the token from Session events.

### Branding and packaging

The Desktop build reads `DSH_DESKTOP_DISTRIBUTION` as an absolute manifest path. The manifest and every branding asset must remain beneath its directory. `electron-builder` takes application ID, product name, copyright, protocol name and scheme, icons, installer sidebar, and update mode from the manifest.

The enterprise application sets an isolated Electron `userData` root and Harness home, uses its own protocol scheme, and omits automatic and mandatory update policy when updates are disabled. Shell localization replaces the official product name with the configured name, and the welcome mark, application name, menu labels, About panel, tray labels, installer strings, and smoke-test paths follow that distribution identity.

The client brand package fills sidebar mark and name, blank-home mark, and hero frame slots. It renders the configured `DSH_CLIENT_TITLE` and a product-name initial. The welcome page renders the localized product name as text, so it no longer depends on the official wordmark asset.

### Security and failure handling

Passwords and raw enterprise request or response bodies never enter logs, analytics, renderer IPC, Session events, model context, tool results, or crash reports. Enterprise URLs require HTTPS; loopback HTTP requires explicit test configuration.

Login failures use existing account-safe error categories. Model retries remain owned by the existing LLM retry policy. Authentication failure remains an enterprise-route error and never selects an official provider.

### Upstream merge guard

`pnpm run verify-enterprise-touchpoints --base <ref>` compares the current branch with the base merge point and rejects changed upstream paths outside `scripts/enterprise/upstream-touchpoints.json`. Enterprise packages, tests, the distribution design record, and explicit Desktop integration files are the only accepted additions or edits.

## Alternatives considered

**Use only configuration and an API-key form.** This removes the login plugin but cannot provide username-and-password authentication.

**Write a dedicated enterprise LLM adapter.** This duplicates OpenAI-compatible transport, streaming, tool calls, retries, and image behavior already maintained by `llm-pi-ai`.

**Build a separate Electron application around the official Web profile.** This isolates more source, but requires independent maintenance of windows, tray behavior, updater, installer, signing, IPC, and Desktop security.

**Submit generic white-label and username-password support upstream first.** This can reduce future differences, but depends on upstream product decisions and does not independently deliver the enterprise distribution.

## Testing

Unit tests cover manifest validation, URL restrictions, field and token mapping, rejections without body leakage, login-page headers and escaping, account cancellation, credential commit ordering, token resolution, enterprise path isolation, locale replacement, installer branding, and upstream path policy.

The real Loader composition test uses `headless`, `llm-pi-ai`, credentials, local JSONL persistence, and an owned OpenAI-compatible SSE server. It verifies the Bearer request, `northstar-chat` model, assistant output, persisted Session lookup, and token absence from Session events.

`build:artifacts`, the Desktop shell bundle, and `build:check` pass on this checkout. `test:docs` passes. The broad `test:gui` run passed 13,089 tests and reported four environment-dependent failures in unrelated existing tests: two HTTP timing tests, one Windows symlink permission test, and one package subprocess timeout.

An enterprise staging e2e exists behind `ENTERPRISE_E2E_*` variables. It self-skips when the endpoint or test credentials are absent.

## Consequences

Enterprise behavior is concentrated in private packages and a small Desktop distribution adapter. Official model and account routes are unavailable in enterprise mode by design, and there is no automatic fallback.

The long-lived token has no refresh flow. Rotation requires sign-out and sign-in. The file-backed credential store is owner-only but remains readable by processes under the same OS user, including agent tools.

The repository does not yet contain a keyless recorded enterprise Session snapshot or a qualified enterprise staging run. Production icon assets, signing certificates, notarization, update hosting, installed-artifact qualification, and final Windows/macOS visual acceptance are release inputs not present in this checkout.

The client mark currently derives from the first product-name character. A distributor requiring exact logo artwork must replace the component artwork while preserving its slots and build-time title.
