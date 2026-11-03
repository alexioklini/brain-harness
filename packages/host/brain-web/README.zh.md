---
description: 现有 Brain 账户登录与隔离的 Harness Web 工作进程。
kind: package-bundle
---

# Brain web

[English](README.md) | 中文

## 概述

此 Cordis 插件验证现有 Brain 账户，为每个账户维护独立的 Harness 工作进程和存储目录，并使用共享应用凭据授权 Router 请求。浏览器 Cookie 仅用于 HTTPS，工作进程的私有 Cookie 保留在网关，每次请求都会重新验证 Brain 账户。网关通过独立的 `dsh --profile` 组合运行，其自身进程不挂载智能体。

## 目录

- [部署](#deployment)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)

<a id="deployment"></a>
## 部署

从干净且已推送的主源码目录 `main` 分支构建。`python3 scripts/release_guard.py` 检查该状态；`pnpm exec tsx scripts/package-brain.ts` 使用共享可执行文件打包辅助函数，将构建后的运行时、提交标识和归档校验和一起打包。

自定义配置在 `dsh.profile.bundles` 中选择本包。组合挂载现有的凭据、子进程、沙盒和 HTTP 提供程序。`BRAIN_GATEWAY_PORT` 设置回环监听端口；`BRAIN_GATEWAY_CONFIG` 包含 JSON 格式的 `GatewayConfig`，其中只有地址、构建产物路径、资源限制和共享凭据引用，不包含凭据值。`routerURL` 是不带 `/v1` 的源地址；`brainURL` 是现有 Brain 源地址。`loginIndex` 指向构建后的 `brain-login.html`。

工作进程使用经过审核的 Brain 补丁以及各自生成的网关补丁。`workerReadableRoots` 只授权物理构建产物和系统目录，不得与 `storageRoot` 重叠。当前独占读取策略要求 macOS Seatbelt，不支持的执行方式会被拒绝。每个工作进程获得私有网关令牌、独立主目录和临时目录。共享应用密钥仅在父进程中解析。此文件策略不提供网络隔离。

由控制器管理的 API 客户端可在已验证的路由上发送 HTTP Basic 凭据。网关通过 Brain 交换凭据，在到期前仅保留私有 Brain 会话和 Authorization 标头的哈希，不存储密码。浏览器请求仍要求来源匹配。`maxLogins` 限制保留的登录数量。

浏览器通过 `POST /_brain/login` 登录，通过 `POST /_brain/logout` 退出。`/_brain/conversations/` 下的对话选择按账户和对话分别保存在仅父进程可读的同级目录。保存前与推理前均检查项目权限。`/_brain/privacy/` 下的隐私读取根据登录账户派生会话标识。`/_brain/application/` 下的应用调用使用账户的私有 Brain Cookie。工作进程的 Router 请求仅允许模型发现、中央工具策略、授权对话指令和 Responses，身份及会话元数据由网关派生。流式传输同样受请求限制和取消控制。WebSocket 升级使用相同的账户验证，并且只携带分配的工作进程 Cookie；退出、会话到期、关闭和请求截止时间都会终止流。Responses 事件遵循标准 SSE 分发规则，没有数据的事件头会被忽略。最近一次推理请求的中央工具执行证据按账户和对话单独保留；辅助标题请求不会覆盖它。工作进程的默认工作区位于其私有主目录内。重启网关会使浏览器登录失效，但保留账户存储。

<a id="model-experience"></a>
## 模型体验

### 账户范围内的请求

#### 模型看到什么

工作进程的现有 `/v1/responses` 对话通过 Router 使用中央工具执行。网关不提供工具名称或参数结构。它向工作进程返回已授权的项目指令和所选深度搜索指导，工作进程通过正常系统提示组装将其记录。MoA 由 Router 元数据调度。

#### Token 影响

身份验证元数据不会增加模型 Token。项目和研究指令消耗其实际提示 Token。

#### KV Cache 影响

修改项目指令或研究模式会改变已记录的系统提示，并可能影响前缀复用。

## 已知限制与待办工作

<a id="known-limitations-and-deferred-work"></a>

- 此集成尚未完成。网关和隔离工作进程启动已通过本地冒烟检查。项目选择、隐私控制、MoA 和研究仍需真实验收；项目管理尚未完成。当前网关保留工作进程直到其退出或网关关闭；`maxUsers` 限制容量。初始网关已部署用于专用 Brain 测试账户验收；这不是完整功能发布。

<a id="dev-note"></a>
### 开发备注

构建后的工作进程和网关组合测试覆盖启动和访问拒绝。仍需真实账户与功能验收。
