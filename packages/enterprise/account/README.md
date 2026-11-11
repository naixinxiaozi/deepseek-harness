---
description: "Enterprise username and password authentication with a local Host form and a stored long-lived token for branded Desktop builds."
kind: "package-reference"
---

# @dsh-enterprise/dsh-enterprise-account

English | [中文](README.zh.md)

## Summary

Sign users into a branded Desktop workspace with enterprise username and password credentials. The Host serves a local form, exchanges the password over HTTPS, and stores only the returned long-lived token under `ENTERPRISE_LLM_TOKEN`. Passwords never persist. Select this provider when the enterprise service owns authentication; the official platform account provider is the fallback when those exact OAuth endpoints are required.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount this service in place of `dsh-deepseek-account-platform` and configure the private enterprise endpoints.

### Minimal configuration

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

| Field | Default | Meaning |
|---|---|---|
| `productName` | required | Product name shown by the Host login page |
| `loginUrl` | required | Enterprise JSON login endpoint |
| `logoutUrl` | absent | Optional enterprise token revocation endpoint |
| `usageUrl` | required | HTTPS account usage page |
| `topUpUrl` | required | HTTPS account top-up page |
| `inferenceOrigin` | required | Exact origin allowed to receive the token |
| `usernameField` | `username` | JSON login-request username field |
| `passwordField` | `password` | JSON login-request password field |
| `tokenField` | `access_token` | Dot-separated token path in the login response |
| `allowLoopbackHttp` | `false` | Permit HTTP only for loopback test services |
| `requestTimeoutMs` | `30000` | Deadline for one enterprise HTTP request |
| `attemptTimeoutMs` | `600000` | Maximum browser-login attempt lifetime |

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`startSignIn` creates a one-time route, nonce, and deadline on the Host web server. The Host renders a script-free form and accepts only a bounded same-origin POST. A successful exchange writes the credential reference before publishing the signed-in state. Cancellation aborts the exchange and disposes the route.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Account service, login lifecycle, token reference, and sign-out |
| [`src/protocol.ts`](src/protocol.ts) | Bounded enterprise login and logout requests |
| [`src/login-page.ts`](src/login-page.ts) | Localized script-free form and security headers |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Enterprise distribution manifest](../distribution/README.md) — validates the same endpoints before startup.
- [DeepSeek account service](../../credentials/deepseek-account/README.md) — shared account service contract.
- [Credentials](../../credentials/credentials-local/README.md) — local token storage and reference precedence.

-----

<a id="model-experience"></a>
## Model Experience

None, as enterprise credentials affect HTTP authentication only and never enter model prompts, Session logs, or tool results.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The token has no refresh flow** — rotation or server-side revocation requires signing in again.
- **The file-backed credential store is same-user readable** — a deployment requiring Agent isolation needs an OS credential-store provider.
- **The login service must remain reachable during authentication** — the Desktop cannot create a token from offline credentials.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
