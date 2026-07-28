---
slug: /filetree
sidebar_label: 项目结构
---

# 项目结构

Vine 是 Go 应用框架，不要求专用的项目清单或固定目录。一个可以运行的 Vine 应用本质上只是普通 Go module，最小结构如下：

```text
demo/
├── go.mod
├── go.sum
└── main.go               # 定义应用并选择 standalone、linked 或 app 运行模式
```

项目变大后，可以把启动、应用装配、业务代码和基础设施分开：

```text
demo/
├── go.mod
├── go.sum
├── cmd/
│   └── demo/
│       └── main.go       # 进程入口，只负责参数与运行模式
├── internal/
│   ├── application/
│   │   ├── app.go        # ApplicationSpec、应用名称与公共绑定
│   │   ├── components.go # 数据库、Redis 等 InitComponents 装配
│   │   └── modules.go    # 业务 Module 的 InitModules 装配
│   ├── account/
│   │   ├── module.go     # account 业务生命周期
│   │   ├── service.go    # 业务逻辑
│   │   ├── rpc.go        # Rpc handler
│   │   ├── web.go        # Web handler
│   │   ├── event.go      # Event listener
│   │   └── task.go       # Task runner
│   ├── booking/
│   │   └── ...           # 另一个业务模块
│   └── platform/
│       ├── database.go   # rdb.Database 实现与配置
│       └── redis.go      # redis.Redis 实现与配置
├── config/               # 可选：应用自己的配置文件
├── migrations/           # 可选：数据库迁移
└── web/                  # 可选：独立前端项目
```

这只是适合中型项目的起点，不是框架约束。小项目可以把 `Application`、组件和模块都放在 `main.go`；大型项目也可以按团队现有的 Go 工程规范继续拆分。

## 目录职责

- `cmd/<name>/main.go`：选择 `app`、`linked` 或 `standalone` 构造器并启动进程，不承载业务逻辑。
- `internal/application/`：定义应用规格，集中注册组件、模块和应用级依赖。
- `internal/<business>/`：按业务能力组织 Module、服务以及 Rpc、Web、Event、Task 入口。
- `internal/platform/`：数据库、Redis 和其他基础设施组件。
- `config/`、`migrations/`、`web/`：由应用按需增加，不是 Vine 必需目录。

Go 测试应与被测源码放在同一 package，例如 `service.go` 对应 `service_test.go`，不需要单独创建测试目录。

## 可选的 Skel 契约

使用 Skel 时，可以在仓库中另外维护 `skel/` 和生成代码目录；具体布局由 skelc 配置和团队约定决定，Vine 不要求它们位于某个业务 domain 下。

```text
demo/
├── skel/                 # 可选：手工维护的契约
└── skeled/               # 可选：skelc 生成代码
```

生成目录不要手工修改。完整流程见[创建第一个 Skel 契约](./first-contract.md)。
