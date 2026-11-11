---
description: "Validate enterprise Desktop product, endpoint, model catalog, branding, and update configuration before build or startup."
kind: "package-library"
---

# @dsh-enterprise/dsh-enterprise-distribution

English | [中文](README.zh.md)

## Summary

Callers validate one enterprise Desktop manifest before packaging or startup. Success returns a detached configuration for native application identity, enterprise authentication, the OpenAI-compatible model proxy, artwork paths, profile bundles, and update mode. Invalid URLs, an official application identity, duplicate or missing models, unsafe directory names, and official update feeds fail before the Desktop application consumes the file.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Pass parsed manifest JSON to `parseEnterpriseDistribution()`. The returned object carries the normalized timeout defaults and the complete model list.

```ts
import { parseEnterpriseDistribution } from '@dsh-enterprise/dsh-enterprise-distribution'

declare const value: unknown
const distribution = parseEnterpriseDistribution(value)
console.log(distribution.model.defaultModel)
```

Malformed values throw. Authentication and inference URLs require HTTPS unless loopback HTTP is explicitly enabled for a test manifest. Branding paths remain relative strings; packaging owns file existence and containment checks.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

Zod validates the untrusted JSON structure. A second validation pass checks URL origins and paths, rejects the official application identifier and update host, verifies unique model ids, and requires the default model to exist. The runtime does not read files or contact enterprise services.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Manifest schema and semantic validation |
| [`src/types.ts`](src/types.ts) | Public configuration types |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Enterprise package group](../README.md) — adjacent enterprise packages.
- [Enterprise distribution design](../../../.agents/notes/implemented/feature/2026-11-11-enterprise-desktop-distribution.md) — Desktop integration and security decisions.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Branding files are not opened here** — the Desktop packaging adapter owns path resolution, regular-file checks, and containment.
- **The manifest carries no secrets** — enterprise tokens remain in the Host credential store and signing credentials remain machine configuration.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
