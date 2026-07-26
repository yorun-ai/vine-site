# Vine Site Agent Guidelines

## Project Scope

- This repository is the public site for the Vine framework.
- It owns Vine product pages, application guides, framework concepts, runtime and deployment documentation, infrastructure references, and release documentation.
- Skel language and skelc documentation belong to `skel-site`. Link to `https://skel.yorun.ai` instead of duplicating them here.
- Internal tools and non-public projects must not appear in public content, navigation, examples, release notes, or architecture diagrams.
- Keep implementation-specific source documentation in the owning source repository.

## Documentation Ownership

- English source documents live under `docs`.
- Simplified Chinese translations live under
  `i18n/zh-CN/docusaurus-plugin-content-docs/current`.
- Keep English source documents and their Simplified Chinese translations
  synchronized.
- Cross-product tutorials may show the complete workflow, but language rules and skelc command reference remain owned by `skel-site`.

## Versioning

- Site documentation versions follow Vine releases.
- Create snapshots with `pnpm docusaurus docs:version VERSION`.
- Do not manually edit generated version snapshots. Correct current documentation first, then create a new snapshot.
- Compatibility documentation must state the relevant Vine and skelc versions when behavior depends on both.

## Site Development

- Preserve the existing visual language and local Tailwind/shadcn theme implementation.
- Keep links valid in both locales. Use `/docs/...` for this site and absolute `https://skel.yorun.ai/docs/...` links for Skel content.
- Do not document planned APIs, commands, flags, or behavior as available.
- Run `pnpm typecheck`, `pnpm build`, and `git diff --check` after changes.
