---
slug: /logging-and-testing
sidebar_label: 日志与测试
---

# 日志与测试

Vine 使用 `core/logger` 记录结构化日志。每条记录都包含 `logger` 字段，用冒号分隔的名称标识日志来源，例如 `app:demo.user:rpc:server`。

## 写入日志

业务代码可以直接使用包级默认 logger。它的名称是 `vine:default`。

Vine 自身使用稳定的分层名称：`vine:core:link`、`vine:core:rpc` 和
`vine:core:redact` 表示框架核心能力，`vine:infra:rdb` 表示基础设施适配；
Go 标准库日志使用 `vine:stdlog`。这些名称可以直接用于日志级别规则。

```go title="service.go"
logger.Info("user created", "userId", user.ID)
logger.Error("payment failed", "orderId", order.ID, "error", err)
```

需要区分日志来源时，创建带名称的 logger。传入 `New` 的多个名称片段会用 `:` 拼接；片段本身也可以包含 `:`。`Child` 可以在已有名称后继续追加片段，并继承父 logger 的配置和属性。

```go title="service.go"
appLog := logger.New("app", "demo.user")
rpcLog := appLog.Child("rpc", "server")

rpcLog.Info("request completed", "method", "GetUser", "elapsedMs", 12)
// logger=app:demo.user:rpc:server
```

`logger` 是保留字段，不能作为顶层日志属性传入。可以通过 `With` 为派生 logger 添加固定的结构化属性：

```go title="service.go"
tenantLog := appLog.With(slog.String("tenantId", tenantID))
tenantLog.Info("tenant initialized")
```

## 按名称配置日志级别

未显式指定级别的 logger 使用 `LevelAuto`。它会动态匹配进程内的名称规则；没有规则命中时，再使用全局级别。修改规则或全局级别后，已经创建的 auto-level logger 也会立即采用新配置。

```go title="main.go"
logger.SetGlobalLevel(logger.LevelInfo)

logger.SetLevel("app:**", logger.LevelWarn)
logger.SetLevel("app:*:rpc", logger.LevelError)
logger.SetLevel("app:demo.user:*", logger.LevelInfo)
logger.SetLevel("app:demo.user:rpc:server", logger.LevelDebug)
```

规则和 logger 名称都按 `:` 分段：

- 普通片段只匹配相同文本。
- `*` 严格匹配一个片段。
- `**` 匹配零个或多个连续片段。
- 一条规则也会匹配其后代名称。例如，`app:*:rpc` 能匹配 `app:demo.order:rpc:client`。
- `*` 和 `**` 不能单独作为完整规则；`rpc*`、`*rpc`、`***` 等片段内通配形式也不受支持。

多条规则同时命中时，按以下顺序选择：

1. 从左到右逐段比较，普通片段的优先级高于 `*`，`*` 高于 `**`。
2. 最先出现差异的位置决定优先级，后续片段不再参与比较。
3. 如果较短规则的所有片段与较长规则具有相同的匹配类型，则更长的规则优先。
4. 没有规则命中时，使用 `SetGlobalLevel` 设置的全局级别。

以上面的规则为例：

| logger 名称 | 生效规则 | 级别 | 原因 |
| --- | --- | --- | --- |
| `app:demo.user:rpc:server` | `app:demo.user:rpc:server` | `DEBUG` | 全字面量的精确规则最具体 |
| `app:demo.user:event` | `app:demo.user:*` | `INFO` | 左侧的字面量片段优先于 `app:**` |
| `app:demo.order:rpc:client` | `app:*:rpc` | `ERROR` | `*` 在第二段的优先级高于 `**` |
| `app:demo.order:event` | `app:**` | `WARN` | 只有通用应用规则命中 |
| `vine:default` | 无 | 全局 `INFO` | 没有规则命中，回退到全局级别 |

`ClearLevel(pattern)` 用于删除一条规则，`Levels()` 返回当前规则的副本。规则是进程级配置；如果在 `WithOption` 中设置具体的 `LevelDebug`、`LevelInfo`、`LevelWarn` 或 `LevelError`，该 logger 的级别会固定，不再跟随规则或全局级别。

## 格式与输出

全局格式、级别和输出路径分别配置：

```go title="main.go"
logger.SetGlobalFormat(logger.FormatJSON)
logger.SetGlobalLevel(logger.LevelInfo)
logger.SetGlobalOutputPath("/var/log/demo/app.log")
```

`FormatText` 每条记录输出一行便于阅读的 `key=value` 文本；`FormatJSON` 以 JSON Lines 形式输出，每条记录是一个 JSON 对象。未设置格式时，Vine 在 Kubernetes 环境中默认使用 JSON，其他环境默认使用文本。

输出始终写入 stderr。设置非空输出路径后，日志还会追加写入该文件，并自动创建父目录；传入空路径可恢复为只写 stderr。

`New` 的最后一个参数可以是 `WithOption`。每个字段独立生效：空的 `Format` 和 `OutputPath` 会动态跟随全局配置，空的 `Level` 是 `LevelAuto`；非空字段则固定在该 logger 上。

```go title="audit.go"
auditLog := logger.New("app:demo.user:audit", logger.WithOption{
    Format:     logger.FormatJSON,
    Level:      logger.LevelInfo,
    OutputPath: "/var/log/demo/audit.log",
})
```

标准库 `log` 的输出会由名称为 `vine:stdlog` 的 logger 接管。需要替换包级默认 logger 时，调用 `logger.SetDefault(customLogger)` 即可。

## 敏感字段与二进制

Skel 字段使用 `@sensitive` 标记。skelc 会在对应的 Go 字段上生成 `skel:"sensitive"`，Rpc、Event 和 Task payload 日志会通过 `core/redact` 将其替换为 `<redacted>`。字段名称本身不会触发隐式遮蔽；动态 map 或 JSON 中的敏感内容需要由调用方使用 `RootSensitive` 或 `Sanitizer` 显式处理。

```skel
data LoginRequest {
    username: string

    @sensitive
    password: string
}
```

`@sensitive` 能标记整个 data / config、event 的 `payload` block，以及 actor 的 `credential` / `info` block。对应生成类型会实现 `skel.Sensitive` interface 的 `SkelSensitive()` marker method，不增加数据字段，也不改变 JSON / CBOR；`core/redact` 会把该类型的值整体替换为 `<redacted>`。event 和 auth 容器本身不能标记。标记整个 Rpc method input / output 或 resource check input 时，skelc 会写入 `MethodSpec`，对应 payload 日志同样整体遮蔽；标记整个 task trigger input 时，则会写入 Task `TriggerSpec`，供处理 Task 参数的代码识别。

`core/redact` 不依赖 Rpc、Event 或 Task 的具体架构，也能直接处理普通 Go 值：

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

`Render` 失败时会通过 `vine:core:redact` 额外记录一条 `ERROR` 日志，其中只包含安全的
`failureKind` 分类，不包含可能携带敏感数据的原始错误文本；调用方仍会收到原始错误。

调用方已知整个值敏感时，传入 `redact.Option{RootSensitive: true}`，无需依赖具体 Go 类型或字段 tag。

`redact.Option{RevealSensitive: true}` 能显式保留普通敏感字段，适合受严格控制的临时诊断。二进制值不受该选项影响：始终只输出字节数，不输出原始内容。

框架的 Rpc、Event 和 Task 日志在记录 payload 时始终调用 `core/redact`，不提供关闭脱敏或输出敏感原文的全局开关。`core/redact` 同时限制遍历深度、节点数、集合大小、字符串长度和最终 JSON 大小；发生裁剪时，`Result.Truncated` 为 `true`。

## 应用测试

`app/testkit` 用于在测试中启动 standalone runtime、覆盖配置并创建类型安全客户端。它适合覆盖依赖注入、Rpc handler、Event listener 和 Task runner 的集成行为。

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

Vine App 在同一测试进程中是单例。一个测试 package 只启动一次 standalone runtime；有多组用例时，在同一个顶层测试中用 `t.Run(...)` 组织子用例并共享 runtime，不要在多个测试里重复创建 App。

测试应关注可观察行为：返回值、状态变化、配置覆盖以及错误码。只有在验证真实租约、断网或 TLS 入口时，才需要启动独立 Hub、Link 和 Portal 进程。

运行全部 Go 测试：

```bash
go test ./...
```

运行指定包：

```bash
go test ./path/to/package -run TestName
```
