---
title: Version Compatibility
sidebar_label: Compatibility
description: Choose compatible Vine, Go, and skelc versions for development and production.
slug: /compatibility
---

Vine applications depend on three versioned inputs: the Go toolchain, the
`go.yorun.ai/vine` module, and the `skelc` version that generates contract
code. Pin all three for reproducible builds.

:::warning `next` is the only maintained documentation stream before 1.0

These pages follow current Vine source and can move ahead of the latest
release. Vine does not maintain a separate documentation snapshot for each
pre-1.0 release. Release snapshots begin with `v1.0.0`.

For production before 1.0, pin the module and tools to exact release tags, then
verify examples and behavior against the source for those tags before relying
on anything documented only in `next`.

:::

## Choose a documentation stream

Use `next` to evaluate current source or contribute to Vine. Use exact release
tags and their source trees as the production baseline until versioned
documentation begins with `v1.0.0`.

| Use case | Vine source | Documentation | Recommendation |
| --- | --- | --- | --- |
| Production | Exact reviewed release tag | `Vine next` plus the selected tag's source | Pin every tool and module, then verify documented behavior against that tag |
| Current-source development | Current Vine checkout | `Vine next` | Verify examples against the same checkout before relying on them |

Vine is still before 1.0. Patch releases within the same minor line are
intended to remain backward-compatible, while a new minor release can change
public APIs, CLI behavior, configuration, Skel integration, or protocols.
Exact pins keep those upgrades explicit.

## Current compatibility matrix

| Vine | Go | Minimum skelc | Recommended pinned skelc |
| --- | --- | --- | --- |
| `v0.10.0` | `1.26.5` or later | `v0.9.0` | `v0.10.0` |
| Current source / `Vine next` | `1.26.5` or later | `v0.9.0` | Use the exact reviewed skelc version for your checkout |

Both Vine `v0.10.0` and the current source report `v0.9.0` from
`core/skel.MinSkelcVersion()`. This is a lower bound, not a recommendation to
leave the compiler unpinned. Generated schemas record their compiler version,
and Vine rejects schemas whose compiler version is missing or lower than the
runtime minimum.

The runtime check does not define an upper compatibility bound for future
skelc releases. Pin a version that your application has generated, reviewed,
and tested.

## Pin a production toolchain

For the current stable release, pin the build toolchain, module, and installed
tools:

```bash
go mod edit -go=1.26.5 -toolchain=go1.26.5
go get go.yorun.ai/vine@v0.10.0

go install go.yorun.ai/vine/cmd/vine@v0.10.0
go install go.yorun.ai/skelc/cmd/skelc@v0.10.0
```

The `go` directive records the expected language version, and the `toolchain`
directive requests the compiler. Also pin the CI image or toolchain
installation, because an already newer default toolchain can still be
selected. Commit `go.mod`, `go.sum`, the Skel sources, and the generated-code
changes. Do not use `@latest` in a production build pipeline because it
changes the resolved tool version without changing your application source.

### Verify installed tools

```bash
go version
vine version
vine version --json
skelc version
```

`vine version` reports the Vine version, build platform, Go version, and
`MinSkelcVersion`. The JSON form is suitable for a CI preflight check. Make
sure `go version` reports the intended compiler and the binary found on `PATH`
is the same binary used by deployment automation.

See [Vine CLI](./cli.md) for the command reference and
[First Skel Contract](./first-contract.md) for the generation workflow.

## Read the minimum skelc version in code

Applications and build tools can read the runtime requirement through the
public `core/skel` package:

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

For Vine `v0.10.0` and the current source, this prints:

```text
v0.9.0
```

Use this value when a build system needs to compare the selected generator
against the Vine runtime. The generated schema remains the final runtime
check, so regenerate and test the application after changing either Vine or
skelc.

## Upgrade without mixing versions

For each upgrade:

1. Change the pinned Vine and skelc versions in one reviewable branch.
2. Confirm the Go version required by the selected Vine module.
3. Run `vine version --json` and record the reported minimum skelc version.
4. Regenerate all maintained contracts with the selected skelc binary.
5. Review generated changes instead of editing generated files.
6. Run application tests and exercise the deployed topology in a staging
   environment.
7. Deploy Vine, generated application code, and runtime services as one
   compatibility change.

```bash
skelc check --skel-in ./skel
skelc gen go --skel-in ./skel --go-out ./skeled
go test ./...
```

Before promoting the result, complete the
[Production Readiness Checklist](../operations/production-readiness.md). Skel language
and generator details remain in the
[Skel documentation](https://skel.yorun.ai/docs/).
