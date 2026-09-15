---
slug: /cli
sidebar_label: Vine CLI
---

# Vine CLI

`vine` 命令可以启动本地开发运行时或单独的 Hub、Link、Portal，也能查看当前
binary 的构建版本。

- `dev`：为独立进程中的业务应用启动本地运行时
- `hub` / `link` / `portal`：启动 Vine 运行时基础服务
- `version`：查看当前 CLI 版本

查看版本：

```bash
vine version
```

查看帮助：

```bash
vine --help
vine hub serve --help
```

## 安装与版本

安装 `next` 当前描述的源码版本：

```bash
go install go.yorun.ai/vine/cmd/vine@main
```

确认安装结果：

```bash
which vine
vine version
```

正式发布应用时，请把 `main` 换成与应用 module 相同、经过审查的 commit 或 tag。
升级前先看[版本兼容性](./compatibility.md)。

## dev

`dev` 在一个 CLI 进程中启动 Hub、Portal 和 Link，供本地业务应用调试：

```bash
vine dev --seed-hub-data-file ./seed.yaml
```

Hub Rpc、Redis、NATS、Portal 到 Hub、Link 到 Hub，以及 Portal 到 Link 的流量
均使用进程内 transport。Link 仍监听 `127.0.0.1:7079`，因此另一个进程中的业务
应用会保留正常的网络边界：

```go title="main.go"
app.New[*HelloApp]().StartAndWait()
```

`app.New` 默认使用的 Link endpoint 已经是 `http://127.0.0.1:7079`。需要其他地址
时，将 `--link-api-listen` 与 `VINE_LINK_ENDPOINT` 或
`app.Option.LinkEndpoint` 配套设置。

未指定数据库时，`dev` 使用默认的 `--no-db` 模式：seed 文件加载到内存，配置保持只读。
需要跨运行保留 Hub 状态并可写时，指定数据库文件；需要初始化应用配置或 Portal 路由时，指定 seed：

```bash
vine dev \
  --db-sqlite-file ./hub-dev.sqlite \
  --seed-hub-data-file ./seed.yaml \
  --dashboard-url http://:7099/
```

可用选项：

- `--link-api-listen`：供外部应用连接的 Link API 地址，默认
  `127.0.0.1:7079`
- `--no-db`：不使用持久化数据库，两个数据库参数都未指定时的默认值；此时必须提供
  `--seed-hub-data-file`，配置只读
- `--db-sqlite-file` / `--db-postgres-url`：可选的 Hub 持久化存储
- `--seed-hub-data-file`：Hub seed 数据；默认的 `--no-db` 模式下必需
- `--seed-hub-source-file`：可选的 seed 字段来源文件
- `--seed-hub-vars-file`：部署变量 YAML 字典
- `--dashboard-url`：Hub Dashboard 的 Portal 入口；默认 `http://:7099/`，启用
  后台 mTLS 时默认 `https://:7099/`

对应的环境变量为 `VINE_API_LISTEN`、`VINE_NO_DB`、`VINE_DB_SQLITE_FILE`、
`VINE_DB_POSTGRES_URL`、`VINE_SEED_HUB_DATA_FILE`、
`VINE_SEED_HUB_SOURCE_FILE`、`VINE_SEED_HUB_VARS_FILE` 和 `VINE_DASHBOARD_URL`。
按 `Ctrl+C` 会依次优雅停止 Link、Portal 和 Hub。

`dev` 保留 App 到 Link 以及 Link 到 App 的网络边界，但不模拟本地 Vine 运行时
内部的网络故障、租约或 TTL 过期。部署与基础设施验证仍使用各组件的独立命令。

## hub

`hub` 是配置、注册和管理中心。

启动 hub，使用本地 NATS 和 SQLite：

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite
```

使用外部 NATS 时，先使用 NATS CLI 创建所需的 JetStream stream，再启动 Hub 或
Link。下面的示例使用文件存储和单副本；请根据实际部署拓扑调整 `--storage` 和
`--replicas`：

```bash
export VINE_MQ_NATS_ENDPOINT=nats://127.0.0.1:4222

nats --server "$VINE_MQ_NATS_ENDPOINT" stream add VINE_EVENTS \
  --subjects "event.>" \
  --retention interest \
  --storage file \
  --replicas 1 \
  --defaults

nats --server "$VINE_MQ_NATS_ENDPOINT" stream add VINE_TASKS \
  --subjects "task.>" \
  --retention workqueue \
  --storage file \
  --replicas 1 \
  --defaults
```

分别运行 `nats --server "$VINE_MQ_NATS_ENDPOINT" stream info
VINE_EVENTS` 和对应的 `VINE_TASKS` 命令，确认两个 stream 都已就绪，再启动
Hub：

```bash
vine hub serve \
  --mq-mode=nats \
  --mq-nats-endpoint "$VINE_MQ_NATS_ENDPOINT" \
  --db-sqlite-file ./hub.sqlite
```

使用 PostgreSQL：

```bash
vine hub serve \
  --mq-mode=nats \
  --mq-nats-endpoint nats://127.0.0.1:4222 \
  --db-postgres-url postgres://demo:demo@127.0.0.1:5432/hub
```

指定监听地址：

```bash
vine hub serve \
  --control-listen 127.0.0.1:7071 \
  --watch-listen 127.0.0.1:7072 \
  --admin-listen 127.0.0.1:7075 \
  --db-sqlite-file ./hub.sqlite
```

Hub Control API、watch listener、Admin API 与 Web listener 默认分别监听
`127.0.0.1:7071`、`127.0.0.1:7072`、`127.0.0.1:7075`。

从 seed YAML 初始化数据：

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite \
  --seed-hub-data-file ./seed.yaml
```

可通过 `--seed-hub-source-file` 提供字段来源，通过 `--seed-hub-vars-file`
提供部署变量字典。SQLite 或 PostgreSQL 仅在首次初始化时读取这些文件；
no-db 模式每次启动都重新读取。用法见[部署变量](../framework/configuration.md#deployment-variables)。

指定 Hub Dashboard 访问地址：

```bash
vine hub serve \
  --dashboard-url http://:7099/ \
  --db-sqlite-file ./hub.sqlite
```

`--dashboard-url` 默认值是 `http://:7099/`，启用后台 mTLS 时则是
`https://:7099/`。它用于配置 Hub Dashboard 的 Portal 入口规则，支持指定 host、
端口和路径，例如 `https://hub.example.com:8443/admin`。mTLS 下的 HTTPS 默认入口
会使用 Portal 的临时自签 Web 证书，直到配置匹配的公开证书；因此引导阶段浏览器会
将该证书标记为不受信任。

配置锁后端：

```bash
vine hub serve \
  --lock-mode=redis \
  --lock-redis-endpoint redis://redis.example.com:6379/0 \
  --db-sqlite-file ./hub.sqlite
```

Hub 默认使用 `--lock-mode=embedded`，租约锁保存在自身内存中，重启后丢失。
`--lock-mode=redis` 改为使用 `--lock-redis-endpoint` 指定的 Redis 数据库，该地址
支持 `redis://` 和 `rediss://`。`--lock-mode=disable` 拒绝锁操作。应用侧用法见
[Lock 模式](../runtime/hub.md#lock-模式)。

环境变量也能提供同名配置：

- `VINE_CONTROL_LISTEN`
- `VINE_ADMIN_LISTEN`
- `VINE_WATCH_LISTEN`
- `VINE_LOCK_MODE`
- `VINE_LOCK_REDIS_ENDPOINT`
- `VINE_MQ_NATS_ENDPOINT`
- `VINE_MQ_MODE`
- `VINE_SEED_HUB_DATA_FILE`
- `VINE_SEED_HUB_SOURCE_FILE`
- `VINE_SEED_HUB_VARS_FILE`
- `VINE_DASHBOARD_URL`
- `VINE_DB_SQLITE_FILE`
- `VINE_DB_POSTGRES_URL`

注意：

- `--db-sqlite-file` 和 `--db-postgres-url` 必须二选一
- Hub 默认使用 `--mq-mode=embedded`，此时拒绝 `--mq-nats-endpoint`。
  连接外部 NATS 时，必须同时提供 `--mq-mode=nats` 和 `--mq-nats-endpoint`。
- `--lock-mode=redis` 必须提供 `--lock-redis-endpoint`；`embedded` 和 `disable`
  模式拒绝该参数。

## 后台 mTLS 参数

`hub serve`、`link serve` 与 `portal serve` 共用以下参数：

- `--mtls-ca-file`：用于认证 Vine 组件的 CA 证书。
- `--mtls-cert-file`：当前组件的身份证书。
- `--mtls-key-file`：身份证书对应的私钥。

三个参数必须同时提供。每张证书都必须是仅含一个 SPIFFE URI SAN 的 X.509-SVID；
Hub、Link 与 Portal 的身份分别是
`spiffe://<trust-domain>/vine/daemon/vine.hub`、
`spiffe://<trust-domain>/vine/daemon/vine.link` 与
`spiffe://<trust-domain>/vine/daemon/vine.portal`，相互通讯的组件必须使用相同 trust domain。
证书还必须同时允许 server 与 client authentication。DNS SAN 即使存在，也不参与
组件身份授权。对应环境变量是 `VINE_MTLS_CA_FILE`、`VINE_MTLS_CERT_FILE` 和
`VINE_MTLS_KEY_FILE`。

使用 `app/linked` 的程序也支持相同的参数和环境变量；还可以通过
`linked.Option.MTLSCAFile`、`MTLSCertFile` 和 `MTLSKeyFile` 直接配置内嵌 Link。

Link 或 Portal 启用 mTLS 时，`--hub-endpoint` 必须使用 `https://`；后台服务注册
也必须使用 HTTPS，组件不会静默接受旧的明文 endpoint。

## link

`link` 是应用侧运行时，负责连接 Hub、接收 Portal 或其他 Link 的 ingress，并注册
它所管理的应用能力。

启动 link：

```bash
vine link serve \
  --hub-endpoint https://hub.internal:7071 \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/link.pem \
  --mtls-key-file /run/vine/link-key.pem
```

指定监听地址：

```bash
vine link serve \
  --api-listen 127.0.0.1:7081 \
  --ingress-listen 127.0.0.1:7082 \
  --hub-endpoint http://127.0.0.1:7071
```

环境变量：

- `VINE_API_LISTEN`
- `VINE_INGRESS_LISTEN`
- `VINE_HUB_ENDPOINT`

## portal

`portal` 是应用网关，从 hub 获取 portal entry / rule / site 配置，然后把外部请求转发到目标应用。

启动 portal：

```bash
vine portal serve \
  --hub-endpoint https://hub.internal:7071 \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/portal.pem \
  --mtls-key-file /run/vine/portal-key.pem
```

环境变量：

- `VINE_HUB_ENDPOINT`

## 常见工作流

### 本地调试外部应用

```bash
vine dev --seed-hub-data-file ./seed.yaml
go -C ./src/server run ./cmd/myapp
```

### 单独启动运行时基础服务

```bash
vine hub serve --db-sqlite-file ./hub.sqlite
vine link serve --hub-endpoint http://127.0.0.1:7071
vine portal serve --hub-endpoint http://127.0.0.1:7071
```
