export type LandingIcon =
  | 'badge-check'
  | 'blocks'
  | 'braces'
  | 'layers'
  | 'network'
  | 'package'
  | 'rocket'
  | 'server'
  | 'shield'
  | 'terminal'

export type LandingCard = {
  titleId: string
  title: string
  descriptionId: string
  description: string
  to: string
  icon: LandingIcon
}

export const gettingStarted: LandingCard[] = [
  {
    titleId: 'homepage.cards.quickStart.title',
    title: 'Quick start',
    descriptionId: 'homepage.cards.quickStart.description',
    description:
      'Create a minimal Vine application and learn its core structure.',
    to: '/tutorial-first-app',
    icon: 'rocket',
  },
  {
    titleId: 'homepage.cards.applicationModel.title',
    title: 'Application model',
    descriptionId: 'homepage.cards.applicationModel.description',
    description:
      'Understand applications, components, modules, and lifecycle.',
    to: '/application-model',
    icon: 'layers',
  },
  {
    titleId: 'homepage.cards.dependencyInjection.title',
    title: 'Dependency injection',
    descriptionId: 'homepage.cards.dependencyInjection.description',
    description:
      'Connect capabilities through explicit, testable dependencies.',
    to: '/di',
    icon: 'network',
  },
  {
    titleId: 'homepage.cards.compatibility.title',
    title: 'Versions and compatibility',
    descriptionId: 'homepage.cards.compatibility.description',
    description:
      'Pin compatible Vine, Go, and skelc versions before building.',
    to: '/compatibility',
    icon: 'badge-check',
  },
]

export const guides: LandingCard[] = [
  {
    titleId: 'homepage.cards.rpc.title',
    title: 'RPC services',
    descriptionId: 'homepage.cards.rpc.description',
    description:
      'Define and call services with consistent runtime contracts.',
    to: '/guide/rpc',
    icon: 'braces',
  },
  {
    titleId: 'homepage.cards.web.title',
    title: 'Web applications',
    descriptionId: 'homepage.cards.web.description',
    description:
      'Build HTTP endpoints while keeping business code independent.',
    to: '/web',
    icon: 'terminal',
  },
  {
    titleId: 'homepage.cards.events.title',
    title: 'Events and tasks',
    descriptionId: 'homepage.cards.events.description',
    description:
      'Run asynchronous workflows using events and background tasks.',
    to: '/events-and-tasks',
    icon: 'blocks',
  },
  {
    titleId: 'homepage.cards.runtime.title',
    title: 'Runtime and deployment',
    descriptionId: 'homepage.cards.runtime.description',
    description:
      'Move from a local process to distributed Vine runtimes.',
    to: '/runtime-mechanisms',
    icon: 'server',
  },
  {
    titleId: 'homepage.cards.production.title',
    title: 'Production readiness',
    descriptionId: 'homepage.cards.production.description',
    description:
      'Review security, shutdown, observability, and failure behavior.',
    to: '/production-readiness',
    icon: 'shield',
  },
  {
    titleId: 'homepage.cards.packages.title',
    title: 'Package reference',
    descriptionId: 'homepage.cards.packages.description',
    description:
      'Browse the framework packages and their responsibilities.',
    to: '/core-packages',
    icon: 'package',
  },
]
