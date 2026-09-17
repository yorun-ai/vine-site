---
slug: /meta
sidebar_label: 上下文与身份
---

# 上下文与身份

RPC、Web、Event 和 Task 的处理代码都需要知道“这次调用从哪里来、由谁发起、属于哪条调用链”。`core/meta` 用一组统一对象表达这些信息：

- 当前应用自身信息
- 调用链 trace / span
- 调用发起方信息
- 当前操作人信息
- 带这些元信息的 `context.Context`

Vine 会在请求边界创建并传递这些对象；业务代码只需从执行上下文中读取，不必自行生成或解析传输字段。

## 核心接口

### `App`

```go
type App interface {
    Name() string
    Version() string
    InstanceId() string
}
```

创建方式：

```go
appInfo, err := meta.NewApp(
    "demo.service",
    "1.2.3",
    "123e4567-e89b-12d3-a456-426614174000",
)
```

约束：

- `name` 由点号分隔的片段组成，片段以字母开头，可包含小写字母和数字，例如 `demo.service`、`user2`
- `version` 必须是完整的 semver，例如 `1.2.3` 或 `0.0.0-dev`。允许 Go module 形式的
  `v` 前缀；`1.2`、`01.2.3` 之类不完整的版本会被拒绝
- `instanceId` 必须是合法 UUID。Vine 会为每个应用实例生成 UUID v7，
  `meta.MustNewAppWithRandomId(name, version)` 即按此方式创建身份

### `CurrentApp`

`CurrentApp` 标识它所注入的组件图所属的那个应用实例，字段与 `App` 相同：

```go
type CurrentApp interface {
    Name() string
    Version() string
    InstanceId() string
}
```

需要拿到自身所属应用的 Component 或 Module 可以注入它：

```go
type GreetingModule struct {
    app.BaseModule
    CurrentApp meta.CurrentApp `inject:""`
}
```

描述其他应用的身份（调用方、发起方、已注册的 peer 等）仍使用 `App`。

### 构建身份

应用对外报告的版本来自构建时链接进二进制的值。可执行文件名称、版本、commit、构建者和构建时间都来自 `go.yorun.ai/vine/buildinfo`：

```bash
go build -ldflags "\
  -X go.yorun.ai/vine/buildinfo.ldVersion=1.2.3 \
  -X go.yorun.ai/vine/buildinfo.ldGitCommit=$(git rev-parse --short HEAD)" \
  ./cmd/demo
```

可执行文件名称由点号分隔的片段组成，片段内为小写字母和数字，片段之间可以带短横线，例如 `user.service`、`user-service`、`demo.worker-2`。版本必须是完整的 semver，可带 Go module 形式的 `v` 前缀。构建工具可用 `buildinfo.IsValidName` 与 `buildinfo.IsValidVersion` 做同样的校验；链接了不可用的名称或版本时，进程启动阶段就会失败。未链接版本时报告 `0.0.0`。

`buildinfo.Name`、`Version`、`GitCommit`、`BuiltBy`、`BuiltTime` 读取这些链接值。构建未链接的 commit、构建者或构建时间返回空字符串，`Inspect` 会将其显示为 `NotAvailable`，并同时输出 Go 工具链信息。

### `Trace`

```go
type Trace interface {
    Id() string
    Span() string
    ParentSpan() string
    NewChildTrace() Trace
}
```

创建方式：

```go
trace := meta.InitialTrace()
child := trace.NewChildTrace()
```

也可以显式指定：

```go
trace, err := meta.NewTrace("4bf92f3577b34da6a3ce929d0e0e4736", "")
```

当 `span == ""` 时，`NewTrace(...)` 会自动生成新 span。

### `Initiator`

```go
type Initiator interface {
    App
    Dialer() string
    IpAddr() string
}
```

表示“是谁发起了这次调用”。

```go
initiator, err := meta.NewInitiator(
    "gateway.api",
    "1.2.3",
    "123e4567-e89b-12d3-a456-426614174000",
    "gateway.api/1.2.3",
    "127.0.0.1",
)
```

如果 `ipStr == ""`，`IpAddr()` 会返回空字符串；非空时必须能被 `netip.ParseAddr(...)` 解析。

### `Actor`

```go
type Actor interface {
    Type() ActorType
    IsAnonymous() bool
    IsAuthenticated() bool
    Realm() string
    Identifier() string
    RawInfo() string
}
```

```go
anonymous := meta.NewAnonymousActor()
authenticated := meta.NewAuthenticatedActor(&skeled.UserActorInfo{
    UserId: "user-1",
})
```

认证 Actor 的 info 类型由生成代码注册。使用 `meta.GetActorInfo[T](actor)` 读取类型安全的身份信息。

`Realm()` 返回完整的 actor SkelName，例如 `base.UserActor`。
`Identifier()` 将 `auth.info` 中标记了 `@identifier` 的字段值以字符串形式返回，
支持字符串、UUID 和整数标识符。定位主体时应同时比较这两个值；认证状态使用
`IsAuthenticated()` 判断。

```go
actor := ctx.Actor()
realm := actor.Realm()
identifier := actor.Identifier()
```

声明标识符需要使用支持 `@identifier` 的 skelc，并重新生成契约。未声明标记的 Actor 返回空标识符；absent、anonymous、authenticating
状态的 realm 和 identifier 均为空字符串。重命名 actor 或其 domain 会改变 realm。

### `Context`

```go
type Context interface {
    context.Context

    Trace() Trace
    Initiator() Initiator
    Actor() Actor
}
```

创建方式：

```go
ctx := meta.NewContext(
    context.Background(),
    trace,
    initiator,
    actor,
)
```

`meta.Context` 只是对标准 `context.Context` 的包装。

## Trace 规则

### Trace ID

Trace ID 规则：

- 16 字节随机数
- 十六进制小写字符串
- 长度固定 32
- 全零值非法

能用这些 API：

- `meta.NewId()`
- `meta.IsValidId(id)`

### Span ID

Span ID 规则：

- 8 字节随机数
- 十六进制小写字符串
- 长度固定 16
- 全零值非法

能用这些 API：

- `meta.NewSpan()`
- `meta.IsValidSpan(span)`

### `InitialTrace()` 与 `NewChildTrace()`

`InitialTrace()` 会创建根 trace：

- 新的 `Id()`
- 新的 `Span()`
- `ParentSpan()` 为空字符串

`NewChildTrace()` 会基于当前 trace 派生子 span：

- 复用相同 trace id
- `ParentSpan()` 等于父 span
- 新生成子 span

## Base64 编解码辅助

`core/meta` 提供以下两组编解码辅助函数。

### Initiator

```go
encoded := meta.EncodeInitiatorToBase64(initiator)
decoded, err := meta.DecodeInitiatorFromBase64(encoded)
```

特殊行为：

- `DecodeInitiatorFromBase64("")` 会返回 `nil, nil`

### Actor

```go
encoded := meta.EncodeActorToBase64(actor)
decoded, err := meta.DecodeActorFromBase64(encoded)
```

空字符串不是合法的 Actor 编码，`DecodeActorFromBase64("")` 会返回错误。没有身份信息时，应显式使用 `meta.NewAbsentActor()`；未登录访问使用 `meta.NewAnonymousActor()`。

## 适用场景

典型场景：

- 在 RPC / Web / Message 边界上传递 trace
- 统一表示“调用来自哪个 app”
- 把 Actor 和 Initiator 作为运行时上下文对象往下传

`meta` 只负责数据模型，不负责日志字段格式化。
