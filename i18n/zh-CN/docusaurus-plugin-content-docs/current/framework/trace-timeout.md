---
slug: /trace-timeout
sidebar_label: 追踪与超时
---

# Trace 与 Timeout

请求进入 Vine 后，trace 会贯穿 Portal、auth/check、Rpc/Web handler 和后续下游调用；timeout 会从入口开始计时，并在每次转发时换算成剩余时间继续传递。业务代码通常不需要手工解析这些 header，只要继续使用当前注入的上下文发起下游调用即可。

## 你会看到哪些 Header

外部请求进入 Portal 时，主要涉及这些 header：

| Header | 谁传 | 用途 |
| --- | --- | --- |
| `vrpc-trace` | Rpc 客户端 | 传递 Rpc 调用链 |
| `vweb-trace` | Web 客户端 | 传递 Web 调用链 |
| `vrpc-options` | Rpc 客户端 | 传递 Rpc 调用选项，目前只有 `timeout` |
| `vweb-options` | Web 客户端 | 传递 Web 调用选项，目前只有 `timeout` |
| `portal-trace-id` | Portal 响应 | 返回本次请求的 trace id，方便排查 |

trace header 使用逗号分隔的 `key=value` 格式：

```text
vrpc-trace: id=123e4567e89b12d3a456426614174000,span=1234567890abcdef
vweb-trace: id=123e4567e89b12d3a456426614174000,span=1234567890abcdef
```

options header 目前只有 timeout：

```text
vrpc-options: timeout=30s
vweb-options: timeout=30s
```

timeout 使用 Go duration 格式，例如 `1000ms`、`1s`、`30s`。

## 外部 Rpc 客户端应该怎么传

调用 rpcgw 时必须传 `vrpc-trace`。如果客户端有自己的 span，传完整格式：

```text
vrpc-trace: id=<trace_id>,span=<span_id>
```

如果客户端只有 request id 或 trace id，也可以只传 `id`：

```text
vrpc-trace: id=<trace_id>
```

这种情况下，Portal 会补一个 span，用作服务端调用树的入口 anchor。这个 span 不对应客户端真实日志，但能让服务端内部 auth/check/target 调用挂在同一棵 trace 树下。

可选传入 timeout：

```text
vrpc-options: timeout=10s
```

如果不传，rpcgw 默认使用 `30s`。如果传入超过 `120s`，rpcgw 会返回 invalid request。

## 外部 Web 客户端应该怎么传

调用 webgw 时可以传 `vweb-trace`：

```text
vweb-trace: id=<trace_id>,span=<span_id>
```

也可以只传 `id`，或者完全不传。不传时 webgw 会创建新的 trace。

可选传入 timeout：

```text
vweb-options: timeout=10s
```

对于普通 HTTP 请求，如果不传，webgw 默认使用 `30s`。SSE 和 WebSocket 属于长连接：未显式传入 timeout 时不限制连接总时长，而是在连续 `60s` 没有任何流量后关闭连接。SSE 服务端应定期发送 heartbeat，WebSocket 的 Ping/Pong 或业务帧都会刷新 idle timeout。

如果显式传入 timeout，该 timeout 仍作为整个请求或连接的总时长；超过 `120s` 时，webgw 会返回 bad request。

外部客户端不应该依赖 `vweb-actor` 或 `vweb-initiator`。这些 header 由 webgw 写给后端应用，客户端传入的同名值不会作为可信身份使用。

## 响应里怎么拿 Trace Id

Portal 会在响应中写：

```text
portal-trace-id: <trace_id>
```

这个值用于客户端记录和后续排查。它只包含 trace id，不包含 span，也不是下一次请求应该继续传播的完整 trace context。

如果请求本身带了合法 trace id，`portal-trace-id` 会尽量返回同一个 id。若 trace header 缺失或非法，Portal 会生成新的 trace id 或返回错误，具体取决于入口类型和校验规则。

## Timeout 怎么计算

timeout 从进入 gateway 开始计时，而不是只限制最后一次转发。

例如客户端传：

```text
vrpc-options: timeout=30s
```

rpcgw 会在入口创建一个 30 秒 deadline。之后：

```text
rpcgw 入口
  -> auth/check 使用同一个 deadline
  -> 转发到目标服务前重新计算剩余时间
  -> 下游服务继续使用剩余 timeout
```

如果 auth/check 花掉了 2 秒，转发给目标服务时就不会再传 `timeout=30s`，而是传接近 `timeout=28s` 的剩余时间。

普通 Web 请求的 `vweb-options` 也是同样机制。web auth 会计入总耗时，最终 forward 到后端 Web 应用前也会刷新剩余 timeout。未显式指定 timeout 的 SSE 和 WebSocket 不创建总时长 deadline，而由双向流量的 idle timeout 控制生命周期。

对于普通 Rpc/Web 请求，Portal 会把外部客户端连接断开和内部执行 timeout 分开处理。请求进入 gateway 并创建执行上下文后，移动端断线、浏览器关闭页面这类 client cancel 不会默认取消 auth/check、handler 或下游调用；执行仍由 timeout、Portal 停止等服务端侧信号控制。SSE 和 WebSocket 长连接会响应客户端断开、上游断开、idle timeout 和 Portal 停止。

如果请求体还没有传完整，Portal 或下游读取 body 时仍会失败。这类情况不会被当作已经开始的完整业务执行。

## Handler 里调用下游要注意什么

业务 handler 里继续调用 Rpc 时，通常不用手工设置 timeout。只要使用 Vine 注入的当前上下文，Rpc client 会自动读取 context deadline，并把剩余时间写入 `vrpc-options`。

推荐：

```go
// 使用当前 handler 注入的 client/context，继续发起 Rpc 调用。
result := h.SomeClient.DoSomething(...)
```

避免：

```go
ctx := context.Background()
```

如果你用没有 deadline 的新 context 覆盖当前上下文，下游调用就拿不到 gateway 传下来的剩余 timeout。

普通 Web handler 也是一样。webgw 会把 `vweb-options` 应用到后端 Web handler 的 request context；handler 内再调用 Rpc 时，会继续递减并传播为 `vrpc-options`。未显式指定 timeout 的 SSE/WebSocket handler context 没有总时长 deadline；其中发起的 Rpc 调用仍使用 Rpc 自身的默认 timeout，除非业务代码显式传入 context 或 timeout。

## 在 OTel 后台会看到什么

带 auth/check 的 Rpc 请求大致会形成这样的调用树：

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

Web 请求大致会形成：

```text
incoming trace
  -> webgw gateway
      -> auth rpc client
          -> auth rpc server
      -> web forward
          -> backend web handler
```

如果客户端只传了 trace id，没有传 span，Portal 会补一个入口 span。这个 span 只是服务端调用树的 parent anchor，不一定能在客户端侧找到对应日志。

## Vine 内部怎么派生 Span

Vine 使用 `meta.Trace` 表示 trace context：

```go
type Trace interface {
    Id() string
    Span() string
    ParentSpan() string
    NewChildTrace() Trace
}
```

跨进程 header 只传 `id` 和 `span`。接收方把 header 里的 `span` 当作 remote parent，然后在本地创建新的 child trace。

普通 Rpc 调用：

```text
当前 handler trace
  -> rpc client trace
      -> rpc server handler trace
```

Portal gateway：

```text
incoming trace
  -> gateway trace
      -> auth/check/forward trace
```

`ParentSpan()` 只存在于本地 trace 对象中，用于日志或后续 OTel 映射，不会写入 header。

## 与 OTel 的关系

`meta.Trace` 不是完整的 OTel span。它只负责生成和传播：

- trace id
- 当前 span id
- 本地 parent span id

真正的 span name、attributes、status、events、finish/export 应由日志或 OTel 层负责。这样业务传播模型和具体观测后端可以解耦。
