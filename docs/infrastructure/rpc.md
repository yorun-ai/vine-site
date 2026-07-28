---
slug: /rpc
sidebar_label: Rpc API
---

# Rpc API

For day-to-day use, start with [Using Rpc](../framework/rpc-guide.md). See [vRPC over HTTP](./vrpc-http.md) for the wire protocol. This page documents the client, server, executor, and service metadata APIs provided by `core/rpc`. Use it when you need to tune low-level invocation options or build a custom integration layer.

`core/rpc` provides a unified Rpc abstraction. It is responsible for:

- Registering service and method metadata.
- Creating clients that make calls.
- Creating servers that receive requests.
- Carrying trace, initiator, actor, and client metadata in context.
- Executing methods either through direct reflection or through the `ctr/di` container.

It is designed to be used with generated code.

## Relationship to Generated Code

A typical workflow is:

1. Define a service in a `.skel` file.
2. Generate Go code.
3. The generated code calls `rpc.Register(...)` automatically from `init()`.
4. Business code implements the generated server interface.
5. Run it with `rpc.NewClient(...)` or `rpc.NewServer(...)`.

You generally should not write a complete `ServiceSpec` by hand.

## Client

### `ClientOption`

The client configuration is:

```go
type Option struct {
    Context             meta.Context
    ClientApp           meta.App
    Logger              *logger.Logger
    ReturnIfSystemError bool
    ServerEndpoint      string
}
```

Notes:

- The field is named `ServerEndpoint`.
- `Context` cannot be nil.
- `Logger` cannot be nil.
- When `ReturnIfSystemError == false`, system errors panic by default.

### Creating and Invoking a Client

```go
client := rpc.NewClient(rpc.ClientOption{
    Context:        metaCtx,
    ClientApp:      appInfo,
    Logger:         logger.New("app", appInfo.Name(), "rpc", "client"),
    ServerEndpoint: "http://127.0.0.1:8080",
})
```

Invoke a method with:

```go
result, err := client.Invoke(methodInfo, arguments, options...)
```

The return values are:

- The business result.
- An `ex.Error`.

### Invoke Options

The supported options are:

- `rpc.WithContext(ctx)`
- `rpc.WithTimeout(duration)`

Rules:

- `WithTimeout(...)` must be greater than zero.
- `WithContext(...)` only replaces the parent `context.Context` used for the underlying request lifecycle.
- `WithContext(...)` does not replace Rpc metadata. Trace, initiator, and actor still come from the client's own `meta.Context`.
- `WithContext(...)` and `WithTimeout(...)` cannot be used together.
- When `WithContext(...)` is omitted, the default request timeout is `30s`.

### `ReturnIfSystemError`

When `ReturnIfSystemError == true`, the client returns a system error to the caller instead of panicking.

The default value is `false`.

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

`HandlerTypes` is a `[]reflect.Type`.

Create a server like this:

```go
server := rpc.NewServer(rpc.ServerOption{
    App:          appInfo,
    HandlerTypes: []reflect.Type{reflect.TypeFor[*UserServiceImpl]()},
})
```

### Exposed Capabilities

`Server` mainly provides:

- `GetServiceInfos()`
- `RpcHandler()`
- `HTTPHandler()`

`HTTPHandler()` returns a standard `http.Handler`.

## Executor

```go
type Executor interface {
    Init(infoDict spec.ImplDict)
    Execute(rpcContext rpc.Context, methodImpl spec.MethodImpl, arguments []any) (any, ex.Error)
}
```

The framework includes two implementations.

### `NewDefaultExecutor()`

The default executor creates the implementation object through reflection and calls its method directly.

If a handler struct contains exactly one field of type `spec.Context`, the default executor automatically injects the current Rpc context into it.

### `NewContainerExecutor(...)`

```go
rpc.NewContainerExecutor(filterTypes, bindAppliers)
```

This executor integrates `core/ctr` and `core/di` and additionally injects these dependencies with `ExecutionScope`:

- `spec.Context`
- `spec.MethodInfo`

Use it for server execution chains that need filters, DI, or context extensions.

## `rpc.Context`

`rpc.Context` extends `meta.Context` with `Client()`:

```go
type Context interface {
    meta.Context
    Client() meta.App
}
```

Create one with:

```go
rpcCtx := rpc.NewContext(ctx, trace, clientApp, initiator, actor)
```

It represents:

- The current trace.
- The current initiator.
- The current actor.
- The client application for the current Rpc call.

## Service Metadata

### `ServiceSpec`

`ServiceSpec` is the registration input and is usually provided by generated code:

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

After registration, service metadata is exposed as `ServiceInfo`:

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

In particular:

- `FullURLPath()` has the form `/{serviceSkelName}/{methodSkelName}`.
- `PositionArguments(...)` expands an arguments struct into positional arguments.
- `ValidateArguments(...)` verifies that arguments satisfy the generated Skeleton constraints.
- `ValidateResult(...)` verifies that a result satisfies the generated Skeleton constraints.

## Service Registration

Register a service with:

```go
rpc.Register(serviceSpec)
```

## Normal and ER Interfaces

The framework supports two styles of service signature.

A normal server:

```go
type UserServiceServer interface {
    GetUser(id string) User
}
```

An ER server:

```go
type UserServiceServerER interface {
    GetUser(id string) (User, ex.Error)
}
```

Rules:

- Business errors from a normal server usually flow through the panic and recover path.
- The final return value of an ER server is always `ex.Error`.
- A normal server can be wrapped as an ER server through `WrapperERServerCtor`.

## Recommendations

- Prefer generated metadata to handwritten specs.
- Always provide a `Logger` explicitly when creating a client.
- On the server, prefer `NewContainerExecutor(...)` when you need context injection or filters.
- Enable `ReturnIfSystemError` explicitly only when you want to catch and handle system errors yourself.
