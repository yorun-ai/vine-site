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
vine dev
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

未指定数据库时，`dev` 会创建临时 SQLite，并在优雅退出后删除。需要跨运行保留
Hub 状态时可指定数据库文件；需要初始化应用配置或 Portal 路由时可指定 seed：

```bash
vine dev \
  --db-sqlite-file ./hub-dev.sqlite \
  --seed-yaml-file ./seed.yaml \
  --dashboard-url http://:7099/
```

可用选项：

- `--link-api-listen`：供外部应用连接的 Link API 地址，默认
  `127.0.0.1:7079`
- `--db-sqlite-file` / `--db-postgres-url`：可选的 Hub 持久化存储
- `--seed-yaml-file`：可选的 Hub seed 数据
- `--dashboard-url`：Hub Dashboard 的 Portal 入口，默认 `http://:7099/`

对应的环境变量为 `VINE_API_LISTEN`、`VINE_DB_SQLITE_FILE`、
`VINE_DB_POSTGRES_URL`、`VINE_SEED_YAML_FILE` 和 `VINE_DASHBOARD_URL`。
按 `Ctrl+C` 会依次优雅停止 Link、Portal 和 Hub。

`dev` 保留 App 到 Link 以及 Link 到 App 的网络边界，但不模拟本地 Vine 运行时
内部的网络故障、租约或 TTL 过期。部署与基础设施验证仍使用各组件的独立命令。

## hub

`hub` 是配置、注册和管理中心。

启动 hub，使用本地 NATS 和 SQLite：

```bash
vine hub serve \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

指定外部 NATS：

```bash
vine hub serve \
  --mq-external-nats-url nats://127.0.0.1:4222 \
  --db-sqlite-file ./hub.sqlite
```

使用 PostgreSQL：

```bash
vine hub serve \
  --mq-external-nats-url nats://127.0.0.1:4222 \
  --db-postgres-url postgres://demo:demo@127.0.0.1:5432/hub
```

指定监听地址：

```bash
vine hub serve \
  --api-listen 127.0.0.1:7071 \
  --redis-listen 127.0.0.1:7073 \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

Hub API 和内嵌 Redis 默认分别监听 `127.0.0.1:7071` 和 `127.0.0.1:7073`。需要跨主机访问时，请显式指定可达的监听地址并通过防火墙限制访问。特别提醒：内嵌 Redis 只能暴露在可信网络中。

从 seed YAML 初始化数据：

```bash
vine hub serve \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite \
  --seed-yaml-file ./seed.yaml
```

指定 Hub Dashboard 访问地址：

```bash
vine hub serve \
  --dashboard-url http://:7099/ \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

`--dashboard-url` 默认值是 `http://:7099/`，用于配置 Hub Dashboard 的 Portal 入口规则。支持指定 host、端口和路径，例如 `https://hub.example.com:8443/admin`。

环境变量也能提供同名配置：

- `VINE_API_LISTEN`
- `VINE_REDIS_LISTEN`
- `VINE_MQ_EXTERNAL_NATS_URL`
- `VINE_MQ_EMBEDDED_NATS`
- `VINE_SEED_YAML_FILE`
- `VINE_DASHBOARD_URL`
- `VINE_DB_SQLITE_FILE`
- `VINE_DB_POSTGRES_URL`

注意：

- `--db-sqlite-file` 和 `--db-postgres-url` 必须二选一
- `--mq-external-nats-url` 和 `--mq-embedded-nats` 必须二选一

## link

`link` 是应用侧运行时，负责连接 Hub、接收 Portal 或其他 Link 的 ingress，并注册
它所管理的应用能力。

启动 link：

```bash
vine link serve \
  --hub-endpoint http://127.0.0.1:7071
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
  --hub-endpoint http://127.0.0.1:7071
```

环境变量：

- `VINE_HUB_ENDPOINT`

## 常见工作流

### 本地调试外部应用

```bash
vine dev
go run ./cmd/myapp
```

### 单独启动运行时基础服务

```bash
vine hub serve --mq-embedded-nats --db-sqlite-file ./hub.sqlite
vine link serve --hub-endpoint http://127.0.0.1:7071
vine portal serve --hub-endpoint http://127.0.0.1:7071
```
