---
description: 通过 LLMRouter 发现 Brain 模型并传输 Responses 流。
kind: package-reference
---

# Brain 模型适配器

[English](README.md) | 中文

## 概述

`brain` 提供方在选择模型及准备调用时读取经过身份验证的 Router 目录。模型权限被撤销或目录读取失败时，请求会停止。共享 pi-ai 适配器负责 Responses 流式传输、取消和消息转换。每次准备好的调用保留已解析的模型配置。选择器仅显示可见的文本生成模型；Router 的推理级别 `none` 映射到 Harness 的 `off`，同时保留传输值。

配置 `baseURL`、凭据引用、`timeoutMs` 和 `maxResponseBytes`。账号必须使用 Router 的 `automatic` 工具执行模式。Harness 不提供本地工具声明；中央工具选择、执行及后续调用由 LLMRouter 负责。存在本地工具声明时，请求在推理前失败。请求携带 Harness 会话标识，供中央工具和 PII 使用，并采用 Brain 上下文策略。

## 目录

- [模型体验](#model-experience)
- [已知限制与待完成工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="model-experience"></a>
## 模型体验

### 中央服务请求

#### 模型看到的内容

工具描述、参数及可用权限来自 LLMRouter 和当前中央 Tools-Service 目录。`llmrouter_pii_session` 和 `llmrouter_tools_session` 字段绑定同一会话。适配器仅添加传输元数据，不添加模型指令。由 Router 管理的工具轮次会产生正常的上下文及 token 开销。

#### Token 影响

传输元数据不增加模型 token。Router 纳入中央服务结果时，这些结果会产生正常的上下文开销。

#### KV Cache 影响

传输元数据不改变模型可见的前缀；缓存复用由当前 Router 上下文和工具结果决定。

## 已知限制与待完成工作

<a id="known-limitations-and-deferred-work"></a>

- 适配器不负责 Web 身份验证。部署必须按账号隔离凭据和会话存储。当前集成尚未提供项目、MoA、研究、隐私、定时任务面板或项目专属 RAG 上下文。真实服务验收尚未完成。

<a id="dev-note"></a>
### 开发备注

真实服务验收和账号隔离尚未完成。Brain 配置用于开发集成，尚未发布为服务。
