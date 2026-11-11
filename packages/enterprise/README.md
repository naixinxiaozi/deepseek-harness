---
description: "Private enterprise distribution bundles and adapters for branded Desktop builds."
kind: "package-group"
---

# enterprise/ — branded Desktop distribution packages

English | [中文](README.zh.md)

## Summary

This group keeps enterprise-specific behavior outside the official runtime packages. It provides validated distribution configuration, the enterprise login provider, the profile bundle that replaces official account and model rows, and private client branding. Official packages remain under the `@deepseek-ai` scope; these private packages use `@dsh-enterprise` and ship only through the branded Desktop build.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role |
|---|---|
| [`account`](account/README.md) | Provides enterprise username and password sign-in and the stored model credential |
| [`bundle`](bundle/README.md) | Replaces official account, model, and client-brand profile rows |
| [`distribution`](distribution/README.md) | Validates product identity, enterprise service endpoints, model catalog, branding paths, and update mode |
| [`ui-brand`](ui-brand/README.md) | Occupies sidebar and blank-home product-brand slots |

<a id="related-documentation"></a>
## Related documentation

- [Desktop application](../../apps/desktop/README.md) — loads the enterprise manifest and owns native packaging.
- [Enterprise distribution design](../../.agents/notes/implemented/feature/2026-11-11-enterprise-desktop-distribution.md) — ownership and security decisions.

<a id="dev-note"></a>
## Dev Note

None.
