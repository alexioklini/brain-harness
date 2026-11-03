---
description: Brain model discovery and Responses streaming through LLMRouter.
kind: package-reference
---

# Brain model adapter

English | [中文](README.zh.md)

## Summary

The `brain` provider reads the authenticated Router catalog for model selection and again when preparing a call. Revoked models and failed catalog reads stop the request. The shared pi-ai adapter handles Responses streaming, cancellation and message conversion. Each prepared call retains its resolved model configuration. The picker includes visible text-generation models; Router reasoning `none` maps to Harness `off` while retaining its wire value.

## Table of Contents

- [Configuration](#configuration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="configuration"></a>
## Configuration

Configure `baseURL`, a credential reference, `timeoutMs` and `maxResponseBytes`. The account must use Router `automatic` tool execution. Harness supplies no local tool declarations; LLMRouter owns central selection, execution and continuation. Local tool declarations fail before inference. With `gatewayContext` enabled, the normal system-prompt assembly reads authorized project and research instructions from the gateway and records them in the session. Requests carry the Harness session identifier for central tools and PII and use the Brain context policy.

<a id="model-experience"></a>
## Model Experience

### Central service request

#### What the model sees

Tool descriptions, arguments and eligibility come from LLMRouter and the current central Tools-Service catalog. The `llmrouter_pii_session` and `llmrouter_tools_session` fields bind the same session. Without `gatewayContext`, this adapter adds transport metadata only. With it enabled, project and research instructions enter the recorded system prompt. Router-managed tool rounds contribute their normal context and token costs.

#### Token effect

Transport metadata adds no model tokens. Central service results contribute their normal context when the Router includes them.

#### KV Cache effect

Transport metadata does not change the model-visible prefix; current Router context and tool results determine cache reuse.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The adapter is not a web authentication system. A deployment must isolate credentials and session storage by account. The Brain gateway owns project authorization, MoA routing and privacy access. Central scheduled-task management remains unfinished. Live feature acceptance is pending.

<a id="dev-note"></a>
### Dev Note

The initial gateway is deployed for dedicated-account acceptance. Local adapter checks do not establish live feature completion.
