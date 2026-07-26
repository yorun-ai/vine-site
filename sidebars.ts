import type {SidebarsConfig} from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  docsSidebar: [
    'index',
    {
      type: 'category',
      label: 'Get Started',
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
      label: 'Core Concepts',
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
      label: 'Application Capabilities',
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
      label: 'Runtime and Deployment',
      items: ['runtime/mechanisms', 'runtime/hub', 'runtime/link', 'runtime/portal'],
    },
    {
      type: 'category',
      label: 'Reference',
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
