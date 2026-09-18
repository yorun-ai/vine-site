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
- **服务注册中心**：接收 Link 上报的应用、RPC、Web、事件和任务能力；维护实例状态。它同时记录注册到 Hub 的 Portal 实例，Dashboard 据此展示正在提供服务的网关实例。
- **运行时分发层**：将配置、注册、Portal 规则、schema 与证书写入 Redis，供消费者读取和订阅。
- **组件 Control API**：提供 Link 与 Portal 使用的发现和注册服务。
- **管理入口**：在独立 listener 上提供 Dashboard 与 Admin API，操作者直接访问，
  不经过 Portal。

Hub 不是业务请求的转发路径。业务的外部请求由 Portal 处理，应用间调用由 Link 发现并转发。

## 启动

最小的本地开发配置使用 SQLite 和内嵌 NATS：

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite
```

默认监听地址如下：

| 服务 | 默认地址 | 用途 |
| --- | --- | --- |
| Hub Control API | `127.0.0.1:7071` | Link、Portal 发现 Hub 基础设施并维护注册 |
| Hub Redis | `127.0.0.1:7072` | 运行时快照读取与订阅 |
| Hub Admin API 与 Dashboard | `127.0.0.1:7099` | Dashboard 管理 Rpc 与内嵌 Dashboard 应用 |

可用 `--control-listen`、`--watch-listen` 和 `--admin-listen` 修改这些 listener。
watch listener 承载 Link 与 Portal 读取和订阅的流量，该 listener 兼容 Redis 协议。

Portal 站点不能以 admin listener 为目标。

## 消息队列

Dashboard 的 **状态 → 任务队列** 与 **状态 → 事件队列** 页面展示 Hub 所用 NATS 中保留的
消息与各消费者的积压情况。读取不会消费消息，也不会创建 Stream 或 Consumer。使用外置
NATS 时，需要由部署方创建 Vine 的 Stream，并允许 Hub 查询其 JetStream 的 Stream 与
Consumer 信息；standalone 模式需要开启 Dashboard listener。

## 后台 mTLS

Hub、Link 与 Portal 可以使用一个由部署提供的 CA，并为每个组件身份使用不同证书。
三个证书参数必须同时配置：

```bash
vine hub serve \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/hub.pem \
  --mtls-key-file /run/vine/hub-key.pem \
  --db-sqlite-file ./hub.sqlite
```

Hub 证书必须仅含一个 SPIFFE URI SAN
`spiffe://<trust-domain>/vine/daemon/vine.hub`，并同时允许 TLS server 与 client
authentication；Link 和 Portal 在相同 trust domain 中分别使用
`/vine/daemon/vine.link` 与 `/vine/daemon/vine.portal`。Vine 会验证完整
X.509-SVID 并精确比较 URI，DNS SAN 不授予组件
角色。配置后，Hub 会在 Control API、内嵌 Redis 与内嵌 NATS 上强制
mTLS。Redis 还会把 SPIFFE 身份绑定到对应的 Redis ACL 用户。
内嵌 NATS 接受 Hub 与 Link 身份，拒绝 Portal。

Admin API 在自己的监听上提供明文 HTTP，因为它承载的 Dashboard 由浏览器访问，
浏览器不持有 mesh 证书。

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
`--mq-nats-endpoint` 只接受 `nats://`。

:::

生产部署可使用 PostgreSQL 和外部 NATS：

```bash
vine hub serve \
  --db-postgres-url postgres://user:password@db.example.com:5432/vine \
  --mq-mode=nats \
  --mq-nats-endpoint nats://nats.example.com:4222
```

Hub 默认使用 `--mq-mode=embedded`。连接外部 NATS 时，必须同时提供
`--mq-mode=nats` 和 `--mq-nats-endpoint`；embedded 模式拒绝 endpoint。

数据库参数 `--db-sqlite-file` 和 `--db-postgres-url` 至多提供一个。两项数据库参数都不提供时，Hub 默认使用 `--no-db`：seed 配置加载到内存，配置保持只读。

可用 `--seed-data-file ./seed.yaml` 在启动时导入初始配置、Portal 入口、站点、规则和证书。使用数据库时，导入后仍由数据库作为配置真源。

`appConfigs[].value` 可以直接使用 YAML 对象，内部支持嵌套 map 和列表。
字段名与 JSON 保持一致，枚举 key 和 value 使用枚举名称。
这种格式用于启动 seed；后续修改在实体页面上逐个字段完成。

```yaml
appConfigs:
  - name: demo.AppConfig
    value:
      enabled: true
      statuses:
        EAST: ACTIVE
        WEST: LOCKED
```

Hub 会把结构化值转换成 JSON。字符串值表示 JSON 文本，例如
`value: '{"enabled":true}'`；
如果配置值本身是 JSON 字符串，请使用 `value: '"text"'`。
日期和时间戳保留原始文本，包括 UTC 偏移和小数秒；引号内的字符串和 map key 也保留原始拼写。

seed 文件禁止锚点 `&`、别名 `*`、`<<` 合并语法、复杂或 null key、非有限数字和自定义 YAML tag，请直接展开填写。数字仅支持普通十进制写法：拒绝前导零（如 `012`）、数字分隔符、非十进制和科学计数法。

导入文件中的所有项目都必须满足配置要求，包括 Dashboard 中未选中的项目。
如果导入过程中发生数据库错误，部分数据可能已保存；重试前请检查当前配置。
规则的填写要求见 [Portal](./portal.md#规则校验)。

## Lock 模式

Hub 默认使用 `--lock-mode=embedded`，通过 Control API 提供租约锁。
锁状态保存在内存中，Hub 重启后会丢失。

使用外部 Redis：

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite \
  --lock-mode=redis \
  --lock-redis-endpoint=redis://redis.example.com:6379/0
```

Link 直接连接 Hub 下发的 Redis endpoint。地址支持 `redis://` 和 `rediss://`，
可以包含用户名、密码和数据库编号。对应环境变量为 `VINE_LOCK_MODE` 和
`VINE_LOCK_REDIS_ENDPOINT`。

`redis` 模式必须提供 endpoint，`embedded` 和 `disable` 模式拒绝 endpoint。
使用 `--lock-mode=disable` 拒绝锁操作。standalone 固定使用进程内嵌锁，不暴露
Lock 配置入口；不同 standalone 进程之间不共享锁。

### 应用侧锁

应用注入 `*lock.Locker` 即可获得自动续期的租约锁，其 key 按应用名隔离；注入
`*lock.UniversalLocker` 时，key 在同一锁后端上的所有应用之间共享：

```go title="service.go"
type OrderService struct {
    Locks *lock.Locker `inject:""`
}

func (s *OrderService) Settle(ctx context.Context, orderID string) {
    lease := s.Locks.WithContext(ctx).Lock("settle:" + orderID)
    defer lease.TryUnlock()

    // 业务必须在 lease.Context() 结束时停止。
    s.settleWhileOwned(lease.Context(), orderID)
}
```

`Lock` 会等待直到获得租约，`TryLock` 只尝试一次，竞争失败时返回 `false`。竞争不是
错误，但后端故障或 context 结束会 panic 并抛出框架错误。租约默认 30 秒，持有期间
会在后台自动续期；`lock.WithTTL` 调整的是租约时长，不是等待上限，等待时长请通过
`WithContext` 的 deadline 控制。续期失败会取消 `Lock.Context()` 并将租约标记为
已损坏，此后 `Unlock` 会 panic，因此失去租约属于正常情况时应使用 `TryUnlock`。
租约只是协调手段：不保证公平性，不可重入，也不能作为 fencing token。

如果应用只需要协调互斥，且锁后端由部署统一提供，使用 `core/lock`；如果需要自己声明
Redis Component 并自行管理 endpoint，则使用 [Redis 指南](../framework/redis-guide.md)
中的 `infra/redis` 锁。

## 注册与租约

实例停止发送心跳后，其注册信息即失效，Hub 随后将其移除。

当 Link 或业务应用异常停止时，Portal 和其他 Link 会在注册失效后移除对应 endpoint，而不是持续转发到失效实例。

## Hub 重启与端点变化

Hub 重启后不保留注册与 watch 状态，Link 与 Portal 会重新注册并重新订阅；
地址未变的 Hub 重启不会打断进行中的订阅。

Hub 的 control API 端点属于固定配置：Link 与 Portal 连接启动时指定的 `--hub-endpoint`，Hub API 地址变化需要同步更新该配置。

## Inproc 模式

Hub 能作为单进程 runtime 的内部组件运行。此时 Hub API 使用 `inproc` transport，Redis 只提供进程内连接，且不启动对外监听端口。

inproc 模式没有租约过期，注册会一直保留到应用显式注销。它适合本地调试、集成测试和 standalone 应用，不用于验证断网、租约失效等分布式故障语义。

## Seed 变量与字段来源

Hub 会用变量文件和可选的字段来源映射解析 seed 模板。可以在 seed 模板之外传入
YAML 变量字典：

```yaml
# seed.yaml
appConfigs:
  - name: demo.Config
    value:
      enabled: ${enabled}
      endpoint: https://${host}
```

```yaml
# variables.yaml
enabled: true
host: api.example.com
```

完整字段的 `${name}` 引用保留变量的 YAML 类型；文本内部插值产生字符串，
要求变量为非 null 的标量。`${database.port:5432}` 在 key 缺失时使用默认值；
缺失且没有默认值的变量会导致启动失败。变量路径各段使用 camelCase。
映射 key 不支持变量引用，插入的值作为字面数据使用，不会再次插值。
没有变量引用的 seed 无需变量文件。嵌套路径与校验规则见
[部署变量](../framework/configuration.md#deployment-variables)。

可选的来源文件使用 JSON Pointer 定位原始模板中的字段（数组下标从 0 开始）：

```yaml
version: 1
seedSha256: "<原始 seed 模板字节的 SHA-256>"
fields:
  /appConfigs/0/value/endpoint:
    source: profile/dev
    define: domain/catalog
    override: profile/dev
```

没有覆盖时省略 `override`。标签仅用于说明来源，不控制优先级。
摘要不匹配或字段路径不存在会导致启动失败。来源文件不包含具体文件路径、行列或变量值。

standalone 应用可以通过 Go `embed` 嵌入模板和来源映射，并传入
`Option.HubSeedData`、`Option.HubSeedSource`，部署变量字典通过
`Option.HubSeedVarsFile` 指定。也可以使用 `Option.HubSeedDataFile` 和可选的
`Option.HubSeedSourceFile`。嵌入与文件模式不能混用：嵌入模板必须搭配嵌入来源映射，
文件模板必须搭配文件来源映射。变量在两种模式下都只能通过文件传入；文件模式对应的
Hub 作为独立服务运行时，环境变量为 `VINE_SEED_DATA_FILE`、`VINE_SEED_SOURCE_FILE`
和 `VINE_SEED_VARS_FILE`；由 standalone 应用托管 Hub 时，对应为
`VINE_HUB_SEED_DATA_FILE`、`VINE_HUB_SEED_SOURCE_FILE` 和 `VINE_HUB_SEED_VARS_FILE`。

Dashboard 的“字段来源”显示最初定义、最后覆盖、原始模板、实际使用的变量值及默认值使用
情况。编辑某个字段会清除该字段的变量依赖。

## 相关文档

- [Link](./link.md)：应用侧注册、配置订阅和服务发现。
- [Portal](./portal.md)：读取 Hub 配置并提供外部网关。
- [命令行](../getting-started/cli.md)：完整参数与环境变量。
