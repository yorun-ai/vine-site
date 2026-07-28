---
slug: /di
sidebar_label: Dependency Injection
---

# Dependency Injection

Vine creates modules, handlers, listeners, and runners through DI. Start with
`inject:""` fields. Add a binding when an interface needs an implementation,
construction needs a factory, or an object needs an explicit lifetime.

```go
type UserService struct {
    Repo *UserRepo `inject:""`
}

func (*DemoApp) BindCommon(b *di.Binder) {
    b.Bind(di.T[UserRepo]()).ToImplementation(di.T[*PostgresUserRepo]())
}
```

The application creates the root container for you. You only need to call `di.NewInjector(...)` directly when writing a standalone tool or testing DI behavior. The container:

- Registers types and construction methods.
- Injects dependencies into fields automatically.
- Manages object lifetimes.
- Distinguishes root containers from execution containers.

## Core interfaces

### `Injector`

```go
type Injector interface {
    Get(targetType reflect.Type) reflect.Value
    Resolve(targetPtr any)
    Invoke(method any) []reflect.Value
}
```

Typical usage:

```go
var svc *UserService
injector.Resolve(&svc)

results := injector.Invoke(func(repo *UserRepo) string {
    return repo.Name
})
```

### `PlainInjector`

```go
type PlainInjector interface {
    Injector
    SubInjector(bindAppliers ...BindApplier) PlainInjector
    StartExecution(seedAppliers ...SeedApplier) ExecutionInjector
}
```

Create one with:

```go
injector := di.NewInjector(func(b *di.Binder) {
    // Register bindings
})
```

The root container's fallback scope is `TransientScope`.

### `ExecutionInjector`

```go
type ExecutionInjector interface {
    Injector
    CompleteExecution()
}
```

It:

- Reuses singleton instances from the root container.
- Owns `ExecutionScope` instances for the current execution.
- Disposes execution objects in reverse order when `CompleteExecution()` runs.

## Scopes

Vine provides three lifetimes:

- `SingletonScope`
- `ExecutionScope`
- `TransientScope`

Specify one explicitly with:

```go
b.Bind(di.T[*A]()).In(di.SingletonScope)
b.Bind(di.T[*B]()).In(di.ExecutionScope)
b.Bind(di.T[*C]()).In(di.TransientScope)
```

You can also declare a default scope on a type:

```go
type Config struct {
    di.SingletonScoped
}

type RequestInfo struct {
    di.ExecutionScoped
}

type TempValue struct {
    di.TransientScoped
}
```

If a constructible type has neither an explicit `In(...)` call nor a scope
marker, the injector resolving it supplies the fallback scope:

- A root or child `PlainInjector` uses `TransientScope`.
- An `ExecutionInjector` uses `ExecutionScope`.

This is why an unscoped handler dependency is shared within one request but a
direct resolution from the root injector creates a fresh value. An explicit
scope or a marker on the type always wins over the fallback.

A scope belongs to the requested target type, not to the concrete instance eventually created. For forwarding and factory bindings such as `ToImplementation(...)`, `ToFactory(...)`, and `ToInstance(...)`, the scope describes only the current binding.

If the same concrete implementation is requested both through an interface and directly, those requests use separate bindings and may have different lifetimes. To share a lifetime, bind both explicitly with matching scopes, or forward both to the same existing instance or factory source.

For example:

```go
b.Bind(di.T[MailGateway]()).
    ToImplementation(di.T[*SMTPGateway]()).
    In(di.SingletonScope)

b.Bind(di.T[*SMTPGateway]()).
    In(di.TransientScope)
```

Then:

```go
var gateway MailGateway
injector.Resolve(&gateway) // Uses the SingletonScope binding for MailGateway

var smtp *SMTPGateway
injector.Resolve(&smtp) // Uses the TransientScope binding for *SMTPGateway
```

If a struct implements `DIInit()`, the container calls it automatically after construction and field injection. If it implements `DIDispose()`, it can participate in disposal at the end of an execution.

Note: `PlainInjector` does not own the application shutdown sequence and does not automatically dispose `SingletonScope` instances. The application, component, or module that created the injector should close singleton resources in a lifecycle hook such as `BeforeAppStop()` or `AfterAppStop()`.

## Type helper

Use `di.T[T]()` to obtain a `reflect.Type`:

```go
di.T[*UserService]()
di.T[MailGateway]()
```

Supported binding target types primarily include:

- Interfaces.
- Struct pointers.
- Maps.
- Slices.
- Functions.

## Binding methods

### Binding a struct type

```go
b.Bind(di.T[*UserService]()).In(di.SingletonScope)
```

This tells the container to construct `*UserService` and continue resolving its field dependencies.

### Binding an interface to an implementation

```go
b.Bind(di.T[MailGateway]()).
    ToImplementation(di.T[*SMTPGateway]()).
    In(di.SingletonScope)
```

The following constraints apply:

- The target type must be an interface.
- The implementation type must be a struct pointer.
- The implementation type must implement the interface.

Here, `In(...)` applies to the `MailGateway` binding. If code also resolves `*SMTPGateway` directly, that request uses `*SMTPGateway`'s own explicit or implicit binding.

### Binding a factory function

```go
b.Bind(di.T[*Repo]()).
    ToFactory(func(db *gorm.DB, logger *logger.Logger) *Repo {
        return &Repo{DB: db, Logger: logger}
    }).
    In(di.SingletonScope)
```

Factory arguments are resolved from the container.

Supported signatures are:

- `func(...) T`
- `func(...) (T, error)`

If the last return value is an `error` and is not `nil`, the container panics.

The shorthand form is:

```go
b.BindFactory(func(db *gorm.DB) *Repo {
    return &Repo{DB: db}
}).In(di.SingletonScope)
```

`BindFactory(...)` uses the factory's first return type as the target type automatically.

### Binding an existing instance

```go
b.BindInstance(existingClient)
```

This binding:

- Uses `reflect.TypeOf(instance)` as its target type.
- Is equivalent to `ToInstance(instance)`.
- Always uses `SingletonScope`.

### Abstract factories

For an interface target, you can also use `ToAbstractFactory(...)`. It is useful when the concrete implementation of an interface must be selected at runtime.

## Field injection

Mark fields with `inject:""`:

```go
type UserService struct {
    di.SingletonScoped

    Repo   *UserRepo    `inject:""`
    Logger *logger.Logger `inject:""`
}
```

Field injection:

- Resolves dependencies by field type.
- Supports exported fields.
- Supports anonymous embedded fields.

## Resolve, Invoke, and Get

### `Resolve`

```go
var service *UserService
injector.Resolve(&service)
```

### `Invoke`

```go
results := injector.Invoke(func(repo *UserRepo, svc *UserService) string {
    return repo.Name + ":" + svc.Name()
})
```

`Invoke(...)` returns `[]reflect.Value`.

### `Get`

```go
value := injector.Get(di.T[*UserService]())
service := value.Interface().(*UserService)
```

## Execution containers

```go
execution := injector.StartExecution()
defer execution.CompleteExecution()
```

Resolution follows these rules:

- `SingletonScope`: reuse the root-container singleton.
- `ExecutionScope`: cache the instance for the current execution.
- `TransientScope`: create a new instance on every request.
- No declared scope: use `ExecutionScope` while resolving through this
  execution injector.

A root `PlainInjector` cannot resolve an `ExecutionScope` type directly.

## Seeding

Objects available only at runtime can be seeded when calling `StartExecution(...)`:

```go
execution := injector.StartExecution(func(s *di.Seeder) {
    s.SeedInstance(currentRequest)
    s.SeedInstance(currentTrace)
})
defer execution.CompleteExecution()
```

You can also specify a type explicitly:

```go
execution := injector.StartExecution(func(s *di.Seeder) {
    s.Seed(di.T[context.Context](), ctx)
})
```

The following constraints apply:

- A seeded target type must resolve to `ExecutionScope`.
- Seeding is only allowed inside a `SeedApplier` passed to `StartExecution(...)`; retaining and using the `Seeder` after that method returns causes a panic.
- The value passed to `SeedInstance(...)` must be compatible with the target type.

## Child containers

Extend a root container with:

```go
sub := injector.SubInjector(func(b *di.Binder) {
    b.Bind(di.T[*FeatureService]()).In(di.SingletonScope)
})
```

A child container:

- Can see bindings from its parent.
- Can add its own bindings.
- Still uses `TransientScope` as its fallback scope.

## Disposal

Objects can participate in disposal in two ways:

- The type implements the framework's disposal convention.
- The binding declares a disposer through `WithDisposer(...)`.

`ExecutionInjector.CompleteExecution()` cleans up execution objects, including:

- `ExecutionScope` instances.
- Tracked `TransientScope` instances created during the execution.

`PlainInjector` does not end the lifetime of `SingletonScope` instances automatically. Vine resource components such as RDB and Redis close shared connections while the App is stopping; resources bound by business code should follow the same pattern.

Therefore, if business code binds databases, Redis or MQ clients, file handles, or other singleton resources through DI, it should release them explicitly in an application, component, or module shutdown hook rather than relying on `PlainInjector` to call `DIDispose()`.

## Choosing a scope

- Leave request-aware services, clients, configuration readers, DAOs, caches,
  and lockers unscoped, and inject them only into execution-owned objects.
  They are then reused inside one execution and stay fresh across executions.
- Use `ExecutionScope` explicitly for values that are only valid during an
  execution, especially seeded request context, trace, and protocol metadata.
- Use `SingletonScope` only for context-free objects that are safe to share for
  the entire application lifetime and have an explicit owner responsible for
  shutdown.
- Use `TransientScope` when every resolution must produce a fresh stateless
  object.
- Do not turn a request-aware client or dynamic configuration reader into a
  singleton merely to avoid construction; doing so can pin the context or
  configuration observed by the first resolution.

See [Execution Model](../runtime/execution-model.md) for the containers Vine
creates around Rpc, Web, Event, and Task handlers.
