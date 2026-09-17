---
slug: /configuration
title: 配置
sidebar_label: 配置
description: 类型化 Vine 配置、实例级快照与运行时更新。
---

# 配置

Vine 配置由 Skel 声明、Hub 存储、Link 分发，最终作为类型化 Go 依赖解析。应用代码
不需要自己轮询 Hub 或解码配置 JSON。

配置设计的关键不只是字段本身，还有一个很重要的问题：**一个应用实例什么时候可以看到新值**。

## 声明类型化配置

```skel title="skel/domain.skel"
@desc("结算应用")
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

执行常规 Skel 检查与生成流程：

```bash
skelc check --skel-in ./skel
skelc gen go --skel-in ./skel --go-out ./skeled
```

生成类型会自动向 Vine 注册自己的 Skel 名、Go 类型和生命周期，像普通依赖一样注入即可：

```go title="checkout_service.go"
type CheckoutService struct {
    Config *skeled.CheckoutConfig `inject:""`
}
```

生成的配置类型无需手工注册。

## 字符串空白处理

Vine 会去除配置字符串字段的首尾 Unicode 空白，包括可空字符串、列表元素和 Map
中的字符串 Value。例如，`"  hello  world\n"` 会变成 `"hello  world"`，字符串内部
空白保留。空值、Map Key、枚举和 `json` 内容保持原样。

该行为同时适用于 `eternal` 和 `instant` 配置，只影响应用收到的值，不会修改 Hub
保存或 Dashboard 显示的值。`@sensitive` 控制日志脱敏，不会关闭 trim。

## 选择生命周期

| 生命周期 | Link 保留什么 | 应用代码看到什么 | 适用场景 |
| --- | --- | --- | --- |
| `eternal` | 当前应用实例第一次读取时捕获的值 | 该应用实例余下生命周期始终使用同一快照 | 连接设置、schema 选择、启动策略 |
| `instant` | Hub 发布更新时随之变化的受监听快照 | 后续 DI resolution 解码得到的新值 | Feature flag、限额、可动态调整的行为 |

两种生命周期都是懒读取：只有 DI 第一次需要生成类型时才会读取。注入该配置的 Module
或 Component 在应用启动时构造；仅由请求 Handler 使用的配置，可能直到第一次
对应 execution 才会读取。

### Instant 不会修改已有对象

instant 更新不会修改已经注入的 Go 指针，后续 execution 会解析到更新的值。这会影响 DI 的行为：

- 普通 RPC、Web、Event 或 Task Handler 为一次 execution 创建。它注入的配置也在
  该 execution 中解析，所以能看到最新 instant 快照。
- Module 与应用 Component 是应用生命周期的单例。如果它把 instant 配置
  保存在字段中，该指针就会一直保持构造时的值。
- 任何显式单例依赖只要捕获了 instant 配置，也具有同样行为。

长生命周期对象如果必须响应更新，建议把依赖更新的逻辑放到新建的 execution 依赖中，
或设计显式刷新边界。不要误以为字段注入等于实时引用。

## 提供配置值

Hub seed 文件使用配置的完整 Skel 名；`value` 字段可以直接写 YAML 对象（Hub 会转换为 JSON），也支持在 YAML 字符串中编码 JSON：

```yaml title="seed.yaml"
appConfigs:
  - name: demo.checkout.CheckoutConfig
    value:
      timeoutMs: 3000
      currency: CNY
  - name: demo.checkout.FeatureFlagsConfig
    value:
      newCheckout: true
```

standalone 模式：

```go title="main.go"
standalone.NewWithOption[*CheckoutApp](standalone.Option{
    HubDBSQLiteFile: "./hub.sqlite",
    HubSeedDataFile: "./seed.yaml",
}).StartAndWait()
```

注意，这里的 `HubDBSQLiteFile` 是 **Hub 自己的数据库**，不会配置业务 `infra/rdb` Component。
如果应用本身还有关系型数据库，需要另外声明。

独立运行 Hub 时：

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite \
  --seed-data-file ./seed.yaml
```

seed 会被导入 Hub 数据库，导入后数据库仍然是 source of truth；不指定数据库时，
Hub 把 seed 保留在内存中并只读提供。

## 部署变量 {#deployment-variables}

Seed 变量让应用只向部署者暴露少量配置，而不要求他们理解其余配置结构。
开发者决定哪些 seed 字段引用变量，其余字段保留固定值；同一个变量可以供多个配置字段使用。

### 暴露指定配置项

以上面的结算配置为例，在应用 seed 中暴露超时时间，币种保留固定值：

```yaml title="app/seed/hub.yaml"
appConfigs:
  - name: demo.checkout.CheckoutConfig
    value:
      timeoutMs: "${checkout.timeoutMs:3000}"
      currency: CNY
```

部署配置文件只需要包含暴露的参数：

```yaml title="vars.yaml"
checkout:
  timeoutMs: 5000
```

文件名可以自行选择，通过 `--seed-vars-file ./vars.yaml`、
`VINE_SEED_VARS_FILE` 或 `standalone.Option.HubSeedVarsFile` 指定。
应用代码仍然取得替换后的 `CheckoutConfig`，无需自行读取字典或解析占位符。

### 定义变量结构

应用可以用 Skel data 类型 `app.Vars` 定义部署字典，并嵌套其他 data 类型：

```skel title="app/skel/vars.skel"
domain app

data Vars {
    checkout: CheckoutVars
}

data CheckoutVars {
    timeoutMs: int
}
```

按正常的 Skel 流程生成并导入 Go 包。导入生成包会注册 schema，standalone 内的 Hub
便能校验引用的变量。独立运行的 Hub 只能使用其自身进程已注册的 schema。
没有注册 `app.Vars` 时仍可查找和替换变量，但不会对引用值做类型校验。

### 替换规则

- 路径由 camelCase 节点组成，用点分隔：`${database.host}` 读取 YAML 字典中的
  `database.host`。
- `${database.port:5432}` 仅在 key 缺失时使用默认值。显式的 `null`、空字符串、
  `0`、`false` 会传递到使用位置进行校验，不会触发默认值。
- 整个字段引用变量时，可以替换标量、对象或列表；文本中的引用，例如
  `"https://${host}/api"`，则进行字符串插值。
- 已注册的变量结构校验被引用的值；配置结构也会校验整个对象的替换，要求必需的 key
  存在，多余的对象 key 忽略。未使用的字典值不要求提供。
- 替换进来的值不会再次解析占位符。
- 缺失且没有默认值的变量会导致 seed 初始化失败，例如
  `variable "database.host" is missing and has no default`。

Seed 没有变量时不需要 vars 文件；所有引用都有默认值时，也可以不传这个文件。

### 初始化与后续修改

Hub 先解析 seed，再保存最终配置。这是初始化步骤，不会建立到变量文件的动态绑定。

| Hub 存储方式 | 变量何时生效 | 部署后如何修改 |
| --- | --- | --- |
| 默认 no-db 模式 | 每次启动时加载到新的内存数据库 | 修改 `vars.yaml` 后重启；Dashboard 配置只读 |
| SQLite 或 PostgreSQL | 首次 seed 初始化，完成状态记录在数据库 metadata 中 | 通过 Hub 更新配置；后续启动完全跳过 seed、source、vars 文件 |

Dashboard 通过配置注释或字段信息浮层展示每个字段的来源、最近一次覆盖以及实际使用的变量
值。可选的 seed source 文件补充来源信息，不提供变量值。
二进制与部署配置文件的交付方式见[单机应用打包](../getting-started/deployment-modes.md#deployment-configuration)。

## 配置值何时被读取

配置通过依赖注入到达 execution，因此 consumer 在第一次使用时拿到的是生成后的 Go 值。
当 Hub 持有的值更新后，`instant` 配置会在之后的 execution 中重新解码；而已经注入到长生命周期
对象中的指针仍保留它当初拿到的值。

standalone 通过进程内连接以同样的方式解析。

## 失败语义

配置 resolution 是严格操作：

- 生成配置必须已经在进程中注册。
- Hub 与 Link 中必须存在与完整 Skel 名对应的非空值。
- JSON 必须能解码为生成的 Go 类型。

任何条件不满足，resolution 都会失败，而不是静默返回零值配置。失败出现的位置取决于
第一个 consumer：Module 可能让应用启动失败；仅由 Handler 使用的配置则可能在请求
到达时才首次失败。

排查配置缺失时：

1. 确认应用确实导入了生成 package。
2. 确认 Hub 中的完整名称与 JSON 字段名。
3. 确认应用所连接的 Link 能访问 Hub API 与 Redis 分发 endpoint。
4. 确认部署的生成 schema 与配置值是一起发布的。
5. 对 instant 配置，先创建新的 execution，再判断已经注入的单例是否理应变化。

## 设计建议

- 如果改配置而不重建应用会导致资源或不变量不一致，请用 `eternal`。
- 只有每个新 execution 都能安全地从新快照选择行为时，才使用 `instant`。
- 配置值应保持声明式。不要拿配置更新当命令式 job trigger，这类工作请用 Task。
- 滚动发布期间，不同应用版本可能暂时读取同一个 Hub 值，因此相关字段应保持向后兼容。
- credential 与私钥必须留在当前可信运行时网络边界内。分发敏感配置前先检查
  [生产就绪清单](../operations/production-readiness.md)。

语言规则见 [Skel 配置语法](https://skel.yorun.ai/docs/syntax)，binding 与 scope
细节见[依赖注入](./di.md)。
