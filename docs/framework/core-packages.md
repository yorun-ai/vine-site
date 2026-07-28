---
slug: /core-packages
title: Public Package Map
sidebar_label: Public Packages
description: Find the supported Vine package for an application task and know when to use the lower-level APIs.
---

# Public Package Map

Vine's public Go API is intentionally organized as a set of facades. Start with
`app` and the generated contract types used by your application, then import a
`core/*` or `infra/*` package only for the capability you need.

The authoritative symbol-level reference is
[`pkg.go.dev/go.yorun.ai/vine`](https://pkg.go.dev/go.yorun.ai/vine). This page
answers a different question: **which package should application code choose?**

:::warning Public boundary

Packages under `internal/` are implementation details. They may explain a stack
trace, but application code must not import or mirror them. Public behavior is
defined by the packages below and by the runtime contracts documented on this
site.

:::

## Application assembly

| Task | Package | Start here |
| --- | --- | --- |
| Declare an application, components, modules, capabilities, and lifecycle hooks | [`app`](https://pkg.go.dev/go.yorun.ai/vine/app) | [Application model](./application-model.md) |
| Run one or more applications with an embedded Hub, Link, and Portal | [`app/standalone`](https://pkg.go.dev/go.yorun.ai/vine/app/standalone) | [First application](../getting-started/tutorial-first-app.md) |
| Run one or more applications with an in-process Link connected to an external Hub | [`app/linked`](https://pkg.go.dev/go.yorun.ai/vine/app/linked) | [Deployment topologies](../getting-started/deployment-modes.md) |
| Test application behavior with a controlled standalone runtime | [`app/testkit`](https://pkg.go.dev/go.yorun.ai/vine/app/testkit) | [Logging and testing](./logging-testing.md) |

Most `main` packages need only one runtime-mode constructor:

```go
standalone.NewWithOption[*CheckoutApp](standalone.Option{
    SQLiteFile: "./vine.sqlite",
}).StartAndWait()
```

Keep application assembly in the application spec. Avoid constructing
lower-level servers or transports in `main`.

## Application capabilities

| Capability | Package | What application code normally uses |
| --- | --- | --- |
| Configuration | [`core/conf`](https://pkg.go.dev/go.yorun.ai/vine/core/conf) | Generated config types injected into modules or executions |
| Rpc | [`core/rpc`](https://pkg.go.dev/go.yorun.ai/vine/core/rpc) | Generated service clients and server implementations |
| Web | [`core/web`](https://pkg.go.dev/go.yorun.ai/vine/core/web) | Generated Web handler, router, assets server, or reverse proxy |
| Event | [`core/event`](https://pkg.go.dev/go.yorun.ai/vine/core/event) | Generated emitter and listener |
| Task | [`core/task`](https://pkg.go.dev/go.yorun.ai/vine/core/task) | Generated launcher and runner |
| Skel runtime types | [`core/skel`](https://pkg.go.dev/go.yorun.ai/vine/core/skel) | Generated scalar/schema helpers and `MinSkelcVersion()` |

Generated code already connects these packages to its type-safe facade. Prefer
the generated client, handler, listener, or runner over manually constructing a
`ServiceSpec`, `WebSpec`, `EventSpec`, or `TaskSpec`.

Use the low-level constructors in these packages only when building framework
integration code, a custom executor, or a transport adapter. The corresponding
reference pages describe those advanced APIs:

- [Rpc API](../infrastructure/rpc.md)
- [vRPC over HTTP](../infrastructure/vrpc-http.md)
- [App API](./app.md)

## Execution foundations

| Concern | Package | Use it when |
| --- | --- | --- |
| Dependency bindings and scopes | [`core/di`](https://pkg.go.dev/go.yorun.ai/vine/core/di) | Binding common dependencies or writing custom integration code |
| Filtered method execution | [`core/ctr`](https://pkg.go.dev/go.yorun.ai/vine/core/ctr) | Implementing filters or a custom execution pipeline |
| Context, trace, application identity, and Actor | [`core/meta`](https://pkg.go.dev/go.yorun.ai/vine/core/meta) | Reading identity/context or starting an explicit call context |
| Structured framework errors | [`core/ex`](https://pkg.go.dev/go.yorun.ai/vine/core/ex) | Returning stable error codes across a boundary |
| Structured logging | [`core/logger`](https://pkg.go.dev/go.yorun.ai/vine/core/logger) | Writing application logs with Vine categories and context fields |
| Sensitive-data projection | [`core/redact`](https://pkg.go.dev/go.yorun.ai/vine/core/redact) | Redacting generated or application data before diagnostics |
| Process runtime and executable identity | [`core/runtime`](https://pkg.go.dev/go.yorun.ai/vine/core/runtime) | Reading the process-level runtime name, version, instance ID, or build details; not identifying an individual App inside a bundle |
| Build metadata | [`buildinfo`](https://pkg.go.dev/go.yorun.ai/vine/buildinfo) | Adding or reading release-time linker metadata |

For ordinary Rpc, Web, Event, and Task handlers, Vine creates the execution
container and seeds the correct context automatically. Read
[Dependency and execution model](../runtime/execution-model.md) before retaining a
dependency outside the handler that received it.

## Infrastructure components

| Need | Package | Guide | Reference |
| --- | --- | --- | --- |
| Relational database, GORM connection, typed DAO/query | [`infra/rdb`](https://pkg.go.dev/go.yorun.ai/vine/infra/rdb) | [RDB guide](./rdb-guide.md) | [RDB API](../infrastructure/rdb.md) |
| Redis client, typed cache, distributed locker | [`infra/redis`](https://pkg.go.dev/go.yorun.ai/vine/infra/redis) | [Redis guide](./redis-guide.md) | [Redis API](../infrastructure/redis.md) |

Declare these as application components. This lets Vine create their
dependencies before business modules, expose them through DI, and stop them
after business modules finish.

## Reusable utilities

The `util/*` packages are public, framework-independent helpers:

| Package | Purpose |
| --- | --- |
| [`util/vcode`](https://pkg.go.dev/go.yorun.ai/vine/util/vcode) | JSON, CBOR, YAML, compression, and Base58 helpers |
| [`util/vfile`](https://pkg.go.dev/go.yorun.ai/vine/util/vfile) | File path, read, and write helpers |
| [`util/vmap`](https://pkg.go.dev/go.yorun.ai/vine/util/vmap) | Map collection, search, stream, and concurrent-map helpers |
| [`util/vmath`](https://pkg.go.dev/go.yorun.ai/vine/util/vmath) | Graph and numeric helpers |
| [`util/vnet`](https://pkg.go.dev/go.yorun.ai/vine/util/vnet) | Address, IP, and URL helpers |
| [`util/vpre`](https://pkg.go.dev/go.yorun.ai/vine/util/vpre) | Framework-style precondition checks |
| [`util/vslice`](https://pkg.go.dev/go.yorun.ai/vine/util/vslice) | Slice collection, set, search, stream, and concurrency helpers |
| [`util/vstring`](https://pkg.go.dev/go.yorun.ai/vine/util/vstring) | String and delimited-value helpers |

Use a standard-library function when it is equally clear. These packages are
most useful when the same helper is already part of a Vine-facing code path.

## Suggested order

1. Learn `app` and one runtime-mode package.
2. Work through the guide for each capability your application exposes.
3. Read the execution foundations when writing filters, custom bindings, or
   context-sensitive infrastructure.
4. Use the symbol reference for exact signatures and the reference section on
   this site for wire behavior and framework defaults.
