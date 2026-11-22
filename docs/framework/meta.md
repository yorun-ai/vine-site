---
slug: /meta
sidebar_label: Context & Identity
---

# Context & Identity

Rpc, Web, Event, and Task handlers all need to know where a call came from, who initiated it, and which call chain it belongs to. `core/meta` represents this information through a consistent set of objects:

- The current application.
- Call-chain traces and spans.
- The initiator of a call.
- The current actor.
- A `context.Context` carrying this metadata.

Vine creates and propagates these objects at request boundaries. Business code normally only needs to read them from the execution context; it doesn't need to generate them or parse transport fields itself.

## Core interfaces

### `App`

```go
type App interface {
    Name() string
    Version() string
    InstanceId() uuid.UUID
}
```

Create one with:

```go
appInfo, err := meta.NewApp(
    "demo.service",
    "1.2.3",
    uuid.MustParse("123e4567-e89b-12d3-a456-426614174000"),
)
```

Constraints:

- `name` uses lowercase letters and digits in dot-separated segments that start
  with a letter, such as `demo.service` or `user2`.
- `version` must be a full semantic version, such as `1.2.3` or `0.0.0-dev`;
  the Go module form `v1.2.3` is also accepted.

`meta.MustNewAppWithRandomId(name, version)` generates a UUID v7 instance ID.

### `CurrentApp`

`CurrentApp` identifies the application instance that owns the component graph it
is injected into. It carries the same fields as `App`:

```go
type CurrentApp interface {
    Name() string
    Version() string
    InstanceId() uuid.UUID
}
```

A component or module that needs the application it belongs to injects it:

```go
type GreetingModule struct {
    app.BaseModule
    CurrentApp meta.CurrentApp `inject:""`
}
```

Use `App` for an identity that describes another application, such as a caller,
initiator, or registered peer.

### Build identity

An application reports the version its build links. The executable name, version,
commit, builder, and build time come from `go.yorun.ai/vine/buildinfo`:

```bash
go build -ldflags "\
  -X go.yorun.ai/vine/buildinfo.ldVersion=1.2.3 \
  -X go.yorun.ai/vine/buildinfo.ldGitCommit=$(git rev-parse --short HEAD)" \
  ./cmd/demo
```

An executable name uses lowercase letters and digits in dot-separated segments,
with dashes allowed between them, such as `user.service`, `user-service`, or
`demo.worker-2`. The version is a full semantic version that may carry the Go
module `v` prefix. `buildinfo.IsValidName` and `buildinfo.IsValidVersion` apply
these rules for build tooling, and a build that links an unusable name or version
fails while the process starts. A build that links no version reports `0.0.0`.

`buildinfo.Name`, `Version`, `GitCommit`, `BuiltBy`, and `BuiltTime` read the
linked values. A commit, builder, or build time that a build does not link is
empty, and `Inspect` prints it as `NotAvailable` alongside the Go toolchain.

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
    uuid.MustParse("123e4567-e89b-12d3-a456-426614174000"),
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
    IsImpersonated() bool
    Impersonator() Actor
    Realm() string
    Identifier() string
    RawInfo() string
    LogFields() []slog.Attr
}
```

```go
anonymous := meta.NewAnonymousActor()
authenticated := meta.NewAuthenticatedActor(&skeled.UserActorInfo{
    UserId: "user-1",
})
```

Generated code registers the info type of an authenticated Actor. Use `meta.GetActorInfo[T](actor)` to read its type-safe identity information.

`Realm()` returns the full actor Skel name, such as `base.UserActor`.
`Identifier()` returns the string representation of the `auth.info` field marked
with `@identifier`, supporting string, UUID, and integer identifiers. Compare both
values to identify a subject; use `IsAuthenticated()` to check authentication status.

```go
actor := ctx.Actor()
realm := actor.Realm()
identifier := actor.Identifier()
```

Declaring an identifier requires skelc support for `@identifier` and regenerated
contracts. An actor without the
marker returns an empty identifier. Absent, anonymous, and authenticating actors
return empty realm and identifier values. Renaming the actor or its domain changes
its realm.

### Impersonation

An impersonated actor remains authenticated. Its `Realm()`, `Identifier()`, and
`GetActorInfo[T]` describe the effective identity used for service access and
permission checks. `IsImpersonated()` reports whether an operator is attached;
`Impersonator()` returns that operator, or `nil` for ordinary authentication.

```go
actor := ctx.Actor()
if operator := actor.Impersonator(); operator != nil {
    operatorRealm := operator.Realm()
    operatorID := operator.Identifier()
    // Record both the effective identity and the operator in your audit trail.
    _, _ = operatorRealm, operatorID
}
```

Portal accepts both the generated AuthResult contract and ActorInfo responses,
selecting the format from the authentication method descriptor. With
AuthResult, `info` is required. Omit `impersonatorInfo` or return null for ordinary
authentication; otherwise populate exactly one declared operator info field.
Session storage, impersonation authorization, and ending impersonation belong to
your authentication service. Clients can keep using the same session credential.

Vine forwards the complete operator identity. A downstream service does not need
to register the operator's Go info type to read its realm, identifier, or raw info
and forward it again. Typed `GetActorInfo[T]` requires that type's registration.
`meta.NewImpersonatedActor(effective, operator)` also constructs this metadata
from two ordinarily authenticated actors; it does not perform authorization.
Only one direct operator is supported. Construction rejects an already
impersonated effective actor or operator, and decoding rejects nested impersonators.

Contracts generated with skelc v0.35.0 or later include the authentication-result
and impersonator types used here.

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

Vine uses the current actor metadata to attach identity fields to business context logs and Rpc client/server lifecycle logs.

These loggers share the same identity field rules: `actorType` is always recorded, while `actorRealm` and `actorIdentifier` appear only when non-empty. For a direct impersonator, non-empty `impersonatorActorRealm` and `impersonatorActorIdentifier` are added. These are top-level log fields; unavailable values are omitted. The logger does not automatically include actor info payloads.

`actor.LogFields()` returns these identity fields as standard-library `[]slog.Attr` for use with structured loggers. Check that the actor is non-nil before calling it.
