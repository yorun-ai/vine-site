---
slug: /cli
sidebar_label: Vine CLI
---

# Vine CLI

The `vine` command starts a local development runtime or individual Hub, Link,
and Portal services, and shows the build version.

- `dev`: Start a local runtime for business applications running in separate processes.
- `hub` / `link` / `portal`: Start the Vine runtime infrastructure services.
- `version`: Print the CLI version.

Show the version:

```bash
vine version
```

Show help:

```bash
vine --help
vine hub serve --help
```

## Installation and version

Install the source revision corresponding to `next`:

```bash
go install go.yorun.ai/vine/cmd/vine@main
```

Verify the installation:

```bash
which vine
vine version
```

For a released application, replace `main` with the same reviewed commit or tag
used by the application module. See [Version Compatibility](./compatibility.md)
before upgrading.

## dev

`dev` starts Hub, Portal, and Link in one CLI process for local application
development:

```bash
vine dev
```

Hub RPC, Redis, NATS, Portal-to-Hub, Link-to-Hub, and Portal-to-Link traffic use
in-process transports. Link still listens on `127.0.0.1:7079`, so a business
application in another process can use the normal network boundary:

```go title="main.go"
app.New[*HelloApp]().StartAndWait()
```

The default Link endpoint used by `app.New` is already
`http://127.0.0.1:7079`. Use `--link-api-listen` together with
`VINE_LINK_ENDPOINT` or `app.Option.LinkEndpoint` when another address is
required.

When no database option is supplied, `dev` creates a temporary SQLite database
and removes it after a graceful shutdown. Supply a database file to preserve
Hub state between runs, and a seed file to initialize application configuration
or Portal routes:

```bash
vine dev \
  --db-sqlite-file ./hub-dev.sqlite \
  --seed-yaml-file ./seed.yaml \
  --dashboard-url http://:7099/
```

Available options:

- `--link-api-listen`: Link API address for external applications; defaults to
  `127.0.0.1:7079`.
- `--db-sqlite-file` / `--db-postgres-url`: optional persistent Hub storage.
- `--seed-yaml-file`: optional Hub seed data.
- `--dashboard-url`: Hub Dashboard Portal entry; defaults to `http://:7099/`, or
  `https://:7099/` when backend mTLS is enabled.

The corresponding environment variables are `VINE_API_LISTEN`,
`VINE_DB_SQLITE_FILE`, `VINE_DB_POSTGRES_URL`, `VINE_SEED_YAML_FILE`, and
`VINE_DASHBOARD_URL`. Press `Ctrl+C` to stop Link, Portal, and Hub gracefully.

`dev` preserves the App-to-Link and Link-to-App network boundary but does not
simulate network failures, leases, or TTL expiry inside the local Vine runtime.
Use the individual service commands for deployment and infrastructure testing.

## hub

`hub` is the configuration, registration, and management center.

Start Hub with local NATS and SQLite:

```bash
vine hub serve \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

Use an external NATS server:

Before starting Hub or Link, use the NATS CLI to provision the required
JetStream streams. This example uses file storage and one replica; adjust
`--storage` and `--replicas` for the deployment topology:

```bash
export VINE_MQ_EXTERNAL_NATS_URL=nats://127.0.0.1:4222

nats --server "$VINE_MQ_EXTERNAL_NATS_URL" stream add VINE_EVENTS \
  --subjects "event.>" \
  --retention interest \
  --storage file \
  --replicas 1 \
  --defaults

nats --server "$VINE_MQ_EXTERNAL_NATS_URL" stream add VINE_TASKS \
  --subjects "task.>" \
  --retention workqueue \
  --storage file \
  --replicas 1 \
  --defaults
```

Verify both definitions with `nats --server "$VINE_MQ_EXTERNAL_NATS_URL"
stream info VINE_EVENTS` and the corresponding `VINE_TASKS` command. Then
start Hub:

```bash
vine hub serve \
  --mq-external-nats-url "$VINE_MQ_EXTERNAL_NATS_URL" \
  --db-sqlite-file ./hub.sqlite
```

Use PostgreSQL:

```bash
vine hub serve \
  --mq-external-nats-url nats://127.0.0.1:4222 \
  --db-postgres-url postgres://demo:demo@127.0.0.1:5432/hub
```

Specify listen addresses:

```bash
vine hub serve \
  --control-listen 127.0.0.1:7071 \
  --redis-listen 127.0.0.1:7072 \
  --admin-listen 127.0.0.1:7075 \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

The Hub Control API defaults to `127.0.0.1:7071`, embedded Redis to
`127.0.0.1:7072`, and the Admin API and Web listener to `127.0.0.1:7075`.

Initialize data from a seed YAML file:

```bash
vine hub serve \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite \
  --seed-yaml-file ./seed.yaml
```

Specify the Hub Dashboard URL:

```bash
vine hub serve \
  --dashboard-url http://:7099/ \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

`--dashboard-url` defaults to `http://:7099/`, or `https://:7099/` when backend
mTLS is enabled. It configures the Portal entry rule for the Hub Dashboard. You
can supply a host, port, and path, such as
`https://hub.example.com:8443/admin`. The mTLS HTTPS default uses Portal's
temporary self-signed Web certificate until a matching public certificate is
configured, so browsers will report it as untrusted during bootstrap.

You can also pass these settings through environment variables:

- `VINE_CONTROL_LISTEN`
- `VINE_ADMIN_LISTEN`
- `VINE_REDIS_LISTEN`
- `VINE_MQ_EXTERNAL_NATS_URL`
- `VINE_MQ_EMBEDDED_NATS`
- `VINE_SEED_YAML_FILE`
- `VINE_DASHBOARD_URL`
- `VINE_DB_SQLITE_FILE`
- `VINE_DB_POSTGRES_URL`

Notes:

- Pick exactly one of `--db-sqlite-file` and `--db-postgres-url`.
- Pick exactly one of `--mq-external-nats-url` and `--mq-embedded-nats`.

## Backend mTLS flags

The `hub serve`, `link serve`, and `portal serve` commands share these flags:

- `--mtls-ca-file`: CA certificate used to authenticate Vine components.
- `--mtls-cert-file`: this component's identity certificate.
- `--mtls-key-file`: private key for the identity certificate.

All three must be supplied together. Each certificate must be an X.509-SVID
with exactly one SPIFFE URI SAN. The required identities are
`spiffe://<trust-domain>/vine/daemon/vine.hub`,
`spiffe://<trust-domain>/vine/daemon/vine.link`, and
`spiffe://<trust-domain>/vine/daemon/vine.portal`; all communicating components must use
the same trust domain. Certificates must be valid for both server and client
authentication. DNS SANs are not used for component authorization. The
corresponding environment variables are `VINE_MTLS_CA_FILE`,
`VINE_MTLS_CERT_FILE`, and `VINE_MTLS_KEY_FILE`.

Programs using `app/linked` accept the same flags and environment variables.
They can also configure the embedded Link directly through
`linked.Option.MTLSCAFile`, `MTLSCertFile`, and `MTLSKeyFile`.

When Link or Portal enables mTLS, `--hub-endpoint` must use `https://`. Backend
service registrations are also required to use HTTPS, preventing a component
from silently accepting an older plaintext endpoint.

## link

`link` is the application-side runtime. It connects to Hub, accepts ingress from
Portal or other Links, and registers its applications' capabilities.

Start Link:

```bash
vine link serve \
  --hub-endpoint https://hub.internal:7071 \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/link.pem \
  --mtls-key-file /run/vine/link-key.pem
```

Specify listen addresses:

```bash
vine link serve \
  --api-listen 127.0.0.1:7081 \
  --ingress-listen 127.0.0.1:7082 \
  --hub-endpoint http://127.0.0.1:7071
```

Environment variables:

- `VINE_API_LISTEN`
- `VINE_INGRESS_LISTEN`
- `VINE_HUB_ENDPOINT`

## portal

`portal` is the application gateway. It reads portal entry, rule, and site
configuration from Hub, then forwards external requests to the target
application.

Start Portal:

```bash
vine portal serve \
  --hub-endpoint https://hub.internal:7071 \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/portal.pem \
  --mtls-key-file /run/vine/portal-key.pem
```

Environment variables:

- `VINE_HUB_ENDPOINT`

## Common workflow

### Debug an external application locally

```bash
vine dev
go run ./cmd/myapp
```

### Start runtime services separately

```bash
vine hub serve --mq-embedded-nats --db-sqlite-file ./hub.sqlite
vine link serve --hub-endpoint http://127.0.0.1:7071
vine portal serve --hub-endpoint http://127.0.0.1:7071
```
