import {mkdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import type {LoadContext, Plugin} from '@docusaurus/types'
import type {
  DocMetadata,
  LoadedContent,
} from '@docusaurus/plugin-content-docs'
import {
  gettingStarted,
  guides,
  type LandingCard,
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
  const renderCards = (cards: LandingCard[]) =>
    cards
      .map(
        (card) =>
          `- [${translate(card.titleId, card.title)}](${card.to.slice(1)}.md) — ${translate(card.descriptionId, card.description)}`,
      )
      .join('\n')

  return [
    `# ${translate('homepage.title', 'Vine Developers')}`,
    '',
    translate(
      'homepage.description',
      'Build evolvable Go applications with explicit contracts.',
    ),
    '',
    `## ${translate('homepage.sections.gettingStarted', 'Getting started')}`,
    '',
    renderCards(gettingStarted),
    '',
    `## ${translate('homepage.sections.guides', 'Build and operate')}`,
    '',
    renderCards(guides),
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
