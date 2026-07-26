import type {Config} from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'
import {themes as prismThemes} from 'prism-react-renderer'

const config: Config = {
  title: 'Vine',
  tagline: 'A Go application framework built around explicit contracts',
  url: 'https://vine.yorun.ai',
  baseUrl: '/',
  organizationName: 'yorun-ai',
  projectName: 'vine-site',
  onBrokenLinks: 'throw',
  future: {
    faster: {
      swcJsLoader: true,
      swcJsMinimizer: true,
      swcHtmlMinimizer: true,
      lightningCssMinimizer: true,
      mdxCrossCompilerCache: true,
      rspackBundler: true,
      rspackPersistentCache: true,
      ssgWorkerThreads: false,
      gitEagerVcs: true,
    },
  },
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'throw',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-CN'],
    localeConfigs: {
      en: {
        label: 'English',
        htmlLang: 'en',
      },
      'zh-CN': {
        label: '简体中文',
        htmlLang: 'zh-CN',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          path: './docs',
          routeBasePath: 'docs',
          sidebarPath: './sidebars.ts',
          editUrl: ({locale, docPath}) =>
            locale === 'zh-CN'
              ? `https://github.com/yorun-ai/vine-site/tree/main/i18n/zh-CN/docusaurus-plugin-content-docs/current/${docPath}`
              : `https://github.com/yorun-ai/vine-site/tree/main/docs/${docPath}`,
          showLastUpdateAuthor: false,
          showLastUpdateTime: false,
          versions: {
            current: {
              label: 'Vine next',
            },
          },
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],
  plugins: [
    ['./src/plugins/tailwind.ts', {}],
    ['./src/plugins/aliases.ts', {}],
  ],
  themes: ['@docusaurus/theme-mermaid'],

  themeConfig: {
    navbar: {
      title: 'Vine',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Documentation',
        },
        {
          href: 'https://skel.yorun.ai',
          label: 'Skel',
          position: 'left',
        },
        {
          type: 'docsVersionDropdown',
          position: 'right',
          dropdownActiveClassDisabled: true,
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: 'https://github.com/yorun-ai/vine-site',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      copyright: `Copyright © ${new Date().getFullYear()} Cartopeira Pte. Ltd.`,
    },
    prism: {
      additionalLanguages: ['go', 'bash', 'yaml', 'http', 'typescript', 'json'],
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
    mermaid: {
      theme: {
        light: 'neutral',
        dark: 'dark',
      },
      options: {
        look: 'classic',
        layout: 'dagre',
        htmlLabels: true,
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        flowchart: {
          curve: 'rounded',
          diagramPadding: 16,
          nodeSpacing: 48,
          rankSpacing: 64,
        },
      },
    },
  } satisfies Preset.ThemeConfig,
}

export default config
