---
slug: /filetree
sidebar_label: 项目结构
---

# 项目结构

Vine 应用统一采用下面这套标准结构。项目根目录只承载一个业务边界：

```text
demo/
├── go.mod
├── go.sum
├── skel/                        # 手工维护的契约
│   ├── domain.skel
│   └── greeting_service.skel
├── skeled/                      # 契约生成代码
│   ├── golang/
│   └── typescript/
└── src/
    ├── server/
    │   ├── app/                 # Vine App 定义与依赖装配
    │   │   └── app.go
    │   ├── cmd/
    │   │   └── demo/
    │   │       └── main.go      # 进程入口
    │   ├── core/                # 业务模型、规则与接口
    │   ├── impl/                # Rpc、Web、Event、Task 适配层
    │   └── repo/                # 持久化实现
    └── web/                     # 前端 package
        ├── src/
        ├── package.json
        └── tsconfig.json
```

## 目录职责

- `skel/` 是契约的事实来源，契约修改只发生在这里。
- `skeled/` 保存从 `skel/` 生成的代码，禁止手工修改。Go 端使用
  `skeled/golang/`，Web 端使用 `skeled/typescript/`。
- `src/server/app/` 定义 Vine App，负责装配 Component、Module、handler、
  repository 和共享依赖。
- `src/server/cmd/<name>/main.go` 选择运行模式并启动进程，不承载业务逻辑。
- `src/server/core/` 放置与传输协议无关的业务模型、用例、规则和 repository 接口。
- `src/server/impl/` 把生成的 Rpc、Web、Event、Task 契约适配到 `core/` 业务逻辑。
- `src/server/repo/` 实现持久化接口，并负责数据库 record 与 core model 的映射。
- `src/web/` 放置前端 package。没有前端时可以不创建；存在前端时仍统一放在该边界内。

测试与被测源码放在一起，例如 `service_test.go` 与 `service.go` 位于同一 package。
依赖方向统一指向 `core/`：适配层和 repository 可以依赖 core 接口与模型，`core/`
不得反向依赖 `impl/` 或 `repo/`。

契约生成流程见[第一个 Skel 契约](/docs/first-skel-contract)。Skel 语法与 `skelc`
命令参考由 [Skel 文档](https://skel.yorun.ai/docs/getting-started)维护。
