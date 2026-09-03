---
slug: /container-deployment
sidebar_label: 容器与 Kubernetes
description: 构建、配置并部署 Vine Hub、Link 与 Portal 容器镜像。
---

# 容器与 Kubernetes

Vine 为 Hub、Link 和 Portal 提供独立容器镜像。每个镜像运行对应的
`vine ... serve` 命令，并接受与 CLI 相同的 `VINE_*` 环境变量。

先选择[部署拓扑](../getting-started/deployment-modes.md)，再使用本指南。Kubernetes 文件
位于 Vine 仓库的 [`examples/k8s`](https://github.com/yorun-ai/vine/tree/main/examples/k8s)
目录。

## 选择镜像版本

官方镜像随每次 Vine release 发布到 GitHub Container Registry（GHCR）。镜像支持
Linux AMD64 与 ARM64。

| 组件 | 镜像 | 命令 |
| --- | --- | --- |
| Hub | `ghcr.io/yorun-ai/vine-hub:vX.Y.Z` | `vine hub serve` |
| Link | `ghcr.io/yorun-ai/vine-link:vX.Y.Z` | `vine link serve` |
| Portal | `ghcr.io/yorun-ai/vine-portal:vX.Y.Z` | `vine portal serve` |

三个组件应使用同一个不可变的 Vine release tag：

```bash
docker pull ghcr.io/yorun-ai/vine-hub:vX.Y.Z
docker pull ghcr.io/yorun-ai/vine-link:vX.Y.Z
docker pull ghcr.io/yorun-ai/vine-portal:vX.Y.Z
```

`latest` 跟随最新的非预发布版本。它可用于验证，但不要用于稳定部署。

镜像以无特权 `vine` 用户运行。Kubernetes base 会丢弃 Hub 和 Link 的全部
capability，只给 Portal 授予绑定 80 和 443 所需的 `NET_BIND_SERVICE`。证书和部署
配置不会写入镜像。

## 运行配置

Hub 默认不选择数据库或 NATS 模式。每个 Hub 容器必须在以下每组中准确配置一项：

| 关注点 | 选项一 | 选项二 |
| --- | --- | --- |
| 数据库 | `VINE_DB_SQLITE_FILE=/data/hub.sqlite` | `VINE_DB_POSTGRES_URL=postgres://...` |
| 消息系统 | `VINE_MQ_EMBEDDED_NATS=true` | `VINE_MQ_EXTERNAL_NATS_URL=nats://...` |

同一组不能同时设置两项。使用 SQLite 时，将持久化存储挂载到 `/data`。通过
`VINE_SEED_YAML_FILE` 配置 seed 文件时，也需要将对应文件挂载进容器。

Dockerfile 默认值和可接受的环境变量如下：

| 镜像 | 变量 | 镜像默认值 | 用途 |
| --- | --- | --- | --- |
| Hub | `VINE_CONTROL_LISTEN` | `0.0.0.0:7071` | Link 与 Portal 使用的 Control API |
| Hub | `VINE_ADMIN_LISTEN` | `0.0.0.0:7075` | Admin API 与 Dashboard Web |
| Hub | `VINE_REDIS_LISTEN` | `0.0.0.0:7072` | 内嵌 Redis endpoint |
| Hub | `VINE_DB_SQLITE_FILE` | 空 | SQLite 数据库路径 |
| Hub | `VINE_DB_POSTGRES_URL` | 空 | PostgreSQL 连接 URL |
| Hub | `VINE_MQ_EMBEDDED_NATS` | `false` | 启动内嵌 NATS |
| Hub | `VINE_MQ_EXTERNAL_NATS_URL` | 空 | 外部 NATS URL |
| Hub | `VINE_SEED_YAML_FILE` | 空 | 启动 seed 文件 |
| Hub | `VINE_DASHBOARD_URL` | 空 | 显式指定的 Dashboard 地址 |
| Link | `VINE_HUB_ENDPOINT` | `http://hub:7071` | Hub Control API endpoint |
| Link | `VINE_API_LISTEN` | `0.0.0.0:7079` | 面向应用的 Link API |
| Link | `VINE_INGRESS_LISTEN` | `0.0.0.0:7082` | Link ingress endpoint |
| Portal | `VINE_HUB_ENDPOINT` | `http://hub:7071` | Hub Control API endpoint |
| 全部 | `VINE_MTLS_CA_FILE` | 空 | 后台 mTLS CA 文件 |
| 全部 | `VINE_MTLS_CERT_FILE` | 空 | 组件证书文件 |
| 全部 | `VINE_MTLS_KEY_FILE` | 空 | 组件私钥文件 |

三个 mTLS 变量必须全部省略或全部配置。flag 对应关系和详细服务语义参阅
[CLI 参考](../getting-started/cli.md)。

## Kubernetes 快速部署

Kustomize base 使用独立的 `vine` namespace，显式选择 SQLite 和内嵌 NATS，适合
小规模的单副本部署：

```bash
kubectl apply -k https://github.com/yorun-ai/vine//examples/k8s?ref=main
kubectl -n vine get pods,svc,pvc
kubectl -n vine logs statefulset/hub
```

该远程命令跟随 `main`，仅供验证。稳定部署时，检出你要运行的 Vine release，将每个
镜像 tag 替换为该 release 的不可变 tag，再应用本地 `examples/k8s` 目录。

基础清单创建：

- 单副本 Hub `StatefulSet`、headless Service，以及 SQLite 使用的 5 Gi
  `ReadWriteOnce` volume claim；
- Link `Deployment` 和内部 API/ingress Service；
- Portal `Deployment`，以及暴露 80、443 和默认 Dashboard 入口 7099 的
  `LoadBalancer` Service；
- 每个组件的 startup、readiness 和 liveness TCP probe；
- 受限的 Pod/container 安全上下文：不挂载 service-account token、禁止提权、使用
  runtime-default seccomp profile，并将根文件系统设为只读。

Link 和 Portal 使用 init container 等待 `hub:7071` 上的 Hub Control API。Hub Service
使用 headless 模式，是因为内嵌 NATS 会选择动态端口并通过 `InfoService` 上报；直接解析
到 Pod 才能让该端口保持可达。使用 SQLite 时，Hub 应保持单副本。

Portal 默认使用 `LoadBalancer` Service。集群没有云负载均衡器时，改为
`ClusterIP`，通过 ingress controller 暴露所需的 Portal listener，或在开发时使用
`kubectl port-forward`。

## 后台 mTLS overlay

基础清单在组件之间使用 HTTP，因此没有证书也能启动。`overlays/mtls` Kustomize
overlay 用于启用后台 mTLS。在本地 Vine checkout 中操作，并为每个组件准备独立
身份，使用以下 SPIFFE path：

```text
spiffe://<trust-domain>/vine/daemon/vine.hub
spiffe://<trust-domain>/vine/daemon/vine.link
spiffe://<trust-domain>/vine/daemon/vine.portal
```

使用存放在仓库之外的证书文件创建 namespace 和组件 Secret：

```bash
kubectl apply -f examples/k8s/base/namespace.yaml

kubectl -n vine create secret generic vine-hub-mtls \
  --from-file=ca.pem=mtls/ca.pem \
  --from-file=cert.pem=mtls/hub.pem \
  --from-file=key.pem=mtls/hub-key.pem \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n vine create secret generic vine-link-mtls \
  --from-file=ca.pem=mtls/ca.pem \
  --from-file=cert.pem=mtls/link.pem \
  --from-file=key.pem=mtls/link-key.pem \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n vine create secret generic vine-portal-mtls \
  --from-file=ca.pem=mtls/ca.pem \
  --from-file=cert.pem=mtls/portal.pem \
  --from-file=key.pem=mtls/portal-key.pem \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -k examples/k8s/overlays/mtls
```

overlay 将每个 Secret 以只读方式挂载到 `/run/vine/mtls`，设置全部三个
`VINE_MTLS_*` 变量，并将 Link 和 Portal 改为
`VINE_HUB_ENDPOINT=https://hub:7071`。Portal 对外 HTTPS listener 使用的公开证书
属于另一套配置边界，由 Hub 管理。

## 私有镜像仓库

使用私有镜像仓库时，创建 image-pull Secret，并在每个 Pod spec 中设置
`imagePullSecrets`。修改镜像位置时，应同时更新 Hub、Link 和 Portal 的 container，以及
Link 和 Portal 的 init container。

## 生产调整

基础清单是可运行示例，并非通用生产配置。进入生产环境前：

- 将三个镜像固定到同一个不可变 Vine release；
- 需要持久性、独立扩缩容或固定消息 endpoint 时，使用托管 PostgreSQL 和外部 NATS；
- 外部 NATS 消除动态端口要求后，调整 headless Hub Service；
- 提供后台 mTLS 身份和私有网络策略；
- 决定如何暴露 Portal listener，以及如何签发和轮换公开 TLS 证书；
- 为目标集群配置资源 request、limit、中断策略、备份和监控。

部署上线前，应继续完成[生产就绪检查清单](./production-readiness.md)。
