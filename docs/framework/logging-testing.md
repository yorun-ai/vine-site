---
slug: /logging-and-testing
sidebar_label: Logging & Testing
---

# Logging & Testing

Vine uses `core/logger` for structured logging. Every record contains a `logger` field whose colon-separated name identifies its source, such as `app:demo.user:rpc:server`.

## Writing logs

Application code can use the package-level default logger directly. Its name is `vine:default`.

Vine itself uses stable hierarchical names: `vine:core:link`, `vine:core:rpc`,
and `vine:core:redact` identify framework capabilities, while `vine:infra:rdb`
identifies the infrastructure adapter. Go standard-library logs use
`vine:stdlog`. These names can be used directly in level rules.

```go title="service.go"
logger.Info("user created", "userId", user.ID)
logger.Error("payment failed", "orderId", order.ID, "error", err)
```

Create a named logger when you need to distinguish log sources. Multiple name arguments passed to `New` are joined with `:`, and an argument may itself contain `:`. `Child` appends segments to an existing name while inheriting the parent's options and attributes.

```go title="service.go"
appLog := logger.New("app", "demo.user")
rpcLog := appLog.Child("rpc", "server")

rpcLog.Info("request completed", "method", "GetUser", "elapsedMs", 12)
// logger=app:demo.user:rpc:server
```

`logger` is reserved and cannot be supplied as a top-level log attribute. Use `With` to add fixed structured attributes to a derived logger:

```go title="service.go"
tenantLog := appLog.With(slog.String("tenantId", tenantID))
tenantLog.Info("tenant initialized")
```

## Configuring levels by name

A logger without an explicit level uses `LevelAuto`. It dynamically resolves process-wide name rules and falls back to the global level when no rule matches. Existing auto-level loggers immediately observe later rule and global-level changes.

```go title="main.go"
logger.SetGlobalLevel(logger.LevelInfo)

logger.SetLevel("app:**", logger.LevelWarn)
logger.SetLevel("app:*:rpc", logger.LevelError)
logger.SetLevel("app:demo.user:*", logger.LevelInfo)
logger.SetLevel("app:demo.user:rpc:server", logger.LevelDebug)
```

Rules and logger names are split into `:`-separated segments:

- A literal segment matches only the same text.
- `*` matches exactly one segment.
- `**` matches zero or more consecutive segments.
- A rule also matches descendant names. For example, `app:*:rpc` matches `app:demo.order:rpc:client`.
- `*` and `**` cannot be complete rules by themselves. In-segment wildcard forms such as `rpc*`, `*rpc`, and `***` are not supported.

When several rules match, Vine selects one in this order:

1. Compare segments from left to right. A literal outranks `*`, and `*` outranks `**`.
2. The first position with a different match type decides the priority; later segments are not considered.
3. If every segment of a shorter rule has the same match type as the corresponding segment of a longer rule, the longer rule wins.
4. If no rule matches, Vine uses the global level configured by `SetGlobalLevel`.

With the rules above:

| Logger name | Effective rule | Level | Reason |
| --- | --- | --- | --- |
| `app:demo.user:rpc:server` | `app:demo.user:rpc:server` | `DEBUG` | The all-literal exact rule is the most specific |
| `app:demo.user:event` | `app:demo.user:*` | `INFO` | Its left-side literals outrank `app:**` |
| `app:demo.order:rpc:client` | `app:*:rpc` | `ERROR` | `*` in the second segment outranks `**` |
| `app:demo.order:event` | `app:**` | `WARN` | Only the general application rule matches |
| `vine:default` | None | Global `INFO` | No rule matches, so the global level applies |

Use `ClearLevel(pattern)` to remove a rule. `Levels()` returns a copy of the current rules. Rules are process-wide. If `WithOption` specifies a concrete `LevelDebug`, `LevelInfo`, `LevelWarn`, or `LevelError`, that logger's level is fixed and no longer follows rules or the global level.

## Format and output

Configure the global format, level, and output path independently:

```go title="main.go"
logger.SetGlobalFormat(logger.FormatJSON)
logger.SetGlobalLevel(logger.LevelInfo)
logger.SetGlobalOutputPath("/var/log/demo/app.log")
```

`FormatText` emits one human-readable `key=value` line per record. `FormatJSON` uses JSON Lines, with one JSON object per record. When no format is configured, Vine defaults to JSON in Kubernetes and text in other environments.

Logs are always written to stderr. A non-empty output path additionally appends them to that file and creates its parent directories automatically. Pass an empty path to return to stderr-only output.

The final argument to `New` may be `WithOption`. Each field behaves independently: an empty `Format` or `OutputPath` dynamically follows its global setting, while an empty `Level` means `LevelAuto`; non-empty fields are fixed on that logger.

```go title="audit.go"
auditLog := logger.New("app:demo.user:audit", logger.WithOption{
    Format:     logger.FormatJSON,
    Level:      logger.LevelInfo,
    OutputPath: "/var/log/demo/audit.log",
})
```

Output from the standard library `log` package is bridged through a logger named `vine:stdlog`. Call `logger.SetDefault(customLogger)` when you need to replace the package-level default logger.

## Sensitive fields and binary values

Skel fields can be marked with `@sensitive`. skelc adds `skel:"sensitive"`
to the corresponding Go field, and Rpc, Event, and Task payload logging uses
`core/redact` to replace it with `<redacted>`. Field names alone never trigger
implicit masking; callers must explicitly handle sensitive content in dynamic
maps or JSON with `RootSensitive` or `Sanitizer`.

```skel
data LoginRequest {
    username: string

    @sensitive
    password: string
}
```

`@sensitive` can also mark an entire data or config declaration, an Event `payload` block, and Actor `credential` or `info` blocks. The corresponding generated type implements the `SkelSensitive()` marker method from the `skel.Sensitive` interface, adding no data field and changing neither JSON nor CBOR; `core/redact` replaces values of that type with `<redacted>` as a whole. Event declarations and Actor `auth` containers cannot be marked. When an entire Rpc method input/output or Resource check input is marked, skelc records the metadata in `MethodSpec`, and the corresponding payload log is masked as a whole. Whole Task trigger input metadata is recorded in Task `TriggerSpec` for code that processes Task arguments.

`core/redact` is independent of the concrete Rpc, Event, and Task architecture,
so it can render ordinary Go values directly:

```go
rendered, err := redact.Render(value)
if err != nil {
    return err
}
logger.Info("diagnostic value",
    "value", rendered.JSON,
    "redacted", rendered.Redacted,
)
```

When `Render` fails, it also emits an `ERROR` record through
`vine:core:redact`. The record contains only a safe `failureKind` category,
not the original error text that may contain sensitive data; the caller still
receives the original error.

When the caller already knows that the entire value is sensitive, pass
`redact.Option{RootSensitive: true}` without relying on a particular Go type
or field tag.

`redact.Option{RevealSensitive: true}` explicitly preserves ordinary sensitive
fields and should only be used for tightly controlled temporary diagnostics.
It doesn't affect binary values: they are always replaced with their byte
length, never their raw contents.

Framework Rpc, Event, and Task logs always call `core/redact` when they record payloads; there is no global switch that disables masking or emits sensitive values in full. `core/redact` also bounds traversal depth, node count, collection size, string length, and final JSON size. `Result.Truncated` is `true` when a value is truncated.

## Application testing

`app/testkit` starts a standalone runtime in tests, overrides configuration, and creates type-safe clients. It works well for integration tests that cover dependency injection, Rpc handlers, Event listeners, and Task runners.

```go title="greeting_test.go"
func TestGreeting(t *testing.T) {
    runtime := testkit.StartStandalone[*GreetingApp](t, testkit.Option{})
    execution := runtime.NewExecution(testkit.ExecutionOption{
        Actor: meta.NewAnonymousActor(),
    })
    client := testkit.NewClient[skeled.GreetingServiceClient](execution)

    got := client.Hello("Vine")
    require.Equal(t, "Hello, Vine", got.Message)
}
```

A Vine App is a singleton within a test process. Start a standalone runtime only once per test package. When you have multiple cases, organize them with `t.Run(...)` under the same top-level test and share the runtime; don't create the App repeatedly in separate tests.

Tests should focus on observable behavior: return values, state changes, configuration overrides, and error codes. Start separate Hub, Link, and Portal processes only when you need to test real leases, network loss, or TLS ingress.

Run all Go tests:

```bash
go -C ./src/server test ./...
```

Run a specific test in a package:

```bash
go -C ./src/server test ./path/to/package -run TestName
```
