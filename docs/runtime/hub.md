---
slug: /hub
sidebar_label: Hub Control
---

# Hub

Hub is the control plane of the Vine runtime. It stores configuration and registration data, then distributes runtime snapshots and change events to Link and Portal.

```mermaid
flowchart LR
  App["Business application"] -->|"Register"| Link["Link"]
  Link --> Hub["Hub"]
  Portal["Portal"] -->|"Read and subscribe"| Hub
  Hub --> DB["Database: configuration, site rules, certificates"]
  Hub --> Redis["Redis: runtime snapshots and change events"]
  Hub --> NATS["NATS: messaging infrastructure for events and tasks"]
```

## Responsibilities

- **Configuration center**: reads configuration from SQLite or PostgreSQL and synchronizes it to Redis.
- **Service registry**: receives application, Rpc, Web, event, and task capabilities reported by Link, and maintains instance state.
- **Runtime distribution layer**: writes configuration, registrations, Portal rules, schemas, and certificates to Redis for consumers to read and subscribe to.
- **Management entry point**: provides the Hub API and Dashboard. External access to the Dashboard is controlled by Portal configuration.

Hub is not on the business request path. Portal handles external requests, while Link discovers and forwards calls between applications.

## Starting Hub

The smallest local development setup uses SQLite and embedded NATS:

```bash
vine hub serve \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

The default listen addresses are:

| Service | Default address | Purpose |
| --- | --- | --- |
| Hub API | `127.0.0.1:7071` | Allows Link, Portal, and management clients to connect to Hub. |
| Hub Redis | `127.0.0.1:7073` | Provides runtime snapshot reads and subscriptions. |

:::warning Current security boundary

Authentication and encrypted transport between components remain TODOs. The
embedded Hub Redis server currently allows password-free, read-only client
connections and distributes runtime configuration including Portal TLS private
keys. Until those security capabilities are implemented, deploy the Hub API,
Hub Redis, Link API, and Link ingress only on loopback or trusted private
networks, restrict access with a firewall, and never expose these internal ports
to an untrusted network.

:::

Production deployments can use PostgreSQL and an external NATS server:

```bash
vine hub serve \
  --db-postgres-url postgres://user:password@db.example.com:5432/vine \
  --mq-external-nats-url nats://nats.example.com:4222
```

Exactly one of `--db-sqlite-file` and `--db-postgres-url` must be provided. Exactly one of `--mq-embedded-nats` and `--mq-external-nats-url` must also be provided.

Use `--seed-yaml-file ./seed.yaml` to import initial configuration, Portal rules, and certificates at startup. The database remains the source of truth after the import.

## Registration and Leases

In normal process mode, Link writes application and Rpc service registrations with a TTL and renews their leases through heartbeats. When Hub's registry sweeper finds an expired lease, it actively unregisters the instance and publishes a deletion event.

As a result, if Link or a business application exits unexpectedly, Portal and other Link instances remove the corresponding endpoint after its registration expires instead of continuing to forward requests to a dead instance.

## Inproc Mode

Hub can run as an internal component of a single-process runtime. In this mode, the Hub API uses the `inproc` transport, Redis only provides in-process connections, and no external listen ports are opened.

Inproc mode does not use TTLs, heartbeats, or the registry sweeper. A registration remains until the application explicitly unregisters it. This mode is suitable for local debugging, integration tests, and standalone applications, but not for testing distributed failure behavior such as network partitions or lease expiration.

## Related Documentation

- [Link](./link.md): application-side registration, configuration subscriptions, and service discovery.
- [Portal](./portal.md): reads Hub configuration and provides the external gateway.
- [CLI](../getting-started/cli.md): complete options and environment variables.
