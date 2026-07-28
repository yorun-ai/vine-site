---
slug: /app
sidebar_label: App API
---

# App API

Most application code only needs `go.yorun.ai/vine/app`. The package owns the
process lifecycle, creates components and modules, mounts HTTP/Rpc/Web entry
points, and makes runtime dependencies available through DI.

## Public entry points

Business code usually depends on the top-level `go.yorun.ai/vine/app` package. Import `app/linked` or `app/standalone` only when composing those runtime modes.

Commonly used entry points include:

- `App`
- `ApplicationSpec`
- `Application`
- `Flag` / `FlagModel` / `RunFlag`
- `Module` / `BaseModule`
- `EventerSpec` / `EventerEnabled`
- `ServicerSpec` / `ServicerEnabled`
- `TaskerSpec` / `TaskerEnabled`
- `WebberSpec` / `WebberEnabled`
- `ListenerOption` / `RunnerOption`
- `WithListenerTimeout(...)` / `WithListenerConcurrency(...)` / `WithListenerNoRetry()`
- `WithRunnerTimeout(...)` / `WithRunnerConcurrency(...)` / `WithRunnerNoRetry()`
- `WithRunnerCronScheduler(...)`
- `T[T]()`
- `With(flag)`
- `New[S](...)`
- `NewWithOption[S](...)` / `Option`
- `linked.New[S](...)` / `linked.NewWithOption[S](...)` / `linked.Option`
- `linked.NewBundled(...)` / `linked.NewBundledWithOption(...)`
- `standalone.New[S](...)` / `standalone.NewWithOption[S](...)` / `standalone.Option`
- `standalone.NewBundled(...)` / `standalone.NewBundledWithOption(...)`

## Core interfaces

### `App`

```go
type App interface {
    Name() string
    Start()
    StopGracefully()
    StartAndWait()
}
```

Typical usage:

```go
app.New[*DemoApp]().StartAndWait()
```

The methods have the following semantics:

- `Start()`: starts the application without blocking.
- `StopGracefully()`: performs a graceful shutdown and blocks until the application has fully stopped.
- `StartAndWait()`: starts the application, waits for a termination signal, and then performs a graceful shutdown.

Lifecycle methods are single-use. Calling `Start()` more than once, calling `StopGracefully()` before startup, calling `StopGracefully()` more than once, or calling `Start()` after shutdown causes a panic.

### `ApplicationSpec`

The application specification interface is:

```go
type ApplicationSpec interface {
    Name() string
    InitComponents(addComponent TypeAdder)
    InitModules(addModule TypeAdder)
    BindCommon(b *di.Binder)
}
```

Its methods are:

- `Name()`: returns the application name. It must match
  `^[a-z]+(?:\.[a-z]+)*$`: one or more lowercase-letter segments separated by
  dots, such as `demo.checkout`.
- `InitComponents(...)`: declares component types.
- `InitModules(...)`: declares module types.
- `BindCommon(...)`: registers application-wide dependencies.

A business application can embed `app.Application` to obtain the default implementations, then override only the methods it needs.

### `Application`

`Application` is the default base type:

```go
type Application struct {
    AppFlag *RunFlag `inject:""`
}
```

Its default behavior is:

- `Name()` returns an empty string, so a business application must override it.
- `InitComponents(...)` does not add components.
- `InitModules(...)` does not add modules.
- `BindCommon(...)` does not add bindings.

A minimal application usually looks like this:

```go
type DemoApp struct {
    app.Application
}

func (*DemoApp) Name() string {
    return "demo.app"
}
```

## Creation

### `New`

```go
instance := app.New[*DemoApp]()
```

`New` constructs and validates the application specification immediately. It
is not a lazy factory: injected fields and `DIInit()` on the spec run during
this call, and the root context and listen address are captured before
`Start()`.

The following rules apply:

- Each spec type can be created only once.
- Different spec types with the same `Name()` cannot be created together.

In other words, the framework enforces both spec-type uniqueness and application-name uniqueness.

The `Option` accepted by the top-level `app.NewWithOption(...)` provides `LinkEndpoint`. You can also provide it through `--link-endpoint` or `VINE_LINK_ENDPOINT`.

### Runtime-mode constructors

- `linked.New(...)`: starts a Link in the same process, then starts the business application as an in-process application. `linked.Option` supports `HubEndpoint` and `IngressListen`, which can also be supplied through `--hub-endpoint` / `--ingress-listen` or the corresponding environment variables.
- `linked.NewBundled(...)`: lets multiple business applications share one in-process Link connected to an external Hub. A bundled linked application cannot also carry its own `linked.Option`.
- `standalone.New(...)`: starts Hub, Portal, Link, and one business application in the same process. `standalone.Option` supports a seed YAML file, a SQLite file, a PostgreSQL URL, and a Dashboard URL.
- `standalone.NewBundled(...)`: bundles multiple standalone applications with one embedded Hub, Portal, and Link. A bundled standalone application cannot also carry its own `standalone.Option`.

## Flag model

### `With(flag)`

`New[...]()` accepts `FlagApplier` values. The most common form is:

```go
app.New[*DemoApp](
    app.With(&app.RunFlag{ListenAddr: ":18080"}),
)
```

`With(flag)` has these constraints:

- `flag` cannot be `nil`.
- `flag` must be a pointer to a struct.
- Each flag type can be supplied only once.

### `RunFlag`

```go
type RunFlag struct {
    FlagModel
    ListenAddr   string
    LinkEndpoint string
    Context      context.Context
}
```

Its behavior is:

- When `ListenAddr == ""`, the application listens on a randomly assigned port.
- `LinkEndpoint` selects the Link API used by an application created directly
  with `app.New(...)` or `app.NewWithOption(...)`. It can be set through
  `app.Option`, `--link-endpoint`, or `VINE_LINK_ENDPOINT`.
- When `Context == nil`, it falls back to `context.Background()`.
- The framework creates a default `RunFlag` even when one is not provided explicitly.

Inside an application, `AppFlag` exposes the resolved run options. Prefer
setting them at construction:

```go
instance := app.New[*DemoApp](
    app.With(&app.RunFlag{ListenAddr: ":18080"}),
)
```

`BindCommon` runs during `Start()`, after Vine has captured `ListenAddr`, so
changing `AppFlag.ListenAddr` there does not move the application listener. If
the application type must own a default, implement `DIInit()` on the
application spec; it runs during `New`, after `AppFlag` injection:

```go
func (a *DemoApp) DIInit() {
    if a.AppFlag.ListenAddr == "" {
        a.AppFlag.ListenAddr = ":18080"
    }
}
```

### Custom flags

```go
type DemoFlag struct {
    app.FlagModel
    Region string
}

type DemoApp struct {
    app.Application
    Flag *DemoFlag `inject:""`
}
```

Supply it when creating the application:

```go
app.New[*DemoApp](
    app.With(&DemoFlag{Region: "cn"}),
)
```

## Components and modules

### Infrastructure components

Declare framework components such as databases and Redis through `InitComponents`. Business types should embed the corresponding public component, such as `rdb.Database` or `redis.Redis`:

```go
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*MainDatabase]())
    add(app.T[*MainRedis]())
}
```

Components expose connections, DAOs, caches, lockers, and other objects through the dependency injection container. A component type cannot be declared more than once.

### Module

Use a `Module` for business lifecycle logic. Embed `app.BaseModule` and implement only the lifecycle methods you need:

```go
type DemoModule struct {
    app.BaseModule
}

func (*DemoApp) InitModules(add app.TypeAdder) {
    add(app.T[*DemoModule]())
}
```

Modules participate in:

- `BeforeAppStart`
- `AfterAppStart`
- `BeforeAppStop`
- `AfterAppStop`

Shutdown hooks run in reverse order.

## Optional capabilities

An application spec can implement the following capability interfaces as needed.

### Rpc: `ServicerSpec`

```go
type ServicerSpec interface {
    ServicerBind(b *di.Binder)
    ServicerInitHandlers(addHandler TypeAdder)
    ServicerInitFilters(addFilter TypeAdder)
}
```

The base type with empty default implementations is:

```go
type ServicerEnabled struct{}
```

When enabled, the framework creates a `core/rpc` server and mounts it at `/rpc/invoke`.

### Web: `WebberSpec`

An application supports one Webber:

```go
type WebberSpec interface {
    WebberBind(b *di.Binder)
    WebberInitHandlers(addHandler TypeAdder)
    WebberInitFilters(addFilter TypeAdder)
}
```

`WebberEnabled` provides empty default implementations.

The Webber access prefix is:

```text
/web/access/default@<appName>
```

### Event: `EventerSpec`

```go
type EventerSpec interface {
    EventerBind(b *di.Binder)
    EventerInitListeners(addListener ListenerTypeAdder)
    EventerInitFilters(addFilter TypeAdder)
}
```

The base type with empty default implementations is:

```go
type EventerEnabled struct{}
```

When enabled, the framework creates an Event server and mounts it at `/event`.

Listener declarations can include these options:

- `app.WithListenerTimeout(timeout)`
- `app.WithListenerConcurrency(concurrency)`
- `app.WithListenerNoRetry()`

### Task: `TaskerSpec`

```go
type TaskerSpec interface {
    TaskerBind(b *di.Binder)
    TaskerInitRunners(addRunner RunnerTypeAdder)
    TaskerInitFilters(addFilter TypeAdder)
}
```

The base type with empty default implementations is:

```go
type TaskerEnabled struct{}
```

When enabled, the framework creates a Task server and mounts it at `/task`.

Runner declarations can include these options:

- `app.WithRunnerTimeout(timeout)`
- `app.WithRunnerConcurrency(concurrency)`
- `app.WithRunnerNoRetry()`
- `app.WithRunnerCronScheduler(triggerSkelName, cronExpr)`

The Cron scheduler registers a schedule for a trigger with no arguments. `triggerSkelName` and `cronExpr` cannot be empty, and `cronExpr` must be a valid standard Cron expression. A trigger with arguments cannot be a Cron scheduler target.

## Routing model

An application process mounts these built-in prefixes as needed:

- `/console`
- `/rpc/invoke`
- `/event`
- `/task`
- `/web/access/...`

Routing behaves as follows:

- After a prefix is matched, the framework removes it and passes the remaining path to the corresponding handler.
- If no registered route matches, the response is `404`.

For example, when the request path is:

```text
/rpc/invoke/demo.user.UserService/getUser
```

the path passed to the Rpc handler is:

```text
/demo.user.UserService/getUser
```

A module that implements `PathPrefixRouteModule` can also add custom prefix routes.

## HTTP and in-process transport

In normal mode:

- The application starts an HTTP server by default.
- When `ListenAddr == ""`, it listens on a randomly assigned port.
- The server uses h2c.

The framework also supports in-process mode for communication between built-in applications. It is not a public creation entry point in the top-level `app` package.

In-process mode registers:

- All Rpc routes.
- All `/web/access/...` routes.

## Startup and shutdown

`Start()` runs approximately in this order:

1. Initialize the Linker and configuration reader.
2. Initialize the injector.
3. Initialize components.
4. Initialize modules.
5. Initialize console, Servicer, Webber, Eventer, and Tasker capabilities.
6. Run component `BeforeAppStart()` hooks.
7. Run module `BeforeAppStart()` hooks.
8. Start the HTTP or in-process server.
9. Start the Servicer, Eventer, and Tasker.
10. Register application capabilities with Link.
11. Run component `AfterAppStart()` hooks.
12. Run module `AfterAppStart()` hooks.

`StopGracefully()` runs approximately in this order:

1. Run module `BeforeAppStop()` hooks in reverse order.
2. Run component `BeforeAppStop()` hooks in reverse order.
3. Unregister the application.
4. Stop the HTTP or in-process server.
5. Cancel the runtime context.
6. Run module `AfterAppStop()` hooks in reverse order.
7. Run component `AfterAppStop()` hooks in reverse order.

In `linked` mode, the outer application waits for the business application to complete `StopGracefully()` before stopping the in-process Link. This prevents Link's in-process handler from being removed before the business application unregisters.

In standalone and bundled standalone modes, business applications are stopped gracefully in reverse order before the embedded Link, Portal, Hub, and other runtime components stop.

Registration begins before `AfterAppStart`. Do not put readiness-critical work
in that hook. Startup-hook failure panics and does not run an automatic rollback
of already constructed resources. See [Application lifecycle](../runtime/application-lifecycle.md)
for exact boundaries and hook responsibilities.

## DI visibility

Dependencies commonly visible inside an application include:

- All flag types.
- The application's own spec instance.
- User component instances.
- Module instances.
- Common dependencies bound through `BindCommon(...)`.
- Contexts and loggers added by individual capability subsystems.

In particular:

- Use `BindCommon(...)` for application-wide dependencies.
- Use a component or module's own `Bind(...)` method for dependencies specific to that object.
- Servicer, Webber, Eventer, and Tasker capabilities add their respective contexts to the execution container.

## Working rules

- Override `Name()` in every business application.
- Supply the listen address through
  `app.With(&app.RunFlag{ListenAddr: "..."})` at construction time. If an
  application must choose its own default, set the injected flag in the
  specification's `DIInit()`; `BindCommon(...)` is too late.
- Declare components and modules as pointer types.
- Put shared bindings in `BindCommon(...)`, not routing or startup work.
- Keep Web routing under a single `WebberSpec`. If you need more routes, add multiple handlers to the same Webber.
