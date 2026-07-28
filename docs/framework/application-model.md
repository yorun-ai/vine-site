---
slug: /application-model
sidebar_label: Application Model
---

# Application Model

A Vine App is the unit the runtime starts, registers, and stops. Its
specification supplies a stable name and declares the components, modules, and
capabilities that belong to that application.

## Minimal application

```go title="app.go"
type CheckoutApp struct {
    app.Application
}

func (*CheckoutApp) Name() string {
    return "demo.checkout"
}
```

The name must match `^[a-z]+(?:\.[a-z]+)*$`, for example
`demo.checkout`. Different App specifications in one process need different
names. Replicas of one logical application use the same name; among other
things, that makes them compete as one Event consumer group.

## What an application can declare

| Entry point | Purpose |
| --- | --- |
| `InitComponents` | Infrastructure components such as databases and Redis |
| `InitModules` | Business modules that start and stop with the application |
| `BindCommon` | Dependencies shared by all execution contexts |
| `ServicerInitHandlers` | Rpc service implementations |
| `WebberInitHandlers` | Web route implementations |
| `EventerInitListeners` | Event listeners |
| `TaskerInitRunners` | Task runners |

Declare only the capabilities the application actually needs. Vine creates endpoints from these declarations and registers them with the runtime through Link.

## Choose a startup mode

```go title="main.go"
// Single-process development
standalone.NewWithOption[*CheckoutApp](standalone.Option{
    SQLiteFile: "./vine.sqlite",
}).StartAndWait()

// Connect to an external Hub with Link in the application process
linked.NewWithOption[*CheckoutApp](linked.Option{
    HubEndpoint: "http://127.0.0.1:7071",
}).StartAndWait()

// Connect to a standalone Link
app.NewWithOption[*CheckoutApp](app.Option{
    LinkEndpoint: "http://127.0.0.1:7079",
}).StartAndWait()
```

See [Runtime Modes and Deployment Topologies](../getting-started/deployment-modes.md) for the
tradeoffs among these modes, [Application Lifecycle](../runtime/application-lifecycle.md)
for exact construction and hook timing, and
[Runtime Architecture](../runtime/mechanisms.md) for capability registration.
