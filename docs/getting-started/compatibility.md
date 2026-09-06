---
title: Compatibility
sidebar_label: Compatibility
description: Compatibility and pinning rules for Vine, Go, and skelc.
slug: /compatibility
---

Three versions define a Vine build: Go, `go.yorun.ai/vine`, and the `skelc`
binary that generated the contract code. Record all three. Upgrading only one
can leave checked-in generated code out of step with the runtime.

:::warning What `next` means before 1.0

This site tracks current Vine source. It can move ahead of the latest release,
and there are no per-release documentation snapshots before `v1.0.0`.

For a released application, pin an exact commit or tag and treat that source as
the final word when `next` differs.

:::

## Documentation before 1.0

Vine hasn't reached 1.0 yet. Patch releases within the same minor line are meant
to stay backward-compatible, while a new minor release can change public APIs,
CLI behavior, configuration, Skel integration, or protocols.

- Working from current source: use `next` and the same Vine checkout.
- Building from a release: pin the release tag and check changed APIs against
  that tag.
- Upgrading: update Vine, skelc, and generated code together in one review.

## Current source requirements

| Vine documentation | Go | Minimum skelc | skelc to use |
| --- | --- | --- | --- |
| Current source / `next` | `1.26.6` or later | `v0.9.0` | The exact revision reviewed with the application |

Current Vine source reports `v0.9.0` from
`core/skel.MinSkelcVersion()`. This is a lower bound, not a version-selection
policy. Generated schemas record their compiler version, and Vine rejects a
schema whose compiler version is missing or below the runtime minimum.

The runtime check doesn't set an upper compatibility bound for future skelc
releases. Pin a version your application has generated, reviewed, and tested.

## Pin a reviewed toolchain

The tutorials use `main` because this site documents current source. For CI or a
release, replace both values below with reviewed commit hashes or tags:

```bash
VINE_REVISION=main
SKELC_REVISION=main

go -C ./src/server mod edit -go=1.26.6 -toolchain=go1.26.6
go -C ./src/server get go.yorun.ai/vine@"$VINE_REVISION"

go install go.yorun.ai/vine/cmd/vine@"$VINE_REVISION"
go install go.yorun.ai/skelc/cmd/skelc@"$SKELC_REVISION"
```

The `go` directive records the expected language version, and the `toolchain`
directive requests the compiler. Pin the CI image or toolchain installation as
well, since an already newer default toolchain can still end up selected. Commit
`src/server/go.mod`, `src/server/go.sum`, the Skel sources, and the generated-code
changes. Never leave `main` or `@latest` in a production build pipeline: either
can resolve to new code without a change to the application repository.

### Check the tools CI will use

```bash
go version
vine version
vine version --json
skelc version
```

`vine version` reports the Vine version, build platform, Go version, and
`MinSkelcVersion`. The JSON form works well for a CI preflight check. Make sure
`go version` reports the intended compiler and that the binary found on `PATH` is
the same one used by deployment automation.

See [Vine CLI](./cli.md) for the command reference and
[First Skel Contract](./first-contract.md) for the generation workflow.

## Read the minimum skelc version in code

Applications and build tools can read the runtime requirement through the public
`core/skel` package:

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

For current Vine source, this prints:

```text
v0.9.0
```

Use this value when a build system needs to compare the selected generator
against the Vine runtime. The generated schema is still the final runtime check,
so regenerate and test the application after changing either Vine or skelc.

## Upgrade the set together

For an upgrade:

1. Change the pinned Vine and skelc versions in one reviewable branch.
2. Confirm the Go version required by the selected Vine module.
3. Run `vine version --json` and record the reported minimum skelc version.
4. Regenerate all maintained contracts with the selected skelc binary.
5. Review generated changes instead of editing generated files.
6. Run application tests and exercise the deployed topology in a staging
   environment.
7. Release Vine, generated application code, and runtime services as one
   compatibility change.

```bash
skelc check --skel-in ./skel
skelc gen go --skel-in ./skel --go-out ./skeled/golang
go -C ./src/server test ./...
```

Before promoting the result, complete the
[Production Readiness Checklist](../operations/production-readiness.md). Skel language
and generator details remain in the
[Skel documentation](https://skel.yorun.ai/docs/).

## Skel struct tags in unreleased Vine

Current unreleased Vine accepts comma-separated `skel` field attributes. Config
readers interpret `noTrim`; Rpc argument registration interprets `index(n)`;
redaction recognizes `sensitive` independently of the other attributes.
`core/skel.HasTagFlag` and `core/skel.TagIndex` expose the same tag parsing for
custom Go integrations; the index helper does not read legacy `arg` tags.

Argument indexes remain zero-based, unique, and contiguous. Legacy `arg:"n"`
tags remain supported; if both forms are present, they must agree. Missing,
malformed, duplicate, conflicting, or out-of-range indexes fail registration.
These Go tags do not change JSON or CBOR field names or wire formats.

This runtime support does not require raising the minimum skelc version.
Existing generated code remains supported. Generator changes for the new tags
are separate: upgrade Vine before generating `index(n)` or combined attributes.
Older Vine cannot resolve index-only arguments, ignores `noTrim`, and does not
recognize `sensitive` when combined with other attributes.
