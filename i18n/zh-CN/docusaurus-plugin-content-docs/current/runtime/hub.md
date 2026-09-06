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
- **组件 Control API**：提供 Link 与 Portal 使用的发现和注册服务。
- **管理入口**：在独立 listener 上提供 Dashboard Rpc 与 Web handler；Dashboard
  的外部访问由 Portal 配置决定。

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
| Hub Control API | `127.0.0.1:7071` | Link、Portal 发现 Hub 基础设施并维护注册 |
| Hub Redis | `127.0.0.1:7072` | 运行时快照读取与订阅 |
| Hub Admin API 与 Web | `127.0.0.1:7075` | Dashboard 管理 Rpc 与内嵌 Dashboard Web |

可用 `--control-listen`、`--redis-listen` 和 `--admin-listen` 修改这些 listener。

该 listener 边界也体现在 Hub 的 Skel 契约中。Link 与 Portal 使用
`vine.hub.control` 域，其中包含 `InfoService` 和 `RegistryService`；Dashboard
client 使用独立的 `vine.hub.admin` 域访问管理 Rpc 服务与 `DashboardWeb`。

## 后台 mTLS

Hub、Link 与 Portal 可以使用一个由部署提供的 CA，并为每个组件身份使用不同证书。
三个证书参数必须同时配置：

```bash
vine hub serve \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/hub.pem \
  --mtls-key-file /run/vine/hub-key.pem \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

Hub 证书必须仅含一个 SPIFFE URI SAN
`spiffe://<trust-domain>/vine/daemon/vine.hub`，并同时允许 TLS server 与 client
authentication；Link 和 Portal 在相同 trust domain 中分别使用
`/vine/daemon/vine.link` 与 `/vine/daemon/vine.portal`。Vine 会验证完整
X.509-SVID 并精确比较 URI，DNS SAN 不授予组件
角色。配置后，Hub 会在 Control API、Admin API、内嵌 Redis 与内嵌 NATS 上强制
mTLS。Redis 还会把 SPIFFE 身份绑定到对应的 Redis ACL 用户。
内嵌 NATS 接受使用 `spiffe://<trust-domain>/vine/daemon/vine.hub` 身份的 Hub
Scheduler、Admin Debug publisher，以及使用
`spiffe://<trust-domain>/vine/daemon/vine.link` 身份的 Link client；Portal 不允许连接。

省略 `--dashboard-url` 时，启用后台 mTLS 还会把 Dashboard Portal 入口的默认值
从 `http://:7099/` 改为 `https://:7099/`。只有仍与原始默认值一致的已有内置规则
会被迁移，用户自定义的 Dashboard 入口会保留。

对应环境变量是 `VINE_MTLS_CA_FILE`、`VINE_MTLS_CERT_FILE` 与
`VINE_MTLS_KEY_FILE`。

:::warning 仍需注意的安全边界

后台 mTLS 是可选配置。未同时提供三个证书参数时，仍保留现有 h2c、明文 Redis 与
`nats://` 开发行为，此时必须将 listener 放在 loopback 或可信私有网络中。

应用到 Link 的通信不属于后台 mTLS 范围，因为 Link 是应用的 sidecar。两者通常
位于同一主机和部署信任边界内，这是预期拓扑。特殊部署仍可使用非 loopback Link
API，但会收到告警，这条 h2c 路径也保持未经认证的状态；部署方必须自行保护这条
路径。Portal 对外 listener 不会复用
后台身份证书。启用 mTLS 后，如果没有匹配的公开证书，Portal 会回退到一个短期、
仅驻留当前进程的自签 Web 证书；配置的 Portal 证书始终优先。该回退能加密引导流量，
但不会被浏览器信任。外部 PostgreSQL 与 NATS endpoint 也继续使用各自的安全配置；
`--mq-external-nats-url` 当前只接受 `nats://`。

:::

生产部署可使用 PostgreSQL 和外部 NATS：

```bash
vine hub serve \
  --db-postgres-url postgres://user:password@db.example.com:5432/vine \
  --mq-external-nats-url nats://nats.example.com:4222
```

数据库参数 `--db-sqlite-file` 和 `--db-postgres-url` 必须二选一；消息队列参数 `--mq-embedded-nats` 和 `--mq-external-nats-url` 也必须二选一。

可用 `--seed-yaml-file ./seed.yaml` 在启动时导入初始配置、Portal 站点、规则和证书。导入后仍由数据库作为配置真源。

导入文件中的所有项目都必须满足配置要求，包括 Dashboard 中未选中的项目。
如果导入过程中发生数据库错误，部分数据可能已保存；重试前请检查当前配置。
规则的填写要求见 [Portal](./portal.md#规则校验)。

## 注册与租约

普通进程模式下，Link 为应用和 RPC 服务注册写入带 TTL 的记录，并通过心跳续租。Hub 的 registry sweeper 发现租约过期后，会主动注销实例并发布删除事件。

当 Link 或业务应用异常停止时，Portal 和其他 Link 会在注册失效后移除对应 endpoint，而不是持续转发到失效实例。

## Inproc 模式

Hub 能作为单进程 runtime 的内部组件运行。此时 Hub API 使用 `inproc` transport，Redis 只提供进程内连接，且不启动对外监听端口。

inproc 模式不使用 TTL、心跳或 registry sweeper；注册会一直保留到应用显式注销。它适合本地调试、集成测试和 standalone 应用，不用于验证断网、租约失效等分布式故障语义。

## 相关文档

- [Link](./link.md)：应用侧注册、配置订阅和服务发现。
- [Portal](./portal.md)：读取 Hub 配置并提供外部网关。
- [命令行](../getting-started/cli.md)：完整参数与环境变量。
