---
slug: /rpc
sidebar_label: Rpc API
---

# Rpc API

Follow the generated client and server flow in [Using Rpc](../framework/rpc-guide.md)
for application code. The APIs below matter when tuning invocation options,
writing an executor, or integrating a transport. The HTTP binding is documented
separately in [vRPC over HTTP](./vrpc-http.md).

`core/rpc` provides a unified Rpc abstraction. It handles:

- Registering service and method metadata.
- Creating clients that make calls.
- Creating servers that receive requests.
- Carrying trace, initiator, actor, and client metadata in context.
- Executing methods either through direct reflection or through the `ctr/di`
  container.

It's built for generated code.

## Relationship to Generated Code

A typical workflow:

1. Define a service in a `.skel` file.
2. Generate Go code.
3. The generated code calls `rpc.Register(...)` automatically from `init()`.
4. Business code implements the generated server interface.
5. Run it with `rpc.NewClient(...)` or `rpc.NewServer(...)`.

You generally shouldn't write a complete `ServiceSpec` by hand.

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
    Transport           http.RoundTripper
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

To receive the result as a concrete type, use `InvokeAs[T]`:

```go
result, err := client.InvokeAs[string](methodInfo, arguments, options...)
```

The non-nil result must be assignable to `T`. A returned error or absent result
produces the zero value of `T`. Invocation options and system-error handling
are the same as for `Invoke`.

### Invoke Options

The supported options are:

- `rpc.WithContext(ctx)`
- `rpc.WithTimeout(duration)`
- `rpc.WithDestination(appName)`

- `WithTimeout(...)` must be greater than zero.
- `WithContext(...)` only replaces the parent `context.Context` used for the
  underlying request lifecycle.
- `WithContext(...)` does not replace Rpc metadata. Trace, initiator, and actor
  still come from the client's own `meta.Context`.
- `WithContext(...)` and `WithTimeout(...)` cannot be used together.
- When `WithContext(...)` is omitted, the default request timeout is `30s`.

`WithDestination(appName)` restricts routing to instances of that application. The name must not be empty; omit the option to keep unrestricted routing. If the application does not provide the service, the call returns `ServiceUnavailable` without falling back to another application.

`WithDestination` applies only to App-to-Link calls. Portal drops the `destination` field in `vrpc-options`, so the option has no effect on requests routed through Portal.

### `ReturnIfSystemError`

When `ReturnIfSystemError == true`, the client returns a system error to the
caller instead of panicking.

The default is `false`.

## Server

### `ServerOption`

Create a server like this:

```go
server := rpc.NewServer(rpc.ServerOption{
    App:          appInfo,
    HandlerTypes: []reflect.Type{reflect.TypeFor[*UserServiceImpl]()},
})
```

### Exposed Capabilities

`Server` exposes `HTTPHandler()`, which returns a standard `http.Handler` for
mounting the Rpc endpoint in a server you own.

## Executor

A server runs methods through an executor, and the framework provides two.

### `NewDefaultExecutor()`

The default executor calls the handler method directly.

If a handler struct has exactly one field of type `rpc.Context`, the current Rpc
context is injected into it.

### `NewContainerExecutor(...)`

```go
rpc.NewContainerExecutor(filterTypes, bindAppliers)
```

This executor integrates the DI container and filter chain. Use it for execution
chains that need filters, DI, or context extensions; it makes the current
`rpc.Context` and `rpc.MethodInfo` injectable within the execution.

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

- Business errors from a normal server flow through the panic and recover path.
- The final return value of an ER server is always `ex.Error`.

## When using the lower-level APIs

- Keep generated metadata as the source of service and method definitions.
- Pass a `Logger` when constructing a client.
- Use `NewContainerExecutor(...)` on a server that needs context injection or
  filters.
- Set `ReturnIfSystemError` only at a boundary that deliberately catches and
  handles system errors.
