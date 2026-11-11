---
description: "Enterprise client branding for the Desktop sidebar mark, sidebar name, blank-home mark, and conversation frame."
kind: "package-reference"
---

# @dsh-enterprise/dsh-enterprise-ui-brand

English | [中文](README.zh.md)

## Summary

Brand the Desktop client with the configured product name and a derived initial mark. The package fills the sidebar mark and name, the blank-home brand mark, and one layout-neutral Conversation frame layer. Use it when the enterprise bundle replaces `ui-brand-official`; public Web profiles retain the official artwork.

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

Mount the client row after disabling the official brand package.

### Minimal configuration

```yaml
- id: ui-brand-enterprise
  name: '@dsh-enterprise/dsh-enterprise-ui-brand'
```

The browser build must set `DSH_CLIENT_TITLE` to the product name. The plugin uses that public value for visible text and its derived initial.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Declaration-aware slot injection installs the sidebar occupants as one rollback unit. The hero mark and frame are independent occupants. The Node half is inert and exists for Loader discovery.

### Source map

| File | Role |
|---|---|
| [`src/client/index.ts`](src/client/index.ts) | Slot registration and lifetime |
| [`src/client/Brand.tsx`](src/client/Brand.tsx) | Mark, wordmark, and frame components |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Enterprise package group](../README.md) — adjacent package roles.
- [Official brand package](../../client/ui-brand-official/README.md) — the slot-filling reference this package replaces.
- [Sidebar](../../client/ui-sidebar/README.md) — sidebar brand slots.
- [Conversation](../../client/ui-conversation/README.md) — hero mark and frame contracts.

-----

<a id="model-experience"></a>
## Model Experience

None, as the browser-side brand occupants render product identity without adding model input or Session events.

#### KV Cache effect

None; it does not change request prefixes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **The mark is derived from the first product-name character** — a deployment that needs custom artwork must add a package asset and replace the component's mark.
- **`DSH_CLIENT_TITLE` is required** — a client build without the public product title fails when the occupants render.
- **The frame is layout-neutral** — it installs no decorative animation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
