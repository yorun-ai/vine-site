---
slug: /ctr
---

# Execution Containers and Filters (CTR)

Vine invokes Rpc, Web, Event, and Task handlers through an execution container. For each call, the container creates an execution, prepares dependencies and context, runs filters in order, and finally invokes the target method.

Business handlers use this mechanism automatically. You only need to use `core/ctr` directly when building a custom execution entry point or adding shared filters to a call chain.

## 1. Core interfaces

### 1.1 `Container`

```go
type Container interface {
    NewExecution(targetType reflect.Type, targetMethod reflect.Method) Execution
}
```

Create one with:

```go
container := ctr.NewContainer(ctr.Option{
    BindAppliers: []di.BindApplier{...},
    FilterTypes:  []reflect.Type{...},
})
```

### 1.2 `Execution`

```go
type Execution interface {
    Execute(args []any, seedingFuncs ...di.SeedApplier)
    Results() []any
}
```

The methods mean:

- `Execute(...)`: runs one complete execution.
- `Results()`: returns the final values produced by the target method.

### 1.3 `Filter`

```go
type Filter interface {
    Filter(next FilterNext)
}

type FilterNext func()
```

A filter can:

- Run logic before `next()`.
- Run logic after `next()`.
- Short-circuit the remaining execution by not calling `next()`.

## 2. Initialization

```go
type Option struct {
    BindAppliers []di.BindApplier
    FilterTypes  []reflect.Type
}
```

The fields are:

- `BindAppliers`: registers dependencies in the container's root injector.
- `FilterTypes`: declares filter types, which DI creates during execution.

The framework automatically adds:

- `ExecutionScope` bindings for every filter.
- An `ExecutionScope` binding for `*ctr.Context`.
- A final built-in filter that invokes the target method.

## 3. Basic invocation

```go
type Calculator struct {
    di.SingletonScoped
}

func (c *Calculator) Sum(left int, right int) int {
    return left + right
}

container := ctr.NewContainer(ctr.Option{
    BindAppliers: []di.BindApplier{
        func(b *di.Binder) {
            b.Bind(di.T[*Calculator]())
        },
    },
})

method, _ := reflect.TypeOf(&Calculator{}).MethodByName("Sum")
execution := container.NewExecution(reflect.TypeOf(&Calculator{}), method)
execution.Execute([]any{2, 5})

results := execution.Results() // []any{7}
```

The following rules apply:

- `args` must follow the target method's parameter order.
- `Results()` returns every result in the same order as the method declaration.

## 4. Writing a filter

A typical filter looks like this:

```go
type TraceFilter struct {
    di.ExecutionScoped

    Logger  *logger.Logger `inject:""`
    Context *ctr.Context   `inject:""`
}

func (f *TraceFilter) Filter(next ctr.FilterNext) {
    f.Logger.Info("before execution", "method", f.Context.TargetMethodName())
    next()
    f.Logger.Info("after execution", "method", f.Context.TargetMethodName())
}
```

Filters run in `FilterTypes` order and form the usual onion model:

```text
FilterA(before)
  FilterB(before)
    invoke target
  FilterB(after)
FilterA(after)
```

## 5. `Context`

Each execution automatically creates a `*ctr.Context`.

Its available methods include:

- `TargetType()` / `SetTargetType(...)`
- `TargetMethodName()` / `SetTargetMethodName(...)`
- `Arguments()` / `SetArguments(...)`
- `Results()` / `SetResults(...)`

### 5.1 Changing the target and arguments before invocation

Before target invocation completes, a filter can change:

- The target type.
- The target method name.
- The argument list.

For example:

```go
func (f *RouteFilter) Filter(next ctr.FilterNext) {
    f.Context.SetTargetMethodName("Fallback")
    f.Context.SetArguments([]any{"guest"})
    next()
}
```

### 5.2 Changing results after invocation

After the target method has completed, you can no longer change:

- `TargetType`
- `TargetMethodName`
- `Arguments`

`SetResults(...)` remains available, so a filter can wrap results consistently:

```go
func (f *EnvelopeFilter) Filter(next ctr.FilterNext) {
    next()
    f.Context.SetResults([]any{map[string]any{
        "data": f.Context.Results(),
    }})
}
```

## 6. Seeding during `Execute`

`Execution.Execute(...)` accepts additional `di.SeedApplier` values that place runtime objects in this execution's DI container:

```go
execution.Execute([]any{"alice"}, func(s *di.Seeder) {
    s.SeedInstance(currentMeta)
    s.SeedInstance(currentRequest)
})
```

Typical values include:

- The current request context.
- Trace information.
- The current user.
- Other per-execution objects.

## 7. When to use it

`ctr` is particularly useful when you need to:

- Apply shared logic before and after handler or service methods.
- Implement authorization, logging, instrumentation, or route rewriting in filters.
- Let `core/di` manage both target objects and filters.

If you only need to obtain an object and call a method directly, you may not need `ctr`.
