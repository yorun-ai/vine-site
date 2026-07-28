---
title: 版本兼容性
sidebar_label: 兼容性
description: 为开发与生产选择相互兼容的 Vine、Go 和 skelc 版本。
slug: /compatibility
---

Vine 应用依赖三个带版本的输入：Go 工具链、`go.yorun.ai/vine` module，
以及生成契约代码的 `skelc` 版本。为了让构建可复现，应固定三者的版本。

:::warning 1.0 之前只维护 `next` 文档流

这些页面跟随 Vine 当前源码，可能先于最新发行版变化。Vine 不会为每个 1.0
之前的版本分别维护文档快照；版本化文档将从 `v1.0.0` 开始。

1.0 之前用于生产环境时，应将 module 与工具固定到精确的发行 tag；如果某个
行为只出现在 `next`，依赖它之前应使用对应 tag 的源码核对并完成测试。

:::

## 选择文档版本

评估当前源码或参与 Vine 开发时使用 `next`。版本化文档从 `v1.0.0` 开始；
在此之前，生产基线应使用精确发行 tag 及其源码。

| 使用场景 | Vine 源码 | 文档 | 建议 |
| --- | --- | --- | --- |
| 生产环境 | 经过审查的精确发行 tag | `Vine next` 与所选 tag 的源码 | 固定所有工具和 module，并用该 tag 核对文档行为 |
| 当前源码开发 | 当前 Vine checkout | `Vine next` | 依赖示例前，先用同一个 checkout 验证 |

Vine 目前仍处于 1.0 之前。同一个 minor 版本线内的 patch 版本以保持向后
兼容为目标，而新的 minor 版本可能修改公共 API、CLI 行为、配置、Skel
集成或协议。精确固定版本可以让这些升级显式发生。

## 当前兼容矩阵

| Vine | Go | 最低 skelc | 建议固定的 skelc |
| --- | --- | --- | --- |
| `v0.10.0` | `1.26.5` 或更高 | `v0.9.0` | `v0.10.0` |
| 当前源码 / `Vine next` | `1.26.5` 或更高 | `v0.9.0` | 使用与当前 checkout 一起审查过的精确 skelc 版本 |

Vine `v0.10.0` 和当前源码报告的最低版本都是 `v0.9.0`，这个值来自
`core/skel.MinSkelcVersion()`。这是下限，不代表可以不固定 compiler
版本。生成的 schema 会记录 compiler 版本；如果版本缺失或低于 runtime
要求，Vine 会拒绝注册该 schema。

runtime 检查没有为未来的 skelc 版本定义兼容上限。请固定已经在应用中完成
生成、审查和测试的版本。

## 固定生产工具链

对于当前稳定发行版，固定构建 toolchain、module 和安装工具：

```bash
go mod edit -go=1.26.5 -toolchain=go1.26.5
go get go.yorun.ai/vine@v0.10.0

go install go.yorun.ai/vine/cmd/vine@v0.10.0
go install go.yorun.ai/skelc/cmd/skelc@v0.10.0
```

`go` directive 记录预期的语言版本，`toolchain` directive 请求使用指定
compiler。同时还应固定 CI image 或 toolchain 安装，因为已经更新的默认
toolchain 仍可能被选中。提交 `go.mod`、`go.sum`、Skel 源文件和生成代码的
变更。生产构建流水线不要使用 `@latest`，因为它会在应用源码未变化时改变
实际解析出的工具版本。

### 核对已安装工具

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

对于 Vine `v0.10.0` 和当前源码，输出为：

```text
v0.9.0
```

构建系统需要比较所选 generator 与 Vine runtime 时，可以读取这个值。生成
schema 仍然是最终的 runtime 检查，因此修改 Vine 或 skelc 版本后都要重新
生成并测试应用。

## 升级时避免混用版本

每次升级都应：

1. 在一个便于审查的分支中同时修改固定的 Vine 与 skelc 版本。
2. 确认所选 Vine module 要求的 Go 版本。
3. 运行 `vine version --json`，记录它报告的最低 skelc 版本。
4. 使用选定的 skelc binary 重新生成所有维护中的契约。
5. 审查生成代码的差异，不要手工修改生成文件。
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
