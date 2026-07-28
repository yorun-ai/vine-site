---
slug: /meta
sidebar_label: 上下文与身份
---

# 上下文与身份

Rpc、Web、Event 和 Task 的处理代码都需要知道“这次调用从哪里来、由谁发起、属于哪条调用链”。`core/meta` 用一组统一对象表达这些信息：

- 当前应用自身信息
- 调用链 trace / span
- 调用发起方信息
- 当前操作人信息
- 带这些元信息的 `context.Context`

Vine 会在请求边界创建并传递这些对象；业务代码通常只需从执行上下文中读取，不必自行生成或解析传输字段。

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

- `name` 必须是点分小写名，例如 `demo.service`
- `version` 必须是合法 semver
- `instanceId` 必须是合法 UUID

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

可以用这些 API：

- `meta.NewId()`
- `meta.IsValidId(id)`

### Span ID

Span ID 规则：

- 8 字节随机数
- 十六进制小写字符串
- 长度固定 16
- 全零值非法

可以用这些 API：

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

- 在 Rpc / Web / Message 边界上传递 trace
- 统一表示“调用来自哪个 app”
- 把 actor 和 initiator 作为运行时上下文对象往下传

`meta` 只负责数据模型，不负责日志字段格式化。
