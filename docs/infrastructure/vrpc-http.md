---
slug: /vrpc-http
---

# vRPC over HTTP 协议

vRPC 是 Vine 的 Rpc 线协议。它使用 HTTP 承载请求与响应，通过 URL 标识 Skel service 和 method，通过 `vrpc-*` Header 传递调用元数据，并使用 JSON 或 CBOR 编码参数、结果和错误。

本文描述当前 vRPC 的 HTTP 承载格式，适合实现非 Go 客户端、调试 Portal Rpc 入口或排查跨进程调用。业务 Go 代码通常应使用 skelc 生成的 client，而不是手工拼装 HTTP 请求。

## 1. 请求目标

每次调用使用一个 HTTP `POST` 请求：

```text
POST <endpoint>/<service-skel-name>/<method-skel-name>
```

例如调用 `demo.greeting.GreetingService` 的 `hello` method：

```http title="request.http"
POST /rpc/invoke/demo.greeting.GreetingService/hello HTTP/1.1
```

路径中的 service 和 method 都使用 Skel 名称，并区分大小写。宿主根据接入方式提供不同的 endpoint 前缀：

- 业务应用的 HTTP Rpc handler 通常挂载在 `/rpc/invoke`。
- Portal Rpc 站点在站点基路径下提供 `/invoke`，完整外部路径由 Portal entry 和 site 配置决定。
- vRPC transport 自身只解析最后的 `/<service>/<method>`，不解释宿主前缀。

除 `POST` 外的请求方法不是有效的 vRPC invoke 请求。

## 2. 请求 Header

| Header | 必需 | 格式与用途 |
| --- | --- | --- |
| `accept` | 是 | `application/vrpc+json`，或在结果包含二进制字段时包含 `application/vrpc+cbor`。 |
| `content-type` | 是 | 请求体编码：`application/vrpc+json` 或 `application/vrpc+cbor`。 |
| `vrpc-trace` | 是 | Trace 信息，格式为 `id=<32位小写十六进制>,span=<16位小写十六进制>`。 |
| `vrpc-client` | 是 | 调用方应用信息：`name`、`version` 和 `instanceId`。 |
| `vrpc-options` | 否 | 调用选项，目前只支持正数 `timeout`。 |
| `vrpc-actor` | 否 | Base64url 编码的 Actor JSON，由受信任的接入层生成或转发。 |
| `vrpc-initiator` | 否 | Base64url 编码的最初调用方信息，由 Vine 运行时传播。 |
| `accept-encoding` | 否 | Portal 对外响应支持 `zstd` 和 `gzip`。 |

典型 Header 如下：

```http title="request.http"
accept: application/vrpc+json
content-type: application/vrpc+json
vrpc-trace: id=123e4567e89b12d3a456426614174000,span=1234567890abcdef
vrpc-client: name=demo.client,version=1.2.3,instanceId=123e4567-e89b-12d3-a456-426614174001
vrpc-options: timeout=10s
```

`vrpc-client` 的约束是：

- `name` 使用小写字母和点，例如 `demo.client`。
- `version` 是语义化版本。
- `instanceId` 是 UUID。

`timeout` 使用 Go duration 格式，例如 `500ms`、`10s`、`1m`。Header 缺失时，核心 transport 不额外创建 deadline；Portal rpcgw 默认使用 `30s`，并拒绝超过 `120s` 的值。

应用间直连要求 `vrpc-trace` 同时包含 `id` 和 `span`。Portal rpcgw 也要求该 Header，但允许外部客户端只传 `id`，并在入口补充 span。

同一个 Header 不应使用多个独立字段行重复发送。需要声明多个响应媒体类型时，把它们放在同一个 `accept` 值中并用逗号分隔。

## 3. 请求体

JSON 请求体是一个只包含 `params` 的信封：

```json title="request.json"
{
  "params": {
    "name": "Vine"
  }
}
```

`params` 内字段由目标 Skel method 的 input 决定。对于有 input 的 method，参数会按生成的 schema 解码和校验；缺少 body、缺少 `params`、字段类型错误或校验失败都会得到 `INVALID_REQUEST`。

没有 input 参数的方法仍使用相同信封，可发送空对象：

```json title="request.json"
{
  "params": {}
}
```

CBOR 使用相同的数据模型，只把整个信封和 `params` 改为 CBOR 编码。当请求参数包含 binary 类型时，生成的客户端会选择 `application/vrpc+cbor`；其他请求默认使用 JSON。

## 4. 响应 Header 与响应体

每个可解码的 vRPC 响应至少包含：

| Header | 格式与用途 |
| --- | --- |
| `content-type` | `application/vrpc+json` 或 `application/vrpc+cbor`。 |
| `vrpc-status` | Vine Rpc 状态码，例如 `OK`、`INVALID_REQUEST` 或 `NOT_FOUND`。 |
| `vrpc-server` | 服务端应用的逻辑 `name`、`version` 和 `instanceId`；逻辑名称不包含内部 `@runtime` 后缀。 |

成功响应使用 `result` 字段，`error` 为 `null`：

```http title="response.http"
HTTP/1.1 200 OK
content-type: application/vrpc+json
vrpc-status: OK
vrpc-server: name=demo.greeting,version=1.2.3,instanceId=123e4567-e89b-12d3-a456-426614174002
```

```json title="response.json"
{
  "result": {
    "message": "Hello, Vine"
  },
  "error": null
}
```

没有 output 的 method 返回 `"result": null`。

失败响应使用 `error` 字段，`result` 为 `null`：

```json title="response.json"
{
  "result": null,
  "error": {
    "code": "NOT_FOUND",
    "message": "user is not found",
    "reason": "",
    "detail": ""
  }
}
```

客户端必须以 `vrpc-status` 和 `error.code` 判断调用结果，不能只解析 HTTP reason phrase。成功时 `vrpc-status` 必须是 `OK` 且 `error` 为空；失败时状态码和 `error.code` 必须一致。

## 5. JSON 与 CBOR 协商

请求和响应分别协商：

1. `content-type` 决定请求体格式。
2. `accept` 声明客户端可接收的响应格式。
3. 只有 method output 含 binary 类型且 `accept` 包含 `application/vrpc+cbor` 时，服务端才返回 CBOR。
4. 其他响应使用 JSON。

生成客户端在参数含 binary 时发送 CBOR；在结果含 binary 时发送：

```http title="request.http"
accept: application/vrpc+cbor, application/vrpc+json
```

媒体类型参数可以存在，例如 `application/vrpc+json; charset=utf-8`。普通 `application/json` 和 `application/cbor` 不是有效的 vRPC content type。

## 6. HTTP 状态码

应用内部的 vRPC HTTP handler 使用固定的 HTTP `200`，业务和框架结果由 `vrpc-status` 表示。这样中间转发层不会把 Rpc 错误误判成 HTTP transport 失败。

Portal rpcgw 是面向外部客户端的 HTTP gateway，会保留 `vrpc-status`，同时映射为常见 HTTP 状态码：

| `vrpc-status` | Portal HTTP 状态码 |
| --- | --- |
| `OK` | `200` |
| `INVALID_REQUEST` | `400` |
| `UNAUTHORIZED` | `401` |
| `CLIENT_FORBIDDEN`、`PERMISSION_DENIED`、`ELEVATION_REQUIRED` | `403` |
| `NOT_FOUND` | `404` |
| `VALIDATION_FAILED`、`OPERATION_FAILED` | `422` |
| `SERVICE_UNAVAILABLE` | `503` |
| `GATEWAY_TIMEOUT` | `504` |
| `INTERNAL`、`UNKNOWN` 及其他未映射状态 | `500` |

`SERVER_UNREACHABLE`、`INVOCATION_CANCELLED`、`INVOCATION_TIMEOUT`、`INVOCATION_FAILED` 和 `UNEXPECTED_RESPONSE` 是客户端本地调用错误，不会作为服务端 `vrpc-status` 返回。

## 7. Portal rpcgw 的附加行为

Portal 在 vRPC transport 之外还负责外部 HTTP 语义：

- 校验站点是否允许目标 service，并完成服务发现和转发。
- 根据站点的 Actor 策略执行认证和权限检查；外部客户端不应伪造 `vrpc-actor` 或 `vrpc-initiator`。
- 为缺少 span 的合法 `vrpc-trace` 补充入口 span，并在转发时派生 child span。
- 返回 `portal-trace-id`，供客户端记录本次请求的 trace id。
- 清除转发错误中的内部 `detail`，避免把服务端诊断信息暴露到外部。
- 对大于 4 KiB 的响应按 `accept-encoding` 选择 `zstd` 或 `gzip`，优先使用 `zstd`。
- 根据站点配置处理 CORS；预检请求使用 `OPTIONS`，成功时返回 `204`。

因此，面向 Portal 的客户端应同时记录 HTTP 状态码、`vrpc-status` 和 `portal-trace-id`。

## 8. 完整 JSON 调用示例

下面展示一个面向 Portal rpcgw 的请求。实际 host 和站点基路径取决于 Portal 配置。

```bash title="invoke.sh"
curl 'https://api.example.com/invoke/demo.greeting.GreetingService/hello' \
  --request POST \
  --header 'accept: application/vrpc+json' \
  --header 'content-type: application/vrpc+json' \
  --header 'vrpc-trace: id=123e4567e89b12d3a456426614174000,span=1234567890abcdef' \
  --header 'vrpc-client: name=demo.client,version=1.2.3,instanceId=123e4567-e89b-12d3-a456-426614174001' \
  --header 'vrpc-options: timeout=10s' \
  --data '{"params":{"name":"Vine"}}'
```

如需了解 Go 侧的 client、server 与 method metadata，见 [Rpc API 参考](/docs/rpc)；trace 和剩余 timeout 的跨层传播见 [Trace 与 Timeout](/docs/trace-timeout)。
