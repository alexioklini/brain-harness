---
description: Existing Brain account login and isolated Harness web workers.
kind: package-bundle
---

# Brain web

English | [中文](README.zh.md)

## Summary

This Cordis plugin authenticates existing Brain accounts, owns a separate Harness worker and storage directory per account, and authorizes Router requests with the shared application credential. Browser cookies are HTTPS-only, private worker cookies remain on the gateway, and every request revalidates the Brain account. The gateway runs as a dedicated `dsh --profile` composition without an agent in its own process.

## Table of Contents

- [Deployment](#deployment)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="deployment"></a>
## Deployment

Build from the primary source checkout on clean, pushed `main`. `python3 scripts/release_guard.py` checks that state; `pnpm exec tsx scripts/package-brain.ts` packages the built runtime with its commit and archive checksum using the shared executable packaging helpers.

A custom profile selects this package in `dsh.profile.bundles`. Its bundle mounts the existing credential, subprocess, sandbox and HTTP providers. `BRAIN_GATEWAY_PORT` sets a loopback listener; `BRAIN_GATEWAY_CONFIG` contains the JSON `GatewayConfig`. That configuration carries addresses, artifact paths, resource limits and the shared credential reference, never the credential value. `routerURL` is an origin without `/v1`; `brainURL` is the existing Brain origin. `loginIndex` points to the built `brain-login.html`.

Workers use the reviewed Brain patch and their own generated gateway patch. `workerReadableRoots` grants only physical artifact and system directories; it must not overlap `storageRoot`. The current exclusive read policy requires macOS Seatbelt and refuses unsupported enforcement. Each worker receives a private gateway token, its own home and temporary directory. The shared application key resolves only in the parent. Network isolation is not supplied by this file policy.

Controller-owned API clients can send HTTP Basic credentials on authenticated routes. The gateway exchanges them with Brain and retains only a private Brain session and a hash of the Authorization header until expiry; passwords are not stored. Browser requests still require matching origins. `maxLogins` bounds retained logins.

The browser signs in at `POST /_brain/login` and signs out at `POST /_brain/logout`. Application calls under `/_brain/application/` use the account's private Brain cookie. Worker Router requests accept only model discovery, central-tool policy and Responses, with identity and session metadata derived by the gateway. HTTP request limits and cancellation apply to streaming. Restarting the gateway expires browser logins but retains account storage.

<a id="model-experience"></a>
## Model Experience

### Account-scoped requests

#### What the model sees

The worker's existing `/v1/responses` conversation reaches the Router with central tool execution. The gateway supplies no tool names, schemas or additional model instructions.

#### Token effect

Authentication and account metadata do not add model tokens.

#### KV Cache effect

Account authorization does not rewrite the conversation prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This is an unfinished integration. Full worker startup, authenticated browser composition, project selection, privacy controls, MoA, research and central scheduled-task UI require acceptance before release. The gateway currently retains workers until process exit or shutdown; `maxUsers` bounds capacity. Live login and cross-account acceptance require dedicated Brain test accounts. It is not ready for public deployment.

<a id="dev-note"></a>
### Dev Note

Built worker and gateway composition tests cover startup and access rejection. Live account and feature acceptance remains required.
