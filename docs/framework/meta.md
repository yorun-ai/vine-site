---
slug: /meta
---

# Context & Identity (Meta)

Rpc, Web, Event, and Task handlers all need to know where a call came from, who initiated it, and which call chain it belongs to. `core/meta` represents this information through a consistent set of objects:

- The current application.
- Call-chain traces and spans.
- The initiator of a call.
- The current actor.
- A `context.Context` carrying this metadata.

Vine creates and propagates these objects at request boundaries. Business code normally only needs to read them from the execution context; it does not need to generate them or parse transport fields itself.

## Core interfaces

### `App`

```go
type App interface {
    Name() string
    Version() string
    InstanceId() string
}
```

Create one with:

```go
appInfo, err := meta.NewApp(
    "demo.service",
    "1.2.3",
    "123e4567-e89b-12d3-a456-426614174000",
)
```

The following constraints apply:

- `name` must be a dot-separated lowercase name, such as `demo.service`.
- `version` must be valid semantic versioning.
- `instanceId` must be a valid UUID.

### `Trace`

```go
type Trace interface {
    Id() string
    Span() string
    ParentSpan() string
    NewChildTrace() Trace
}
```

Create one with:

```go
trace := meta.InitialTrace()
child := trace.NewChildTrace()
```

Or specify its values explicitly:

```go
trace, err := meta.NewTrace("4bf92f3577b34da6a3ce929d0e0e4736", "")
```

When `span == ""`, `NewTrace(...)` generates a new span automatically.

### `Initiator`

```go
type Initiator interface {
    App
    Dialer() string
    IpAddr() string
}
```

An Initiator represents who initiated a call.

```go
initiator, err := meta.NewInitiator(
    "gateway.api",
    "1.2.3",
    "123e4567-e89b-12d3-a456-426614174000",
    "gateway.api/1.2.3",
    "127.0.0.1",
)
```

If `ipStr == ""`, `IpAddr()` returns an empty string. A non-empty value must be accepted by `netip.ParseAddr(...)`.

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

Generated code registers the info type of an authenticated Actor. Use `meta.GetActorInfo[T](actor)` to read its type-safe identity information.

### `Context`

```go
type Context interface {
    context.Context

    Trace() Trace
    Initiator() Initiator
    Actor() Actor
}
```

Create one with:

```go
ctx := meta.NewContext(
    context.Background(),
    trace,
    initiator,
    actor,
)
```

`meta.Context` is a wrapper around the standard `context.Context`.

## Trace rules

### Trace ID

A trace ID is:

- 16 random bytes.
- A lowercase hexadecimal string.
- Exactly 32 characters long.
- Invalid when every byte is zero.

Use these APIs:

- `meta.NewId()`
- `meta.IsValidId(id)`

### Span ID

A span ID is:

- 8 random bytes.
- A lowercase hexadecimal string.
- Exactly 16 characters long.
- Invalid when every byte is zero.

Use these APIs:

- `meta.NewSpan()`
- `meta.IsValidSpan(span)`

### `InitialTrace()` and `NewChildTrace()`

`InitialTrace()` creates a root trace with:

- A new `Id()`.
- A new `Span()`.
- An empty `ParentSpan()`.

`NewChildTrace()` derives a child span from the current trace by:

- Reusing the same trace ID.
- Setting `ParentSpan()` to the parent span.
- Generating a new child span.

## Base64 encoding helpers

Two sets of helpers are available.

### Initiator

```go
encoded := meta.EncodeInitiatorToBase64(initiator)
decoded, err := meta.DecodeInitiatorFromBase64(encoded)
```

Special behavior:

- `DecodeInitiatorFromBase64("")` returns `nil, nil`.

### Actor

```go
encoded := meta.EncodeActorToBase64(actor)
decoded, err := meta.DecodeActorFromBase64(encoded)
```

An empty string is not a valid Actor encoding, so `DecodeActorFromBase64("")` returns an error. When no identity information is available, use `meta.NewAbsentActor()` explicitly; use `meta.NewAnonymousActor()` for unauthenticated access.

## Use cases

Typical use cases include:

- Propagating traces across Rpc, Web, and message boundaries.
- Representing which application initiated a call consistently.
- Passing the Actor and Initiator down through runtime context.

`meta` only provides the data model; it does not format log fields.
