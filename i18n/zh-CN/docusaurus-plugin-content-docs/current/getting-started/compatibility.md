---
title: 兼容性
sidebar_label: 兼容性
description: Vine、Go 与 skelc 的兼容和版本固定规则。
slug: /compatibility
---

一份 Vine 构建由三个版本共同决定：Go、`go.yorun.ai/vine`，以及生成契约代码的
`skelc`。三者都应留下明确记录。如果只升级其中一个，可能导致仓库里的生成代码与
runtime 不一致。

:::warning 1.0 之前的 `next`

本站跟随 Vine 当前源码，内容可能比最新发行版更靠前；`v1.0.0` 之前不提供
逐版本文档快照。

发布应用时，请固定精确 commit 或 tag。`next` 与所选版本不一致时，以该 revision
的源码为准。

:::

## 1.0 之前如何使用文档

Vine 目前仍处于 1.0 之前。同一个 minor 版本线内的 patch 版本尽量保持向后
兼容，而新的 minor 版本可能修改公共 API、CLI 行为、配置、Skel
集成或协议。

- 基于当前源码开发：使用 `next`，并与同一个 Vine checkout 对照。
- 基于发行版构建：固定发行 tag，API 有差异时查看该 tag 的源码。
- 执行升级：在同一次审查中更新 Vine、skelc 和生成代码。

## 当前源码要求

| Vine 文档 | Go | 最低 skelc | 推荐使用的 skelc |
| --- | --- | --- | --- |
| 当前源码 / `next` | `1.26.5` 或更高 | `v0.9.0` | 与应用一起审查过的精确 revision |

当前 Vine 源码通过 `core/skel.MinSkelcVersion()` 报告最低版本 `v0.9.0`。
这是兼容下限，不是版本选择策略。生成的 schema 会记录 compiler 版本；如果版本缺失
或低于 runtime 要求，Vine 会拒绝注册该 schema。

runtime 检查没有为未来的 skelc 版本定义兼容上限。请固定已经在应用中完成
生成、审查和测试的版本。

## 固定经过审查的工具链

教程使用 `main`，因为本站描述的是当前源码。CI 或正式发布时，请把下面两个值换成
经过审查的 commit hash 或 tag：

```bash
VINE_REVISION=main
SKELC_REVISION=main

go mod edit -go=1.26.5 -toolchain=go1.26.5
go get go.yorun.ai/vine@"$VINE_REVISION"

go install go.yorun.ai/vine/cmd/vine@"$VINE_REVISION"
go install go.yorun.ai/skelc/cmd/skelc@"$SKELC_REVISION"
```

`go` directive 记录预期的语言版本，`toolchain` directive 请求使用指定
compiler。同时还应固定 CI image 或 toolchain 安装，因为已经更新的默认
toolchain 仍可能被选中。提交 `go.mod`、`go.sum`、Skel 源文件和生成代码的
变更。生产构建流水线里，请保留 `main` 或 `@latest` 之外的手段；即使应用仓库没有变更，它们
也可能解析到新的代码。

### 核对 CI 实际使用的工具

```bash
go version
vine version
vine version --json
skelc version
```

`vine version` 会输出 Vine 版本、构建平台、Go 版本和
`MinSkelcVersion`。JSON 形式适合作为 CI 的部署前检查。请确认
`go version` 报告预期的 compiler，并确认 `PATH` 中找到的 binary 就是部署
自动化实际使用的 binary。

命令参考见 [Vine CLI](./cli.md)，生成流程见
[第一个 Skel 契约](./first-contract.md)。

## 在代码中读取最低 skelc 版本

应用和构建工具可以通过公共 `core/skel` package 读取 runtime 要求：

```go
package main

import (
	"fmt"

	"go.yorun.ai/vine/core/skel"
)

func main() {
	fmt.Println(skel.MinSkelcVersion())
}
```

当前 Vine 源码的输出是：

```text
v0.9.0
```

构建系统需要比较所选 generator 与 Vine runtime 时，可读取这个值。生成
schema 仍然是最终的 runtime 检查，因此修改 Vine 或 skelc 版本后都要重新
生成并测试应用。

## 将整套版本一起升级

升级时：

1. 在一个便于审查的分支中同时修改固定的 Vine 与 skelc 版本。
2. 确认所选 Vine module 要求的 Go 版本。
3. 运行 `vine version --json`，记录它报告的最低 skelc 版本。
4. 使用选定的 skelc binary 重新生成所有维护中的契约。
5. 审查生成代码的差异，手工调整请局限在生成文件之外。
6. 运行应用测试，并在 staging 环境验证实际部署拓扑。
7. 将 Vine、生成后的应用代码和 runtime 服务作为一次兼容性变更发布。

```bash
skelc check --skel-in ./skel
skelc gen go --skel-in ./skel --go-out ./skeled
go test ./...
```

提升到生产环境之前，完成
[生产就绪清单](../operations/production-readiness.md)。Skel 语言和 generator 的详细
说明由 [Skel 文档](https://skel.yorun.ai/docs/)维护。
