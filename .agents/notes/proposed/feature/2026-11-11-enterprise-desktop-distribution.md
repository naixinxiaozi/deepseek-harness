# Agent Note: enterprise-branded desktop distribution

Status: proposed

English | [中文](2026-11-11-enterprise-desktop-distribution.zh.md)

## Problem

The Desktop distribution must carry the distributor's product identity, use an enterprise username-and-password login, and route model requests through an OpenAI-compatible enterprise proxy. Sessions remain local. The implementation must preserve the ability to merge upstream DeepSeek Harness changes without repeatedly resolving edits spread through core packages, while the current Desktop shell hardcodes product identity and replaces the account workflow with a platform-specific browser flow.

## Proposal

Create a thin enterprise distribution branch backed by a private enterprise bundle. Keep the official repository as an `upstream` remote, place enterprise behavior in private packages under `packages/enterprise/*`, and limit edits to existing Desktop distribution entry points. The enterprise bundle layers after `dsh-base` and `dsh-web-app`, so it can replace rows without changing the packages that declare them.

### Repository ownership

A versioned distribution manifest supplied by the enterprise bundle owns product name, company name, application ID, executable name, URL scheme, icons, welcome artwork, installer strings, enterprise service URLs, model catalog, public signing identity, and update policy. Signing certificates and notarization credentials remain external machine configuration. A build-time validator rejects missing or conflicting values before compilation or packaging.

The private package group contains an enterprise bundle, an enterprise account provider, and a client branding plugin. The bundle contributes one ordered patch that replaces `deepseek-account`, disables `llm-deepseek` and `llm-deepseek-account` model routes, configures `llm-pi-ai`, and replaces `ui-brand-official`. All enterprise packages use the distributor's private npm scope and remain outside publishable official package lists.

### Enterprise login

The enterprise account provider implements the existing `DeepSeekAccount` service. Its `startSignIn` operation creates a one-time attempt with a random nonce, a short deadline, and a loopback authorization URL. The existing Desktop account lifecycle opens that URL and follows the resulting account state, so the Desktop renderer does not receive a password or token.

The Host serves a localized username-and-password form from the loopback Web server. The form accepts only same-origin POST requests, carries the attempt nonce, sets a restrictive content security policy, uses `cache-control: no-store`, and refuses framing. The Host validates the nonce and attempt lifetime, then sends one HTTPS JSON request to the configured enterprise login endpoint.

The enterprise login response supplies a long-lived access token and may supply safe display identity. The provider stores only the access token under the credential reference `ENTERPRISE_LLM_TOKEN` after the login response succeeds. It never stores the password, authorization request body, or raw enterprise error response. Cancellation settles the attempt before any late response can commit a credential.

Sign-out deletes the local token first and then attempts the configured enterprise logout request without restoring the credential when that request fails. Account details unavailable from the enterprise service return empty results. The distribution manifest requires two HTTPS account links because Desktop validates both links, and the provider does not impersonate Platform profile, balance, or bonus data.

### Model routing

The enterprise bundle configures the existing `llm-pi-ai` adapter with a private provider route named `enterprise`. The route uses `api: openai-completions`, the enterprise base URL, `apiKeyEnv: ENTERPRISE_LLM_TOKEN`, and the enterprise model catalog. The proxy may also support `openai-responses`; that remains an alternate route configuration and does not add another streaming implementation.

The default agent model points to the enterprise route. Chat, title generation, compaction, subagents, and auxiliary model calls therefore use the same proxy unless a deployment explicitly composes another route. Official DeepSeek model rows remain disabled so a missing or rejected enterprise token cannot silently fall back to another provider.

Session storage, attachment storage, tool execution, the agent loop, and request serialization remain unchanged. Enterprise authentication and routing add no model-visible prompt text and no new Session event.

### Branding and packaging

The enterprise client plugin occupies the sidebar mark, sidebar name, conversation hero mark, and hero frame slots used by `ui-brand-official`. Web build configuration selects the enterprise client title. Shell localization receives the product name from the distribution manifest rather than embedding another literal.

The Desktop package uses the enterprise application ID, executable name, installer name, copyright, protocol name, protocol scheme, tray icon, application icons, installer artwork, and update feed from the same manifest. A build without an approved enterprise update feed disables automatic updates and performs no request to the official update service.

The enterprise application uses a unique Electron `userData` directory and an isolated Harness home, log directory, protocol scheme, and single-instance lock. The official DeepSeek Harness and the enterprise application can be installed and run together without sharing sessions, credentials, settings, browser storage, or updater state.

### Failure handling

Login requests have explicit deadlines and observe cancellation. Failures map to the existing account sign-in error codes without exposing raw request or response text. A canceled, expired, malformed, or failed login leaves no credential.

Model requests use the existing retry policy for rate limits, transient transport failures, and server errors. An authentication failure remains an error from the enterprise route and never selects an official provider. The user can sign out and sign in again to replace a rejected long-lived token.

Passwords, tokens, grant payloads, and raw enterprise request or response bodies never enter logs, product analytics, renderer IPC, Session events, model context, tool results, or crash reports. Enterprise service URLs require HTTPS. Loopback HTTP is accepted only through an explicit test configuration.

### Data flow

The login form posts credentials to the Desktop Host. The Host exchanges them with the enterprise identity service and writes `ENTERPRISE_LLM_TOKEN` to the local credential store. `llm-pi-ai` resolves that reference for each model request and sends it as the Bearer credential to the enterprise proxy. The returned model stream follows the existing pi-ai translation path and appends ordinary events to the local Session log.

The Desktop shell reads the distribution manifest during startup and packaging. The enterprise bundle reads service addresses, model metadata, and branding URLs from its validated private configuration. The client branding plugin reads build-time assets and localized product text; it sends no enterprise request of its own.

### Testing

Unit tests cover manifest validation, login-form security headers, nonce and attempt expiry, cancellation races, HTTPS enforcement, credential commit ordering, sign-out ordering, and redaction of credentials and response bodies.

A real Loader composition test mounts the enterprise bundle, `llm-pi-ai`, and local JSONL persistence against an owned fake enterprise service. It verifies the login request, credential persistence, a `/v1/chat/completions` model request with the Bearer token, the resulting Session events, and the absence of official provider routes. A keyless recorded-session snapshot covers one enterprise-profile model turn and tool call.

Desktop tests verify the generated product identity, isolated application and Harness paths, protocol registration, installer strings, disabled official update traffic, and simultaneous installation with the official application. UI inspection covers light and dark themes, loading, failure, disabled, and long-copy states for the login and branded shell; a recorded interaction demonstrates the shipped login and model flow.

An enterprise staging e2e runs when its endpoint and test credential are available and self-skips with an explicit reason otherwise. Packaging verification runs focused tests, artifact build and build checks, lint, documentation synchronization, and the Windows and macOS desktop smokes.

### Upstream merge strategy

The enterprise branch merges `upstream/master` rather than rebasing released enterprise history. Enterprise commits keep custom implementation in `packages/enterprise/*` and change existing upstream files only where the Desktop shell must consume the distribution manifest or load the enterprise bundle.

A checked allowlist records every upstream file the enterprise branch may edit. A repository check compares the enterprise branch with its merge base from `upstream/master` and rejects any changed upstream path outside that allowlist and the enterprise package group. This makes unintended edits to core files fail before release.

## Alternatives considered

**Use only configuration and an API-key form.** This would require no login plugin, but it cannot provide the required username-and-password flow and shifts token acquisition to the user.

**Write a dedicated enterprise LLM adapter.** This duplicates OpenAI-compatible serialization, streaming, tool-call handling, retries, and image behavior already provided by `llm-pi-ai`. It increases both implementation risk and upstream compatibility work.

**Build a separate Electron application around the official Web profile.** This isolates branding and authentication, but requires independent maintenance of the tray, windows, updater, installer, signing, IPC, and Desktop security behavior.

**Submit generic white-label and username-password support to the official repository first.** This could reduce future differences, but it depends on upstream product decisions and cannot deliver the required enterprise distribution independently.

## Acceptance criteria

A fresh installation displays the configured enterprise brand, accepts enterprise username and password, and opens the workspace after a successful login. The password is absent from disk, logs, Session data, analytics, and renderer state after the request settles.

A valid stored token opens the workspace after restart without another login. A missing or rejected token blocks model requests and never calls an official provider.

A chat request reaches only the configured enterprise OpenAI-compatible endpoint with the stored Bearer token. Its assistant stream and tool calls are persisted to the normal local Session log, and existing local Sessions remain readable after restart.

The enterprise application has its own application ID, protocol, user-data directory, Harness home, installer identity, and disabled-or-enterprise-only update policy. It can be installed beside the official application without sharing writable state.

Enterprise sign-out removes the local token before any remote logout result is observed. A canceled or failed login leaves the application signed out.

The enterprise branch changes no upstream core package and changes only allowlisted Desktop distribution files. The upstream-touchpoint check, enterprise unit and composition tests, keyless snapshot, Desktop packaging tests, documentation checks, and available enterprise staging e2e pass.

## Risks

The local credential file protects against other operating-system users but not against processes running as the same user, including agent tools. A deployment that must isolate long-lived tokens from the agent needs an OS credential-store provider instead of the file-backed store.

The enterprise token has no refresh flow. Rotation or server-side revocation requires the user to sign in again after the existing request error identifies the authentication failure.

OpenAI compatibility varies across gateways. Tool-call streaming, reasoning controls, image support, usage reporting, and output limits need qualification against the enterprise staging service.

Product identity is partly embedded in Desktop installation and localization code. The distribution manifest reduces new literals and centralizes values, but upstream Desktop changes can still introduce another product-specific default that the merge allowlist and desktop tests must expose.

Production distribution requires enterprise-controlled signing certificates, notarization credentials, an HTTPS update feed, and trusted release infrastructure. Builds without those inputs remain development or unsigned qualification artifacts.

The enterprise login page and model proxy become security-sensitive internal services. Weak TLS, permissive CORS, token logging at the proxy, or slow authentication endpoints can expose credentials or block the Desktop login flow despite correct local handling.
