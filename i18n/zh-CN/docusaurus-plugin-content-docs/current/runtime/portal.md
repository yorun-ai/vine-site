---
slug: /portal
sidebar_label: Portal 网关
---

# Portal 网关

Portal 是 Vine 的北向入口。它从 Hub Redis 读取入口、站点、证书、descriptor 与 endpoint 信息，并把 HTTP、HTTPS、RPC 和 Web 请求路由到目标应用的 Link endpoint。

```mermaid
flowchart LR
  Client["浏览器 / 外部客户端"] -->|"HTTP / HTTPS"| Portal["Portal"]
  Portal -->|"读取与订阅"| Redis["Hub Redis"]
  Portal --> Link["Link ingress"] --> App["业务应用"]
```

## 职责边界

- **入口监听**：依据 Portal entry 维护 HTTP / HTTPS listener。
- **站点路由**：依据 Portal site 配置创建 RpcGW 或 WebGW，并在站点内匹配请求。
- **Endpoint 发现**：持续订阅 RPC 与 Web endpoint 注册，向网关提供可用实例。
- **认证与授权**：根据 actor、service、resource Descriptor，在 RPC 转发前按需调用后端认证和权限服务。
- **TLS 证书**：读取并监听 Hub 中的证书配置，按 SNI 匹配 HTTPS 证书。
- **自身注册**：向 Hub 注册本实例及 Vine runtime 版本，并在运行期间持续续租，使 Hub
  能够展示正在提供服务的 Portal 实例。

Portal 只处理外部入口与网关策略；它不保存配置真源，也不负责应用及其能力的注册。

## Portal 注册

在分离部署中，Portal 启动时向 Hub 注册自身，每 10 秒续租一次，并在优雅退出时注销。
最后一次心跳后 30 秒，Hub 会将某个 Portal 实例判定为停止服务，因此被强制终止的
Portal 也会自动从列表中消失。Hub Dashboard 会在应用实例之外列出已注册的 Portal 实例。

Hub 重启后不会报告任何 Portal 实例，直到各 Portal 在下一次心跳时重新注册。standalone 的
Portal 与 Hub 同进程，不可能比 Hub 存活更久，因此只注册一次，不发送心跳。


## 启动

Portal 依赖已启动的 Hub：

```bash
vine portal serve \
  --hub-endpoint http://127.0.0.1:7071
```

`--hub-endpoint` 也能通过 `VINE_PORTAL_HUB_ENDPOINT` 设置。HTTP / HTTPS 监听地址不是命令行参数，而是由 Hub 中的 Portal entry 和 rule 配置驱动。

网络部署中，应配置 Portal 的 `vine.portal` 后台身份：

```bash
vine portal serve \
  --hub-endpoint https://hub.internal:7071 \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/portal.pem \
  --mtls-key-file /run/vine/portal-key.pem
```

Portal 会把该证书用于启动时及运行期间的 Hub Control Rpc 调用（`InfoService` 发现，
以及通过 `PortalRegistryService` 完成的注册、心跳与退出注销）、用于通过 Redis 协议
加载并订阅 Hub 配置的 watch 连接，以及到 Link ingress 的调用。它的精确 X.509-SVID 是
`spiffe://<trust-domain>/vine/daemon/vine.portal`，并与 Hub、Link 使用相同 trust domain。
浏览器侧 HTTPS listener 永远不会直接提供这些后台身份文件。启用 mTLS 后，当 SNI 匹配当前
监听器上的 HTTPS 入口、且没有配置证书匹配该 host 时，Portal 会在内存中单独签发一个短期自签
Web 证书；握手阶段会先拒绝无法匹配入口的 SNI，再选择证书。Hub 中配置的精确域名和通配证书
始终优先。临时证书不会被持久化，并在 Portal 停止时消失；它能加密引导流量，但不会被浏览器
信任，生产使用前仍应配置公开证书。

## 配置如何生效

Portal 不需要重启来加载大多数网关变更。它监听 Hub Redis 中的以下内容：

- 入口变更：决定监听地址、HTTP/HTTPS 端口和自动 HTTPS 跳转。
- 规则变更：决定请求交给哪个站点。
- 站点变更：定义 RPC 或 Web 站点及路由规则。
- endpoint 注册信息：决定一个请求可转发到哪些 Link。
- domain、actor、service、Web、resource Descriptor：决定认证与权限准入，以及 API inspection
  和 MCP 提供的契约目录。
- TLS 证书：用于 HTTPS listener 的 SNI 匹配。

Hub 发布配置变更后，Portal 无需重启即可使其生效；业务实例注册或失效时，endpoint 发现也会随之刷新。

Hub 重启无需对 Portal 做任何操作：Portal 会重新连接运行中的 Hub，并在不重启的情况下继续提供服务。详见 [Hub 重启与端点变化](./hub.md#hub-重启与端点变化)。

## WebGW 超时策略 {#web-timeout}

WEBGW Site 可以添加与 `cors` 平级的 `webTimeout`，为 Web 站点设置总的执行预算，例如用于包下载：

```yaml
portalSites:
  - name: packages
    type: WEBGW
    actorSkelName: demo.UserActor
    webName: demo.PackageWeb
    cors:
      mode: SAME_DOMAIN
    webTimeout:
      default:
        total: 30s
      paths:
        - path: /go/**
          total: 15m
```

`total` 使用正的 Go 时长。取最具体的匹配路径规则，覆盖默认值；匹配 Entry
重写后的已解码路径，不包含 query。无通配符时精确匹配，`*` 只匹配单个路径段内的字符，
`**` 独占路径段并可跨段匹配，因此 `/go/**` 匹配 `/go`、`/go/` 及其下级路径，不匹配
`/gopher`。路径必须以 `/` 开头，不接受 query、fragment、`.` / `..` 路径段或其他通配语法。

精确路径优先于通配模式。通配模式从左到右逐段比较：固定段优先于包含 `*` 的段，后者优先于
`**`。包含 `*` 的段按固定字符数量比较，更多的优先。模式结束优先于额外的 `**`，而额外的
固定段或包含 `*` 的段优先于模式结束。具体程度相同时保留配置顺序。例如，
`/files/download/**` 始终优先于 `/files/**`，不受排列顺序影响。当两条规则可能匹配同一
路径时，把期望的时限配置在更具体的规则上。

策略同时是预算和上限：`vweb-options` 可以缩短它，更大或未指定的请求时限按策略总时限执行。
预算从 WebGW 受理开始，包括认证和响应传输，下游收到的始终是剩余时间。SSE 和 WebSocket
连接同样受策略约束，并遵循普通 Web 的
[取消规则](../framework/trace-timeout.md#client-cancellation)。

没有匹配策略时，普通 Web 请求默认 30 秒，可通过请求选项指定最多 120 秒；没有请求超时的
SSE 和 WebSocket 连接保留原有长连接行为。

Dashboard 可编辑默认值和有序的路径规则；保存后的修改只影响新请求，正在执行的请求保留原
截止时间。Admin 更新只要提供该块就整块替换，空对象清空策略，省略字段则保持不变。该策略只
适用于 WEBGW Site。

## 认证模式

method 未声明模式时继承 service 的认证模式；service 与 Web 声明不能使用 `inherit`。


RPC 支持 `required`、`optional`、`anonymous`，Web 另支持 `off`。
本地 descriptor 注册及 Hub 接收入口均拒绝 RPC 显式使用 `off`：

| 模式 | 无凭据 | 有效凭据 | 无效凭据 |
| --- | --- | --- | --- |
| `required` | 拒绝 | 已认证 actor | 拒绝 |
| `optional` | 匿名 actor | 已认证 actor | 拒绝 |
| `anonymous` | 匿名 actor | 拒绝 | 拒绝 |
| `off`（仅 Web） | 不认证 | 不认证 | 不认证 |

认证服务错误也会拒绝请求。通过认证准入后，RPC 仍会执行适用的权限检查。

Web `off` 跳过 Portal 认证并传递匿名 actor，保留 `Authorization` 供应用自行认证。
RPC 和 Web 的 `required`、`optional`、`anonymous` 在准入通过后删除 `Authorization`，
仅向下传递已准入的 actor。

RPC method 未声明模式时使用 service 模式；service 或 Web 声明未声明模式时按 `required`
处理。这类 Web 需要有效凭证，且 actor 必须配置认证。需要匿名访问或由应用自行认证时，
选择 `optional` 或 `off`。

Hub、Link、Portal 应使用同一版本，以保证认证模式一致。

## 可选凭据字段

RPC 和 Web 认证允许在 `Authorization` 中省略可选凭据字段。
例如，`token` 必填、`tenant` 可选时，没有 tenant 就发送
`Authorization: token abc`；需要提供时发送
`Authorization: token abc, tenant team-a`。省略的字段在认证服务中为 nil，
不要传入空值。

必填字段必须存在，所有已提供的值都必须非空。未知字段名和格式错误会被拒绝。
Skel 要求至少声明一个必填凭据字段，因此合法请求总会包含至少一个非空值。

## Inproc 模式

Portal 可随 standalone runtime 在同一进程内启动，此时 Hub Redis 连接与目标 Link endpoint 都是进程内连接。

该模式可验证路由、Descriptor 监听、准入和转发逻辑，但无法模拟独立进程崩溃、外部网络断连及 TLS 端口不可达等分布式条件。需要验证这些条件时，请采用独立进程部署。

## Portal 入口

入口定义 Portal 对外服务的协议、host、监听 IP 和端口。每条规则都属于一个入口，
访问地址由入口持有，因此修改入口会一次性更新它承载的所有规则。Dashboard 会把入口与
站点、规则并列展示，规则编辑器在新建规则时选择入口。

Seed YAML 用 `portalEntries` 段声明入口，同一文档中的规则通过 `entryName` 引用：

```yaml
portalEntries:
  - name: web
    protocol: http
    http:
      host: api.example.com
      http: ENABLED
      httpPort: 80
      https: ENABLED
      httpsPort: 443
      autohttps: ENABLED
    listenIPs: ["0.0.0.0", "::"]

portalRules:
  - name: internal-api
    entryName: web
    matchPathPrefix: /api
    routeType: SITE
    routeSiteName: application-web
```

`protocol` 接受 `http`，把 HTTP 和 HTTPS 归入同一入口。`http` 块可选但必须与
`protocol` 一起使用，包含请求 host 和三个传输开关。在 seed YAML 中 null 块会被拒绝：

| 字段 | 取值 |
| --- | --- |
| `host` | 要匹配的请求 Host；留空表示仅支持通过 HTTP 的 IP 访问 |
| `http` | HTTP 传输：`ENABLED`、`DISABLED` 或 `AUTO` |
| `httpPort` | HTTP 监听端口；`0` 或省略使用 `80`，否则为 `1–65535` |
| `https` | HTTPS 传输模式 |
| `httpsPort` | HTTPS 监听端口；`0` 或省略使用 `443`，否则为 `1–65535` |
| `autohttps` | HTTP 跳转 HTTPS（`308`）模式 |

开关只接受上表中的大写取值，布尔值、null 及其它取值都会被拒绝。省略的开关为 `AUTO`，
由 Hub 结合入口 host 和匹配证书解析：

- 除非显式关闭，HTTP 均开启。
- HTTPS 仅当 host 是域名且存在已启用的匹配证书时开启；该判断不考虑证书有效期。通配符
  入口需要覆盖整个通配符范围的证书。
- 仅当 host 是域名且两种传输都开启时，跳转才开启。

入口同时报告配置的模式和 `effectiveHTTP` 对象，其中包含 `httpEnabled`、`httpsEnabled`、
`autohttpsEnabled`、`httpsReason` 及解析后的端口。Admin 更新只要带上 `http` 就会整块
替换，块内省略的开关恢复 `AUTO`；不带该块则保持当前配置。

HTTPS 尚在等待证书的入口同样会占用对应 HTTPS 端口参与冲突检查：HTTP 和 HTTPS 不能使用
同一端口，至少要启用一种传输；两个已启用入口只有在地址不重叠，或使用相同地址和相同协议时，
才能共用同一端口。Portal 只为已生效的传输打开监听，因此这类入口会在匹配证书出现后开始
提供 HTTPS。

显式开关在保存时必须已经满足条件：

- `https: ENABLED` 需要域名 host 和已启用的匹配证书。
- `autohttps: ENABLED` 需要域名 host、两种传输均已开启，以及已启用的匹配证书。
- 如果证书变更会让这类入口失去最后一张匹配证书，变更会被拒绝。请先把入口改为 `AUTO` 或
  `DISABLED` 再删除证书。

`AUTO` 开关可以等待证书：上传证书后 Hub 会自动启用对应传输，无需修改入口。证书和入口也
可以在同一份 seed 中声明。

生效配置中的 HTTP、HTTPS 和跳转都开启时，只有请求 host 匹配到当前有效的 Portal TLS 证书，
HTTP 请求才会被跳转到 HTTPS。跳转保留请求方法、转义路径和查询参数，使用具体的请求 host
（包括通配符证书匹配到的具体域名），并在 `httpsPort` 为 `443` 时省略端口。没有匹配的有效
证书时，请求继续按普通 HTTP 规则处理；没有匹配规则则返回 `404`。证书更新和过期即时影响
跳转，无需重启 Portal。IP 请求不会被自动跳转。设置 `autohttps: DISABLED` 可让两种协议服务
同一组规则。

`listenIPs` 指定此入口绑定的网络地址，Dashboard 中展示同一份列表。省略或使用 `[]` 会保留
默认的全网卡 TCP 监听，在主机支持时同时服务 IPv4 和 IPv6。显式地址只绑定所属地址族，
因此 `["0.0.0.0", "::"]` 绑定两个地址族的所有网卡，`["127.0.0.1", "::1"]` 只绑定回环地址。
显式 IPv6 监听要求 Portal 所在主机支持 IPv6。Vine 会对列表做规范化与去重，并拒绝域名、
端口、zone 标识，以及列表中重叠的通配地址与具体地址。`http.host` 字段匹配请求 Host，不用于
选择网络接口。

已启用的入口在协议、地址和端口都相同时共享同一个监听器。两个入口只有在地址不重叠，或使用
相同地址和相同协议时，才能共用同一端口，因此同一端口上的通配地址与具体地址会冲突。host、
协议和端口都相同的入口还必须使用相同的 HTTP 配置，此时应把传输配置合并到一个入口中。已启用
的入口即使没有规则也会监听：没有匹配规则的请求返回 `404`，自动 HTTPS 跳转照常生效。

监听变更动态生效。新增绑定失败时，Portal 会关闭刚打开的监听器并恢复原有配置；初始配置
无法绑定时启动失败。从通配地址切换到具体地址可能短暂中断连接。

seed 中每条规则都通过 `entryName` 引用同一文档声明的入口；引用未声明入口的规则会被拒绝。
入口可以暂时不承载任何规则。

## 启用与停用配置

Portal 站点、入口、规则和证书都带有启用开关，可在 Dashboard 中编辑。seed 使用
`enabled`，省略时默认 `true`；显式空值或 `null` 会报错：

```yaml
portalRules:
  - name: legacy-api
    entryName: application
    enabled: false
    matchPathPrefix: /legacy
    routeType: SITE
    routeSiteName: application-web
```

被停用的规则不会生效，被停用入口下的规则、被停用站点下的 SITE 规则同样如此。重定向规则
不属于 SITE 规则，因此站点被停用后仍会生效。被停用的证书不提供服务，可以省略
`certificate` 和 `privateKey`，或保留尚未完整的 PEM 内容；名称、YAML 结构和字段类型仍然
校验，启用时必须提供有效的证书链及匹配的私钥。

## 入口路径映射

当 Web 站点背后的 Web 契约声明了挂载路径时，Portal 使用该路径同时进行匹配和转发；
在挂载路径存在期间，指向该站点的 SITE 规则所配置的前缀不生效：

- 规则编辑器会展示 Web 路径，并提示这两个路径由 Web 固定
- Seed 规则可以省略这两个前缀
- 挂载路径为 `/` 时从根路径提供服务
- 已存储的前缀仍然保留；当 Web 不再声明挂载路径时会重新生效
- 站点或契约变更后，实际路径自动跟随，无需重启 Portal

重定向规则不变：它们沿用配置的模板，不参与挂载路径解析。


以下映射配置适用于目标 Web 未声明挂载路径，或目标站点为 RpcGW 的情况。

SITE 规则支持 `routePathPrefix`，表示目标站点内的路径前缀。Portal 使用
`matchPathPrefix` 匹配原始请求，将该前缀替换为 `routePathPrefix`，再交给站点的 WebGW
或 RpcGW。这只改变转发请求，不改变浏览器地址，也不会改写响应正文、静态资源
URL 或重定向地址。

| `matchPathPrefix` | `routePathPrefix` | 请求 | 站点收到的路径 |
| --- | --- | --- | --- |
| `/api` | 留空 | `/api/users` | `/users` |
| `/api` | `/internal` | `/api/users?x=1` | `/internal/users?x=1` |
| `/api` | `/api` | `/api/users` | `/api/users` |
| `/` | `/internal` | `/users` | `/internal/users` |
| `/api` | `/internal` | `/api` | `/internal` |
| `/api` | `/internal` | `/api/` | `/internal/` |

留空或 `/` 保持剥离前缀的行为。其他值必须以 `/` 开头，不得包含协议、Host、
查询参数、片段、反斜杠、控制字符或 `.` / `..` 路径段。配置的目标前缀末尾的
斜杠会被去掉。入口改写保留请求后缀的编码、查询参数、方法、正文和请求上下文。
匹配仍遵循路径段边界（`/api` 不匹配 `/api2`）及现有规则优先级。
对于 RpcGW，改写后必须是 `/invoke/demo.Service/Method` 等网关路径；
`routePathPrefix` 不会绕过网关鉴权。重定向规则继续使用 `routeRedirectionPattern`，
不能设置 `routePathPrefix`。

可以在 Dashboard 规则编辑器中配置“目标路径前缀”，或通过 Hub seed YAML 设置：

```yaml
portalEntries:
  - name: application
    protocol: http
    http:
      host: api.example.com
      httpPort: 8080
      https: DISABLED
      autohttps: DISABLED
portalRules:
  - name: internal-api
    entryName: application
    matchPathPrefix: /api
    routeType: SITE
    routeSiteName: application-web
    routePathPrefix: /internal
```

请先配置目标站点，再向规则发送请求。规则更新无需重启 Portal 即可生效。
API 更新时不传 `routePathPrefix` 表示不修改，传空字符串表示清除。Seed YAML 表示完整
规则值，省略该字段表示空值。


## 规则校验

以下要求适用于 Admin API 和启动 seed YAML。

入口支持 `protocol: http` 及上面说明的 HTTP 配置块；`http.host` 可以为空、填写主机名、IP，或使用
`*.example.com` 这样的通配符域名，不能带完整 URL 或端口，通配符只允许开头的 `*.`。保存前 Vine
会去掉 host 两端空白、转为小写并去掉一个末尾点号。规则必须填写名称和 `entryName`：seed 必须
引用同一文档内声明的入口，Admin API 则要求该入口已存在于 Hub。`matchPathPrefix` 非空时必须以
`/` 开头，不包含查询参数或片段分隔符、反斜杠、空白、控制字符及 `.` / `..` 路径段。

通配符只匹配一级子域名：`*.example.com` 匹配 `shop.example.com`，不匹配 `example.com`
或 `a.b.example.com`。通配符入口下的每条规则都必须指向 Web 站点，且该站点必须已存在：
不允许 Rpc 目标和重定向；目标站点之后被删除或改为非 Web 类型时，该规则停止服务。还需将
DNS 泛解析指向 Portal；使用 HTTPS 时提供匹配的证书。

HTTPS 每次握手先按 SNI 匹配当前监听器上的入口，再选择证书。精确域名入口优先于通配符入口；
仅有通配符证书不会放行额外域名。缺少 SNI、SNI 为 IP 或无法匹配入口时拒绝握手，TLS 会话恢复也
执行同样的校验。HTTP 请求 Host 在忽略端口、大小写和末尾点号后必须与握手 SNI 一致，否则返回 `421`。
仅在匹配到的入口域名内选择规则；路径未匹配时不会回退到通配符入口。

HTTP 先按 Host 选择入口，精确 Host 优先于通配符；随后仅使用该入口的规则和自动 HTTPS 跳转。
如果入口没有匹配的规则或跳转，请求返回 `404`，不会回退到通配符入口。空 Host 入口仅匹配
HTTP IP 访问，且精确 IP 入口优先。在选中的入口内，优先匹配更长的 `matchPathPrefix`。

`SITE` 必须填写 `routeSiteName`，不能设置 `routeRedirectionPattern`。
`PERMANENT_REDIRECT` 和 `TEMPORARY_REDIRECT` 必须填写 `routeRedirectionPattern`，
不能设置站点名称或非空路由路径前缀。重定向模板支持 `{scheme}`、`{host}`、`{uri}`、
`{path}`、`{query}`、`{method}`、`{remote}`；未知占位符或未配对的大括号会报错。
保存规则时不会检查目标站点是否存在；通配符入口例外，其目标必须是已存在的 Web 站点。
请确保目标站点在接收请求前已配置。

## 规则冲突

当两条规则属于同一个入口、且解析到相同的匹配路径时即构成冲突，因为 Portal 无法为它们
排序。名称排序在前的规则负责服务该请求；当它不再服务该请求时，另一条会立即接管。Dashboard
会标记这两条规则并展示它们匹配的请求，Admin API 通过 `listConflicts` 报告每一对冲突。

处理冲突的方式有：停用其中一条规则、在另一个入口下创建该规则，或修改站点挂载路径，
从而改变其规则解析出的路径。

## 证书信息

证书使用 PEM 文本：`certificate` 包含站点证书及其后的中间证书，`privateKey` 包含私钥：

```yaml
portalCerts:
  - name: example
    certificate: |
      -----BEGIN CERTIFICATE-----
      ...
      -----END CERTIFICATE-----
    privateKey: |
      -----BEGIN PRIVATE KEY-----
      ...
      -----END PRIVATE KEY-----
```

Hub 在保存前校验证书链，以及证书与私钥是否配对。Admin API 更新时可以省略
`privateKey` 以保留已有私钥；Dashboard 的私钥输入留空也按此处理。证书读取 API
不返回私钥内容。

证书签发者、域名和有效期自动从证书内容解析，无需手填。YAML 中即使填写了
这些元数据，也以证书内容为准。证书覆盖的域名决定哪些入口 host 可以启用 HTTPS
和自动跳转；证书集合变化时，Hub 会重新计算受影响的入口。

## API 服务边界

`api service` 是客户端经 Portal 访问的入口。只有 API 服务会暴露给客户端，普通后端服务不会；
[扩展服务](https://skel.yorun.ai/zh-CN/docs/services)（`ext service`）同样不会暴露给客户端，
即使声明中带有 `for`、`auth` 或 `require` 规则。后端认证、权限和资源检查等服务仍在 Portal
背后运行，不作为客户端入口。

## RpcGW 后端请求

`/invoke` 和 MCP 向后端转发固定的头部集合：`Accept`、`Content-Type`、
`vrpc-client`、`vrpc-trace`、`vrpc-initiator`、`vrpc-actor` 和 `vrpc-options`，
其中 trace、initiator、actor 和剩余超时由 Portal 填写。Cookie、任意自定义头部、转发类
头部、MCP 头部以及只用于响应的 vRPC 头部都不会转发；User-Agent 和客户端 IP 只保留在
initiator 元数据中。业务身份应放在受理后的 actor 信息里，调用参数放在 method 入参中，
不提供可配置的头部透传。

请求体必须未压缩：只接受缺失或单个 `identity` 的 `Content-Encoding`，其他或格式错误的
编码在准入前就会被拒绝。

## Inspect API 契约

在 Hub Dashboard 的 RPCGW 站点上开启 **Inspect**，或在 seed 中设置
`inspectEnabled: true`：

```yaml
portalSites:
  - name: public-api
    type: RPCGW
    actorSkelName: demo.UserActor
    inspectEnabled: true
```

开关默认 `false`，仅 RPCGW 站点支持开启。Dashboard 修改会动态生效，无需重启 Portal。
查询只读且不要求身份认证，因此能访问该站点的客户端都可以读取目录。调用 API 仍遵循原有
认证和权限规则。

假设 Portal 规则把站点挂载在 `/api`：

| GET 路径 | 响应内容 |
| --- | --- |
| `/api/inspect/_list` | `{ "services": [...] }`，包含服务摘要 |
| `/api/inspect/demo.UserService/_list` | `{ "service": {...}, "methods": [...] }`，包含该服务的方法摘要 |
| `/api/inspect/demo.UserService/get` | 方法元数据、`inputSchema` 和 `outputSchema` |

`/api/inspect` 和 `/api/inspect/` 也返回服务列表。服务和方法名应使用列表返回的
`skelName`，包括版本后缀。`/api` 前缀取决于入口规则的路径映射。

响应使用 `application/json`。列表分别放在 `services` 或 `methods` 字段中，
方法详情直接返回对象。服务列表示例：

```json
{
  "services": [
    {"name": "UserService", "skelName": "demo.UserService"}
  ]
}
```

方法列表还在 `service` 字段中携带与服务目录相同的服务摘要：

```json
{
  "service": {
    "name": "UserService",
    "skelName": "demo.UserService"
  },
  "methods": [
    {"name": "get", "skelName": "get", "authMode": "required"}
  ]
}
```

只展示本站点配置且接受当前 Actor 的 API Service，不包含内部服务和其他 Actor 的 API。
摘要包含名称、描述和已声明的废弃信息；方法摘要及详情中的 `authMode`、`require` 表示调用时
最终生效的策略，详情还通过 `service` 标识所属服务。列表按 `skelName` 排序，没有匹配项时
对应字段返回空数组，如 `{ "services": [] }` 或 `{ "service": {...}, "methods": [] }`。
已注册的契约不需要后端实例在线即可查询。

### JSON Schema 格式

`inputSchema` 和 `outputSchema` 分别是独立的
[JSON Schema Draft 2020-12](https://json-schema.org/specification) 文档。
围绕它们的服务目录和方法元数据使用 Vine 自己的 inspect 响应结构。

- `inputSchema` 描述 vRPC `params` 内的命名参数对象；`outputSchema` 描述 `result`
  内的值，无返回值的方法使用 `null` Schema。Schema 不包含协议包装层。
- 每份文档包含自己的 `$schema`，并在 `$defs` 中携带引用的 Data/Enum 定义。
  本地 `$ref` 支持泛型实例和递归结构，不需要访问其他接口来解析引用。
- 非 nullable 字段列入 `required`；nullable 字段允许省略或传 `null`。
  对象允许未知字段，以保持向前兼容。
- 枚举包含声明项和生成代码的 `UNSPECIFIED` 默认项；list 是数组，map 是带有键和值约束的对象。
- 标量遵循 JSON 传输格式：decimal 是字符串，binary 是 base64 字符串；UUID、timestamp、
  local date 使用对应的标准 format。duration 使用 `1h30m0s` 这样的 Go duration 字符串；
  local time 和 local date-time 不带时区，因此不使用 JSON Schema 的 `duration` 或要求
  时区的 `time`/`date-time` format。
- 描述、废弃标记和示例转为 Schema 注解。`x-skel-type`、`x-skel-sensitive`、
  `x-skel-deprecatedReason` 保留额外的 Skel 元数据。敏感标记是注解，不是访问控制。

例如，提取方法的参数 Schema：

```bash
curl -s http://localhost:8080/api/inspect/demo.UserService/get \
  | jq '.inputSchema'
```

这些 Schema 用于描述契约，inspect 不会给 `invoke` 增加请求校验。
提取后的 Schema 可直接交给标准校验器或工具使用。

### 可用性与错误

失败时使用相应的 HTTP 状态码，响应体直接返回 `code` 和 `message`，例如：

```json
{
  "code": "SERVICE_UNAVAILABLE",
  "message": "inspect descriptors are syncing"
}
```

开关关闭、路径未知、服务或方法不在可见目录中时返回 HTTP 404。
非 GET 请求返回 HTTP 400 和 `INVALID_REQUEST`；OPTIONS 按站点 CORS 配置提供 GET 预检。

描述数据同步期间返回 HTTP 503、`SERVICE_UNAVAILABLE` 和 `Retry-After: 1`。
单方法详情在所需类型缺失或无法表示时也返回 503。响应设置 `Cache-Control: no-store`。

## MCP 工具

在 Hub Dashboard 的 RPCGW 站点上开启 **MCP**，或设置 `mcpEnabled: true`：

```yaml
portalSites:
  - name: api
    type: RPCGW
    actorSkelName: demo.UserActor
    mcpEnabled: true
```

开关默认关闭，修改后无需重启即可生效，与 Inspect 相互独立。Entry 将 `/api` 映射到本站点
根路径时，MCP 客户端的 Streamable HTTP 地址为
`https://api.example.com/api/mcp`。

入口实现 MCP `2026-07-28`。客户端必须在 `MCP-Protocol-Version` 头中发送该版本；其他取值
或缺少该头都返回 HTTP 400。客户端可先通过 `server/discover` 发现服务信息，再列出或调用
工具。响应使用 JSON，服务端不维护会话状态。入口只提供 tools，不提供 prompts、resources
或工具列表变更通知。GET 和 DELETE 返回 405。

### 发现与调用

`tools/list` 返回本站点配置且接受当前 Actor 的 API Service 工具。发现工具无需
凭据，也不要求后端实例在线。每个 API 方法对应一个工具，通常命名为
`{serviceSkelName}.{methodSkelName}`，例如 `demo.UserService.get`。
调用时使用返回的 `name`：不符合 MCP 工具名规则时改用稳定生成的标识符，`title` 保留
`Service/Method` 原始路径。列表按工具名排序，每页最多 100 项；将 `nextCursor`
作为下一次请求的 `cursor`，直到不再返回游标。

工具提供 JSON Schema 2020-12 的 `inputSchema` 和 `outputSchema`，包含所依赖的
Data 和 Enum 定义。`tools/call` 指定工具名及命名参数，例如：

```json
{
  "name": "demo.UserService.get",
  "arguments": {"id": 42}
}
```

这里展示请求的 `params` 内容，MCP 客户端负责添加协议外层和版本元数据。输入和成功
输出都会执行 schema 校验。`structuredContent` 直接包含 API 返回值，文本 `content`
提供相同的 JSON。`outputSchema` 直接描述该值，可以是标量、数组、对象或 `null`；
无返回值的方法返回 `"structuredContent": null`。

### 认证与可用性

为客户端的 HTTP `Authorization` 请求头配置与 `/api/invoke` 相同格式的 Vine
凭据。调用使用本站点的 Actor，以及方法现有的认证和权限规则。无效凭据不会退回匿名
访问，凭据不会到达业务服务。此入口不提供 OAuth 发现或自动登录。

MCP 关闭时返回 404。未知工具和协议格式错误返回协议错误；API 执行失败或工具参数
不合法时返回 `isError: true` 的工具结果。Descriptor 同步期间返回协议错误，并携带
`Retry-After: 1`；无法解析的 schema 也会报错，直到契约就绪。响应禁止缓存。

工具调用默认总时限为 30 秒，由服务端控制。`params._meta["vmcp-options"]` 接受
`"timeout=60s"` 这样的 options 字符串，最多 120 秒，语法和校验与 `vrpc-options`
一致；非法值返回 JSON-RPC Invalid Params，未知选项忽略。该选项是 Vine 扩展而非
MCP 标准字段，也不会修改客户端 SDK 自身的等待超时。请求受理后，客户端断连、调用方
deadline 和 MCP SDK 取消都不会取消后端执行；详见
[客户端取消](../framework/trace-timeout.md#client-cancellation)。

浏览器请求必须来自 Entry 自身的 Origin 或本站点 CORS 允许的 Origin。不允许或格式
错误的 Origin 返回 403，预检请求同样执行此校验。

## 相关文档

- [Hub](./hub.md)：管理 Portal entry、rule、site 与证书配置。
- [Link](./link.md)：承载目标应用的 ingress 与 endpoint 注册。
- [RPC](../infrastructure/rpc.md)：应用内部的 RPC 抽象。
