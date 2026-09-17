---
slug: /cli
sidebar_label: Vine CLI
---

# Vine CLI

`vine` 命令可以启动单独的 Hub、Link、Portal，也能查看当前 binary 的构建版本。

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
  --admin-listen 127.0.0.1:7099 \
  --db-sqlite-file ./hub.sqlite
```

Hub Control API、watch listener、Admin API 与 Dashboard listener 默认分别监听
`127.0.0.1:7071`、`127.0.0.1:7072`、`127.0.0.1:7099`。

从 seed YAML 初始化数据：

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite \
  --seed-data-file ./seed.yaml
```

可通过 `--seed-source-file` 提供字段来源，通过 `--seed-vars-file`
提供部署变量字典。SQLite 或 PostgreSQL 仅在首次初始化时读取这些文件；
no-db 模式每次启动都重新读取。用法见[部署变量](../framework/configuration.md#deployment-variables)。

admin listener 提供 Dashboard，并在 `/api/invoke` 上响应 Admin API，浏览器因此只需访问
同一个 origin。Dashboard 只属于这个 listener：Hub 不为它发布 Portal 入口、站点或规则，
它也不需要单独的访问地址。即使启用了后台 mTLS，该 listener 仍使用明文 HTTP，因为操作者
的浏览器并不持有 mesh 证书；请让它只监听 loopback 或位于可信网络内。

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
- `VINE_SEED_DATA_FILE`
- `VINE_SEED_SOURCE_FILE`
- `VINE_SEED_VARS_FILE`
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

使用 `app/linked` 的程序通过带 Link 前缀的参数配置内嵌 Link：`--link-mtls-ca-file`、
`--link-mtls-cert-file` 和 `--link-mtls-key-file`，或 `VINE_LINK_MTLS_CA_FILE`、
`VINE_LINK_MTLS_CERT_FILE` 和 `VINE_LINK_MTLS_KEY_FILE`；也可以直接在
`linked.Option` 上设置 `MTLSCAFile`、`MTLSCertFile` 和 `MTLSKeyFile`。

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

### 让外部应用连接本地运行时服务

```bash
vine hub serve --seed-data-file ./seed.yaml
vine link serve --hub-endpoint http://127.0.0.1:7071
go -C ./src/server run ./cmd/myapp
```

`app.New` 创建的应用默认连接 `http://127.0.0.1:7079` 的 Link API；Link 监听其他
地址时，使用 `VINE_LINK_ENDPOINT` 或 `app.Option.LinkEndpoint`。

### 单独启动运行时基础服务

```bash
vine hub serve --db-sqlite-file ./hub.sqlite
vine link serve --hub-endpoint http://127.0.0.1:7071
vine portal serve --hub-endpoint http://127.0.0.1:7071
```
