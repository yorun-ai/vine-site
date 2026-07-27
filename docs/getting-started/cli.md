---
slug: /cli
---

# Vine CLI

`vine` is the command-line entry point for Vine. It provides runtime services and version information.

- `hub` / `link` / `portal`: Start Vine runtime infrastructure services.
- `version`: Display the current CLI version.

Display the version:

```bash
vine version
```

Display help:

```bash
vine --help
vine hub serve --help
```

## Installation and Version

Install a published version:

```bash
go install go.yorun.ai/vine/cmd/vine@latest
```

Verify the installation:

```bash
which vine
vine version
```

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

By default, the Hub API and embedded Redis listen on `127.0.0.1:7071` and `127.0.0.1:7073`, respectively. For access from another host, explicitly configure a reachable listen address and restrict it with a firewall; do not expose the embedded Redis server directly to an untrusted network.

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

The default value of `--dashboard-url` is `http://:7099/`. It configures the Portal entry rule for Hub Dashboard. You can specify a host, port, and path, such as `https://hub.example.com:8443/admin`.

The same settings can also be supplied through environment variables:

- `VINE_API_LISTEN`
- `VINE_REDIS_LISTEN`
- `VINE_MQ_EXTERNAL_NATS_URL`
- `VINE_MQ_EMBEDDED_NATS`
- `VINE_SEED_YAML_FILE`
- `VINE_DASHBOARD_URL`
- `VINE_DB_SQLITE_FILE`
- `VINE_DB_POSTGRES_URL`

Notes:

- Choose exactly one of `--db-sqlite-file` and `--db-postgres-url`.
- Choose exactly one of `--mq-external-nats-url` and `--mq-embedded-nats`.

## link

`link` is the application-side sidecar mesh. It connects to Hub, provides ingress, and registers the capabilities of the current application.

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

`portal` is the application gateway. It reads portal entry, rule, and site configuration from Hub, then forwards external requests to the target application.

Start Portal:

```bash
vine portal serve \
  --hub-endpoint http://127.0.0.1:7071
```

Environment variables:

- `VINE_HUB_ENDPOINT`

## Common Workflows

### Start Runtime Infrastructure Services Separately

```bash
vine hub serve --mq-embedded-nats --db-sqlite-file ./hub.sqlite
vine link serve --hub-endpoint http://127.0.0.1:7071
vine portal serve --hub-endpoint http://127.0.0.1:7071
```
