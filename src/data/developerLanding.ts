export type LocalizedCopy = {
  id: string
  text: string
}

export type DocLink = {
  title: LocalizedCopy
  to: string
}

export type GovernanceStage = {
  title: LocalizedCopy
  description: LocalizedCopy
  artifact: string
}

export type MechanismIcon =
  | 'composition'
  | 'lifecycle'
  | 'execution'
  | 'exposure'
  | 'feedback'
  | 'topology'

export type VineMechanism = {
  icon: MechanismIcon
  label: LocalizedCopy
  title: LocalizedCopy
  description: LocalizedCopy
  markers: string[]
  links: DocLink[]
}

export type GuideLink = DocLink & {
  description: LocalizedCopy
}

export type GuideGroup = {
  icon: 'contract' | 'application' | 'runtime'
  title: LocalizedCopy
  description: LocalizedCopy
  links: GuideLink[]
}

export type RuntimeRole = {
  icon: 'hub' | 'portal' | 'link' | 'application'
  title: LocalizedCopy
  description: LocalizedCopy
}

export const runtimeRoles: RuntimeRole[] = [
  {
    icon: 'hub',
    title: {id: 'homepage.runtime.hub.title', text: 'Hub'},
    description: {
      id: 'homepage.runtime.hub.description',
      text: 'Config & registry',
    },
  },
  {
    icon: 'portal',
    title: {id: 'homepage.runtime.portal.title', text: 'Portal'},
    description: {
      id: 'homepage.runtime.portal.description',
      text: 'External entry & policy',
    },
  },
  {
    icon: 'link',
    title: {id: 'homepage.runtime.link.title', text: 'Link'},
    description: {
      id: 'homepage.runtime.link.description',
      text: 'Discovery & delivery',
    },
  },
  {
    icon: 'application',
    title: {
      id: 'homepage.runtime.application.title',
      text: 'Application',
    },
    description: {
      id: 'homepage.runtime.application.description',
      text: 'Business execution',
    },
  },
]

export const governanceStages: GovernanceStage[] = [
  {
    title: {id: 'homepage.loop.declare.title', text: 'Declare'},
    description: {
      id: 'homepage.loop.declare.description',
      text: 'Capture the domain boundary.',
    },
    artifact: '.skel',
  },
  {
    title: {id: 'homepage.loop.validate.title', text: 'Validate'},
    description: {
      id: 'homepage.loop.validate.description',
      text: 'Reject invalid contracts early.',
    },
    artifact: 'skelc check',
  },
  {
    title: {id: 'homepage.loop.generate.title', text: 'Generate'},
    description: {
      id: 'homepage.loop.generate.description',
      text: 'Produce typed Go boundaries.',
    },
    artifact: 'skelc gen',
  },
  {
    title: {id: 'homepage.loop.assemble.title', text: 'Assemble'},
    description: {
      id: 'homepage.loop.assemble.description',
      text: 'Declare application capabilities.',
    },
    artifact: 'ApplicationSpec',
  },
  {
    title: {id: 'homepage.loop.execute.title', text: 'Execute'},
    description: {
      id: 'homepage.loop.execute.description',
      text: 'Apply scopes, filters, and routing.',
    },
    artifact: 'Vine runtime',
  },
  {
    title: {id: 'homepage.loop.verify.title', text: 'Verify'},
    description: {
      id: 'homepage.loop.verify.description',
      text: 'Feed tests and signals back.',
    },
    artifact: 'tests + ops',
  },
]

export const vineMechanisms: VineMechanism[] = [
  {
    icon: 'composition',
    label: {id: 'homepage.mechanisms.composition.label', text: 'Composition'},
    title: {
      id: 'homepage.mechanisms.composition.title',
      text: 'Application composition is explicit',
    },
    description: {
      id: 'homepage.mechanisms.composition.description',
      text: 'ApplicationSpec lists components, modules, and capabilities. DI validates bindings and separates application singletons from execution-scoped state.',
    },
    markers: ['ApplicationSpec', 'DI', 'Component', 'Module'],
    links: [
      {
        title: {
          id: 'homepage.links.applicationModel',
          text: 'Application Model',
        },
        to: '/application-model',
      },
      {
        title: {
          id: 'homepage.links.dependencyInjection',
          text: 'Dependency Injection',
        },
        to: '/di',
      },
    ],
  },
  {
    icon: 'lifecycle',
    label: {id: 'homepage.mechanisms.lifecycle.label', text: 'Lifecycle'},
    title: {
      id: 'homepage.mechanisms.lifecycle.title',
      text: 'Readiness and shutdown have an order',
    },
    description: {
      id: 'homepage.mechanisms.lifecycle.description',
      text: 'Components start before modules, and readiness-critical work completes before registration. During shutdown, BeforeAppStop runs in reverse ownership order; Link then unregisters and drains traffic before AfterAppStop releases resources.',
    },
    markers: ['BeforeAppStart', 'Register', 'Drain', 'AfterAppStop'],
    links: [
      {
        title: {id: 'homepage.links.lifecycle', text: 'Lifecycle'},
        to: '/application-lifecycle',
      },
      {
        title: {
          id: 'homepage.links.routing',
          text: 'Routing & Readiness',
        },
        to: '/request-routing',
      },
    ],
  },
  {
    icon: 'execution',
    label: {id: 'homepage.mechanisms.execution.label', text: 'Execution'},
    title: {
      id: 'homepage.mechanisms.execution.title',
      text: 'Every call gets the same execution boundary',
    },
    description: {
      id: 'homepage.mechanisms.execution.description',
      text: 'Execution containers provide scoped dependencies. Filters wrap the target; Meta carries trace, caller, actor, cancellation, and deadline; structured errors cross the boundary explicitly.',
    },
    markers: ['Container', 'Filter', 'Meta', 'Trace', 'Timeout', 'Error'],
    links: [
      {
        title: {
          id: 'homepage.links.executionModel',
          text: 'Execution Model',
        },
        to: '/execution-model',
      },
      {
        title: {
          id: 'homepage.links.contextIdentity',
          text: 'Context & Identity',
        },
        to: '/meta',
      },
    ],
  },
  {
    icon: 'exposure',
    label: {id: 'homepage.mechanisms.exposure.label', text: 'Exposure'},
    title: {
      id: 'homepage.mechanisms.exposure.title',
      text: 'Undeclared capabilities are not routable',
    },
    description: {
      id: 'homepage.mechanisms.exposure.description',
      text: 'Generated Rpc, Web, Event, Task, actor, permission, and schema metadata enters Vine registries. Link publishes the application inventory, Hub distributes it, and Portal controls external entry.',
    },
    markers: ['Rpc', 'Web', 'Event', 'Task', 'DomainSchema'],
    links: [
      {
        title: {id: 'homepage.links.architecture', text: 'Architecture'},
        to: '/runtime-mechanisms',
      },
      {
        title: {id: 'homepage.links.rpcServices', text: 'Rpc Services'},
        to: '/guide/rpc',
      },
    ],
  },
  {
    icon: 'feedback',
    label: {id: 'homepage.mechanisms.feedback.label', text: 'Feedback'},
    title: {
      id: 'homepage.mechanisms.feedback.title',
      text: 'Runtime behavior stays visible',
    },
    description: {
      id: 'homepage.mechanisms.feedback.description',
      text: 'Logs can redact Skel-sensitive values. Trace and timeout cross calls; health checks, leases, configuration watches, and testkit expose behavior outside a code diff.',
    },
    markers: ['Redaction', 'Health', 'Lease', 'Config', 'testkit'],
    links: [
      {
        title: {
          id: 'homepage.links.loggingTesting',
          text: 'Logging & Testing',
        },
        to: '/logging-and-testing',
      },
      {
        title: {
          id: 'homepage.links.productionChecks',
          text: 'Production Checks',
        },
        to: '/production-readiness',
      },
    ],
  },
  {
    icon: 'topology',
    label: {id: 'homepage.mechanisms.topology.label', text: 'Topology'},
    title: {
      id: 'homepage.mechanisms.topology.title',
      text: 'Topology changes without rewriting the app',
    },
    description: {
      id: 'homepage.mechanisms.topology.description',
      text: 'The same capability declarations run in standalone, linked, and separated modes. Start in one process, then test process and network boundaries without changing business modules.',
    },
    markers: ['standalone', 'linked', 'separated'],
    links: [
      {
        title: {id: 'homepage.links.deployment', text: 'Deployment'},
        to: '/deployment-modes',
      },
      {
        title: {
          id: 'homepage.links.productionChecks',
          text: 'Production Checks',
        },
        to: '/production-readiness',
      },
    ],
  },
]

export const guideGroups: GuideGroup[] = [
  {
    icon: 'contract',
    title: {id: 'homepage.guides.contract', text: 'Contract'},
    description: {
      id: 'homepage.guides.contract.description',
      text: 'Define a typed boundary, then pin the toolchain that generates it.',
    },
    links: [
      {
        title: {
          id: 'homepage.guides.firstContract.title',
          text: 'First Contract',
        },
        description: {
          id: 'homepage.guides.firstContract.description',
          text: 'Define a Skel service and generate its Go boundary.',
        },
        to: '/first-skel-contract',
      },
      {
        title: {
          id: 'homepage.guides.compatibility.title',
          text: 'Compatibility',
        },
        description: {
          id: 'homepage.guides.compatibility.description',
          text: 'Pin Go, Vine, and skelc before building.',
        },
        to: '/compatibility',
      },
    ],
  },
  {
    icon: 'application',
    title: {id: 'homepage.guides.application', text: 'Application'},
    description: {
      id: 'homepage.guides.application.description',
      text: 'Build one complete app, then understand how its pieces compose.',
    },
    links: [
      {
        title: {
          id: 'homepage.guides.firstApplication.title',
          text: 'First Application',
        },
        description: {
          id: 'homepage.guides.firstApplication.description',
          text: 'Run a complete Vine runtime in one process.',
        },
        to: '/tutorial-first-app',
      },
      {
        title: {
          id: 'homepage.guides.applicationModel.title',
          text: 'Application Model',
        },
        description: {
          id: 'homepage.guides.applicationModel.description',
          text: 'Organize components, modules, and capabilities.',
        },
        to: '/application-model',
      },
    ],
  },
  {
    icon: 'runtime',
    title: {id: 'homepage.guides.runtime', text: 'Runtime'},
    description: {
      id: 'homepage.guides.runtime.description',
      text: 'Trace requests through the runtime before operating it.',
    },
    links: [
      {
        title: {
          id: 'homepage.guides.architecture.title',
          text: 'Architecture',
        },
        description: {
          id: 'homepage.guides.architecture.description',
          text: 'Follow configuration, discovery, routing, and delivery.',
        },
        to: '/runtime-mechanisms',
      },
      {
        title: {
          id: 'homepage.guides.production.title',
          text: 'Production Checks',
        },
        description: {
          id: 'homepage.guides.production.description',
          text: 'Review security, persistence, shutdown, and failure behavior.',
        },
        to: '/production-readiness',
      },
    ],
  },
]
