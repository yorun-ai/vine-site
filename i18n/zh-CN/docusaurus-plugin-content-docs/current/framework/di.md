---
slug: /di
sidebar_label: 依赖注入
---

# 依赖注入（DI）

Vine 使用依赖注入创建模块、handler、listener 和 runner，并管理它们依赖对象的生命周期。日常开发从字段上的 `inject:""` 开始；需要替换接口实现或控制 scope 时，再添加显式绑定。

```go
type UserService struct {
    Repo *UserRepo `inject:""`
}

func (*DemoApp) BindCommon(b *di.Binder) {
    b.Bind(di.T[*UserRepo]()).In(di.SingletonScope)
    b.Bind(di.T[*UserService]()).In(di.SingletonScope)
}
```

应用会负责创建根容器。只有编写独立工具或测试 DI 行为时，才需要直接调用 `di.NewInjector(...)`。容器负责：

- 注册类型与构造方式
- 按字段自动注入依赖
- 管理对象生命周期
- 区分根容器与执行期容器

## 核心接口

### `Injector`

```go
type Injector interface {
    Get(targetType reflect.Type) reflect.Value
    Resolve(targetPtr any)
    Invoke(method any) []reflect.Value
}
```

常见用法：

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

创建入口：

```go
injector := di.NewInjector(func(b *di.Binder) {
    // 注册绑定
})
```

根容器的默认 fallback scope 是 `TransientScope`。

### `ExecutionInjector`

```go
type ExecutionInjector interface {
    Injector
    CompleteExecution()
}
```

它会：

- 复用根容器里的单例
- 持有本次执行的 `ExecutionScope` 实例
- 在 `CompleteExecution()` 时按逆序回收执行期对象

## Scope

Vine 提供 3 种生命周期：

- `SingletonScope`
- `ExecutionScope`
- `TransientScope`

显式指定方式：

```go
b.Bind(di.T[*A]()).In(di.SingletonScope)
b.Bind(di.T[*B]()).In(di.ExecutionScope)
b.Bind(di.T[*C]()).In(di.TransientScope)
```

也可以在类型上声明默认 scope：

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

如果一个可构造类型既没有显式 `In(...)`，也没有 marker scope，会使用所在容器的 fallback scope；根容器和子容器的 fallback 都是 `TransientScope`。

Scope 绑定在“请求的 target type”上，而不是绑定在最终创建出的 concrete instance 上。也就是说，`ToImplementation(...)`、`ToFactory(...)`、`ToInstance(...)` 这类转发或工厂式绑定，其 scope 只描述当前这条 binding 的生命周期。

如果同一个 concrete implementation 既会通过接口请求，又会被直接请求，它们会分别走各自的 binding，生命周期可能不同。需要共享生命周期时，应显式绑定两边并保持 scope 一致，或者让它们转发到同一个已有实例/工厂来源。

示例：

```go
b.Bind(di.T[MailGateway]()).
    ToImplementation(di.T[*SMTPGateway]()).
    In(di.SingletonScope)

b.Bind(di.T[*SMTPGateway]()).
    In(di.TransientScope)
```

此时：

```go
var gateway MailGateway
injector.Resolve(&gateway) // 使用 MailGateway 这条 SingletonScope binding

var smtp *SMTPGateway
injector.Resolve(&smtp) // 使用 *SMTPGateway 这条 TransientScope binding
```

如果结构体实现了 `DIInit()`，实例构造并完成字段注入后会自动调用；如果实现了 `DIDispose()`，则可在执行期释放时参与清理。

注意：`PlainInjector` 不拥有应用停止流程，也不会自动释放 `SingletonScope` 实例。单例资源的关闭应由创建该 injector 的 app、component 或 module 生命周期负责，例如在 `BeforeAppStop()` / `AfterAppStop()` 中关闭数据库连接、Redis client 或其他外部资源。

## 类型辅助函数

`di.T[T]()` 用于获取 `reflect.Type`：

```go
di.T[*UserService]()
di.T[MailGateway]()
```

允许绑定的目标类型主要包括：

- interface
- struct pointer
- map
- slice
- func

## 绑定方式

### 绑定结构体类型

```go
b.Bind(di.T[*UserService]()).In(di.SingletonScope)
```

这表示让容器自己构造 `*UserService`，并继续解析它的字段依赖。

### 接口绑定到实现

```go
b.Bind(di.T[MailGateway]()).
    ToImplementation(di.T[*SMTPGateway]()).
    In(di.SingletonScope)
```

约束：

- 目标类型必须是 interface
- 实现类型必须是 struct pointer
- 实现类型必须实现该接口

这里的 `In(...)` 作用于 `MailGateway` 这条 binding。若代码也直接解析 `*SMTPGateway`，则会使用 `*SMTPGateway` 自己的显式或隐式 binding。

### 工厂函数绑定

```go
b.Bind(di.T[*Repo]()).
    ToFactory(func(db *gorm.DB, logger *logger.Logger) *Repo {
        return &Repo{DB: db, Logger: logger}
    }).
    In(di.SingletonScope)
```

工厂参数会继续从容器解析。

支持：

- `func(...) T`
- `func(...) (T, error)`

如果最后一个返回值是 `error` 且不为 `nil`，会 panic。

快捷写法：

```go
b.BindFactory(func(db *gorm.DB) *Repo {
    return &Repo{DB: db}
}).In(di.SingletonScope)
```

`BindFactory(...)` 会自动用工厂的第一个返回值类型作为 target type。

### 绑定已有实例

```go
b.BindInstance(existingClient)
```

特点：

- target type 取 `reflect.TypeOf(instance)`
- 实际上等价于 `ToInstance(instance)`
- scope 会被固定成 `SingletonScope`

### 抽象工厂

如果目标是 interface，也可以使用 `ToAbstractFactory(...)` 绑定抽象工厂。它适合做“同一个接口，根据运行时再决定给哪个实现”的场景。

## 字段注入

通过 `inject:""` 标记字段：

```go
type UserService struct {
    di.SingletonScoped

    Repo   *UserRepo    `inject:""`
    Logger *logger.Logger `inject:""`
}
```

特点：

- 按字段类型解析依赖
- 支持导出字段
- 支持匿名嵌入字段

## Resolve / Invoke / Get

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

`Invoke(...)` 的返回值是 `[]reflect.Value`。

### `Get`

```go
value := injector.Get(di.T[*UserService]())
service := value.Interface().(*UserService)
```

## 执行期容器

```go
execution := injector.StartExecution()
defer execution.CompleteExecution()
```

解析规则：

- `SingletonScope`：复用根容器单例
- `ExecutionScope`：在当前 execution 内缓存
- `TransientScope`：每次都新建

根 `PlainInjector` 不能直接解析 `ExecutionScope` 类型。

## Seeding

执行期对象通常只能在运行现场拿到，可以在 `StartExecution(...)` 时 seed：

```go
execution := injector.StartExecution(func(s *di.Seeder) {
    s.SeedInstance(currentRequest)
    s.SeedInstance(currentTrace)
})
defer execution.CompleteExecution()
```

也可以显式指定类型：

```go
execution := injector.StartExecution(func(s *di.Seeder) {
    s.Seed(di.T[context.Context](), ctx)
})
```

约束：

- 被 seed 的目标类型必须解析成 `ExecutionScope`
- seed 只能在 `StartExecution(...)` 的 `SeedApplier` 回调中执行；该方法返回后继续使用保留的 `Seeder` 会 panic
- `SeedInstance(...)` 的实例类型必须和目标类型兼容

## 子容器

可以在根容器之上继续扩展：

```go
sub := injector.SubInjector(func(b *di.Binder) {
    b.Bind(di.T[*FeatureService]()).In(di.SingletonScope)
})
```

特点：

- 子容器可以看到父容器的绑定
- 子容器可以追加自己的绑定
- 子容器自己的 fallback scope 仍然是 `TransientScope`

## 释放逻辑

对象可以通过两种方式参与释放：

- 类型自己实现框架约定的 dispose 能力
- 绑定时通过 `WithDisposer(...)` 声明销毁函数

`ExecutionInjector.CompleteExecution()` 会统一触发执行期对象的清理。执行期清理覆盖：

- `ExecutionScope` 实例
- execution 内创建且被跟踪到的 `TransientScope` 实例

`SingletonScope` 的生命周期不由 `PlainInjector` 自动结束。Vine 的 RDB、Redis 等资源组件会在 App 停止阶段关闭共享连接；业务代码自行绑定的资源也应采用同样方式。

因此，如果业务代码通过 DI 绑定了数据库、Redis、MQ client、文件句柄等单例资源，也应该在 app/component/module 的停止钩子中明确释放，而不是依赖 `PlainInjector` 自动调用 `DIDispose()`。

## 使用建议

- 全局配置、客户端、缓存优先用 `SingletonScope`
- 请求上下文、trace、调用元数据优先用 `ExecutionScope`
- 无状态临时对象才用 `TransientScope`
- 能用显式绑定就用显式绑定，不要过度依赖隐式补全
