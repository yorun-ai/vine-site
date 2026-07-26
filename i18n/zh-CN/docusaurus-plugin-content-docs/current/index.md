---
sidebar_position: 1
slug: /
---

# Vine 文档

Vine 是面向 Go 应用的框架。本文档帮助你从创建应用开始，逐步使用配置、服务调用、异步任务和外部访问能力。

## 开始使用

- [了解 Vine](/docs/getting-started)：认识 App、Hub、Link、Portal 和 skelc。
- [启动第一个应用](/docs/tutorial-first-app)：在一个进程中启动完整 Vine runtime。
- [创建第一个 Skel 契约](/docs/first-skel-contract)：校验契约并生成类型安全代码。
- [运行模式与部署拓扑](/docs/deployment-modes)：选择 standalone、linked 或完全分开部署。
- [命令行](/docs/cli)：安装 `vine`、查看版本并启动运行时服务。
- [项目目录结构](/docs/filetree)：了解 Vine 应用和模块的推荐结构。

## 核心概念

- [应用模型](/docs/application-model)：理解 App、Module、Portal、Link 和 Hub 如何组成一个应用。
- [组件与模块](/docs/components)：组织业务能力和生命周期资源。
- [依赖注入](/docs/di)：scope、binding 与 execution。
- [上下文元信息](/docs/meta)：trace、initiator 与 actor。
- [错误处理](/docs/ex)：统一错误码和 recover 约定。
- [执行容器](/docs/ctr)：filter 链和方法执行。

## 应用能力

- [应用配置](/docs/configuration)：从 Skel 声明到运行时注入。
- [Rpc](/docs/guide/rpc)：声明服务、实现方法并完成一次调用。
- [Web](/docs/web)：注册路由、静态资源和外部入口。
- [Event 与 Task](/docs/events-and-tasks)：异步消息、任务和调度。
- [Redis](/docs/guide/redis)：配置连接并注入类型安全的 Redis 能力。
- [关系型数据库](/docs/guide/rdb)：配置数据源、事务和数据库访问。
- [日志与测试](/docs/logging-and-testing)：结构化日志和 standalone 集成测试。

## 运行时与部署

- [组件运行机制](/docs/runtime-mechanisms)：启动、注册、发现、配置、消息投递和优雅停止。
- [Hub](/docs/hub)：配置、服务注册与运行时分发。
- [Link](/docs/link)：应用接入、服务发现与本地能力运行。
- [Portal](/docs/portal)：外部 HTTP / HTTPS、Rpc 与 Web 网关。
- [运行模式与部署拓扑](/docs/deployment-modes)：选择 standalone、linked 或完全分开部署。

## Skel 与代码生成

- [skelc 文档](https://skel.yorun.ai/docs/)：安装、语言参考、CLI、代码生成与运行时类型。

## API 与实现参考

完成入门教程后，可继续查阅 [App](/docs/app)、[Rpc](/docs/rpc)、[Redis](/docs/redis)、[RDB](/docs/rdb) 和 [框架包索引](/docs/core-packages) 的完整参考。
