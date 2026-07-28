---
slug: /link
sidebar_label: Link 运行时
---

# Link

Link 是部署在应用侧的 runtime 接入层。它将本地应用注册到 Hub，维护配置和服务发现，并为 Rpc、Web、事件和任务提供统一的运行时能力。

```mermaid
flowchart LR
  App["本地应用"] <--> Link["Link"] <--> Hub["Hub"]
  Link --> Rpc["Rpc：发现并转发"]
  Link --> Web["Web：投递给本地 App"]
  Link --> EventTask["Event / Task：消费并派发"]
  Link --> Config["Config：订阅配置变更"]
```

## 职责边界

- **应用注册**：保存本地应用实例事实，向 Hub 注册能力，并在退出时注销。
- **健康与租约**：普通模式下对实例进行健康检查并向 Hub 发送 heartbeat。
- **配置读取**：提供配置快照，并监听 Hub Redis 的变更事件。
- **Rpc 发现与转发**：选择一个已注册的本地或远端 Rpc 实例并转发调用。
- **Web 投递**：接收 Portal 已选定的 Web 请求，并转发给请求中指定的本地应用
  实例。
- **异步消息派发**：消费 NATS 消息，投递给本地声明的事件监听器和任务执行器。

Link 是本地应用能力的唯一 owner。Rpc、Web、事件、任务和配置模块只从它派生各自的运行时索引，不直接维护另一份应用实例状态。

## 启动

Hub 启动后，可通过其 API endpoint 启动 Link：

```bash
vine link serve \
  --hub-endpoint http://127.0.0.1:7071
```

默认 API 监听在 `127.0.0.1:7079`。Ingress 默认使用 `0.0.0.0:0`，由系统分配端口并将实际 endpoint 注册到 Hub。需要固定地址时显式配置：

```bash
vine link serve \
  --api-listen 127.0.0.1:7081 \
  --ingress-listen 127.0.0.1:7082 \
  --hub-endpoint http://127.0.0.1:7071
```

对应环境变量为 `VINE_API_LISTEN`、`VINE_INGRESS_LISTEN` 与 `VINE_HUB_ENDPOINT`。

## 请求路径

### Rpc

应用发起 Rpc 调用时，请求先进入 Link 的 `rpcproxy`。proxy 对当前 service
registration 执行 round-robin，选择下一条注册。注册属于本地应用时，Link 直接调用其
应用 endpoint；否则经目标 Link 转发。本地性只改变转发路径，不构成选择优先级。完成
选择后发生的失败，也不会让该次调用自动改试另一条注册。

### Web

`webproxy` 只索引当前 Link 所拥有应用的 Web handler。分布式 Web endpoint
快照和 round-robin 选择由 Portal 负责；Portal 把请求发送给选中实例所属的
Link，目标 Link 再校验本地实例与 handler，并调用应用 endpoint。Link 不会从
自己的 discovery index 中选择远端 Web 目标。Portal 选择、发现新鲜度与失败
边界见[请求路由](./request-routing.md)。

### Event 与 Task

`event` 和 `task` 根据本地实例声明建立 NATS 消费；应用能力变更时，Link 自动更新相应消费与派发状态。

## Inproc 模式

`linked.New(...)` 会让 Link 与业务应用同进程，但 Hub 仍是外部服务。Link 会
开放 ingress、向 Hub 注册并继续向 Hub 发送 heartbeat。进程内 App 与 Link
生命周期绑定，因此独立的应用 healthcheck 会被禁用。

standalone 才会把 Hub、Portal、Link 和应用全部放入同一进程，并使用进程内 Redis 与 endpoint；这种模式不执行 heartbeat。要验证租约和网络故障，可使用 linked 或完全分开部署。

## 相关文档

- [Hub](./hub.md)：配置与注册信息的来源。
- [Portal](./portal.md)：对外请求进入应用的网关。
- [App](../framework/app.md)：以 linked 或 standalone 方式装配应用。
