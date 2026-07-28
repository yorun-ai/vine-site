# Contributing to Vine Site

Thank you for helping improve the Vine documentation. This repository contains
the public website for the Vine framework.

## Before You Start

- Read [AGENTS.md](AGENTS.md) for the repository's documentation, ownership,
  versioning, and validation rules.
- Keep each pull request focused on one coherent documentation or site change.
- For substantial information-architecture or visual-design changes, open an
  issue or discussion before investing in the implementation.
- Do not include internal tools, private projects, credentials, deployment
  details, or other non-public information.

## Repository Scope

This repository owns Vine framework concepts, application guides, runtime and
deployment documentation, infrastructure references, and the Vine product
site. Skel language and skelc documentation belongs in
[`yorun-ai/skel-site`](https://github.com/yorun-ai/skel-site); link to
`https://skel.yorun.ai` instead of duplicating it here.

Implementation changes belong in the
[`yorun-ai/vine`](https://github.com/yorun-ai/vine) repository. Documentation
must describe behavior that exists in a released version or the current Vine
source; do not present planned APIs as available.

## Prerequisites

- Node.js 20 or later
- pnpm 11.15.1

Install dependencies and start the bilingual hot-reload development server:

```bash
pnpm install
pnpm dev
```

This command serves both locales from one local address, so edits refresh
automatically and locale switching remains available. To use fewer resources
while editing one locale, run `pnpm dev:en` or `pnpm dev:zh`; those commands
intentionally compile only one locale, and their language switcher cannot
navigate to the other locale.

## Documentation Layout

- English source documents: `docs`
- Simplified Chinese translations:
  `i18n/zh-CN/docusaurus-plugin-content-docs/current`
- Site and navigation configuration: `docusaurus.config.ts` and `sidebars.ts`
- Shared site components and styles: `src`

Update the English source and its Simplified Chinese translation in the same
pull request.
Keep filenames, document IDs, headings, examples, diagrams, and internal links
aligned between locales.

Use `/docs/...` for links within this site. Use absolute
`https://skel.yorun.ai/docs/...` links for Skel content. Check that links and
navigation work in both locales.

## Writing and Site Changes

- Prefer concrete, runnable examples over abstract placeholders.
- State version requirements when behavior depends on a particular Vine or
  skelc release.
- Keep terminology and API spelling consistent with the Vine source.
- Preserve the existing visual language and shared component patterns.
- Keep diagrams readable in both light and dark themes.
- Do not commit `node_modules`, `.docusaurus`, `build`, editor state, or local
  environment files.

For code examples that represent executable behavior, validate them against the
appropriate source repository when practical.

## Documentation Versions

Current documentation is edited first. Release snapshots are generated from the
current documentation with:

```bash
pnpm docusaurus docs:version VERSION
```

Do not manually edit generated version snapshots. Creating or updating a
snapshot should be an explicit release task.

## Validation

Before submitting a pull request, run:

```bash
pnpm install --frozen-lockfile
pnpm audit:security
pnpm typecheck
pnpm build
git diff --check
```

`pnpm build` builds both the Chinese and English sites. Review the rendered
pages when changing navigation, components, styles, Markdown structure, or
Mermaid diagrams.

## Pull Request Checklist

- The change stays within the public Vine documentation scope.
- Chinese and English documents are synchronized.
- Commands, APIs, links, and version requirements are accurate.
- Both locales build successfully.
- User-visible structural or compatibility implications are explained.
- No credentials, private information, local paths, or generated build output
  are included.

## License

Unless explicitly stated otherwise, any contribution intentionally submitted
for inclusion in Vine Site is licensed under the terms and conditions of the
[Apache License 2.0](LICENSE), in accordance with Section 5 of the license.

By submitting a contribution, you represent that you have the right to submit
it under these terms.
