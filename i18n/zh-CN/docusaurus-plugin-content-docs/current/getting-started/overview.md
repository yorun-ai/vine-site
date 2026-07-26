---
slug: /getting-started
---

# 开始使用 Vine

Vine 是一个面向 Go 应用的运行框架。它把应用生命周期、依赖注入、配置、Rpc、Web、事件、任务和基础设施组件放在同一套应用模型中，并通过 Hub、Link、Portal 支持从单进程开发平滑过渡到多进程部署。

## 你将使用哪些工具

| 工具或组件 | 作用 | 什么时候需要 |
| --- | --- | --- |
| Vine App | 启动业务应用并管理组件生命周期 | 所有应用 |
| skelc | 将 `.skel` 契约生成 Go 或 TypeScript 代码 | 定义 Rpc、Event、Task、Web 契约时 |
| Hub | 保存配置和服务注册信息 | linked 或分开部署时 |
| Link | 将应用连接到 Hub，并负责发现和转发 | linked 或分开部署时 |
| Portal | 向外部客户端提供 HTTP/HTTPS 入口 | 需要公开访问时 |

## 推荐学习路径

1. 完成 [快速开始](/docs/tutorial-first-app)，启动第一个 standalone 应用。
2. 阅读 [运行模式](/docs/deployment-modes)，选择 standalone、linked 或分开部署。
3. 通过 [应用模型](/docs/application-model) 和 [组件与模块](/docs/components) 了解装配与生命周期。
4. 使用 [skelc](https://skel.yorun.ai/docs/) 定义 Rpc、Web、Event 或 Task 契约。
5. 根据需要接入 [Redis](/docs/guide/redis)、[关系型数据库](/docs/guide/rdb) 和外部网关。

如果只是本地体验，从 standalone 开始即可；它不要求提前部署 Hub、Link 或 Portal。
