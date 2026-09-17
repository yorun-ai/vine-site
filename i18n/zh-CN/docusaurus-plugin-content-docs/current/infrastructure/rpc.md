---
slug: /rpc
sidebar_label: Rpc API
---

# Rpc API

业务代码应先按[使用 Rpc](../framework/rpc-guide.md)里的方式使用生成的 client 和
server。需要调整调用选项、编写 executor 或接入 transport 时，再查下面的底层 API。
HTTP 承载格式单独列在 [vRPC over HTTP](./vrpc-http.md)。

`core/rpc` 提供统一的 Rpc 抽象，负责：

- 注册服务与方法元信息
- 创建 client 发起调用
- 创建 server 接收请求
- 在上下文里传递 trace / initiator / actor / client
- 选择直接反射执行，或经由 `ctr/di` 容器执行

它默认和生成代码配套使用。

## 和生成代码的关系

典型流程：

1. 用 `.skel` 定义 service
2. 生成 Go 代码
3. 生成代码中的 `init()` 自动调用 `rpc.Register(...)`
4. 业务实现生成出的 server 接口
5. 用 `rpc.NewClient(...)` 或 `rpc.NewServer(...)` 运行

不推荐手写完整 `ServiceSpec`。

## Client

### `ClientOption`

`ClientOption` 的字段如下：

```go
type Option struct {
    Context             meta.Context
    ClientApp           meta.App
    Logger              *logger.Logger
    ReturnIfSystemError bool
    ServerEndpoint      string
    Transport           http.RoundTripper
}
```

注意：

- 字段名是 `ServerEndpoint`
- `Context` 必须非空
- `Logger` 必须非空
- `ReturnIfSystemError == false` 时，system error 默认会直接 panic

### 创建与调用

```go
client := rpc.NewClient(rpc.ClientOption{
    Context:        metaCtx,
    ClientApp:      appInfo,
    Logger:         logger.New("app", appInfo.Name(), "rpc", "client"),
    ServerEndpoint: "http://127.0.0.1:8080",
})
```

调用入口：

```go
result, err := client.Invoke(methodInfo, arguments, options...)
```

返回值：

- 第一个返回值是业务结果
- 第二个返回值是 `ex.Error`

需要具体类型的结果时，使用 `InvokeAs[T]`：

```go
result, err := client.InvokeAs[string](methodInfo, arguments, options...)
```

非 nil 的结果必须可赋值给 `T`。返回错误或没有结果时，第一个返回值为 `T` 的零值。
调用选项和 system error 的处理方式与 `Invoke` 一致。

### Invoke 选项

调用选项包括：

- `rpc.WithContext(ctx)`
- `rpc.WithTimeout(duration)`
- `rpc.WithDestination(appName)`

规则：

- `WithTimeout(...)` 必须大于 0
- `WithContext(...)` 只覆盖底层请求生命周期使用的父 `context.Context`
- `WithContext(...)` 不会覆盖 Rpc 元数据，trace / initiator / actor 仍来自 client 自己的 `meta.Context`
- `WithContext(...)` 与 `WithTimeout(...)` 不可同时使用
- 不传 `WithContext(...)` 时，默认请求超时是 `30s`

`WithDestination(appName)` 只在指定应用的实例中选择服务提供者，名称必须非空；不传该选项时保持原有路由。目标应用不提供该服务时返回 `ServiceUnavailable`，不会回退到其他应用。

`WithDestination` 只作用于 App 到 Link 的调用。Portal 会丢弃 `vrpc-options` 中的 `destination` 字段，因此该选项对经 Portal 路由的请求无效。

### `ReturnIfSystemError`

当 `ReturnIfSystemError == true` 时，客户端会把 system error 作为返回值交给调用方处理，而不是直接 panic。

默认值是 `false`。

## Server

### `ServerOption`

创建方式：

```go
server := rpc.NewServer(rpc.ServerOption{
    App:          appInfo,
    HandlerTypes: []reflect.Type{reflect.TypeFor[*UserServiceImpl]()},
})
```

### 暴露能力

`Server` 提供 `HTTPHandler()`，它返回标准 `http.Handler`，可用于把 Rpc endpoint 挂载到你自己
的 server 上。

## Executor

server 通过 executor 执行方法，框架内置两种实现。

### `NewDefaultExecutor()`

默认 executor 直接调用 handler 方法。

如果 handler struct 中有且只有一个 `rpc.Context` 类型字段，当前 Rpc 上下文会注入其中。

### `NewContainerExecutor(...)`

```go
rpc.NewContainerExecutor(filterTypes, bindAppliers)
```

该 executor 接入 DI 容器与 filter 链。需要 filter、DI 或上下文扩展的执行链使用它；它让当前
`rpc.Context` 与 `rpc.MethodInfo` 可在执行期间注入。

## `rpc.Context`

`rpc.Context` 在 `meta.Context` 基础上补充了 `Client()`：

```go
type Context interface {
    meta.Context
    Client() meta.App
}
```

创建方式：

```go
rpcCtx := rpc.NewContext(ctx, trace, clientApp, initiator, actor)
```

它表示：

- 当前 trace
- 当前 initiator
- 当前 actor
- 本次 Rpc 调用的 client app

## 普通接口与 ER 接口

框架同时支持两套服务签名风格。

普通 server：

```go
type UserServiceServer interface {
    GetUser(id string) User
}
```

ER server：

```go
type UserServiceServerER interface {
    GetUser(id string) (User, ex.Error)
}
```

规则：

- 普通 server 的业务错误通常通过 panic / recover 链路处理
- ER server 的最后一个返回值固定是 `ex.Error`

## 使用底层 API 时

- 服务和方法定义以生成的元信息为准，不要再手写一套完整 spec
- 构造 client 时传入 `Logger`
- server 需要 context 注入或 filter 时使用 `NewContainerExecutor(...)`
- 只有明确要接住并处理 system error 的边界，才设置 `ReturnIfSystemError`
