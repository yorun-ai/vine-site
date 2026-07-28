import type {SidebarsConfig} from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Start Here',
      items: [
        'getting-started/overview',
        'getting-started/compatibility',
        'getting-started/tutorial-first-app',
        'getting-started/first-contract',
        'getting-started/filetree',
      ],
    },
    {
      type: 'category',
      label: 'Build with Vine',
      items: [
        'framework/application-model',
        'framework/components',
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
      label: 'How Vine Works',
      items: [
        'runtime/mechanisms',
        'runtime/application-lifecycle',
        'runtime/execution-model',
        'runtime/request-routing',
        'framework/trace-timeout',
      ],
    },
    {
      type: 'category',
      label: 'Deploy and Operate',
      items: [
        'getting-started/deployment-modes',
        'operations/production-readiness',
        'runtime/hub',
        'runtime/link',
        'runtime/portal',
        'getting-started/cli',
      ],
    },
    {
      type: 'category',
      label: 'Reference',
      items: [
        'framework/core-packages',
        'framework/app',
        'framework/di',
        'framework/ctr',
        'framework/meta',
        'framework/ex',
        'infrastructure/rpc',
        'infrastructure/vrpc-http',
        'infrastructure/redis',
        'infrastructure/rdb',
      ],
    },
  ],
}

export default sidebars
