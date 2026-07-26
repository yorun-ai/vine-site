---
slug: /components
---

# Components and Modules

Components and modules split an application into functional units that can be initialized, injected, and stopped independently. Vine creates them and injects their dependencies when the application starts, then releases their resources in reverse order when the application stops.

## Capability overview

Application-side capabilities are declared by the App and enabled as needed:

| Capability | What it provides | Entry point |
| --- | --- | --- |
| Module | Organizes domain services, background work, and lifecycle resources | `InitModules`, `app.BaseModule` |
| Config | Obtains `eternal` or `instant` configuration | [Application Configuration](/docs/configuration) |
| Rpc | Provides and calls type-safe services | [Using Rpc](/docs/guide/rpc) |
| Web | Registers HTTP routes, static assets, and reverse proxies | [Web](/docs/web) |
| Event | Publishes facts and notifies multiple consumers asynchronously | [Events and Tasks](/docs/events-and-tasks) |
| Task | Triggers specific work or schedules it with Cron | [Events and Tasks](/docs/events-and-tasks) |
| RDB | Connects to PostgreSQL or SQLite and injects DAOs | [Relational Database](/docs/guide/rdb) |
| Redis | Injects Redis, caches, and distributed lockers | [Redis](/docs/guide/redis) |
| Logger / testkit | Provides structured logging and standalone integration testing | [Logging and Testing](/docs/logging-and-testing) |

Three components collaborate in a multi-process runtime:

| Component | Responsibility | Documentation |
| --- | --- | --- |
| Hub | Distributes configuration, registrations, and runtime state | [Hub](/docs/hub) |
| Link | Connects applications, discovers and forwards services, and dispatches messages | [Link](/docs/link) |
| Portal | Provides the external HTTP, HTTPS, Rpc, and Web gateway | [Portal](/docs/portal) |

See [Component Runtime Mechanisms](/docs/runtime-mechanisms) and [Deployment Topologies](/docs/deployment-modes) for how these pieces form standalone, linked, and fully separated deployments.

## When to use a module

Business capabilities are typically implemented as modules. Modules are suitable for domain services, background work, and resources that should start and stop with the application:

```go title="module.go"
type UserModule struct {
    app.BaseModule
}

func (m *UserModule) BeforeAppStart() error {
    // Initialize business resources
    return nil
}

func (m *UserModule) BeforeAppStop() {
    // Stop accepting new work
}
```

Declare the module in the application:

```go title="app.go"
func (*DemoApp) InitModules(add app.TypeAdder) {
    add(app.T[*UserModule]())
}
```

## When to use an infrastructure component

Infrastructure such as databases and Redis is integrated through components. A business application declares concrete component types and uses them to provide connection settings, DAOs, lockers, or caches:

```go title="app.go"
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*MainDatabase]())
    add(app.T[*MainRedis]())
}
```

Objects exposed by components enter the dependency injection container. Modules, Rpc handlers, Web handlers, Event listeners, and Task runners can inject and use them directly.

## Lifecycle order

```mermaid
flowchart LR
  Create["Create and inject"] --> BeforeStart["BeforeAppStart"] --> Start["Application starts serving"] --> AfterStart["AfterAppStart"]
  AfterStart --> BeforeStop["BeforeAppStop"] --> Stop["Stop serving"] --> AfterStop["AfterAppStop"]
```

- `BeforeAppStart`: establish connections, warm data, or verify dependencies; returning an error prevents the application from starting.
- `AfterAppStart`: runs after the application is ready to serve.
- `BeforeAppStop`: stops accepting new work and begins draining.
- `AfterAppStop`: releases connections and other resources.

At startup, Vine runs infrastructure components in declaration order, followed by modules. During shutdown, it stops modules in reverse order before stopping components. This lets business modules use database and Redis resources that are already ready during startup, and gives them a chance to clean up before those connections are released.

Do not declare the same module or component type more than once. To share dependencies, bind them in the application's `BindCommon` method or in the object's own `Bind` method. Leave per-request context dependencies to the execution scope.

See [Dependency Injection](/docs/di) for binding options and [Runtime Mechanisms](/docs/runtime-mechanisms) for the complete startup sequence.
