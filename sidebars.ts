import type {SidebarsConfig} from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: '快速开始',
      items: [
        'getting-started/overview',
        'getting-started/tutorial-first-app',
        'getting-started/first-contract',
        'getting-started/filetree',
        'getting-started/deployment-modes',
        'getting-started/cli',
      ],
    },
    {
      type: 'category',
      label: '核心概念',
      items: [
        'framework/application-model',
        'framework/components',
        'framework/di',
        'framework/meta',
        'framework/trace-timeout',
        'framework/ex',
        'framework/ctr',
      ],
    },
    {
      type: 'category',
      label: '应用能力',
      items: [
        'framework/configuration',
        'framework/rpc-guide',
        'framework/web',
        'framework/event-task',
        'framework/redis-guide',
        'framework/rdb-guide',
        'framework/logging-testing',
      ],
    },
    {
      type: 'category',
      label: '运行时与部署',
      items: ['runtime/mechanisms', 'runtime/hub', 'runtime/link', 'runtime/portal'],
    },
    {
      type: 'category',
      label: '参考',
      items: [
        'framework/app',
        'infrastructure/vrpc-http',
        'infrastructure/rpc',
        'infrastructure/redis',
        'infrastructure/rdb',
        'framework/core-packages',
      ],
    },
  ],
}

export default sidebars
