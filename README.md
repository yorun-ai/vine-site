# Vine Site

**English** | [简体中文](README.zh-CN.md)

This repository contains the public website and documentation for the Vine framework, published at [vine.yorun.ai](https://vine.yorun.ai).

Skel language and skelc documentation are maintained separately in [`skel-site`](https://github.com/yorun-ai/skel-site) and published at [skel.yorun.ai](https://skel.yorun.ai).

## Development

Prerequisites: Node.js 20 or later and pnpm.

```bash
pnpm install
pnpm dev
```

Use `pnpm dev:zh` for Simplified Chinese. Validate both locales with:

```bash
pnpm typecheck
pnpm build
```

## Versioning

Vine documentation versions follow Vine releases:

```bash
pnpm docusaurus docs:version 0.10.0
```

Do not edit generated version snapshots manually.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for documentation ownership, bilingual
content requirements, and validation steps.

## License

Vine Site is open source under the [Apache License 2.0](LICENSE).
