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

`pnpm dev` starts both locales with hot reload behind one local address, so
edits refresh automatically and the language switcher works as it does in
production. Use `pnpm dev:en` or `pnpm dev:zh` for a lower-overhead,
single-locale server; its language switcher cannot leave the compiled locale.

Validate both locales with:

```bash
pnpm typecheck
pnpm build
```

## Deployment

Production deployments run automatically from `main` through Cloudflare
Workers Builds.

`pnpm build` generates the static site in `build`. `wrangler.jsonc` is the
source of truth for the Worker configuration, 404 fallback, and the
`vine.yorun.ai` custom domain.

Deploying to production requires authorized Cloudflare credentials.
Contributors do not need Cloudflare access to build or preview the site locally.

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
