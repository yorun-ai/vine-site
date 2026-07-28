---
slug: /ctr
sidebar_label: 容器与过滤器
---

# 容器与过滤器

Vine 的 Rpc、Web、Event 和 Task handler 都通过执行容器调用。容器为每次调用创建 execution，准备依赖与上下文，按顺序执行 filters，最后调用目标方法。

业务 handler 会自动使用这套机制。只有要构建自定义执行入口，或为调用链增加通用过滤器时，才需要直接使用 `core/ctr`。

## 核心接口

### `Container`

```go
type Container interface {
    NewExecution(targetType reflect.Type, targetMethod reflect.Method) Execution
}
```

创建方式：

```go
container := ctr.NewContainer(ctr.Option{
    BindAppliers: []di.BindApplier{...},
    FilterTypes:  []reflect.Type{...},
})
```

### `Execution`

```go
type Execution interface {
    Execute(args []any, seedingFuncs ...di.SeedApplier)
    Results() []any
}
```

语义：

- `Execute(...)`：触发一次完整执行
- `Results()`：读取目标方法最终返回值

### `Filter`

```go
type Filter interface {
    Filter(next FilterNext)
}

type FilterNext func()
```

filter 可以：

- 在 `next()` 前做前置逻辑
- 在 `next()` 后做后置逻辑
- 不调用 `next()`，直接短路后续执行

## 初始化方式

```go
type Option struct {
    BindAppliers []di.BindApplier
    FilterTypes  []reflect.Type
}
```

说明：

- `BindAppliers`：给容器根 injector 注册依赖
- `FilterTypes`：声明 filter 类型，执行时由 DI 创建实例

框架会自动补充：

- 所有 filter 的 `ExecutionScope` 绑定
- `*ctr.Context` 的 `ExecutionScope` 绑定
- 最后一个“真正调用目标方法”的内置 filter

## 最基本的调用

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

规则：

- `args` 必须和目标方法参数顺序一致
- `Results()` 返回所有返回值，顺序与方法定义一致

## Filter 写法

典型 filter：

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

执行顺序和 `FilterTypes` 一致，形成标准洋葱模型：

```text
FilterA(before)
  FilterB(before)
    invoke target
  FilterB(after)
FilterA(after)
```

## `Context`

每次 execution 都会自动创建一个 `*ctr.Context`。

可用接口包括：

- `TargetType()` / `SetTargetType(...)`
- `TargetMethodName()` / `SetTargetMethodName(...)`
- `Arguments()` / `SetArguments(...)`
- `Results()` / `SetResults(...)`

### 调用前改写目标与参数

在执行结束前，可以修改：

- 目标类型
- 目标方法名
- 参数列表

例如：

```go
func (f *RouteFilter) Filter(next ctr.FilterNext) {
    f.Context.SetTargetMethodName("Fallback")
    f.Context.SetArguments([]any{"guest"})
    next()
}
```

### 调用后改写返回值

一旦目标方法执行完成，就不能再改：

- `TargetType`
- `TargetMethodName`
- `Arguments`

但 `SetResults(...)` 仍然可用，所以可以统一包装返回值：

```go
func (f *EnvelopeFilter) Filter(next ctr.FilterNext) {
    next()
    f.Context.SetResults([]any{map[string]any{
        "data": f.Context.Results(),
    }})
}
```

## Execute 时的 seeding

`Execution.Execute(...)` 可以额外传 `di.SeedApplier`，把运行时对象塞进本次 execution 的 DI 容器：

```go
execution.Execute([]any{"alice"}, func(s *di.Seeder) {
    s.SeedInstance(currentMeta)
    s.SeedInstance(currentRequest)
})
```

适合注入：

- 当前请求上下文
- trace 信息
- 当前用户
- 其它一次性执行态对象

## 适用场景

`ctr` 特别适合这几类场景：

- handler / service 方法前后挂统一逻辑
- 通过 filter 做鉴权、日志、埋点、路由改写
- 希望目标对象和 filter 都由 `core/di` 托管

如果只是单纯想“拿到对象然后直接调方法”，那就不一定需要 `ctr`。
