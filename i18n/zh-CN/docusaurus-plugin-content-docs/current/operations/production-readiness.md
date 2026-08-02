---
title: 上线检查
sidebar_label: 上线检查
description: Vine 生产部署需要确认的边界与验证项。
slug: /production-readiness
---

应用在 standalone 模式下能够工作，只说明业务装配已经跑通，并不能证明分布式部署
可靠。进入 linked 或分离拓扑之前，应按实际准备部署的 Vine revision，逐项验证下面的
进程、网络、持久化、交付和停止边界。

## 选择部署拓扑

- [ ] 根据运维要求选择拓扑，而不只是根据应用数量选择。
- [ ] 记录 Hub、Portal、每个 Link 和每个业务应用的运行位置。
- [ ] 分配地址或防火墙规则前，先画出所有必需的网络路径。

| 拓扑 | 进程边界 | 生产含义 |
| --- | --- | --- |
| Standalone | Hub、Portal、Link 和应用共享一个进程 | 适合本地开发与集成测试；不会覆盖网络租约和独立故障 |
| Linked | Hub 与 Portal 独立；Link 与应用同进程 | 保留网络注册和心跳行为，但每个应用与其 Link 共用生命周期 |
| 分开部署 | Hub、Portal、Link 和应用都是独立进程 | 支持独立发布、重启和扩缩容，但必须显式配置每一条内部网络路径 |

先阅读 [运行与部署](../getting-started/deployment-modes.md)，再通过
[Hub](../runtime/hub.md)、[Link](../runtime/link.md) 和 [Portal](../runtime/portal.md) 了解各进程
的职责。

## 部署前固定版本

- [ ] 固定 Go、Vine 和 skelc，不要在构建时解析 `@latest`。
- [ ] 运行部署镜像中实际包含的 `vine` binary。
- [ ] Vine 或 skelc 变化后，重新生成并审查契约代码。

```bash
go version
vine version
vine version --json
skelc version
```

当前 Vine 源码要求 Go `1.26.5` 或更高，并报告最低 skelc 版本 `v0.9.0`。`next`
并不是冻结的发行版；如何记录部署实际使用的 revision，见
[版本兼容性](../getting-started/compatibility.md)。

## 保护运行时网络

:::warning 后台 mTLS 边界

Vine 可以为 Hub、Link 与 Portal 强制使用部署提供的 mTLS 身份。在每个进程上同时
配置三个 `--mtls-*-file` 参数后，Hub Control API、Admin API、内嵌 Redis 与
NATS、Link ingress，以及组件代理 client 都会使用 mTLS。证书通过精确的
X.509-SVID URI SAN `spiffe://<trust-domain>/vine/daemon/vine.hub`、
`spiffe://<trust-domain>/vine/daemon/vine.link`、
`spiffe://<trust-domain>/vine/daemon/vine.portal` 标识组件；同一部署的所有组件必须使用相同
trust domain，DNS SAN 不授予组件身份。发现到的明文 endpoint 会被拒绝，不会作为
降级路径接受。

后台 mTLS 是可选配置；省略证书参数时会保留明文开发行为。应用到 Link 的通讯有意
不包含在该边界内，因为 Link 是应用的 sidecar：两者必须位于同一主机和部署信任
边界内。将它们部署在不同主机不属于 Vine 支持的拓扑。Portal 对外 listener 使用
独立配置的公开证书；启用 mTLS 后，如果没有匹配项，会回退到一个仅驻留当前进程的
自签 Web 证书，用于加密引导访问。该临时证书不受浏览器信任，也不是生产证书。其他
明文路径都必须限制在 loopback 或可信私有网络中。

内嵌 Redis ACL 继续隔离 `vine.hub`、`vine.link`、`vine.portal`；启用 mTLS 后，
Redis 还要求 ACL 用户名与 client 证书身份一致。外部 PostgreSQL 和 NATS endpoint
使用它们自己的认证与加密配置。

:::

清点每一个 listener：

| 边界 | 当前默认值 | 必需调用方 | 生产操作 |
| --- | --- | --- | --- |
| Hub Control API | `127.0.0.1:7071` | Link 与 Portal | 启用后台 mTLS，只绑定到可达的私有地址 |
| Hub Redis | `127.0.0.1:7072` | Link 与 Portal | 启用后台 mTLS；不要把它发布为通用 Redis 服务 |
| Hub Admin API 与 Web | `127.0.0.1:7075` | Portal | 启用后台 mTLS，并与组件流量隔离 |
| Link API | `127.0.0.1:7079` | 同主机部署的业务应用 | 保留在 sidecar 主机内，只允许它管理的应用访问 |
| Link ingress | `0.0.0.0:0` | Hub 调试工具、Portal 和远端 Link 实例 | 启用后台 mTLS；网络策略要求固定端口时设置固定地址 |
| 业务应用 HTTP | `127.0.0.1:0` | 它对应的 Link sidecar | 让应用与 Link 位于同一主机和部署信任边界内 |
| 普通 Hub 模式的内嵌 NATS | 随机 TCP 端口 | Hub 内部 publisher 与 Link 实例 | 启用后台 mTLS；运维需要固定 endpoint 时使用外部 NATS |
| Portal entry | Dashboard 默认 `http://:7099/`，启用 mTLS 时默认 `https://:7099/`；其他入口由 Hub 中的 Portal rule 定义 | 外部客户端 | 只暴露预期的 listener，并在生产使用前替换临时自签证书 |

- [ ] 只允许表格中列出的调用方集合。
- [ ] 准备一个 CA，以及分别标识 `vine.hub`、`vine.link`、`vine.portal` 且同时
  允许 server/client authentication 的证书。
- [ ] 在 Hub、每个 Link 与每个 Portal 上同时配置 `--mtls-ca-file`、
  `--mtls-cert-file`、`--mtls-key-file`。
- [ ] 防火墙需要显式规则时，使用 `--ingress-listen` 避免不可预测的 Link
  ingress 端口。
- [ ] 将每个应用与其 Link sidecar 部署在同一主机和部署信任边界内。使用不同
  container 时，两者之间必须保留私有本地路径；不支持部署在不同主机。
- [ ] 将 Hub Redis 访问权视为应用配置和 TLS 私钥材料的访问权。
- [ ] 确认外部流量通过 Portal 进入，而不是绕过网关路由和准入。

## 配置 Hub 持久化与消息系统

Hub 必须且只能选择一种数据库来源和一种 NATS 模式：

- [ ] 在 SQLite 与 PostgreSQL 中二选一。
- [ ] 在内嵌 NATS 与外部 NATS URL 中二选一。
- [ ] 使用外部 NATS 时，启用 JetStream，并使用当前 CLI 接受的
  `nats://` endpoint。

需要独立运维持久化和消息系统的生产环境，可以用 PostgreSQL 和外部 NATS
启动 Hub：

```bash
vine hub serve \
  --control-listen 10.0.1.10:7071 \
  --redis-listen 10.0.1.10:7072 \
  --admin-listen 10.0.1.10:7075 \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/hub.pem \
  --mtls-key-file /run/vine/hub-key.pem \
  --db-postgres-url "$VINE_DB_POSTGRES_URL" \
  --mq-external-nats-url "$VINE_MQ_EXTERNAL_NATS_URL"
```

Hub 数据库是导入配置、Portal rule 和证书的事实来源。Hub 通过 Redis
分发层发布 runtime 快照和变更；Redis 不能替代数据库。

:::warning Event 与 Task 的持久性

Vine 当前创建的 Event 和 Task JetStream stream 使用内存存储。外部 NATS
能提供独立运维的 runtime endpoint，但当前 stream 配置并不使用磁盘
存储。在验证精确故障场景之前，不要承诺消息能跨 NATS 或 cluster 重启
保留。

:::

- [ ] 按所选拓扑规划并监控 PostgreSQL 或 SQLite 的容量。
- [ ] 启动 Link 前，确认外部 NATS account 已启用 JetStream。
- [ ] 使用与生产一致的拓扑测试 NATS 断开和重连。
- [ ] 按 retry 和重复投递设计 Event Listener 与 Task Runner；传输
  存储不应作为唯一业务记录。

## 验证注册与故障语义

| 模式 | TTL 与 registry sweeper | Link 心跳 | 本地应用健康检查 |
| --- | --- | --- | --- |
| 应用与 Link 分开运行 | 启用 | 启用 | 启用 |
| 应用与 Link 同进程、Hub 走网络的 linked | 启用 | 启用 | 禁用；应用与 Link 共享一个进程 |
| 使用 inproc Hub 的 standalone | 禁用 | 禁用 | 禁用 |

使用普通网络 Hub 时，注册信息带有租约。Link 通过心跳续期，Hub 的
registry sweeper 会注销过期的应用实例并发布删除事件。独立运行的 Link
还会检查它管理的应用。Linked 模式保留网络租约和心跳，但由于 Link
和应用共享一个进程，不需要单独执行本地应用健康检查。

standalone/inproc 模式下，注册信息会保留到显式 unregister。此时没有
心跳、租约过期扫描或本地应用健康检查，因此 standalone 测试通过并
不能证明分布式存活机制正确。

在当前源码中，独立运行的 Link 每 5 秒检查一次应用，console ping 的 timeout
是 2 秒；连续三次发生非 timeout 失败后，Link 会注销应用。
调用 timeout 只会写入日志，不会增加该失败计数。Hub 租约为 30 秒，sweeper
每 5 秒运行一次。这些时间是当前实现常量，不是 CLI 调优参数。请分别测试
无响应应用和已停止进程：应用卡住时，Link 仍可能继续续订它在 Hub 中的
租约。

- [ ] 优雅停止一个应用，确认其 endpoint 消失。
- [ ] 不执行优雅停止而终止一个独立运行的应用，确认 Link 在 console ping
  连续发生非 timeout 失败后将其移除。
- [ ] 终止 Link 或断开其连接，确认 Hub 在剩余 endpoint 的租约过期后将其
  移除。
- [ ] 中断 Link 到 Hub 的连接，确认连接恢复后 discovery 最终收敛。
- [ ] 确认 Portal 和调用方不再向过期实例路由。
- [ ] 使用独立进程完成这些检查，不要以 inproc 测试替代。

注册和发现流程见 [运行机制](../runtime/mechanisms.md)。

## 规划优雅停止

在业务应用内部，`StopGracefully()` 按以下顺序执行：

1. 以逆序执行 Module 的 `BeforeAppStop()` hook。
2. 以逆序执行 Component 的 `BeforeAppStop()` hook。
3. 通过 Link 注销应用，包括 Link 侧的传播等待与排空。
4. 停止应用 server：HTTP shutdown 会等待在途 Handler，inproc shutdown
   则移除其 route registration。
5. 取消 runtime context。
6. 以逆序执行 Module 和 Component 的 `AfterAppStop()` hook。

分开部署的进程之间，应保留注销所需的依赖：

1. 停止发送新的外部流量。
2. 优雅停止业务应用。
3. 应用结束后再停止对应的 Link 进程。
4. 外部流量排空后停止 Portal。
5. 最后停止 Hub。

`linked` 模式会自动执行应用先于 Link 的顺序。Standalone 会逆序停止应用，
然后依次停止 Link、Portal 和 Hub。

- [ ] 使用 `StartAndWait()`，或在进程 signal 处理路径调用
  `StopGracefully()`。
- [ ] 为 orchestrator 设置足够长的终止宽限期，让生命周期 hook 和在途
  请求有时间完成。
- [ ] 让 shutdown hook 有明确时限并可观测。
- [ ] 确认正常 rollout 不会依赖租约过期来完成注销。

应用生命周期的完整说明见 [App API](../framework/app.md)。

## 保护配置、证书与备份

- [ ] 将数据库凭据、NATS URL、seed 文件和 TLS 私钥保存在源代码管理
  之外。
- [ ] 将 Hub 数据库、seed 文件、Hub Redis 和备份限制在同一个可信运维
  边界内。
- [ ] 备份 Hub 数据库，并在隔离环境中测试恢复。
- [ ] seed YAML 只用于导入初始状态，不应充当持续备份；此后数据库仍是
  事实来源。
- [ ] 恢复后，检查应用配置、Portal rule、site、证书和 endpoint 订阅。
- [ ] 依赖 HTTPS entry 前，演练证书替换和 SNI 匹配。

注意配置生命周期：`eternal` 配置属于启动状态，新 execution 可以看到更新
后的 `instant` 配置。修改只在启动时读取的值时，应计划重启应用。详见
[配置](../framework/configuration.md)。

## 在当前边界内扩缩容

- [ ] 确认每个业务应用实例都有不同的 runtime instance identity，并确认
  所有预期实例都已注册。
- [ ] 为每个 Link 提供可达的 ingress endpoint；基础设施不允许动态端口时
  使用固定地址。
- [ ] 注册多个目标实例时，同时验证本地与远端服务调用。
- [ ] 添加和移除实例后，验证 Portal 的 endpoint 选择与路由。
- [ ] 缩容时先优雅停止应用，再终止 Link。

已记录的控制面拓扑只有一个 Hub。当前文档没有定义 active-active Hub
协调或 failover 协议，因此在单独验证该架构之前，增加 Hub 进程数量
不等于生产 HA。

Portal 维护自己的 endpoint 订阅，并以轮询方式选择 RPC 和 Web
目标。Link 也会维护本地与远端调用所需的 discovery 状态。注册变更是异步
的，因此应在 rollout 期间测试收敛，不要假设 endpoint 列表会原子更新。

## 执行生产验证

在与生产环境具有相同进程和网络边界的 staging 环境中完成以下检查：

- [ ] 先启动 Hub，再启动 Portal 和 Link，最后启动业务应用。
- [ ] 通过每一个公开 Portal entry 发起请求。
- [ ] 至少完成一次应用到应用的 RPC 调用。
- [ ] 验证请求路径上的 trace ID 和 timeout 符合预期。
- [ ] 应用一次 `instant` 配置变更，并为 `eternal` 配置变更执行重启。
- [ ] 使用幂等测试动作演练 Event 和 Task 的 retry 行为。
- [ ] 测试应用优雅替换和实例突然丢失。
- [ ] 重启 Link，确认注册、订阅和路由恢复。
- [ ] 恢复近期 Hub 数据库备份，验证恢复后的控制面。
- [ ] 确认不可信网络无法访问任何内部 listener。

Vine 不会在业务应用中挂载通用 `/healthz` route。如果部署平台要求 HTTP
liveness 或 readiness endpoint，请添加由应用自己维护、并且语义与应用实际
依赖一致的 route。同时保留端到端请求检查：仅检查进程不能验证 Hub、Link、
Portal、discovery 或 forwarding。

timeout 与 trace 的验证方法见
[Trace 与 Timeout](../framework/trace-timeout.md)，日志和集成测试见
[日志与测试](../framework/logging-testing.md)。
