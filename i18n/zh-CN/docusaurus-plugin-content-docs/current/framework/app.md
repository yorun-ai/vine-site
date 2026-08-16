---
slug: /app
sidebar_label: App API
---

# App API

大多数应用代码只需要依赖 `go.yorun.ai/vine/app` 这一个包就够了。它负责进程生命周期、
Component 与 Module 的创建、HTTP/RPC/Web 入口挂载，以及运行时依赖的注入。

## 对外入口

业务代码依赖顶层包 `go.yorun.ai/vine/app`。如果还要组合运行时组件，按模式导入 `app/linked` 或 `app/standalone`。

常用入口包括：

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
- `NewBundled(...)`
- `linked.New[S](...)` / `linked.NewWithOption[S](...)` / `linked.Option`
- `linked.NewBundled(...)` / `linked.NewBundledWithOption(...)`
- `standalone.New[S](...)` / `standalone.NewWithOption[S](...)` / `standalone.Option`
- `standalone.NewBundled(...)` / `standalone.NewBundledWithOption(...)`

## 核心接口

### `App`

```go
type App interface {
    Name() string
    Start()
    StopGracefully()
    StartAndWait()
}
```

常见用法：

```go
app.New[*DemoApp]().StartAndWait()
```

语义如下：

- `Start()`：启动应用，非阻塞
- `StopGracefully()`：执行优雅停止并阻塞到应用完全退出
- `StartAndWait()`：启动后等待退出信号，再执行优雅停止流程

生命周期调用是单次的。重复 `Start()`、没启动就 `StopGracefully()`、重复 `StopGracefully()`，或者停止后再次 `Start()`，这些操作都会 panic。

### `ApplicationSpec`

应用规格接口是：

```go
type ApplicationSpec interface {
    Name() string
    InitComponents(addComponent TypeAdder)
    InitModules(addModule TypeAdder)
    BindCommon(b *di.Binder)
}
```

字段含义：

- `Name()`：应用名，必须匹配 `^[a-z]+(?:\.[a-z]+)*$`，即由点号分隔的一个或
  多个纯小写字母段，例如 `demo.checkout`
- `InitComponents(...)`：声明 Component 类型
- `InitModules(...)`：声明 Module 类型
- `BindCommon(...)`：注册应用级公共依赖

业务应用嵌入 `app.Application` 即可获得默认实现，再覆盖需要的方法。

### `Application`

`Application` 是默认基类：

```go
type Application struct {
    AppFlag *RunFlag `inject:""`
}
```

默认实现如下：

- `Name()` 返回空字符串，业务 app 必须覆写
- `InitComponents(...)` 默认不追加 Component
- `InitModules(...)` 默认不追加 Module
- `BindCommon(...)` 默认不绑定额外依赖

最小 app 一般这样写：

```go
type DemoApp struct {
    app.Application
}

func (*DemoApp) Name() string {
    return "demo.app"
}
```

## 创建

### `New`

```go
instance := app.New[*DemoApp]()
```

`New` 会立即构造并校验 application spec，它不是 lazy factory。spec 的注入字段和
`DIInit()` 会在这个调用中执行；root context 与 listen address 也会在 `Start()` 前被
捕获。

行为如下：

- 同一个 spec 类型只能创建一次
- 不同 spec 类型如果 `Name()` 相同，也不能同时创建

说白了，框架同时约束了“spec 类型唯一”和“应用名唯一”。

顶层 `app.NewWithOption(...)` 的 `Option` 提供 `LinkEndpoint`，也可以通过 `--link-endpoint` 或 `VINE_LINK_ENDPOINT` 提供。

`app.NewBundled(...)` 将 `app.New(...)` 或 `app.NewWithOption(...)` 创建的多个应用
组合进同一个进程生命周期，并连接外部 Link，包括 `vine dev` 托管的 Link。应用按
声明顺序启动、按逆序停止。bundle 不会启动 Hub、Portal 或 Link，每个子应用保留
自己配置的 Link endpoint；多个应用共享一个 Link sidecar 时应使用同一个 endpoint。

```go
app.NewBundled(
    app.New[*OrderApp](),
    app.New[*PaymentApp](),
).StartAndWait()
```

### 运行模式构造

- `linked.New(...)`：同进程启动一个 Link，再以 inproc app 形式启动业务 app。`linked.Option` 支持 `HubEndpoint`、`IngressListen`、`MTLSCAFile`、`MTLSCertFile` 和 `MTLSKeyFile`，这些值也可以改由对应的命令行参数或环境变量设置。证书标识的是内嵌 `vine.link` workload，而不是业务应用
- `linked.NewBundled(...)`：多个业务 app 共享一个同进程 Link，并连接外部 Hub。注意，被打包的 linked app 不能再带自己的 `linked.Option`
- `standalone.New(...)`：同进程启动 Hub、Portal、Link 和一个业务 app。`standalone.Option` 支持 seed YAML、SQLite 文件、PostgreSQL URL 和 Dashboard URL
- `standalone.NewBundled(...)`：把多个 standalone app 打包进同一套内置 Hub / Portal / Link。注意，被打包的 standalone app 不能再带自己的 `standalone.Option`

## Flag 模型

### `With(flag)`

`New[...]()` 接收 `FlagApplier`，最常见写法是：

```go
app.New[*DemoApp](
    app.With(&app.RunFlag{ListenAddr: ":18080"}),
)
```

`With(flag)` 的约束：

- `flag` 必须为非 `nil`
- `flag` 必须是“指向 struct 的指针”
- 同一个 flag 类型只能提供一次

### `RunFlag`

```go
type RunFlag struct {
    FlagModel
    ListenAddr   string
    LinkEndpoint string
    Context      context.Context
}
```

语义如下：

- `ListenAddr == ""` 时监听随机端口
- `LinkEndpoint` 指定通过 `app.New(...)` 或 `app.NewWithOption(...)` 直接创建的
  应用所连接的 Link API。可以通过 `app.Option`、`--link-endpoint` 或
  `VINE_LINK_ENDPOINT` 设置
- `Context == nil` 时回退到 `context.Background()`
- 即使没有显式传入 `RunFlag`，框架也会自动补一个默认实例

应用内部可以通过 `AppFlag` 读取最终运行参数。更推荐在构造时设置：

```go
instance := app.New[*DemoApp](
    app.With(&app.RunFlag{ListenAddr: ":18080"}),
)
```

`BindCommon` 在 `Start()` 期间运行，此时 Vine 已经捕获 `ListenAddr`。所以在这个阶段修改
`AppFlag.ListenAddr` 是不会改变应用 listener 的。如果确实需要由应用类型提供默认值，建议在
application spec 上实现 `DIInit()`，它会在 `New` 期间、`AppFlag` 注入后执行：

```go
func (a *DemoApp) DIInit() {
    if a.AppFlag.ListenAddr == "" {
        a.AppFlag.ListenAddr = ":18080"
    }
}
```

### 自定义 Flag

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

创建时传入：

```go
app.New[*DemoApp](
    app.With(&DemoFlag{Region: "cn"}),
)
```

## 组件与模块

### 基础设施组件

数据库、Redis 等框架组件通过 `InitComponents` 声明。业务类型应嵌入对应公开组件，例如 `rdb.Database` 或 `redis.Redis`：

```go
func (*DemoApp) InitComponents(add app.TypeAdder) {
    add(app.T[*MainDatabase]())
    add(app.T[*MainRedis]())
}
```

Component 会把连接、DAO、Cache 或 Locker 等对象提供给依赖注入容器。注意，Component 类型不能重复声明。

### Module

业务生命周期逻辑使用 `Module`。嵌入 `app.BaseModule` 后，只需要实现你关心的生命周期方法：

```go
type DemoModule struct {
    app.BaseModule
}

func (*DemoApp) InitModules(add app.TypeAdder) {
    add(app.T[*DemoModule]())
}
```

Module 同样会参与：

- `BeforeAppStart`
- `AfterAppStart`
- `BeforeAppStop`
- `AfterAppStop`

停止阶段按逆序执行。

## 可选能力

应用 spec 按需实现以下能力接口即可。

### RPC：`ServicerSpec`

```go
type ServicerSpec interface {
    ServicerBind(b *di.Binder)
    ServicerInitHandlers(addHandler TypeAdder)
    ServicerInitFilters(addFilter TypeAdder)
}
```

默认空实现基类：

```go
type ServicerEnabled struct{}
```

实现后，框架会创建 `core/rpc` server，并挂到 `/rpc/invoke`。

### Web：`WebberSpec`

一个 app 只支持一个 weber：

```go
type WebberSpec interface {
    WebberBind(b *di.Binder)
    WebberInitHandlers(addHandler TypeAdder)
    WebberInitFilters(addFilter TypeAdder)
}
```

`WebberEnabled` 提供默认空实现。

weber 的访问前缀是：

```text
/web/access/default@<appName>
```

### Event：`EventerSpec`

```go
type EventerSpec interface {
    EventerBind(b *di.Binder)
    EventerInitListeners(addListener ListenerTypeAdder)
    EventerInitFilters(addFilter TypeAdder)
}
```

默认空实现基类：

```go
type EventerEnabled struct{}
```

实现后，框架会创建 event server，并挂到 `/event`。

声明 Listener 时可以附加选项：

- `app.WithListenerTimeout(timeout)`
- `app.WithListenerConcurrency(concurrency)`
- `app.WithListenerNoRetry()`

### Task：`TaskerSpec`

```go
type TaskerSpec interface {
    TaskerBind(b *di.Binder)
    TaskerInitRunners(addRunner RunnerTypeAdder)
    TaskerInitFilters(addFilter TypeAdder)
}
```

默认空实现基类：

```go
type TaskerEnabled struct{}
```

实现后，框架会创建 task server，并挂到 `/task`。

声明 Runner 时可以附加选项：

- `app.WithRunnerTimeout(timeout)`
- `app.WithRunnerConcurrency(concurrency)`
- `app.WithRunnerNoRetry()`
- `app.WithRunnerCronScheduler(triggerSkelName, cronExpr)`

cron scheduler 用于给某个无参数 trigger 注册定时触发规则。`triggerSkelName` 必须非空，`cronExpr` 也必须非空且能被标准 cron 表达式解析。注意，带参数的 trigger 不能作为 cron scheduler 目标。

## 路由模型

app 进程会按需挂载这些内建前缀：

- `/console`
- `/rpc/invoke`
- `/event`
- `/task`
- `/web/access/...`

行为说明：

- 命中某个前缀后，框架会去掉该前缀，再把剩余路径转给对应 Handler
- 没有命中任何已注册 route 时，返回 `404`

例如访问：

```text
/rpc/invoke/demo.user.UserService/getUser
```

传给 RPC Handler 的内部路径会变成：

```text
/demo.user.UserService/getUser
```

Module 如果实现 `PathPrefixRouteModule`，还能主动追加自定义前缀 route。

## HTTP 与 inproc

普通模式下：

- app 默认启 HTTP server
- `ListenAddr == ""` 时监听随机端口
- server 使用 h2c 运行

框架内部还支持 inproc 模式，用于框架自带应用互联。它不是顶层 `app` 包的公共创建入口。

inproc 下会注册：

- 所有 RPC route
- 所有 `/web/access/...` route

## 启动与停止流程

`Start()` 大致顺序：

1. 初始化 Linker 和配置 reader
2. 初始化 injector
3. 初始化 Component
4. 初始化 Module
5. 初始化 console / servicer / webber / eventer / tasker
6. 执行 Component `BeforeAppStart()`
7. 执行 Module `BeforeAppStart()`
8. 启动 HTTP 或 inproc server
9. 启动 servicer / eventer / tasker
10. 向 Link 注册 app 能力
11. 执行 Component `AfterAppStart()`
12. 执行 Module `AfterAppStart()`

`StopGracefully()` 大致顺序：

1. 逆序执行 Module `BeforeAppStop()`
2. 逆序执行 Component `BeforeAppStop()`
3. 注销 app
4. 停止 HTTP 或 inproc server
5. 取消运行时 context
6. 逆序执行 Module `AfterAppStop()`
7. 逆序执行 Component `AfterAppStop()`

在 `linked` 模式下，外层 app 会先等待业务 app 完成 `StopGracefully()`，再停止同进程内的 Link。这样可以避免业务 app 注销时 Link 的 inproc Handler 已经卸载的问题。

在 `standalone` / bundled standalone 模式下，会先按逆序优雅停止业务 apps，再停止 Link、Portal、Hub 等内置运行时组件。

注册会在 `AfterAppStart` 之前开始，所以 readiness 关键工作请放在更早的 hook 里完成。
启动 hook 失败会 panic，也不会自动回滚已经构造的资源。精确边界和 hook 职责见
[应用生命周期](../runtime/application-lifecycle.md)。

## DI 可见性

应用内部常见可见依赖包括：

- 各类 flag
- app 自己的 spec 实例
- 用户 Component 实例
- Module 实例
- `BindCommon(...)` 绑定的公共依赖
- 各能力子系统额外绑定的上下文和 logger

具体来说：

- `BindCommon(...)` 放应用级公共依赖
- Component/Module 自己的 `Bind(...)` 放该对象专属依赖
- Servicer / Webber / Eventer / Tasker 会把各自上下文再补到执行容器里

## 使用时需要守住的边界

- 每个业务 app 都要覆写 `Name()`
- 推荐在构造时通过 `app.With(&app.RunFlag{ListenAddr: "..."})` 提供监听地址。
  如果 app 必须自行选择默认值，请在 specification 的 `DIInit()` 中修改注入的
  flag。到 `BindCommon(...)` 再修改已经太晚了
- Component 和 Module 都用指针类型声明
- `BindCommon(...)` 只放共享依赖，不要在这里做路由或启动工作
- web 路由入口收敛到单个 `WebberSpec`。如果需要更多路由，放在同一个 weber 下追加多个 Handler
