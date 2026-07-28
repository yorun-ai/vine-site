---
slug: /trace-timeout
sidebar_label: Tracing & Timeouts
---

# Tracing & Timeouts

When a request enters Vine, trace context follows it through Portal, auth/check, Rpc/Web handlers, and downstream calls. Timeout starts at the entry point and is converted to the remaining time before each forward. Application code usually does not need to parse these headers manually; it should keep using the injected context for downstream calls.

## Headers You Will See

When an external request enters Portal, these headers are relevant:

| Header | Sender | Purpose |
| --- | --- | --- |
| `vrpc-trace` | Rpc client | Propagates the Rpc call chain |
| `vweb-trace` | Web client | Propagates the Web call chain |
| `vrpc-options` | Rpc client | Carries Rpc call options; currently only `timeout` |
| `vweb-options` | Web client | Carries Web call options; currently only `timeout` |
| `portal-trace-id` | Portal response | Returns the trace id for this request |

Trace headers use comma-delimited `key=value` fields:

```text
vrpc-trace: id=123e4567e89b12d3a456426614174000,span=1234567890abcdef
vweb-trace: id=123e4567e89b12d3a456426614174000,span=1234567890abcdef
```

Options headers currently only contain timeout:

```text
vrpc-options: timeout=30s
vweb-options: timeout=30s
```

Timeout values use Go duration syntax, such as `1000ms`, `1s`, or `30s`.

## External Rpc Clients

Requests to rpcgw must carry `vrpc-trace`. If the client owns a span, send the full form:

```text
vrpc-trace: id=<trace_id>,span=<span_id>
```

If the client only has a request id or trace id, it may send only `id`:

```text
vrpc-trace: id=<trace_id>
```

Portal will create a span and use it as the entry anchor for the server-side call tree. This synthetic span does not correspond to real client-side logs, but it keeps server-side auth/check/target calls under the same trace tree.

The client may also send timeout:

```text
vrpc-options: timeout=10s
```

If it is missing, rpcgw uses `30s`. If it is above `120s`, rpcgw returns invalid request.

## External Web Clients

Requests to webgw may carry `vweb-trace`:

```text
vweb-trace: id=<trace_id>,span=<span_id>
```

The client may send only `id`, or omit `vweb-trace` entirely. If it is missing, webgw creates a new trace.

The client may also send timeout:

```text
vweb-options: timeout=10s
```

For ordinary HTTP requests, webgw uses `30s` when the header is missing. SSE and WebSocket are long-lived connections: without an explicit timeout, Vine does not limit their total duration and closes them only after `60s` with no traffic. SSE servers should send periodic heartbeats; WebSocket Ping/Pong and application frames both refresh the idle timeout.

An explicit timeout still limits the total duration of the request or connection. If it is above `120s`, webgw returns bad request.

External clients should not rely on `vweb-actor` or `vweb-initiator`. webgw writes those headers for backend applications, and client-supplied values are not trusted.

## Reading Trace Id From Responses

Portal writes this response header:

```text
portal-trace-id: <trace_id>
```

Clients can log this value and use it for later investigation. It only contains the trace id. It does not contain span data and is not a full trace context for the next request.

If the request carries a valid trace id, `portal-trace-id` usually returns the same id. If the trace header is missing or invalid, Portal may generate a new trace id or reject the request, depending on the gateway and validation rule.

## How Timeout Is Counted

Timeout starts when the request enters the gateway. It is not only applied to the final forward.

For example, if the client sends:

```text
vrpc-options: timeout=30s
```

rpcgw creates a 30-second deadline at entry. Then:

```text
rpcgw entry
  -> auth/check share the same deadline
  -> remaining time is recomputed before target forward
  -> downstream services keep using the remaining timeout
```

If auth/check uses 2 seconds, the target service will not receive `timeout=30s`; it will receive a value close to `timeout=28s`.

Ordinary Web requests use the same rule for `vweb-options`. Web auth is included in the same budget, and the remaining timeout is refreshed before forwarding to the backend Web application. SSE and WebSocket requests without an explicit timeout do not receive a total-duration deadline; bidirectional traffic and the idle timeout control their lifecycle instead.

For ordinary Rpc/Web requests, Portal separates external client disconnects from internal execution timeout. After a request enters the gateway and its execution context is created, client-side cancellation such as a mobile network drop or a closed browser tab does not cancel auth/check, the handler, or downstream calls by default. Execution is controlled by timeout, Portal shutdown, and other server-side signals. SSE and WebSocket connections respond to client disconnect, upstream disconnect, idle timeout, and Portal shutdown.

If the request body has not been fully received, Portal or the downstream service can still fail while reading the body. That case is not treated as a complete business execution that has already started.

## Calling Downstream From Handlers

When a business handler calls Rpc, it usually does not need to set timeout manually. As long as the call uses the current injected context, the Rpc client reads the context deadline and writes the remaining time to `vrpc-options`.

Keep the injected context:

```go
// Use the current injected client/context for downstream Rpc calls.
result := h.SomeClient.DoSomething(...)
```

This breaks propagation:

```go
ctx := context.Background()
```

If a handler replaces the current context with one that has no deadline, downstream calls lose the remaining timeout propagated by the gateway.

The same applies to ordinary Web handlers. webgw applies `vweb-options` to the backend Web handler request context. If that handler calls Rpc, the remaining timeout continues as `vrpc-options`. SSE/WebSocket handler contexts without an explicit timeout have no total-duration deadline; Rpc calls made from them still use the Rpc default timeout unless application code supplies a context or timeout explicitly.

## What You Will See in an OTel Backend

An Rpc request with auth/check roughly forms this tree:

```text
incoming trace
  -> rpcgw gateway
      -> auth client
          -> auth server
      -> check client
          -> check server
      -> target forward
          -> target rpc server
```

A Web request roughly forms:

```text
incoming trace
  -> webgw gateway
      -> auth rpc client
          -> auth rpc server
      -> web forward
          -> backend web handler
```

If the client only sends a trace id and no span, Portal creates an entry span. That span is only a parent anchor for the server-side tree and may not have matching client-side logs.

## How Vine Derives Spans Internally

Vine uses `meta.Trace` for trace context:

```go
type Trace interface {
    Id() string
    Span() string
    ParentSpan() string
    NewChildTrace() Trace
}
```

Cross-process headers only carry `id` and `span`. The receiver treats the header `span` as the remote parent and creates a new child trace locally.

Normal Rpc call:

```text
current handler trace
  -> rpc client trace
      -> rpc server handler trace
```

Portal gateway:

```text
incoming trace
  -> gateway trace
      -> auth/check/forward trace
```

`ParentSpan()` only exists on the local trace object. It is useful for logs or future OTel mapping, but is not written into headers.

## Relationship With OTel

`meta.Trace` is not a full OTel span. It only creates and propagates:

- trace id
- current span id
- local parent span id

The log or OTel layer should own span names, attributes, status, events, finish/export. This keeps the business propagation model separate from the concrete observability backend.
