---
slug: /first-skel-contract
sidebar_label: First Contract
---

# First Skel Contract

Begin with one Greeting service. `skelc` checks the contract and generates its
Go types, server interface, and client. The generated code is the handoff point
to the [Rpc guide](../framework/rpc-guide.md), where the Vine handler is
implemented.

## Install skelc

```bash
go install go.yorun.ai/skelc/cmd/skelc@main
skelc version
```

`@main` keeps this example aligned with the `next` documentation. A released
application should install a reviewed commit or tag instead, record the
selected `skelc version`, and regenerate contracts only as an explicit change.
See [Version Compatibility](./compatibility.md).

## Create the Contract Directory

From the parent directory where you want the example:

```bash
mkdir -p greeting/skel
cd greeting
```

```text
greeting/
├── skel/
│   ├── domain.skel
│   └── greeting.skel
└── skeled/
```

```skel title="skel/domain.skel"
@desc("Greeting example")
domain demo.greeting
```

```skel title="skel/greeting.skel"
domain demo.greeting

pub data Greeting {
    message: string
}

pub service GreetingService {
    noauth

    method hello {
        input {
            name: string
        }
        output Greeting
    }
}
```

## Validate the Contract

```bash
skelc check --skel-in ./skel
```

If the command exits without an error, the domain, type references, names, and public contract rules are valid. Inspect the symbols recognized by the generator:

```bash
skelc symbol list --skel-in ./skel
```

The output should include:

```text
pub  data     demo.greeting.Greeting
pub  service  demo.greeting.GreetingService
```

## Generate Go Code

```bash
skelc gen go \
  --skel-in ./skel \
  --go-out ./skeled
```

The output directory contains data models, schemas, and service code. A server
implementation outside the generated package must embed
`DefaultGreetingServiceServer`: the generated interface has a package-private
seal method, so another package cannot implement it from scratch. Calls use the
generated client. Regeneration replaces these files; make contract changes in
`.skel`, not in the generated Go.

```mermaid
flowchart LR
  Skel[".skel contract"] --> Check["skelc check"] --> Generate["skelc gen go"] --> Code["Types, Server, Client, Schema"]
```

## Next Steps

- Read [Using Rpc](../framework/rpc-guide.md) to register the generated service implementation with a Vine App.
- Read [Skel syntax](https://skel.yorun.ai/docs/syntax) to continue defining actors, permissions, events, Web endpoints, and tasks.
- When you need separate regular/pub modules, see the [skelc guide](https://skel.yorun.ai/docs/getting-started).
