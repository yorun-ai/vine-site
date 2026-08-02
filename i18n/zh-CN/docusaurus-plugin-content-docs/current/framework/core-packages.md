---
slug: /core-packages
title: 公共 Package
sidebar_label: 公共 Package
description: 应用任务对应的 Vine package，以及底层 API 的使用边界。
---

# 公共 Package

Vine 用 facade package 保持公共 Go API 的边界清晰。应用代码从 `app` 和生成的
contract 类型开始，只为实际使用的能力引入对应的 `core/*` 或 `infra/*` package。

精确到 symbol 的权威参考是
[`pkg.go.dev/go.yorun.ai/vine`](https://pkg.go.dev/go.yorun.ai/vine)。下面这份导航补充
symbol 索引无法回答的问题：**应用代码应该选择哪个 package？**

:::warning 公共边界

`internal/` 下的 package 属于实现细节。它们或许能帮助理解 stack trace，但应用代码
请勿导入或复制这些实现。公共行为由下列 package 和本站记录的运行时 contract 定义。

:::

## 应用装配

| 任务 | Package | 从这里开始 |
| --- | --- | --- |
| 声明应用、Component、Module、能力与生命周期 hook，并让一个或多个应用连接外部 Link 运行 | [`app`](https://pkg.go.dev/go.yorun.ai/vine/app) | [应用模型](./application-model.md) |
| 用内嵌 Hub、Link、Portal 运行一个或多个应用 | [`app/standalone`](https://pkg.go.dev/go.yorun.ai/vine/app/standalone) | [第一个应用](../getting-started/tutorial-first-app.md) |
| 用进程内 Link 连接外部 Hub 并运行一个或多个应用 | [`app/linked`](https://pkg.go.dev/go.yorun.ai/vine/app/linked) | [部署拓扑](../getting-started/deployment-modes.md) |
| 在可控的 standalone 运行时中测试应用行为 | [`app/testkit`](https://pkg.go.dev/go.yorun.ai/vine/app/testkit) | [日志与测试](./logging-testing.md) |

大多数 `main` package 只需要选择一个运行模式 constructor：

```go
standalone.NewWithOption[*CheckoutApp](standalone.Option{
    SQLiteFile: "./vine.sqlite",
}).StartAndWait()
```

应用装配应留在 application spec 中，不要在 `main` 里手工构造底层 server 或 transport。

## 应用能力

| 能力 | Package | 应用代码使用的对象 |
| --- | --- | --- |
| 配置 | [`core/conf`](https://pkg.go.dev/go.yorun.ai/vine/core/conf) | 注入 Module 或 execution 的生成配置类型 |
| RPC | [`core/rpc`](https://pkg.go.dev/go.yorun.ai/vine/core/rpc) | 生成的服务 client 与 server 实现 |
| Web | [`core/web`](https://pkg.go.dev/go.yorun.ai/vine/core/web) | 生成的 Web Handler、router、assets server 或 reverse proxy |
| Event | [`core/event`](https://pkg.go.dev/go.yorun.ai/vine/core/event) | 生成的 emitter 与 Listener |
| Task | [`core/task`](https://pkg.go.dev/go.yorun.ai/vine/core/task) | 生成的 launcher 与 Runner |
| Skel 运行时类型 | [`core/skel`](https://pkg.go.dev/go.yorun.ai/vine/core/skel) | 生成的 scalar/schema 辅助类型与 `MinSkelcVersion()` |

生成代码已经把这些 package 接入类型安全 facade。推荐优先使用生成的 client、Handler、
Listener 或 Runner，而不是手工构造 `ServiceSpec`、`WebSpec`、`EventSpec` 或 `TaskSpec`。

只有在构建框架集成、自定义 executor 或 transport adapter 时，才需要这些 package
中的底层 constructor。对应参考页记录了这些高级 API：

- [RPC API](../infrastructure/rpc.md)
- [基于 HTTP 的 vRPC](../infrastructure/vrpc-http.md)
- [App API](./app.md)

## 执行基础

| 关注点 | Package | 何时使用 |
| --- | --- | --- |
| 依赖绑定与 scope | [`core/di`](https://pkg.go.dev/go.yorun.ai/vine/core/di) | 绑定公共依赖或编写自定义集成 |
| 带 filter 的方法执行 | [`core/ctr`](https://pkg.go.dev/go.yorun.ai/vine/core/ctr) | 实现 filter 或自定义执行管线 |
| Context、trace、应用身份与 Actor | [`core/meta`](https://pkg.go.dev/go.yorun.ai/vine/core/meta) | 读取身份/context 或显式创建调用 context |
| 结构化框架错误 | [`core/ex`](https://pkg.go.dev/go.yorun.ai/vine/core/ex) | 跨边界返回稳定错误码 |
| 结构化日志 | [`core/logger`](https://pkg.go.dev/go.yorun.ai/vine/core/logger) | 使用 Vine category 与 context 字段记录应用日志 |
| 敏感数据投影 | [`core/redact`](https://pkg.go.dev/go.yorun.ai/vine/core/redact) | 在诊断输出前遮蔽生成类型或应用数据 |
| 进程 runtime 与 executable 身份 | [`core/runtime`](https://pkg.go.dev/go.yorun.ai/vine/core/runtime) | 读取进程级 runtime 名称、版本、instance ID 或构建信息；它不标识 bundle 中的某一个 App |
| 构建元数据 | [`buildinfo`](https://pkg.go.dev/go.yorun.ai/vine/buildinfo) | 写入或读取发布时的 linker 元数据 |

对于普通 RPC、Web、Event 与 Task Handler，Vine 会自动创建 execution container 并注入
正确 context。把依赖保留到接收它的 Handler 之外前，请先阅读
[依赖与执行模型](../runtime/execution-model.md)。

## 基础设施组件

| 需求 | Package | 指南 | 参考 |
| --- | --- | --- | --- |
| 关系型数据库、GORM 连接、类型化 DAO/query | [`infra/rdb`](https://pkg.go.dev/go.yorun.ai/vine/infra/rdb) | [RDB 指南](./rdb-guide.md) | [RDB API](../infrastructure/rdb.md) |
| Redis client、类型化 cache、分布式 locker | [`infra/redis`](https://pkg.go.dev/go.yorun.ai/vine/infra/redis) | [Redis 指南](./redis-guide.md) | [Redis API](../infrastructure/redis.md) |

建议将它们声明为应用 Component。这样 Vine 会在业务模块之前创建依赖，通过 DI
公开它们，并在业务模块结束后再停止它们。

## 可复用工具

`util/*` 是不依赖框架运行时的公共辅助 package：

| Package | 用途 |
| --- | --- |
| [`util/vcode`](https://pkg.go.dev/go.yorun.ai/vine/util/vcode) | JSON、CBOR、YAML、压缩与 Base58 辅助 |
| [`util/vfile`](https://pkg.go.dev/go.yorun.ai/vine/util/vfile) | 文件路径、读写辅助 |
| [`util/vmap`](https://pkg.go.dev/go.yorun.ai/vine/util/vmap) | Map collection、查找、stream 与并发 map |
| [`util/vmath`](https://pkg.go.dev/go.yorun.ai/vine/util/vmath) | 图与数值辅助 |
| [`util/vnet`](https://pkg.go.dev/go.yorun.ai/vine/util/vnet) | 地址、IP 与 URL 辅助 |
| [`util/vpre`](https://pkg.go.dev/go.yorun.ai/vine/util/vpre) | 框架风格的前置条件检查 |
| [`util/vslice`](https://pkg.go.dev/go.yorun.ai/vine/util/vslice) | Slice collection、set、查找、stream 与并发辅助 |
| [`util/vstring`](https://pkg.go.dev/go.yorun.ai/vine/util/vstring) | 字符串与分隔值辅助 |

标准库函数同样清晰时，优先用标准库。这些 package 最适合已经处于 Vine 相关调用
路径中的通用操作。

## 实际查阅顺序

1. 先学习 `app` 与一个运行模式 package。
2. 按应用实际暴露的能力逐一阅读对应指南。
3. 编写 filter、自定义绑定或 context-sensitive 基础设施时，再阅读执行基础部分。
4. 用 symbol reference 查询精确签名，用本站 Reference 部分查询 wire 行为与框架默认值。
