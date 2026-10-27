import type {DocMetadata} from '@docusaurus/plugin-content-docs'

/** Build each locale's index from the same metadata as the published docs. */
export function llmsText(
  docs: DocMetadata[],
  origin: string,
  baseUrl: string,
  locale: string,
): string {
  const zh = locale === 'zh-CN'
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim()
  const entries = [...docs]
    .sort((a, b) => a.permalink.localeCompare(b.permalink))
    .map((doc) => {
      const markdownPath = doc.permalink.endsWith('/')
        ? `${doc.permalink}index.md`
        : `${doc.permalink}.md`
      const title = clean(doc.title).replace(/([\[\]\\])/g, '\\$1')
      const description =
        typeof doc.frontMatter.description === 'string'
          ? `: ${clean(doc.frontMatter.description)}`
          : ''
      return `- [${title}](${new URL(markdownPath, origin).href})${description}`
    })

  return [
    '# Vine',
    '',
    `> ${zh ? 'Vine 是基于显式契约的 Apache-2.0 Go 应用框架，将应用生命周期、依赖注入、配置、Rpc、Web、Event、Task、Redis 和关系数据库纳入同一个应用模型。' : 'Vine is an Apache-2.0 Go application framework built around explicit contracts. It brings application lifecycle, dependency injection, configuration, Rpc, Web, Event, Task, Redis and relational databases into one application model.'}`,
    '',
    zh
      ? '从独立运行的应用开始。Hub 管理配置与注册信息，Link 负责发现和投递，Portal 提供对外 HTTP/HTTPS 入口。部署指南说明如何拆分这些运行时服务，而不重写业务代码。'
      : 'Start with a standalone application. Hub manages configuration and registry information, Link handles discovery and delivery, and Portal provides the external HTTP/HTTPS entry. Deployment guides explain how to separate these runtime services without rewriting business code.',
    '',
    zh
      ? '本站维护应用指南、框架概念、运行时拓扑与部署说明。Skel 语法、编译器命令和生成契约的详细说明由 Skel 文档维护。'
      : 'This site owns application guides, framework concepts, runtime topology and deployment. Skel syntax, compiler commands and generated contract details belong to the Skel documentation.',
    '',
    zh
      ? '1.0 之前仅维护当前 next 文档，内容跟踪当前源码，可能领先于最新发布版本。请固定经过验证的工具链版本，并在升级前阅读兼容性说明。'
      : 'Before 1.0, only current next documentation is maintained. It tracks current source and may be ahead of the latest release. Pin reviewed toolchain revisions and consult the compatibility guide before upgrading.',
    '',
    zh
      ? '下列链接指向已发布文档的 Markdown 导出版本。'
      : 'The links below point to Markdown exports of the published documentation.',
    '',
    zh ? '## 文档' : '## Documentation',
    '',
    ...entries,
    '',
    '## Optional',
    '',
    `- [Skel and skelc](https://skel.yorun.ai/): ${zh ? '相关项目的官方文档。' : 'Official documentation for the related project.'}`,
    `- [Yorun](https://www.yorun.ai/): ${zh ? '商业产品工作台；其开放状态以官网说明为准。' : 'The commercial product workbench; consult its website for availability.'}`,
    `- [${zh ? 'English' : '中文'}](${new URL(zh ? '/llms.txt' : '/zh-CN/llms.txt', origin).href}): ${zh ? '英文文档索引。' : 'Chinese documentation index.'}`,
    `- [Sitemap](${new URL(`${baseUrl}sitemap.xml`, origin).href}): ${zh ? '本站页面索引。' : 'Published site pages.'}`,
    '',
  ].join('\n')
}
