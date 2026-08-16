---
slug: /hub
sidebar_label: Hub Control
---

# Hub Control

Hub is the control plane of the Vine runtime. It stores configuration and
registration data, then distributes runtime snapshots and change events to Link
and Portal.

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

- **Configuration center**: reads configuration from SQLite or PostgreSQL and
  synchronizes it to Redis.
- **Service registry**: receives application, Rpc, Web, event, and task
  capabilities reported by Link, and maintains instance state.
- **Runtime distribution layer**: writes configuration, registrations, Portal
  rules, schemas, and certificates to Redis for consumers to read and subscribe
  to.
- **Component control API**: provides discovery and registration services used
  by Link and Portal.
- **Admin entry point**: provides Dashboard Rpc and Web handlers on a separate
  listener. External Dashboard access is controlled by Portal configuration.

Hub is not on the business request path. Portal handles external requests, while
Link discovers and forwards calls between applications.

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
| Hub Control API | `127.0.0.1:7071` | Allows Link and Portal to discover Hub infrastructure and maintain registrations. |
| Hub Redis | `127.0.0.1:7072` | Provides runtime snapshot reads and subscriptions. |
| Hub Admin API and Web | `127.0.0.1:7075` | Serves Dashboard management Rpc and the embedded Dashboard Web application. |

Use `--control-listen`, `--redis-listen`, and `--admin-listen` to override these
listeners.

The listener boundary is also expressed in Hub's Skel contracts. Link and
Portal use the `vine.hub.control` domain, which contains `InfoService` and
`RegistryService`. Dashboard clients use the separate `vine.hub.admin` domain
for management Rpc services and `DashboardWeb`.

## Backend mTLS

Hub, Link, and Portal can use one deployment-provided CA and a distinct
certificate for each component identity. Configure all three certificate flags
together:

```bash
vine hub serve \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/hub.pem \
  --mtls-key-file /run/vine/hub-key.pem \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

The Hub certificate must contain exactly one SPIFFE URI SAN,
`spiffe://<trust-domain>/vine/daemon/vine.hub`, and be valid for both TLS server
and client authentication. Link and Portal use `/vine/daemon/vine.link` and
`/vine/daemon/vine.portal` in the same
trust domain. Vine verifies the complete X.509-SVID and compares the URI
exactly; DNS SANs do not grant a component role. When configured, Hub requires
mTLS on its Control and Admin APIs, embedded Redis, and embedded NATS. Redis
also binds the authenticated SPIFFE identity to the matching Redis ACL user.
Embedded NATS accepts Hub's internal Scheduler and Admin Debug publishers as
`spiffe://<trust-domain>/vine/daemon/vine.hub`, and Link clients as
`spiffe://<trust-domain>/vine/daemon/vine.link`; Portal is not allowed to connect.

When `--dashboard-url` is omitted, enabling backend mTLS also changes the
Dashboard Portal entry default from `http://:7099/` to `https://:7099/`. Existing
built-in rules are migrated only when they still match the original defaults;
customized Dashboard access is preserved.

The equivalent environment variables are `VINE_MTLS_CA_FILE`,
`VINE_MTLS_CERT_FILE`, and `VINE_MTLS_KEY_FILE`.

:::warning Remaining security boundaries

Backend mTLS is opt-in. Without all three certificate flags, existing h2c,
cleartext Redis, and `nats://` development behavior remains active. Keep those
listeners on loopback or a trusted private network.

Application-to-Link communication is intentionally not covered because Link is
the application's sidecar. Both normally run on the same host and within the
same deployment trust boundary. A non-loopback Link API is permitted for unusual
deployments, but it emits a warning and stays unauthenticated h2c; the
deployment must protect the path itself.
Portal's public listeners do not reuse the backend identity certificate. With
mTLS enabled, a missing public certificate falls back to a short-lived,
process-local self-signed Web certificate; a configured Portal certificate
always takes precedence. This fallback encrypts bootstrap traffic but is not
browser-trusted. External PostgreSQL and NATS endpoints also retain their own
security configuration; `--mq-external-nats-url` currently accepts `nats://`.

:::

Production deployments can use PostgreSQL and an external NATS server:

```bash
vine hub serve \
  --db-postgres-url postgres://user:password@db.example.com:5432/vine \
  --mq-external-nats-url nats://nats.example.com:4222
```

Exactly one of `--db-sqlite-file` and `--db-postgres-url` must be provided.
Exactly one of `--mq-embedded-nats` and `--mq-external-nats-url` must also be
provided.

Use `--seed-yaml-file ./seed.yaml` to import initial configuration, Portal rules,
and certificates at startup. The database remains the source of truth after the
import.

## Registration and Leases

In normal process mode, Link writes application and Rpc service registrations
with a TTL and renews their leases through heartbeats. When Hub's registry
sweeper finds an expired lease, it actively unregisters the instance and
publishes a deletion event.

This means that if Link or a business application exits unexpectedly, Portal and
other Link instances remove the corresponding endpoint after its registration
expires instead of continuing to forward requests to a dead instance.

## Inproc Mode

Hub can run as an internal component of a single-process runtime. In this mode,
the Hub API uses the `inproc` transport, Redis only provides in-process
connections, and no external listen ports are opened.

Inproc mode does not use TTLs, heartbeats, or the registry sweeper. A
registration remains until the application explicitly unregisters it. This mode
fits local debugging, integration tests, and standalone applications, but doesn't
test distributed failure behavior such as network partitions or lease
expiration.

## Related Documentation

- [Link](./link.md): application-side registration, configuration subscriptions,
  and service discovery.
- [Portal](./portal.md): reads Hub configuration and provides the external
  gateway.
- [CLI](../getting-started/cli.md): complete options and environment variables.
