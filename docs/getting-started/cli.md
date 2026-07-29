---
slug: /cli
sidebar_label: Vine CLI
---

# Vine CLI

The `vine` command starts Hub, Link, or Portal and shows the build version.

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
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

Use an external NATS server:

```bash
vine hub serve \
  --mq-external-nats-url nats://127.0.0.1:4222 \
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
  --api-listen 127.0.0.1:7071 \
  --redis-listen 127.0.0.1:7073 \
  --mq-embedded-nats \
  --db-sqlite-file ./hub.sqlite
```

The Hub API defaults to `127.0.0.1:7071` and embedded Redis to `127.0.0.1:7073`.
To allow access from another host, explicitly set a reachable listen address and
restrict it with a firewall; never expose the embedded Redis server directly to
an untrusted network.

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

`--dashboard-url` defaults to `http://:7099/`. It configures the Portal entry
rule for the Hub Dashboard. You can supply a host, port, and path, such as
`https://hub.example.com:8443/admin`.

You can also pass these settings through environment variables:

- `VINE_API_LISTEN`
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

## link

`link` is the application-side runtime. It connects to Hub, accepts ingress from
Portal or other Links, and registers its applications' capabilities.

Start Link:

```bash
vine link serve \
  --hub-endpoint http://127.0.0.1:7071
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
  --hub-endpoint http://127.0.0.1:7071
```

Environment variables:

- `VINE_HUB_ENDPOINT`

## Common workflow

### Start runtime services separately

```bash
vine hub serve --mq-embedded-nats --db-sqlite-file ./hub.sqlite
vine link serve --hub-endpoint http://127.0.0.1:7071
vine portal serve --hub-endpoint http://127.0.0.1:7071
```
