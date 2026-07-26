---
slug: /ex
---

# Error Handling (EX)

Vine uses `core/ex` to carry stable error codes across Rpc, Web, Event, Task, and business code. Callers can branch on `Code`, while logs retain the message, reason, detail, and original cause.

## 1. Use cases

Use `core/ex` when you need to:

- Express system and business failures with consistent error codes.
- Keep both a machine-readable `Code` and a message useful for logs and troubleshooting.
- Distinguish business exceptions from system exceptions in panic/recover flows.
- Attach stable metadata to each error code, including category, default message, and whether it can be raised directly.

The overall model is:

1. Describe error semantics with a `Code`.
2. Construct an `ex.Error` with `New(...)` or a related function.
3. Use `panic` when execution must be interrupted.
4. Recover at a boundary with `Recover(...)` or `RecoverApplication(...)`.
5. Handle the error according to its `Type`, `Category`, or `Code`.

## 2. Core types

### 2.1 `Type`

```go
type Type string
```

Four types are defined:

- `InvalidType`
- `NoError`
- `SystemError`
- `ApplicationError`

Their meanings are:

- `NoError` represents success.
- `SystemError` represents framework, call-chain, and fallback system failures.
- `ApplicationError` represents expected business failures.

### 2.2 `Category`

```go
type Category string
```

The categories are:

- `InvalidCategory`
- `SuccessCategory`
- `FrameworkCategory`
- `InvocationCategory`
- `FallbackCategory`
- `ApplicationCategory`

A `Category` is more specific than a `Type` and provides a stable grouping for `Code` values.

### 2.3 `Code`

```go
type Code string
```

`Code` is the central error enumeration. The exported codes are:

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

### 2.4 `Error`

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

The methods return:

- `Type()`: the type derived from `Code`.
- `Code()`: the error code.
- `Message()`: the supplied error message.
- `Reason()`: a more specific reason, in an application-defined format, that clients can use to distinguish cases under the same `Code`.
- `Detail()`: diagnostic detail. Portal preserves the `detail` field in external responses but clears its content.

## 3. Code metadata

Each `Code` has stable metadata exposed through methods.

### 3.1 `Type()`

```go
code := ex.NotFound
kind := code.Type() // ApplicationError
```

`Type` is derived from `Code` and does not need to be stored separately.

### 3.2 `Category()`

```go
category := ex.InvocationTimeout.Category() // InvocationCategory
```

Codes are grouped as follows:

- `OK` belongs to `SuccessCategory`.
- `ServiceUnavailable`, `GatewayTimeout`, `ClientForbidden`, and `InvalidRequest` belong to `FrameworkCategory`.
- `ServerUnreachable`, `InvocationCancelled`, `InvocationTimeout`, `InvocationFailed`, and `UnexpectedResponse` belong to `InvocationCategory`.
- `Internal` and `Unknown` belong to `FallbackCategory`.
- `Unauthorized`, `PermissionDenied`, `ElevationRequired`, `ValidationFailed`, `OperationFailed`, and `NotFound` belong to `ApplicationCategory`.

### 3.3 `IsValid()`

```go
if !code.IsValid() {
    // Invalid error code
}
```

Only codes predefined by the framework are valid.

### 3.4 `IsUnresponsive()`

```go
if ex.InvocationTimeout.IsUnresponsive() {
    // Treat this as an unresponsive downstream dependency
}
```

These invocation errors are classified as unresponsive:

- `ServerUnreachable`
- `InvocationCancelled`
- `InvocationTimeout`
- `InvocationFailed`
- `UnexpectedResponse`

### 3.5 `CanRaiseDirectly()`

```go
ex.NotFound.CanRaiseDirectly() // true
ex.Internal.CanRaiseDirectly() // false
```

Most public error codes can be raised directly. `Internal` and `Unknown` are fallback errors and should not normally be used as explicit final business semantics.

### 3.6 `DefaultMessage()`

```go
ex.Internal.DefaultMessage() // "error occurred, please retry"
ex.Unknown.DefaultMessage()  // "unknown error"
```

Only `Internal` and `Unknown` have predefined default messages; the other codes return an empty default message.

## 4. Constructing errors

### 4.1 Basic form

```go
err := ex.New(ex.NotFound, "missing user")
```

This creates an error object implementing `ex.Error`.

### 4.2 Formatted message

```go
err := ex.New(ex.ValidationFailed, ex.F("field %s is invalid", "email"))
```

### 4.3 Specific reason

```go
err := ex.New(
    ex.OperationFailed,
    "write failed",
    ex.WithReason("disk-quota-exceeded"),
)
```

Use `reason` for a distinguishable subcase in any format agreed upon by producer and consumer. Typically, `Code` identifies the broad failure and `Reason` identifies a specific case that a frontend may present or handle differently.

### 4.4 Detail

```go
err := ex.New(
    ex.OperationFailed,
    "write failed",
    ex.WithDetail("disk quota exceeded"),
)
```

Use detail when you need additional explanation without retaining the original `error` object.

### 4.5 Wrapping an original `error`

```go
err := ex.New(
    ex.OperationFailed,
    "write failed",
    ex.WithCause(cause),
)
```

This preserves these behaviors:

- `errors.Is(...)` can still identify the wrapped error.
- `causeError` is not serialized across processes.

### 4.6 Success and fallback errors

```go
ok := ex.NewOK()
internalErr := ex.NewInternal()
```

- `NewOK()` creates an error object whose `Code == OK`.
- `NewInternal()` is equivalent to `New(ex.Internal, ex.Internal.DefaultMessage())`.

## 5. Error-object behavior

### 5.1 `Type()` is derived from `Code`

```go
err := ex.New(ex.NotFound, "missing user")
err.Type() // ApplicationError
```

You normally do not need to inspect the concrete error implementation; use `Code` and `Type` instead.

### 5.2 `Error()` string format

`ex.Error` also implements the standard `error` interface. Its string resembles:

```text
missing user type=APPLICATION code=NOT_FOUND
```

When `message` is empty, only the type, code, and related information are included.

### 5.3 Invalid codes panic

All constructors call `Code.IsValid()`. Passing an unknown code causes a panic.

Do not construct an unregistered `Code` string manually and pass it to `New(...)`.

## 6. Parsing and checking

### 6.1 `ParseCode(...)`

```go
code, err := ex.ParseCode("NOT_FOUND")
```

- A valid string returns the corresponding `Code`.
- An invalid string returns a standard `error`.

This is useful when restoring a `Code` from configuration, protocol fields, or log replay.

### 6.2 Common checks

```go
if err.Code() == ex.NotFound {
    // Handle a missing resource
}

if err.Type() == ex.ApplicationError {
    // Handle a business error
}

if err.Code().Category() == ex.InvocationCategory {
    // Handle a downstream invocation failure
}
```

## 7. Panic and recover

`core/ex` explicitly supports propagating an `ex.Error` through panic and recovering it at a boundary.

### 7.1 Raising an error

```go
ex.PanicIfError(err)
ex.PanicNew(ex.NotFound, "missing user")
ex.PanicNew(ex.ValidationFailed, ex.F("field %s is required", "name"))
ex.PanicNewIfError(err, ex.OperationFailed)
ex.PanicNewIfNot(user != nil, ex.NotFound, "missing user")
ex.PanicNewIfNot(name != "", ex.ValidationFailed, ex.F("field %s is required", "name"))
```

- `PanicIfError(err)` panics only when `err != nil`.
- `PanicNew(...)` constructs an error and panics immediately.
- `PanicNewIfError(...)` maps a standard `error` to a given `Code`.
- `PanicNewIfNot(...)` keeps the condition check at its original call site, preserving a more accurate panic stack.

### 7.2 `Recover(...)`

```go
defer func() {
    if err := ex.Recover(recover()); err != nil {
        // err may be either an ApplicationError or a SystemError
    }
}()
```

It behaves as follows:

- A `nil` recovered value returns `nil`.
- An `ex.Error` is returned directly, whether it is an `ApplicationError` or `SystemError`.
- A panic value that is not an `ex.Error` is rethrown.

### 7.3 `RecoverApplication(...)`

```go
defer func() {
    if err := ex.RecoverApplication(recover()); err != nil {
        // Only ApplicationError values are returned here
    }
}()
```

This function is stricter:

- It recovers only an `ex.Error` whose `Type() == ApplicationError`.
- A `SystemError` is rethrown.
- A value that is not an `ex.Error` is also rethrown.

Use it at boundaries that should catch only business exceptions without swallowing system failures.

## 8. Typical patterns

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

With a panic/recover style, the same logic can be written as:

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

Recover at the boundary:

```go
func Handle() (err ex.Error) {
    defer func() {
        err = ex.Recover(recover())
    }()

    _ = MustFindUser("u-1")
    return nil
}
```

## 9. Recommendations

- Use `ApplicationError` for expected business failures.
- Use existing system-level codes for framework, call-chain, and fallback failures.
- Reserve `Internal` and `Unknown` for fallback mapping rather than generic business failures.
- Use `New(..., ex.WithCause(...))` when the underlying error chain must be preserved.
- Use `RecoverApplication(...)` when a boundary must not swallow system failures.
