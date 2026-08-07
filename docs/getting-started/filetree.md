---
slug: /filetree
sidebar_label: Project Structure
---

# Project Structure

Vine applications use the following standard project structure:

```text
demo/
├── go.mod
├── go.sum
├── skel/                        # Hand-maintained contracts
│   ├── domain.skel
│   └── greeting_service.skel
├── skeled/                      # Generated contract code
│   ├── golang/
│   └── typescript/
└── src/
    ├── server/
    │   ├── app/                 # Vine App definition and dependency wiring
    │   │   └── app.go
    │   ├── cmd/
    │   │   └── demo/
    │   │       └── main.go      # Process entry point
    │   ├── core/                # Business models, rules, and interfaces
    │   ├── impl/                # Rpc, Web, Event, and Task adapters
    │   ├── repo/                # Persistence implementations
    │   └── seed/                # Project configuration
    │       └── hub.yaml         # Hub seed configuration
    └── web/                     # Frontend package
        ├── src/
        ├── package.json
        └── tsconfig.json
```

## Directory Responsibilities

- `skel/` is the source of truth for contracts. Edit contracts here.
- `skeled/` contains code generated from `skel/`. Never edit generated files
  manually. Go consumers use `skeled/golang/`; TypeScript consumers use
  `skeled/typescript/`.
- `src/server/app/` defines the Vine App and assembles Components, Modules,
  handlers, repositories, and shared dependencies.
- `src/server/cmd/<name>/main.go` selects the runtime mode and starts the
  process. Keep business logic out of the process entry point.
- `src/server/core/` contains transport-independent business models, use cases,
  rules, and repository interfaces.
- `src/server/impl/` adapts generated Rpc, Web, Event, and Task contracts to the
  business logic in `core/`.
- `src/server/repo/` implements persistence interfaces and maps database records
  to core models.
- `src/server/seed/` contains project configuration. Pass
  `src/server/seed/hub.yaml` to runtime startup as the Hub seed file so Hub can
  import it.
- `src/web/` contains the frontend package.

Keep tests beside the source they cover, such as `service_test.go` next to
`service.go`. Direct dependencies toward `core/`: adapters and repositories may
depend on core interfaces and models, while `core/` must not depend on `impl/` or
`repo/`.

For the contract generation workflow, see [First Contract](/docs/first-skel-contract).
Skel syntax and `skelc` command reference are maintained in the
[Skel documentation](https://skel.yorun.ai/docs/getting-started).
