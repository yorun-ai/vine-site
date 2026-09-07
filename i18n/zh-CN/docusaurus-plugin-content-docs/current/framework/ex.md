---
slug: /ex
sidebar_label: 错误处理
---

# 错误处理

Vine 使用 `core/ex` 在 Rpc、Web、Event、Task 和业务代码之间传递稳定的错误码。调用方能按 `Code` 处理错误，日志仍能保留 message、reason、detail 和原始 cause。

## 适用场景

`core/ex` 适合这类场景：

- 希望用统一的错误码表达系统错误和业务错误
- 希望错误对象同时保留机器可读的 `Code` 与面向日志/排障的 message
- 希望在 panic / recover 流程中区分“业务异常”与“系统异常”
- 希望为不同错误码附带稳定的元信息，例如分类、默认文案、是否可直接抛出

整体模型概括为：

1. 用 `Code` 描述错误语义
2. 用 `New(...)` 等函数构造 `ex.Error`
3. 需要中断流程时直接 `panic`
4. 在边界层用 `Recover(...)` 或 `RecoverApplication(...)` 恢复
5. 再根据 `Type` / `Category` / `Code` 做统一处理

## 核心类型

### `Type`

```go
type Type string
```

错误分为 4 种类型：

- `InvalidType`
- `NoError`
- `SystemError`
- `ApplicationError`

含义上：

- `NoError` 表示成功态
- `SystemError` 表示框架、调用链、兜底类系统错误
- `ApplicationError` 表示业务语义上的可预期错误

### `Category`

```go
type Category string
```

分类包括：

- `InvalidCategory`
- `SuccessCategory`
- `FrameworkCategory`
- `InvocationCategory`
- `FallbackCategory`
- `ApplicationCategory`

`Category` 比 `Type` 更细一层，主要用于给 `Code` 做稳定分组。

### `Code`

```go
type Code string
```

`Code` 是整个错误体系的核心枚举。公开错误码包括：

```go
const (
    OK Code = "OK"

    ServiceUnavailable Code = "SERVICE_UNAVAILABLE"
    GatewayTimeout     Code = "GATEWAY_TIMEOUT"
    ClientForbidden    Code = "CLIENT_FORBIDDEN"
    InvalidRequest     Code = "INVALID_REQUEST"

    ServerUnreachable   Code = "SERVER_UNREACHABLE"
    InvocationCancelled Code = "INVOCATION_CANCELLED"
    InvocationTimeout   Code = "INVOCATION_TIMEOUT"
    InvocationFailed    Code = "INVOCATION_FAILED"
    UnexpectedResponse  Code = "UNEXPECTED_RESPONSE"

    Internal Code = "INTERNAL"
    Unknown  Code = "UNKNOWN"

    Unauthorized      Code = "UNAUTHORIZED"
    PermissionDenied  Code = "PERMISSION_DENIED"
    ElevationRequired Code = "ELEVATION_REQUIRED"
    ValidationFailed  Code = "VALIDATION_FAILED"
    OperationFailed   Code = "OPERATION_FAILED"
    NotFound          Code = "NOT_FOUND"
)
```

### `Error`

```go
type Error interface {
    error

    Type() Type
    Code() Code
    Message() string
    Reason() string
    Detail() string
}
```

字段含义：

- `Type()` 由 `Code` 派生
- `Code()` 返回当前错误码
- `Message()` 返回业务传入的错误消息
- `Reason()` 返回细分原因，格式不限，用于前端或调用点在某些情况下区分同一个 `Code` 下的不同场景
- `Detail()` 返回更细节的错误说明，主要用于内部诊断。Portal 对外返回错误时会保留 `detail` 字段但清空字段内容

## Code 元数据

每个 `Code` 都绑定了一组稳定元信息，可通过方法读取。

### `Type()`

```go
code := ex.NotFound
kind := code.Type() // ApplicationError
```

`Type` 不需要单独存储，而是由 `Code` 自动推导。

### `Category()`

```go
category := ex.InvocationTimeout.Category() // InvocationCategory
```

错误码分组如下：

- `OK` 属于 `SuccessCategory`
- `ServiceUnavailable`、`GatewayTimeout`、`ClientForbidden`、`InvalidRequest` 属于 `FrameworkCategory`
- `ServerUnreachable`、`InvocationCancelled`、`InvocationTimeout`、`InvocationFailed`、`UnexpectedResponse` 属于 `InvocationCategory`
- `Internal`、`Unknown` 属于 `FallbackCategory`
- `Unauthorized`、`PermissionDenied`、`ElevationRequired`、`ValidationFailed`、`OperationFailed`、`NotFound` 属于 `ApplicationCategory`

### `IsValid()`

```go
if !code.IsValid() {
    // 非法错误码
}
```

只有框架内预定义的 `Code` 才是合法值。

### `IsUnresponsive()`

```go
if ex.InvocationTimeout.IsUnresponsive() {
    // 可视为下游无响应类问题
}
```

以下调用链错误被标记为“无响应”：

- `ServerUnreachable`
- `InvocationCancelled`
- `InvocationTimeout`
- `InvocationFailed`
- `UnexpectedResponse`

### `CanRaiseDirectly()`

```go
ex.NotFound.CanRaiseDirectly() // true
ex.Internal.CanRaiseDirectly() // false
```

错误类型如下：

- 大多数公开错误码都允许直接抛出
- `Internal` 和 `Unknown` 被视为兜底错误，不建议直接作为业务层显式抛出的最终语义

### `DefaultMessage()`

```go
ex.Internal.DefaultMessage() // "error occurred, please retry"
ex.Unknown.DefaultMessage()  // "unknown error"
```

只有 `Internal` 和 `Unknown` 预置了默认文案，其他错误码默认返回空字符串。

## 构造错误

### 最基础的写法

```go
err := ex.New(ex.NotFound, "missing user")
```

这会创建一个实现了 `ex.Error` 的错误对象。

### 带格式化消息

```go
err := ex.New(ex.ValidationFailed, ex.F("field %s is invalid", "email"))
```

### 带细分原因

```go
err := ex.New(
    ex.OperationFailed,
    "write failed",
    ex.WithReason("disk-quota-exceeded"),
)
```

`reason` 适合承载可判断的细分场景，格式不限，由错误产生方和消费方约定。通常 `Code` 表示错误大类，`Reason` 表示同一个错误码下的具体原因，前端可以在某些情况下根据它做更细的展示或交互处理。

### 带细节说明

```go
err := ex.New(
    ex.OperationFailed,
    "write failed",
    ex.WithDetail("disk quota exceeded"),
)
```

适合需要对外带出更细节说明，但不需要保留原始 `error` 对象时使用。

### 包装原始 `error`

```go
err := ex.New(
    ex.OperationFailed,
    "write failed",
    ex.WithCause(cause),
)
```

行为上：

- 通过 `errors.Is(...)` 能继续判断被包装的原始错误
- `causeError` 不会参与跨进程序列化

### 成功态与兜底错误

```go
ok := ex.NewOK()
internalErr := ex.NewInternal()
```

其中：

- `NewOK()` 等价于创建 `Code == OK` 的错误对象
- `NewInternal()` 等价于 `New(ex.Internal, ex.Internal.DefaultMessage())`

## 错误对象行为

### `Type()` 由 `Code` 自动派生

```go
err := ex.New(ex.NotFound, "missing user")
err.Type() // ApplicationError
```

因此不需要单独判断“这是哪种 error 实现”，直接使用 `Code` 和 `Type`。

### `Error()` 字符串格式

`ex.Error` 同时实现了标准 `error` 接口，字符串格式大致是：

```text
missing user type=APPLICATION code=NOT_FOUND
```

也就是说：

- `message` 为空时，只输出类型和错误码等信息

### 非法 `Code` 会触发 panic

所有构造函数都会检查 `Code.IsValid()`。如果传入未知错误码，会直接 panic。

因此自定义逻辑里不要手工拼接未注册的 `Code` 字符串传给 `New(...)`。

## 解析与判断

### `ParseCode(...)`

```go
code, err := ex.ParseCode("NOT_FOUND")
```

行为：

- 字符串合法时返回对应 `Code`
- 非法时返回普通 `error`

用于在配置、协议字段、日志回放等字符串场景中恢复 `Code`。

### 常见判断方式

```go
if err.Code() == ex.NotFound {
    // 处理资源不存在
}

if err.Type() == ex.ApplicationError {
    // 处理业务错误
}

if err.Code().Category() == ex.InvocationCategory {
    // 处理下游调用问题
}
```

## Panic 与 Recover

`core/ex` 明确支持“用 panic 传播 ex.Error，再在边界统一 recover”这一模式。

### 主动 panic

```go
ex.PanicIfError(err)
ex.PanicNew(ex.NotFound, "missing user")
ex.PanicNew(ex.ValidationFailed, ex.F("field %s is required", "name"))
ex.PanicNewIfError(err, ex.OperationFailed)
ex.PanicNewIfNot(user != nil, ex.NotFound, "missing user")
ex.PanicNewIfNot(name != "", ex.ValidationFailed, ex.F("field %s is required", "name"))
```

语义说明：

- `PanicIfError(err)` 只有在 `err != nil` 时才会 panic
- `PanicNew(...)` 直接构造并 panic
- `PanicNewIfError(...)` 把普通 `error` 映射成指定 `Code`
- `PanicNewIfNot(...)` 适合把条件检查写在原始调用点，方便保留更准确的 panic 栈

### `Recover(...)`

```go
defer func() {
    if err := ex.Recover(recover()); err != nil {
        // err 可能是 ApplicationError，也可能是 SystemError
    }
}()
```

行为：

- `recover()` 结果为 `nil` 时返回 `nil`
- 如果 panic 值是 `ex.Error`，则直接返回
- 无论它是 `ApplicationError` 还是 `SystemError` 都会被接住
- 如果 panic 值不是 `ex.Error`，会重新 panic

### `RecoverApplication(...)`

```go
defer func() {
    if err := ex.RecoverApplication(recover()); err != nil {
        // 这里只会拿到 ApplicationError
    }
}()
```

它更严格：

- 只接住 `Type() == ApplicationError` 的 `ex.Error`
- 如果 panic 值是 `SystemError`，会继续 panic
- 如果 panic 值不是 `ex.Error`，也会继续 panic

适合在只想拦业务异常、不想吞系统故障的边界层使用。

## 一个典型用法

```go
func FindUser(id string) (*User, ex.Error) {
    if id == "" {
        return nil, ex.New(ex.ValidationFailed, "empty id")
    }
    user := repo.Find(id)
    if user == nil {
        return nil, ex.New(ex.NotFound, "user not found")
    }
    return user, nil
}
```

如果你更偏向 panic / recover 风格，或者写成：

```go
func MustFindUser(id string) *User {
    if id == "" {
        ex.PanicNew(ex.ValidationFailed, "empty id")
    }
    user := repo.Find(id)
    if user == nil {
        ex.PanicNew(ex.NotFound, "user not found")
    }
    return user
}
```

边界层统一恢复：

```go
func Handle() (err ex.Error) {
    defer func() {
        err = ex.Recover(recover())
    }()

    _ = MustFindUser("u-1")
    return nil
}
```

## 错误边界规则

- 业务可预期失败优先使用 `ApplicationError`
- 框架层、调用链、兜底异常优先使用已有系统级 `Code`
- `Internal` 和 `Unknown` 更适合做兜底映射，不要滥用为通用业务错误
- 如果需要保留底层错误链，优先使用 `New(..., ex.WithCause(...))`
- 如果边界层不希望吞掉系统故障，优先使用 `RecoverApplication(...)`
