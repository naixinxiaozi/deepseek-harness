---
description: "The private profile layer that replaces official account, model, and client-brand rows in the enterprise Desktop application."
kind: "package-bundle"
---

# @dsh-enterprise/dsh-enterprise

English | [中文](README.zh.md)

## Summary

The enterprise Desktop profile gains one private layer that removes official DeepSeek account and model routes, inserts enterprise username-password sign-in, routes `llm-pi-ai` to the enterprise proxy, and installs enterprise client branding. The Desktop distribution selects this bundle only for its enterprise application identity, so public profile installation is not required.

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

### Install into a profile

The package is private and is not installed from the public npm registry. The Desktop distribution adds `@dsh-enterprise/dsh-enterprise` last in its profile bundle list after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`.

### What you get

The layer disables `deepseek-account`, `llm-deepseek`, `llm-deepseek-account`, and `ui-brand-official`. It inserts `enterprise-account`, configures the `enterprise` provider on `llm-pi-ai`, points `agent-default-model` at that route, and inserts `ui-brand-enterprise`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Host environment values from the validated distribution manifest feed the row configuration. Model metadata is encoded as the `llm-pi-ai` route catalog. The enterprise account and brand packages own their runtime behavior.

### Source map

| File | Role |
|---|---|
| [`cordis.patch.yml`](cordis.patch.yml) | Ordered row disables and inserts |
| [`src/index.ts`](src/index.ts) | Inert package entry required by the bundle manifest |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Enterprise package group](../README.md) — adjacent account, distribution, and brand packages.
- [Profile composition](../../boot/app-boot/README.md#profiles) — bundle layer ordering and patch precedence.
- [pi-ai adapter](../../llm/llm-pi-ai/README.md) — the OpenAI-compatible model route used by this layer.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through the enterprise account and `llm-pi-ai` rows, which own model-visible authentication effects, requests, and outputs.

#### KV Cache effect

The layer changes the active provider route; the enterprise provider's request construction determines cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The patch requires distribution environment values** — a direct profile launch without the Desktop-provided model and service environment is incomplete.
- **Only one provider route is configured** — changing to `openai-responses` requires replacing the distribution's `model.api` value.
- **The bundle disables official routes deliberately** — there is no automatic provider fallback when the enterprise service fails.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
