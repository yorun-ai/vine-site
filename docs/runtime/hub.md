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
Dashboard Portal entry default to `https://:7099/`. Customized Dashboard access
is preserved.

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
security configuration; `--mq-nats-endpoint` currently accepts `nats://`.

:::

Production deployments can use PostgreSQL and an external NATS server:

```bash
vine hub serve \
  --db-postgres-url postgres://user:password@db.example.com:5432/vine \
  --mq-mode=nats \
  --mq-nats-endpoint nats://nats.example.com:4222
```

Hub defaults to `--mq-mode=embedded`. Use `--mq-mode=nats` with
`--mq-nats-endpoint` for external NATS; embedded mode rejects an endpoint.

Provide at most one of `--db-sqlite-file` and `--db-postgres-url`. When neither
database option is set, Hub defaults to `--no-db`: it loads the seed source into memory
and configuration stays read-only.

Use `--seed-hub-data-file ./seed.yaml` to import initial configuration, Portal sites,
rules, and certificates at startup. With a database, the database remains the
source of truth after the import.

`appConfigs[].value` accepts a YAML mapping, including nested maps and lists.
Use the same field names as JSON, and write enum keys and values as their enum
names. This format works for both startup seeding and Dashboard imports.

```yaml
appConfigs:
  - name: demo.AppConfig
    value:
      enabled: true
      statuses:
        EAST: ACTIVE
        WEST: LOCKED
```

Hub converts structured values to JSON. A string value contains JSON text, for
example `value: '{"enabled":true}'`; write `value: '"text"'` when the value is
itself a JSON string. Date and timestamp text is preserved verbatim, including
its UTC offset and fractional seconds, and quoted strings and mapping keys keep
their original spelling.

Seed files and Dashboard YAML input reject YAML anchors (`&`), aliases (`*`),
merge keys (`<<`), complex or null mapping keys, non-finite numbers, and custom
YAML tags; expand these values explicitly instead. Numbers must use ordinary
decimal notation: leading zeros such as `012`, digit separators, non-decimal
bases, and scientific notation are rejected.

All items in an import file must meet the configuration requirements, including
items not selected in the Dashboard. A database error during import may leave
some items saved; check the current configuration before retrying. See
[Portal](./portal.md#rule-validation) for rule requirements.

## Lock mode

Hub defaults to `--lock-mode=embedded`, serving lease locks through its Control
API. Lock state is held in memory and is lost when Hub restarts.

To use an external Redis service:

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite \
  --lock-mode=redis \
  --lock-redis-endpoint=redis://redis.example.com:6379/0
```

Link connects directly to the Redis endpoint advertised by Hub. The endpoint
supports `redis://` and `rediss://`, including URL credentials and a database
number. The corresponding environment variables are `VINE_LOCK_MODE` and
`VINE_LOCK_REDIS_ENDPOINT`.

`redis` mode requires an endpoint. `embedded` and `disable` reject one.
Use `--lock-mode=disable` to reject lock operations. Standalone always uses
in-process embedded locks and exposes no lock configuration options; separate
standalone processes do not share locks.

## Registration and Leases

In normal process mode, Link writes application and Rpc service registrations
with a TTL and renews their leases through heartbeats. When Hub's registry
sweeper finds an expired lease, it actively unregisters the instance and
publishes a deletion event.

If Link or a business application exits unexpectedly, Portal and other Link
instances remove the corresponding endpoint after its registration expires
instead of continuing to forward requests to a dead instance.

## Hub Restart and Endpoint Changes

Hub keeps registrations, watches, and Portal instance records in memory, so a
restarted Hub starts from an empty view of the cluster. Link and Portal recover
on their own instead of requiring a restart:

- Link re-reads Hub information when an instance heartbeat reports that Hub no
  longer knows the instance, and registers the local application instances again.
- Portal re-reads Hub information on a timer, so a restarted Hub that advertises
  different endpoints is followed without operator action.
- A changed watch, MQ, or lock endpoint replaces only the affected connection. An
  unchanged endpoint keeps the existing connection, so a restart that keeps the
  same addresses does not interrupt active subscriptions.
- Watchers re-subscribe on the new watch endpoint and reconcile their snapshot,
  so keys that changed while the endpoint was stale are reported like any other
  change.

Hub's control API endpoint stays configuration: Link and Portal connect to the
`--hub-endpoint` they were started with, and changing the Hub API address
requires updating that configuration.

## Inproc Mode

Hub can run as an internal component of a single-process runtime. In this mode,
the Hub API uses the `inproc` transport, Redis only provides in-process
connections, and no external listen ports are opened.

Inproc mode does not use TTLs, heartbeats, or the registry sweeper. A
registration remains until the application explicitly unregisters it. This mode
fits local debugging, integration tests, and standalone applications, but doesn't
test distributed failure behavior such as network partitions or lease
expiration.

## Seed variables and field sources

Vine v0.17.0 adds `--seed-hub-vars-file` and `--seed-hub-source-file` to Hub and
`vine dev`. Supply a YAML variable dictionary alongside the seed template:

```yaml
# seed.yaml
appConfigs:
  - name: demo.Config
    value:
      enabled: ${enabled}
      endpoint: https://${host}
```

```yaml
# variables.yaml
enabled: true
host: api.example.com
```

A whole-field `${name}` reference preserves the variable's YAML type, while a
reference embedded in text produces a string and requires a scalar, non-null
variable. `${database.port:5432}` supplies a default when the key is missing; an
undefined variable without a default fails startup. Variable paths use camelCase
segments. Mapping keys cannot contain references, and inserted values are literal
data that is not interpolated again. Seeds without references need no variable
file. See [deployment variables](../framework/configuration.md#deployment-variables)
for nested paths and validation rules.

An optional source file maps JSON Pointer field paths in the original template
(array indices start at zero) to origin labels:

```yaml
version: 1
seedSha256: "<SHA-256 of the exact seed template bytes>"
fields:
  /appConfigs/0/value/endpoint:
    source: profile/dev
    define: domain/catalog
    override: profile/dev
```

Omit `override` when there was no override. Labels are opaque to Vine; they do
not control precedence. A mismatched digest or nonexistent field path fails
startup. The map contains no file paths, line numbers, or variable values.

Standalone applications can embed the template and source map with Go `embed`
and pass `Option.SeedHubData` and `Option.SeedHubSource`, plus
`Option.SeedHubVarsFile` for the deployment dictionary. Alternatively, pass
`Option.SeedHubDataFile` with the optional `Option.SeedHubSourceFile`. Inline and
file inputs cannot be mixed: an embedded template requires an embedded source
map, and a file template requires a file source map. Variables are always
supplied through a file. For file inputs the environment variables are
`VINE_SEED_HUB_DATA_FILE`, `VINE_SEED_HUB_SOURCE_FILE`, and
`VINE_SEED_HUB_VARS_FILE`.

Hub stores sources with each configuration object, independently of template
array ordering. The Dashboard's **Field sources** action shows definitions, last
overrides, original templates, resolved variable values, and default usage.
Explicit edits mark affected sources as `hub` and remove their old variable
dependencies. Whole-object imports without sources clear the old source map.
Source metadata stays in Hub and is not sent to Link or Portal. No-db mode keeps
the same metadata in memory.

## Related Documentation

- [Link](./link.md): application-side registration, configuration subscriptions,
  and service discovery.
- [Portal](./portal.md): reads Hub configuration and provides the external
  gateway.
- [CLI](../getting-started/cli.md): complete options and environment variables.
