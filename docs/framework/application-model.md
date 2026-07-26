---
slug: /application-model
---

# Application Model

A Vine App is the entry point of a business process. It gives the application a stable name, declares the components and modules it needs, and selects standalone, linked, or fully separated deployment.

## Minimal application

```go title="app.go"
type CheckoutApp struct {
    app.Application
}

func (*CheckoutApp) Name() string {
    return "demo.checkout"
}
```

The application name identifies the application in service registration and call chains, and it must be unique within a process.

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

See [Runtime Modes and Deployment Topologies](/docs/deployment-modes) for the tradeoffs among these modes and [Component Runtime Mechanisms](/docs/runtime-mechanisms) for lifecycle and capability registration details.
