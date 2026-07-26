---
slug: /getting-started
---

# Get Started with Vine

Vine is an application runtime framework for Go. It brings application lifecycle, dependency injection, configuration, Rpc, Web, events, tasks, and infrastructure components into one application model, while Hub, Link, and Portal support a smooth transition from single-process development to multi-process deployment.

## Tools and Components You Will Use

| Tool or component | Purpose | When you need it |
| --- | --- | --- |
| Vine App | Starts a business application and manages component lifecycles | Every application |
| skelc | Generates Go or TypeScript code from `.skel` contracts | When defining Rpc, Event, Task, or Web contracts |
| Hub | Stores configuration and service registration information | In linked or separated deployments |
| Link | Connects applications to Hub and handles discovery and forwarding | In linked or separated deployments |
| Portal | Provides HTTP/HTTPS entry points for external clients | When public access is required |

## Recommended Learning Path

1. Complete the [quick start](/docs/tutorial-first-app) and launch your first standalone application.
2. Read about [runtime modes](/docs/deployment-modes) and choose standalone, linked, or separated deployment.
3. Learn about assembly and lifecycle through the [application model](/docs/application-model) and [components and modules](/docs/components).
4. Use [skelc](https://skel.yorun.ai/docs/) to define Rpc, Web, Event, or Task contracts.
5. Add [Redis](/docs/guide/redis), a [relational database](/docs/guide/rdb), and an external gateway as needed.

For local evaluation, start with standalone. It does not require Hub, Link, or Portal to be deployed in advance.
