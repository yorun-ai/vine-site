---
slug: /rpc
sidebar_label: Rpc API
---

# Rpc API

日常使用请先阅读 [使用 Rpc](../framework/rpc-guide.md)。HTTP 线协议见 [vRPC over HTTP](./vrpc-http.md)。本页列出 `core/rpc` 的 client、server、executor 和服务元信息 API，适合调整底层调用选项或构建自定义接入层时查阅。

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

通常不建议手写完整 `ServiceSpec`。

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
}
```

注意：

- 字段名是 `ServerEndpoint`
- `Context` 不能为空
- `Logger` 不能为空
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

### Invoke 选项

调用选项包括：

- `rpc.WithContext(ctx)`
- `rpc.WithTimeout(duration)`

规则：

- `WithTimeout(...)` 必须大于 0
- `WithContext(...)` 只覆盖底层请求生命周期使用的父 `context.Context`
- `WithContext(...)` 不会覆盖 Rpc 元数据，trace / initiator / actor 仍来自 client 自己的 `meta.Context`
- `WithContext(...)` 与 `WithTimeout(...)` 不能同时使用
- 不传 `WithContext(...)` 时，默认请求超时是 `30s`

### `ReturnIfSystemError`

当 `ReturnIfSystemError == true` 时，客户端会把 system error 作为返回值交给调用方处理，而不是直接 panic。

默认值是 `false`。

## Server

### `ServerOption`

```go
type Option struct {
    App            meta.App
    MuteVerboseLog bool
    HandlerTypes   []reflect.Type
    Executor       Executor
}
```

注意：

- `HandlerTypes` 是 `[]reflect.Type`

创建方式：

```go
server := rpc.NewServer(rpc.ServerOption{
    App:          appInfo,
    HandlerTypes: []reflect.Type{reflect.TypeFor[*UserServiceImpl]()},
})
```

### 暴露能力

`Server` 提供：

- `GetServiceInfos()`
- `RpcHandler()`
- `HTTPHandler()`

其中 `HTTPHandler()` 返回标准 `http.Handler`。

## Executor

```go
type Executor interface {
    Init(infoDict spec.ImplDict)
    Execute(rpcContext rpc.Context, methodImpl spec.MethodImpl, arguments []any) (any, ex.Error)
}
```

框架内置两种实现。

### `NewDefaultExecutor()`

直接反射创建实现对象并调用方法。

如果 handler struct 中有且只有一个 `spec.Context` 类型字段，默认 executor 会自动把当前 Rpc 上下文注入进去。

### `NewContainerExecutor(...)`

```go
rpc.NewContainerExecutor(filterTypes, bindAppliers)
```

它会接入 `core/ctr` 与 `core/di`，并额外把这些依赖以 `ExecutionScope` 注入：

- `spec.Context`
- `spec.MethodInfo`

适合需要 filter、DI、上下文扩展的服务端执行链。

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

## 服务元信息

### `ServiceSpec`

`ServiceSpec` 是注册输入结构，常由生成代码提供：

```go
type ServiceSpec struct {
    Name     string
    SkelName string

    ServerType        reflect.Type
    DefaultServerType reflect.Type
    ClientType        reflect.Type
    ClientCtor        any

    ERServerType        reflect.Type
    WrapperERServerCtor any
    DefaultERServerType reflect.Type
    ERClientType        reflect.Type
    ERClientCtor        any

    Methods []*MethodSpec
}
```

### `MethodSpec`

```go
type MethodSpec struct {
    Name     string
    SkelName string

    ArgumentsType               reflect.Type
    ValidateArguments           func(any) error
    ResultType                  reflect.Type
    ValidateResult              func(any) error
    ArgumentsContainsBinaryType bool
    ResultContainsBinaryType    bool
    MuteSuccessLog              bool
}
```

### `ServiceInfo`

注册完成后，对外暴露的是 `ServiceInfo`：

```go
type ServiceInfo interface {
    Name() string
    SkelName() string
    ServerType() reflect.Type
    DefaultServerType() reflect.Type
    ClientType() reflect.Type
    ClientCtor() any
    ERServerType() reflect.Type
    WrapperERServerCtor() any
    DefaultERServerType() reflect.Type
    ERClientType() reflect.Type
    ERClientCtor() any
    Methods() []MethodInfo
}
```

### `MethodInfo`

```go
type MethodInfo interface {
    Name() string
    SkelName() string
    ArgumentsType() reflect.Type
    ValidateArguments(any) error
    ResultType() reflect.Type
    ValidateResult(any) error
    ArgumentsContainsBinaryType() bool
    ResultContainsBinaryType() bool
    MuteSuccessLog() bool
    Service() ServiceInfo
    FullURLPath() string
    HasArguments() bool
    NewArguments() any
    HasResult() bool
    NewResult() any
    PositionArguments(arguments any) []any
}
```

其中：

- `FullURLPath()` 格式是 `/{serviceSkelName}/{methodSkelName}`
- `PositionArguments(...)` 把 arguments struct 展成位置参数
- `ValidateArguments(...)` 会检查参数是否满足生成的 Skeleton 约束
- `ValidateResult(...)` 会检查返回值是否满足生成的 Skeleton 约束

## 服务注册

注册入口：

```go
rpc.Register(serviceSpec)
```

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
- 普通 server 可以通过 `WrapperERServerCtor` 包成 ER server

## 使用建议

- 优先使用生成的元信息，不要手写完整 spec
- client 一定显式传入 `Logger`
- server 端如果需要上下文注入和 filter，优先用 `NewContainerExecutor(...)`
- 如果你希望自己接住并处理 system error，再显式开启 `ReturnIfSystemError`
