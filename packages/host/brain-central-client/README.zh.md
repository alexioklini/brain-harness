---
description: 经过身份验证的中央 Brain 服务传输。
kind: package-reference
---

# Brain 中央客户端

[English](README.md) | 中文

## 概述

Host 侧客户端读取当前 LLMRouter 模型目录、准备中央工具选择、执行服务下发的工具标识并读取会话隐私信息。每次请求分别解析凭据，返回错误不包含凭据。请求拒绝重定向、限制响应大小并传递取消信号。不提供本地 shell、文件系统工具或 MCP 执行器。

`baseURL` 包含 Router API 前缀，例如 `https://router.example/v1`。仅回环地址允许使用明文 HTTP。调用方提供凭据解析器、超时和响应字节上限。每个调用方拥有自己的已认证客户端；浏览器输入不得选择其他用户的凭据。

## 目录

- [账号授权](#account-authorization)
- [模型体验](#model-experience)
- [已知限制与待完成工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="account-authorization"></a>
## 账号授权

`BrainAccountClient` 使用已有的 Brain `/api/anmeldung` 和 `/api/ich` API。由服务器持有的登录能力私下保留会话 cookie。每次授权都重新读取用户和团队，拒绝身份变更，并通过 Brain 检查所选项目。即使多个账号共享应用 API 密钥，也会派生出不同的存储和聊天标识。关闭登录会立即阻止后续本地授权，但不撤销上游 Brain 会话。调用方必须隔离各用户的运行时，且不得将登录能力序列化后发送给浏览器。

项目文档上传使用已有的 Brain 已认证 multipart 接口。`projectEvidence` 要求已验证的 `ragScope`，打开中央知识集合，并使用当前问题的前 4000 个字符搜索，这是搜索 API 的上限。两次请求均携带账户和项目请求头；不使用本地索引，也不回退到过期证据。

<a id="model-experience"></a>
## 模型体验

### 中央服务请求

#### 模型看到的内容

`/tools/prepare` 请求设置 `local_workspace_tools: false`。此传输不直接影响模型可见文本或 token。调用方保留服务下发的名称、描述、模式和结果；客户端不提供替代工具定义。

#### Token 影响

传输元数据不增加模型 token。Router 纳入中央服务结果时，这些结果会产生正常的上下文开销。

#### KV Cache 影响

传输元数据不改变模型可见的前缀；缓存复用由当前 Router 上下文和工具结果决定。

## 已知限制与待完成工作

<a id="known-limitations-and-deferred-work"></a>

- 此库本身不挂载智能体预设、不挂载浏览器登录界面，也不隔离 Web 运行时。模型流式传输、RAG 项目、MoA、研究和定时任务界面需要各自的集成。部署前仍须完成真实服务验收。

<a id="dev-note"></a>
### 开发备注

真实服务验收和账号隔离尚未完成。Brain 配置用于开发集成，尚未发布为服务。
