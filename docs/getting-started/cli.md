---
slug: /cli
sidebar_label: Vine CLI
---

# Vine CLI

The `vine` command starts the individual Hub, Link, and Portal services and
shows the build version.

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

## hub

`hub` is the configuration, registration, and management center.

Start Hub with local NATS and SQLite:

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite
```

To use an external NATS server, provision the required JetStream streams with
the NATS CLI before starting Hub or Link. This example uses file storage and one
replica; adjust `--storage` and `--replicas` for the deployment topology:

```bash
export VINE_HUB_MQ_NATS_ENDPOINT=nats://127.0.0.1:4222

nats --server "$VINE_HUB_MQ_NATS_ENDPOINT" stream add VINE_EVENTS \
  --subjects "event.>" \
  --retention interest \
  --storage file \
  --replicas 1 \
  --defaults

nats --server "$VINE_HUB_MQ_NATS_ENDPOINT" stream add VINE_TASKS \
  --subjects "task.>" \
  --retention workqueue \
  --storage file \
  --replicas 1 \
  --defaults
```

Verify both streams with `nats --server "$VINE_HUB_MQ_NATS_ENDPOINT"
stream info VINE_EVENTS` and the matching `VINE_TASKS` command, then start
Hub:

```bash
vine hub serve \
  --mq-mode=nats \
  --mq-nats-endpoint "$VINE_HUB_MQ_NATS_ENDPOINT" \
  --db-sqlite-file ./hub.sqlite
```

Use PostgreSQL:

```bash
vine hub serve \
  --mq-mode=nats \
  --mq-nats-endpoint nats://127.0.0.1:4222 \
  --db-postgres-url postgres://demo:demo@127.0.0.1:5432/hub
```

Specify listen addresses:

```bash
vine hub serve \
  --control-listen 127.0.0.1:7071 \
  --watch-listen 127.0.0.1:7072 \
  --admin-listen 127.0.0.1:7099 \
  --db-sqlite-file ./hub.sqlite
```

The Hub Control API defaults to `127.0.0.1:7071`, the watch listener to
`127.0.0.1:7072`, and the Admin API and Dashboard listener to `127.0.0.1:7099`.

Initialize data from a seed YAML file:

```bash
vine hub serve \
  --db-sqlite-file ./hub.sqlite \
  --seed-data-file ./seed.yaml
```

Use `--seed-source-file` for field origins and `--seed-vars-file` for a
deployment variable dictionary. Repeat `--seed-var path=YAML` to supply variables
directly or override paths from the vars file. SQLite and PostgreSQL apply these
inputs only during initial seeding; no-db mode applies them on every start. See
[deployment variables](../framework/configuration.md#deployment-variables).

The admin listener serves the Dashboard and answers the Admin API on
`/api/invoke`, so a browser reaches both on one origin. The Dashboard belongs to
this listener alone: Hub publishes no Portal entry, site, or rule for it, and it
needs no URL of its own. The listener stays cleartext HTTP even when backend mTLS
is configured, because an operator's browser holds no mesh certificate; keep it
on loopback or on a trusted network.

Configure the lock backend:

```bash
vine hub serve \
  --lock-mode=redis \
  --lock-redis-endpoint redis://redis.example.com:6379/0 \
  --db-sqlite-file ./hub.sqlite
```

Hub keeps lease locks in its own memory by default (`--lock-mode=embedded`), so
they are lost on restart. `--lock-mode=redis` delegates them to the Redis
database named by `--lock-redis-endpoint`, which accepts `redis://` and
`rediss://` URLs. `--lock-mode=disable` rejects lock operations. See
[Lock mode](../runtime/hub.md#lock-mode) for application usage.

These settings are also available as environment variables:

- `VINE_HUB_CONTROL_LISTEN`
- `VINE_HUB_ADMIN_LISTEN`
- `VINE_HUB_WATCH_LISTEN`
- `VINE_HUB_LOCK_MODE`
- `VINE_HUB_LOCK_REDIS_ENDPOINT`
- `VINE_HUB_MQ_NATS_ENDPOINT`
- `VINE_HUB_MQ_MODE`
- `VINE_HUB_SEED_DATA_FILE`
- `VINE_HUB_SEED_SOURCE_FILE`
- `VINE_HUB_SEED_VAR`
- `VINE_HUB_SEED_VARS_FILE`
- `VINE_HUB_DB_SQLITE_FILE`
- `VINE_HUB_DB_POSTGRES_URL`

Notes:

- Pick exactly one of `--db-sqlite-file` and `--db-postgres-url`.
- Hub defaults to `--mq-mode=embedded`, which rejects `--mq-nats-endpoint`.
  Use `--mq-mode=nats` with `--mq-nats-endpoint` to connect to external NATS.
- `--lock-mode=redis` requires `--lock-redis-endpoint`; `embedded` and `disable`
  reject it.

## Component environment variables

The `hub serve`, `link serve`, and `portal serve` commands read environment
variables scoped by component: `VINE_HUB_*`, `VINE_LINK_*`, and `VINE_PORTAL_*`.
Standalone mode reads the same Hub names, and flag names take no component
prefix. Command-line values take priority over environment variables.

Each command accepts `--log-level` and repeatable `--log-rule pattern=LEVEL`:

| Service | Log level | Named rules |
| --- | --- | --- |
| Hub | `VINE_HUB_LOG_LEVEL` | `VINE_HUB_LOG_RULES` |
| Link | `VINE_LINK_LOG_LEVEL` | `VINE_LINK_LOG_RULES` |
| Portal | `VINE_PORTAL_LOG_LEVEL` | `VINE_PORTAL_LOG_RULES` |

A standalone application keeps the process-wide `VINE_LOG_LEVEL` and
`VINE_LOG_RULES`. For the mTLS variables below, `<COMPONENT>` is `HUB`, `LINK`, or
`PORTAL`.

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
corresponding environment variables are `VINE_<COMPONENT>_MTLS_CA_FILE`,
`VINE_<COMPONENT>_MTLS_CERT_FILE`, and `VINE_<COMPONENT>_MTLS_KEY_FILE`.

Programs using `app/linked` configure the embedded Link through flags that name
it: `--link-mtls-ca-file`, `--link-mtls-cert-file`, and `--link-mtls-key-file`,
or `VINE_LINK_MTLS_CA_FILE`, `VINE_LINK_MTLS_CERT_FILE`, and
`VINE_LINK_MTLS_KEY_FILE`. They can also set `LinkMTLSCAFile`,
`LinkMTLSCertFile`, and `LinkMTLSKeyFile` on `linked.Option` directly. A program
that embeds the application can take over these flags; see
[Ignored and renamed flags](../framework/app.md#ignored-and-renamed-flags).

When Link or Portal enables mTLS, `--hub-endpoint` must use `https://`. Backend
service registrations must also use HTTPS, so a component cannot silently accept
a plaintext endpoint.

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

- `VINE_LINK_API_LISTEN`
- `VINE_LINK_INGRESS_LISTEN`
- `VINE_LINK_HUB_ENDPOINT`

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

- `VINE_PORTAL_HUB_ENDPOINT`

## Common workflow

### Run an external application against local runtime services

```bash
vine hub serve --seed-data-file ./seed.yaml
vine link serve --hub-endpoint http://127.0.0.1:7071
go -C ./src/server run ./cmd/myapp
```

An application created with `app.New` reaches the default Link API at
`http://127.0.0.1:7079`; use `VINE_LINK_ENDPOINT` or
`app.Option.LinkEndpoint` when Link listens elsewhere.

### Start runtime services separately

```bash
vine hub serve --db-sqlite-file ./hub.sqlite
vine link serve --hub-endpoint http://127.0.0.1:7071
vine portal serve --hub-endpoint http://127.0.0.1:7071
```
