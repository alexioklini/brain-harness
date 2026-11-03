---
description: Brain conversation modes, project selection, privacy and account controls.
kind: package-reference
---

# Brain controls

English | [中文](README.zh.md)

## Summary

This browser plugin adds conversation mode and project menus above the shared composer, privacy and central-tool evidence dialogs, and central scheduled tasks and sign-out in the sidebar. It uses the existing slots, resource model and UI primitives. Reads and mutations use the authenticated Brain gateway; the browser never receives service credentials.

## Table of Contents

- [Behavior](#behavior)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

<a id="behavior"></a>
## Behavior

The gateway stores mode and project choices separately for each account and conversation. MoA selects central Router orchestration. Deep search contributes evidence-seeking instructions through the worker's logged system-prompt assembly; all tool discovery and execution remain central. Project access is checked again on inference. Privacy reads derive their session from the authenticated account and current conversation. Unknown measurements remain visible; auxiliary measured zero counts are omitted.

The task dialog lists account-owned tasks and supports creation, calendar edits, pause/resume and immediate execution through Brain’s central scheduler. Task model choices come from Brain’s model catalog. Updates retain service-owned fields, including attachment and connector settings.

The tool dialog shows service-reported execution status, arguments and output for the most recent inference request. This is execution evidence, not the enabled-tool catalog. Failed reads and saves stay visible with a retry control. Signing out expires the local gateway login. The package is mounted only by the Brain worker patch and does not modify the upstream default interface.

The project dialog supports creation, instruction edits and document uploads through Brain. It shows current write access and indexing status. The task dialog displays recorded run output and errors. MoA status comes from the Router’s account-scoped orchestration trace.

<a id="model-experience"></a>
## Model Experience

### Conversation choices

#### What the model sees

`chat`, `moa` and `research` mode choices and project selections are sent to the account gateway. Project and research instructions reach the model through the worker’s recorded system-prompt assembly. The controls add no local tools.

#### Token effect

Project and research instructions consume their actual prompt tokens; privacy and tool-evidence dialogs add none.

#### KV Cache effect

Changing project instructions or research mode may change the prompt prefix.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Live project-document retrieval, MoA diagnostics and multi-account acceptance remain pending; local component checks are not model acceptance.

<a id="dev-note"></a>
### Dev Note

The resource provider validates external JSON and cancels reads when its final subscriber leaves. Gateway mutations are owned by the plugin lifetime.
