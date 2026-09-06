---
slug: /configuration
title: Configuration
sidebar_label: Configuration
description: Typed Vine configuration, per-instance snapshots, and runtime updates.
---

# Configuration

Vine configuration is declared in Skel, stored by Hub, distributed through
Link, and resolved as a typed Go dependency. Application code doesn't poll Hub
or decode configuration JSON itself.

The important design choice is not only the fields in a configuration. It is
also **when an application instance is allowed to observe a new value**.

## Declare typed configuration

```skel title="skel/domain.skel"
@desc("Checkout application")
domain demo.checkout
```

```skel title="skel/config.skel"
domain demo.checkout

config CheckoutConfig eternal {
    timeoutMs: int
    currency: string
}

config FeatureFlagsConfig instant {
    newCheckout: bool
}
```

Run the normal Skel check and generation workflow:

```bash
skelc check --skel-in ./skel
skelc gen go --skel-in ./skel --go-out ./skeled
```

The generated types register their Skel name, Go type, and lifecycle with Vine.
Inject them like any other dependency:

```go title="checkout_service.go"
type CheckoutService struct {
    Config *skeled.CheckoutConfig `inject:""`
}
```

Do not register generated configuration types by hand.

## String whitespace

After decoding a configuration, Vine removes leading and trailing Unicode
whitespace with Go's `strings.TrimSpace` from `string` fields, nullable strings,
`list<string>` elements, and string values in maps. Nullable collections and
nullable elements follow the same rule; `null` stays `null`. Whitespace inside
a string is preserved: `"  hello  world\n"` becomes `"hello  world"`.

This applies to both `eternal` and `instant` reads, regardless of the configuration
source. It changes the resolved Go value, not the JSON stored by Hub or the Link
snapshot. Map keys, enums, and `json` content are preserved; other scalar types
continue to use their normal decoding rules.

This is a breaking change in current unreleased Vine source. Earlier versions
preserved string whitespace. Review passwords, prefixes, and other values that
intentionally contain boundary whitespace before upgrading. There is currently
no field-level opt-out. This runtime change requires no new skelc version or
regeneration of existing configuration types.

## Choose the lifecycle

| Lifecycle | What Link retains | What application code observes | Good fit |
| --- | --- | --- | --- |
| `eternal` | The value captured when this application instance first reads the config | The same snapshot for the rest of that application instance | Connection settings, schema choices, startup policy |
| `instant` | A watched snapshot that changes when Hub publishes an update | A newly decoded value on a later DI resolution | Feature flags, limits, and behavior that may change at runtime |

Both lifecycles are lazy: the first read happens when DI first needs the
generated type. A module or component that injects the configuration is usually
constructed during application startup. A configuration used only by a request
handler may not be read until the first matching execution.

### Instant does not mutate an existing object

An instant update changes Link's snapshot. It doesn't modify a Go pointer that
was already injected:

```mermaid
sequenceDiagram
  participant Hub
  participant RuntimeLink as Link
  participant Existing as Existing consumer
  participant Next as Later execution
  Hub-->>RuntimeLink: publish new instant value
  Note over Existing: keeps its existing pointer
  Next->>RuntimeLink: resolve configuration
  RuntimeLink-->>Next: decode a new pointer from the latest snapshot
```

This has a direct DI consequence:

- A normal Rpc, Web, Event, or Task handler is created for an execution. A
  configuration it injects is resolved for that execution and can observe the
  latest instant snapshot.
- A module and an application component are application-lifetime singletons.
  If one stores an instant configuration in a field, that pointer remains the
  value from construction time.
- Any explicitly singleton dependency that captures an instant configuration
  has the same behavior.

If a long-lived object must react to updates, keep the update-sensitive logic
in a newly created execution dependency or design an explicit refresh boundary.
Do not assume field injection is a live reference.

## Provide values

Hub seed files identify a configuration by its fully qualified Skel name. The
`value` field contains JSON encoded as a YAML string:

```yaml title="seed.yaml"
appConfigs:
  - name: demo.checkout.CheckoutConfig
    value: '{"timeoutMs":3000,"currency":"CNY"}'
  - name: demo.checkout.FeatureFlagsConfig
    value: '{"newCheckout":true}'
```

For standalone mode:

```go title="main.go"
standalone.NewWithOption[*CheckoutApp](standalone.Option{
    SQLiteFile:   "./hub.sqlite",
    SeedYAMLFile: "./seed.yaml",
}).StartAndWait()
```

`SQLiteFile` here is **Hub's database**. It doesn't configure a business
`infra/rdb` component. If the application also owns a relational database,
declare that database separately.

For an independently running Hub:

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite \
  --mq-embedded-nats \
  --seed-yaml-file ./seed.yaml
```

The seed is imported into Hub's database. The database remains the source of
truth after import.

## How a value reaches an execution

```mermaid
flowchart LR
  Source["Hub database / seed"] --> Hub["Hub"]
  Hub --> Redis["Runtime snapshot + change event"]
  Redis --> Link["Link config reader"]
  Link --> DI["Application DI factory"]
  DI --> Object["Typed Go value"]
```

1. Hub stores the configured JSON and publishes the runtime representation.
2. Link loads the value. For instant configuration, it also subscribes when the
   value is first referenced.
3. Vine's DI binding asks Link for the snapshot and decodes it into a new
   generated Go value.
4. The consumer receives that value through field or factory injection.

Standalone follows the same steps through in-process connections.

## Failure behavior

Resolving a configuration is a strict operation:

- The generated configuration must be registered in the process.
- Hub and Link must have a non-empty value for its fully qualified Skel name.
- The JSON must decode into the generated Go type.

If any of these conditions is not met, resolution fails rather than silently
returning a zero-value configuration. Where the failure appears depends on the
first consumer: a module can fail application startup, while a handler-only
configuration can first fail during a request.

When diagnosing a missing value:

1. Confirm the generated package is imported by the application.
2. Confirm the fully qualified name and JSON field names in Hub.
3. Confirm the application's Link can reach Hub's API and Redis distribution
   endpoint.
4. Confirm the deployed generated schema and configuration value were released
   together.
5. For instant configuration, create a new execution before concluding that an
   already injected singleton should have changed.

## Design guidance

- Use `eternal` when changing the value without recreating the application
  would leave resources or invariants inconsistent.
- Use `instant` only when each new execution can safely choose behavior from a
  newer snapshot.
- Keep configuration values declarative. Do not use a value update as an
  imperative job trigger; use a Task for that.
- Make related fields backward-compatible during a rolling deployment, because
  different application versions can temporarily read the same Hub value.
- Keep credentials and private keys inside the current trusted-runtime network
  boundary. Review the [production readiness checklist](../operations/production-readiness.md)
  before distributing sensitive values.

See the [Skel configuration syntax](https://skel.yorun.ai/docs/syntax) for
language rules and [Dependency injection](./di.md) for binding and scope
details.
