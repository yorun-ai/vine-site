---
slug: /web
---

# Web

Web 能力用于为应用注册 HTTP 路由、静态资源或反向代理入口。`.skel` 负责声明 Web 名称和允许访问的 Actor，Go handler 负责具体路由。

## 声明入口

```skel title="web.skel"
web UserPortalWeb {
    for ClientActor via client
}
```

生成代码后，实现对应的 Web server，并在 `Routes` 中注册路由：

```go title="web.go"
type UserPortal struct {
    skeled.DefaultUserPortalWebServer
    Context *gin.Context `inject:""`
}

func (h *UserPortal) Routes(router *web.Router) {
    router.GET("/health", h.Health)
}

func (h *UserPortal) Health() {
    h.Context.JSON(200, map[string]string{"status": "ok"})
}
```

在应用中启用 Web 能力并注册 handler：

```go title="app.go"
type DemoApp struct {
    app.Application
    app.WebberEnabled
}

func (*DemoApp) WebberInitHandlers(add app.TypeAdder) {
    add(app.T[*UserPortal]())
}
```

Vine 将 Web 能力注册到 Link；Portal 根据站点规则发现 endpoint 并转发外部请求。

## 请求路径

```mermaid
flowchart LR
  Client["客户端"] --> Portal["Portal 站点与准入"] --> Link["Link Web proxy"] --> Handler["应用 Web handler"]
```

standalone 模式仍走相同的匹配与转发逻辑，但 endpoint 使用进程内连接。静态资源可通过 `web.NewAssetsServer` 提供，转发已有后端可使用 `web.NewReverseProxy`。

Portal 配置见 [Portal](/docs/portal)，Actor 与 Web 语法见 [Skel 语法](https://skel.yorun.ai/docs/syntax)。
