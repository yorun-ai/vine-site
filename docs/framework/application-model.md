---
slug: /application-model
---

# 应用模型

Vine App 是业务进程的入口。它给应用一个稳定名称，声明需要的组件和模块，并选择 standalone、linked 或分开部署模式。

## 最小应用

```go title="app.go"
type CheckoutApp struct {
    app.Application
}

func (*CheckoutApp) Name() string {
    return "demo.checkout"
}
```

应用名称用于服务注册和调用链识别，同一进程中必须唯一。

## 应用可以声明什么

| 入口 | 用途 |
| --- | --- |
| `InitComponents` | 数据库、Redis 等基础设施组件 |
| `InitModules` | 跟随应用启停的业务模块 |
| `BindCommon` | 所有执行场景共享的依赖 |
| `ServicerInitHandlers` | Rpc 服务实现 |
| `WebberInitHandlers` | Web 路由实现 |
| `EventerInitListeners` | Event 监听器 |
| `TaskerInitRunners` | Task 执行器 |

只声明应用真正需要的能力。Vine 会根据这些声明创建 endpoint，并通过 Link 注册到运行时。

## 选择启动方式

```go title="main.go"
// 单进程开发
standalone.NewWithOption[*CheckoutApp](standalone.Option{
    SQLiteFile: "./vine.sqlite",
}).StartAndWait()

// 连接外部 Hub，Link 与应用同进程
linked.NewWithOption[*CheckoutApp](linked.Option{
    HubEndpoint: "http://127.0.0.1:7071",
}).StartAndWait()

// 连接独立 Link
app.NewWithOption[*CheckoutApp](app.Option{
    LinkEndpoint: "http://127.0.0.1:7079",
}).StartAndWait()
```

三种模式的取舍见 [运行模式与部署拓扑](/docs/deployment-modes)。生命周期和能力注册的细节见 [组件运行机制](/docs/runtime-mechanisms)。
