import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import type {LoadContext, Plugin} from '@docusaurus/types'
import type {
  DocMetadata,
  LoadedContent,
} from '@docusaurus/plugin-content-docs'
import {
  governanceStages,
  guideGroups,
  vineMechanisms,
  type LocalizedCopy,
} from '../data/developerLanding'

function withoutFrontMatter(source: string): string {
  return source.replace(
    /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,
    '',
  )
}

function sourcePath(siteDir: string, source: string): string {
  return source.startsWith('@site/')
    ? path.join(siteDir, source.slice('@site/'.length))
    : source
}

function markdownOutputPath({
  baseUrl,
  outDir,
  permalink,
}: {
  baseUrl: string
  outDir: string
  permalink: string
}): string {
  const relativePermalink = permalink.startsWith(baseUrl)
    ? permalink.slice(baseUrl.length)
    : permalink.replace(/^\/+/, '')
  const relativeMarkdownPath = relativePermalink.endsWith('/')
    ? `${relativePermalink}index.md`
    : `${relativePermalink}.md`

  return path.join(outDir, relativeMarkdownPath)
}

function overviewMarkdown(
  translate: (id: string, fallback: string) => string,
): string {
  const copy = ({id, text}: LocalizedCopy) => translate(id, text)
  const renderStages = governanceStages
    .map((stage) => `**${copy(stage.title)}** \`${stage.artifact}\``)
    .join(' → ')
  const renderMechanisms = vineMechanisms
    .map((mechanism) => {
      const markers = mechanism.markers
        .map((marker) => `\`${marker}\``)
        .join(' · ')
      const links = mechanism.links
        .map((link) => `[${copy(link.title)}](${link.to.slice(1)}.md)`)
        .join(' · ')

      return [
        `### ${copy(mechanism.title)}`,
        '',
        `**${copy(mechanism.label)}** · ${markers}`,
        '',
        copy(mechanism.description),
        '',
        links,
      ].join('\n')
    })
    .join('\n\n')
  const renderGuideGroups = guideGroups
    .map(
      (group) =>
        `### ${copy(group.title)}\n\n${group.links
          .map(
            (link) =>
              `- [${copy(link.title)}](${link.to.slice(1)}.md) — ${copy(link.description)}`,
          )
          .join('\n')}`,
    )
    .join('\n\n')

  return [
    `# ${translate('homepage.title', 'Overview')}`,
    '',
    translate(
      'homepage.description',
      'Skel puts domain rules into contracts. Vine carries those rules into application assembly, calls, and runtime behavior.',
    ),
    `**${translate('homepage.description.ai', 'Together, they give AI-generated code stronger boundaries than review alone.')}**`,
    '',
    `[${translate('homepage.actions.firstContract', 'Create the first contract')}](first-skel-contract.md) · [${translate('homepage.actions.firstApplication', 'Build the first application')}](tutorial-first-app.md) · [${translate('homepage.actions.skel', 'Read the Skel overview')}](https://skel.yorun.ai/docs/overview)`,
    '',
    `## ${translate('homepage.sections.mechanisms.title', 'How Vine carries constraints into runtime')}`,
    '',
    translate(
      'homepage.sections.mechanisms.description',
      'Vine is more than an Rpc wrapper. It gives application composition, lifecycle, execution, routing, and runtime feedback one consistent model.',
    ),
    '',
    renderMechanisms,
    '',
    `## ${translate('homepage.sections.loop.title', 'The contract-to-runtime loop, in brief')}`,
    '',
    translate(
      'homepage.sections.loop.description',
      'A boundary starts in .skel, becomes generated code, joins ApplicationSpec, and runs through Vine. Tests and runtime signals carry problems back into the next change.',
    ),
    '',
    renderStages,
    '',
    `## ${translate('homepage.sections.guides.title', 'Continue reading')}`,
    '',
    translate(
      'homepage.sections.guides.description',
      'Start with the part you are changing.',
    ),
    '',
    renderGuideGroups,
    '',
    `## ${translate('homepage.status.label', 'Before 1.0')}`,
    '',
    `${translate('homepage.status.description', "Vine's public API is still stabilizing. Pin reviewed Vine and skelc revisions, and keep runtime endpoints on a trusted network.")} [${translate('homepage.status.compatibility', 'Compatibility')}](compatibility.md) · [${translate('homepage.status.production', 'Production Checks')}](production-readiness.md)`,
  ].join('\n')
}

export default function markdownPagesPlugin({
  siteDir,
  codeTranslations,
}: LoadContext): Plugin {
  let docs: DocMetadata[] = []
  const translate = (id: string, fallback: string) =>
    codeTranslations[id] ?? fallback

  return {
    name: 'vine-markdown-pages',
    allContentLoaded({allContent}) {
      const docsContent = allContent[
        'docusaurus-plugin-content-docs'
      ]?.default as LoadedContent | undefined

      docs =
        docsContent?.loadedVersions.flatMap((version) => version.docs) ??
        []
    },
    async postBuild({baseUrl, outDir}) {
      await Promise.all(
        docs.map(async (doc) => {
          const markdown =
            doc.id === 'index'
              ? overviewMarkdown(translate)
              : withoutFrontMatter(
                  await readFile(
                    sourcePath(siteDir, doc.source),
                    'utf8',
                  ),
                ).trim()
          const outputPath = markdownOutputPath({
            baseUrl,
            outDir,
            permalink: doc.permalink,
          })

          await mkdir(path.dirname(outputPath), {recursive: true})
          await writeFile(outputPath, `${markdown}\n`, 'utf8')
        }),
      )
    },
  }
}
