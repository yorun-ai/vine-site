---
slug: /web
---

# Web

The Web capability registers HTTP routes, static assets, or reverse-proxy endpoints for an application. `.skel` declares the Web name and Actors allowed to access it, while Go handlers define the actual routes.

## Declare an entry point

```skel title="web.skel"
web UserPortalWeb {
    for ClientActor via client
}
```

After generating code, implement the corresponding Web server and register routes in `Routes`:

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

Enable the Web capability and register the handler in the application:

```go title="app.go"
type DemoApp struct {
    app.Application
    app.WebberEnabled
}

func (*DemoApp) WebberInitHandlers(add app.TypeAdder) {
    add(app.T[*UserPortal]())
}
```

Vine registers the Web capability with Link, and Portal discovers the endpoint from its site rules and forwards external requests.

## Request path

```mermaid
flowchart LR
  Client["Client"] --> Portal["Portal site and access control"] --> Link["Link Web proxy"] --> Handler["Application Web handler"]
```

Standalone mode uses the same matching and forwarding behavior, but its endpoint is an in-process connection. Use `web.NewAssetsServer` to serve static assets, or `web.NewReverseProxy` to forward to an existing backend.

See [Portal](/docs/portal) for Portal configuration and [Skel Syntax](https://skel.yorun.ai/docs/syntax) for Actor and Web syntax.
