---
description: Authenticated transport to central Brain services.
kind: package-reference
---

# Brain central client

English | [中文](README.zh.md)

## Summary

The host-side client reads the current LLMRouter model catalog, prepares central tool selection, executes service-issued tool identifiers and retrieves session privacy facts. Credentials are resolved per request and never included in returned errors. Requests refuse redirects, enforce response limits and propagate cancellation. No local shell, filesystem tool or MCP executor is provided.

Configure `baseURL` with the Router API prefix, for example `https://router.example/v1`. Plain HTTP is permitted only for loopback. The caller supplies a credential resolver, timeout and response-byte limit. Each caller owns its authenticated client; browser input must never choose another user's credential.

## Table of Contents

- [Account authorization](#account-authorization)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="account-authorization"></a>
## Account authorization

`BrainAccountClient` uses the existing Brain `/api/anmeldung` and `/api/ich` APIs. Its server-owned login retains the session cookie privately. Each authorization reloads the user and teams, rejects an identity change, and checks the selected project through Brain. It derives different storage and chat identifiers for different accounts, even when their application API key is shared. Closing a login immediately prevents further local authorization; it does not revoke the upstream Brain session. The caller must keep each user's runtime separate and must not serialize the login capability to the browser.

<a id="model-experience"></a>
## Model Experience

### Central service request

#### What the model sees

The `/tools/prepare` request sets `local_workspace_tools: false`. This transport has no direct model-visible text or token effect. Callers retain service-issued names, descriptions, schemas and results; the client supplies no replacement tool definitions.

#### Token effect

Transport metadata adds no model tokens. Central service results contribute their normal context when the Router includes them.

#### KV Cache effect

Transport metadata does not change the model-visible prefix; current Router context and tool results determine cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This library alone does not mount an agent preset, mount a browser login or isolate web runtimes. Model streaming, RAG projects, MoA, research and scheduled-task interfaces require their owning integrations. Live-service acceptance remains required before deployment.

<a id="dev-note"></a>
### Dev Note

Live acceptance and account isolation are pending. The Brain profile is a development integration, not a released service.
