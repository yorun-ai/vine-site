---
slug: /hub
sidebar_label: Hub 控制
---

# Hub 控制

Hub 是 Vine runtime 的控制面。它保存配置和注册信息，并将面向运行时的快照与变更事件分发给 Link 和 Portal。

```mermaid
flowchart LR
  App["业务应用"] -->|"注册"| Link["Link"]
  Link --> Hub["Hub"]
  Portal["Portal"] -->|"读取与订阅"| Hub
  Hub --> DB["数据库：配置、站点规则、证书"]
  Hub --> Redis["Redis：运行时快照与变更事件"]
  Hub --> NATS["NATS：事件与任务的消息基础设施"]
```

## 职责

- **配置中心**：从 SQLite 或 PostgreSQL 读取配置，并同步到 Redis。
- **服务注册中心**：接收 Link 上报的应用、RPC、Web、事件和任务能力；维护实例状态。
- **运行时分发层**：将配置、注册、Portal 规则、schema 与证书写入 Redis，供消费者读取和订阅。
- **管理入口**：提供 Hub API 与 Dashboard；Dashboard 的外部访问由 Portal 配置决定。

Hub 不是业务请求的转发路径。业务的外部请求由 Portal 处理，应用间调用由 Link 发现并转发。

## 启动

最小的本地开发配置使用 SQLite 和内嵌 NATS：

```bash
vine hub serve \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

默认监听地址如下：

| 服务 | 默认地址 | 用途 |
| --- | --- | --- |
| Hub API | `127.0.0.1:7071` | Link、Portal 与管理客户端连接 Hub |
| Hub Redis | `127.0.0.1:7073` | 运行时快照读取与订阅 |

:::warning 当前安全边界

原生传输认证与加密的 TODO 覆盖完整的网络运行时数据面，而不只限于 Hub Redis。
Link 到 Hub、Portal 到 Hub 的 Rpc，Portal/Link 代理流量，以及应用到 Link 的 Rpc
当前均使用明文 h2c；Hub Redis 使用明文 TCP RESP，`nats://` NATS 连接也未加密。
生产目标是为 Vine 组件连接提供双向 TLS（mTLS），并为 NATS 提供 TLS 和经过认证的
客户端身份。inproc transport 不跨越网络边界，不属于该 TODO 的范围。

Hub 内嵌 Redis 已拒绝匿名数据访问，并通过最小权限的命令、key 与订阅 ACL 隔离
`vine.hub`、`vine.link`、`vine.portal` 三个用户。`vine.hub` 使用进程内随机密码；
Link 与 Portal 的空密码仅用于 inproc 和分离部署调试。用户名只能选择 ACL 角色，
不能证明调用方身份，因此任何能触达该 endpoint 的客户端仍可冒充 Link 或 Portal，
而 Portal 角色能够读取 Portal TLS 私钥。只能将 Hub API、Hub Redis、Link API 和
Link ingress 部署在回环地址或受信私有网络中，并通过防火墙限制访问；绝对不要将
这些内部端口暴露到不可信网络。

:::

生产部署可使用 PostgreSQL 和外部 NATS：

```bash
vine hub serve \
  --db-postgres-url postgres://user:password@db.example.com:5432/vine \
  --mq-external-nats-url nats://nats.example.com:4222
```

数据库参数 `--db-sqlite-file` 和 `--db-postgres-url` 必须二选一；消息队列参数 `--mq-embedded-nats` 和 `--mq-external-nats-url` 也必须二选一。

可用 `--seed-yaml-file ./seed.yaml` 在启动时导入初始配置、Portal 规则和证书。导入后仍由数据库作为配置真源。

## 注册与租约

普通进程模式下，Link 为应用和 RPC 服务注册写入带 TTL 的记录，并通过心跳续租。Hub 的 registry sweeper 发现租约过期后，会主动注销实例并发布删除事件。

因此，当 Link 或业务应用异常停止时，Portal 和其他 Link 会在注册失效后移除对应 endpoint，而不是持续转发到失效实例。

## Inproc 模式

Hub 能作为单进程 runtime 的内部组件运行。此时 Hub API 使用 `inproc` transport，Redis 只提供进程内连接，且不启动对外监听端口。

inproc 模式不使用 TTL、心跳或 registry sweeper；注册会一直保留到应用显式注销。它适合本地调试、集成测试和 standalone 应用，不用于验证断网、租约失效等分布式故障语义。

## 相关文档

- [Link](./link.md)：应用侧注册、配置订阅和服务发现。
- [Portal](./portal.md)：读取 Hub 配置并提供外部网关。
- [命令行](../getting-started/cli.md)：完整参数与环境变量。
