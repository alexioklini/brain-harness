---
description: 通过 LLMRouter 发现 Brain 模型并传输 Responses 流。
kind: package-reference
---

# Brain 模型适配器

[English](README.md) | 中文

## 概述

`brain` 提供方在选择模型及准备调用时读取经过身份验证的 Router 目录。模型权限被撤销或目录读取失败时，请求会停止。共享 pi-ai 适配器负责 Responses 流式传输、取消和消息转换。每次准备好的调用保留已解析的模型配置。选择器仅显示可见的文本生成模型；Router 的推理级别 `none` 映射到 Harness 的 `off`，同时保留传输值。

## 目录

- [配置](#configuration)
- [模型体验](#model-experience)
- [已知限制与待完成工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="configuration"></a>
## 配置

配置 `baseURL`、凭据引用、`timeoutMs` 和 `maxResponseBytes`。账号必须使用 Router 的 `automatic` 工具执行模式。Harness 不提供本地工具声明；中央工具选择、执行及后续调用由 LLMRouter 负责。存在本地工具声明时，请求在推理前失败。启用 `gatewayContext` 时，正常系统提示组装从网关读取已授权的项目及研究指令，并将其记录到会话中。请求携带 Harness 会话标识，供中央工具和 PII 使用，并采用 Brain 上下文策略。

启用 `gatewayContext` 后，插件按活动代理记录当前领取的用户问题。项目检索在提示组装期间执行；返回的摘录作为不可信来源数据写入已记录的 `brain:project-evidence` 用户上下文快照。完整用户问题保持不变。代理销毁后释放问题引用。

<a id="model-experience"></a>
## 模型体验

### 中央服务请求

#### 模型看到的内容

工具描述、参数及可用权限来自 LLMRouter 和当前中央 Tools-Service 目录。`llmrouter_pii_session` 和 `llmrouter_tools_session` 字段绑定同一会话。未启用 `gatewayContext` 时，适配器仅添加传输元数据。启用后，项目和研究指令进入已记录的系统提示。由 Router 管理的工具轮次会产生正常的上下文及 token 开销。

#### Token 影响

传输元数据不增加模型 token。Router 纳入中央服务结果时，这些结果会产生正常的上下文开销。

#### KV Cache 影响

传输元数据不改变模型可见的前缀；缓存复用由当前 Router 上下文和工具结果决定。

## 已知限制与待完成工作

<a id="known-limitations-and-deferred-work"></a>

- 适配器不负责 Web 身份验证。部署必须按账号隔离凭据和会话存储。Brain 网关负责项目授权、MoA 路由和隐私访问。中央定时任务管理尚未完成。真实功能验收仍在进行。

<a id="dev-note"></a>
### 开发备注

初始网关已部署用于专用账户验收。本地适配器检查不能证明真实功能已经完成。
