---
slug: /filetree
sidebar_label: Project Structure
---

# Project Structure

Vine applications use the following standard project structure:

```text
demo/
├── skel/                        # Hand-maintained contracts
│   ├── domain.skel
│   └── greeting_service.skel
├── skeled/                      # Generated contract code
│   ├── golang/                  # Generated Go module
│   │   └── go.mod
│   └── typescript/
└── src/
    ├── server/
    │   ├── go.mod               # Backend module; replaces the generated module locally
    │   ├── go.sum
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
  manually. Go consumers use the generated module at `skeled/golang/`;
  TypeScript consumers use `skeled/typescript/`.
- `src/server/go.mod` and `src/server/go.sum` define the backend Go module. Run
  Go module, build, and test commands from `src/server/`. The backend module
  requires the generated Go module and maps its module path to
  `../../skeled/golang` with a local `replace` directive.
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
- `src/server/seed/` contains project configuration. Provide
  `src/server/seed/hub.yaml` to the runtime at startup as the Hub seed file.
- `src/web/` contains the frontend package.

For example, when `skeled/golang/go.mod` declares
`example.com/demo/skeled/golang`, the backend module includes:

```go title="src/server/go.mod"
require example.com/demo/skeled/golang v0.0.0

replace example.com/demo/skeled/golang => ../../skeled/golang
```

Use the generated module path declared by your project in both lines.

Keep tests next to the source they cover, such as `service_test.go` alongside
`service.go`. Keep dependencies pointing toward `core/`: adapters and
repositories may depend on core interfaces and models, but `core/` must not
depend on `impl/` or `repo/`.

For the contract generation workflow, see [First Contract](/docs/first-skel-contract).
Skel syntax and `skelc` command reference are maintained in the
[Skel documentation](https://skel.yorun.ai/docs/getting-started).
