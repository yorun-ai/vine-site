---
slug: /container-deployment
sidebar_label: Containers and Kubernetes
description: Build, configure, and deploy the Vine Hub, Link, and Portal container images.
---

# Containers and Kubernetes

Vine provides separate container images for Hub, Link, and Portal. The images
run the corresponding `vine ... serve` command and accept the same `VINE_*`
environment variables as the CLI.

Choose a [deployment topology](../getting-started/deployment-modes.md) before
using this guide. The Kubernetes files live in the
[`examples/k8s`](https://github.com/yorun-ai/vine/tree/main/examples/k8s)
directory of the Vine repository.

## Choose an image version

| Component | Image | Command |
| --- | --- | --- |
| Hub | `docker.io/yorunai/vine-hub:vX.Y.Z` | `vine hub serve` |
| Link | `docker.io/yorunai/vine-link:vX.Y.Z` | `vine link serve` |
| Portal | `docker.io/yorunai/vine-portal:vX.Y.Z` | `vine portal serve` |

Use the same immutable Vine release tag for all three components:

```bash
docker pull docker.io/yorunai/vine-hub:vX.Y.Z
docker pull docker.io/yorunai/vine-link:vX.Y.Z
docker pull docker.io/yorunai/vine-portal:vX.Y.Z
```

`latest` is useful for evaluation, but do not use it for a stable deployment.

The images run as an unprivileged `vine` user. The Kubernetes base drops all
capabilities from Hub and Link and grants `NET_BIND_SERVICE` only to Portal for
ports 80 and 443. Certificates and deployment configuration are not embedded
into the images.

## Runtime configuration

Hub does not pick a database or NATS mode by default. Every Hub container
must configure exactly one option in each group:

| Concern | Option 1 | Option 2 |
| --- | --- | --- |
| Database | `VINE_DB_SQLITE_FILE=/data/hub.sqlite` | `VINE_DB_POSTGRES_URL=postgres://...` |
| Messaging | `VINE_MQ_EMBEDDED_NATS=true` | `VINE_MQ_EXTERNAL_NATS_URL=nats://...` |

Do not set both options in a group. When using SQLite, mount persistent
storage at `/data`. When a seed file is configured with
`VINE_SEED_YAML_FILE`, mount that file into the container as well.

The Dockerfile defaults and accepted environment variables are:

| Image | Variable | Image default | Purpose |
| --- | --- | --- | --- |
| Hub | `VINE_CONTROL_LISTEN` | `0.0.0.0:7071` | Control API for Link and Portal |
| Hub | `VINE_ADMIN_LISTEN` | `0.0.0.0:7075` | Admin API and Dashboard Web |
| Hub | `VINE_REDIS_LISTEN` | `0.0.0.0:7072` | Embedded Redis endpoint |
| Hub | `VINE_DB_SQLITE_FILE` | empty | SQLite database path |
| Hub | `VINE_DB_POSTGRES_URL` | empty | PostgreSQL connection URL |
| Hub | `VINE_MQ_EMBEDDED_NATS` | `false` | Start embedded NATS |
| Hub | `VINE_MQ_EXTERNAL_NATS_URL` | empty | External NATS URL |
| Hub | `VINE_SEED_YAML_FILE` | empty | Startup seed file |
| Hub | `VINE_DASHBOARD_URL` | empty | Explicit Dashboard URL |
| Link | `VINE_HUB_ENDPOINT` | `http://hub:7071` | Hub Control API endpoint |
| Link | `VINE_API_LISTEN` | `0.0.0.0:7079` | Application-facing Link API |
| Link | `VINE_INGRESS_LISTEN` | `0.0.0.0:7082` | Link ingress endpoint |
| Portal | `VINE_HUB_ENDPOINT` | `http://hub:7071` | Hub Control API endpoint |
| All | `VINE_MTLS_CA_FILE` | empty | Backend mTLS CA file |
| All | `VINE_MTLS_CERT_FILE` | empty | Component certificate file |
| All | `VINE_MTLS_KEY_FILE` | empty | Component private-key file |

The three mTLS variables must be set together or left unset. See
the [CLI reference](../getting-started/cli.md) for flag equivalents and detailed
service semantics.

## Kubernetes quick start

The Kustomize base uses a dedicated `vine` namespace and explicitly selects
SQLite plus embedded NATS for a small, single-replica deployment:

```bash
kubectl apply -k https://github.com/yorun-ai/vine//examples/k8s?ref=main
kubectl -n vine get pods,svc,pvc
kubectl -n vine logs statefulset/hub
```

The remote command follows `main` and is for evaluation only. For a stable
deployment, check out the Vine release you intend to run, replace each image
tag with that release's immutable tag, and apply its local `examples/k8s`
directory.

The base creates:

- a single-replica Hub `StatefulSet`, a headless Service, and a 5 Gi
  `ReadWriteOnce` volume claim for SQLite;
- a Link `Deployment` and internal API/ingress Service;
- a Portal `Deployment` and a `LoadBalancer` Service for ports 80, 443, and
  the default Dashboard entry on 7099;
- startup, readiness, and liveness TCP probes for every component;
- restricted pod and container security contexts with no service-account token,
  no privilege escalation, a runtime-default seccomp profile, and a read-only
  root filesystem.

Link and Portal use init containers to wait for Hub's Control API at `hub:7071`.
The Hub Service is headless because embedded NATS selects a dynamic port and
reports it through `InfoService`; direct Pod resolution keeps that port
reachable. With SQLite, keep Hub at a single replica.

Portal uses a `LoadBalancer` Service by default. On a cluster without a cloud
load balancer, change the Service to `ClusterIP` and expose the required Portal
listeners through an ingress controller, or use `kubectl port-forward` for
development.

## Backend mTLS overlay

The base uses HTTP between components so it can start without certificates.
The `overlays/mtls` Kustomize overlay enables backend mTLS. Work from a local
Vine checkout and prepare a separate identity for every component with these
SPIFFE paths:

```text
spiffe://<trust-domain>/vine/daemon/vine.hub
spiffe://<trust-domain>/vine/daemon/vine.link
spiffe://<trust-domain>/vine/daemon/vine.portal
```

Create the namespace and component-specific Secrets from certificate files kept
outside the repository:

```bash
kubectl apply -f examples/k8s/base/namespace.yaml

kubectl -n vine create secret generic vine-hub-mtls \
  --from-file=ca.pem=mtls/ca.pem \
  --from-file=cert.pem=mtls/hub.pem \
  --from-file=key.pem=mtls/hub-key.pem \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n vine create secret generic vine-link-mtls \
  --from-file=ca.pem=mtls/ca.pem \
  --from-file=cert.pem=mtls/link.pem \
  --from-file=key.pem=mtls/link-key.pem \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl -n vine create secret generic vine-portal-mtls \
  --from-file=ca.pem=mtls/ca.pem \
  --from-file=cert.pem=mtls/portal.pem \
  --from-file=key.pem=mtls/portal-key.pem \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl apply -k examples/k8s/overlays/mtls
```

The overlay mounts each Secret read-only at `/run/vine/mtls`, sets all three
`VINE_MTLS_*` variables, and changes Link and Portal to
`VINE_HUB_ENDPOINT=https://hub:7071`. The public certificates used by Portal's
external HTTPS listeners are a separate configuration boundary managed by
Hub.

## Private registries

For private registries, create an image-pull Secret and add `imagePullSecrets`
to every Pod specification. When changing image locations, update the Hub,
Link, and Portal containers along with the Link and Portal init containers.

## Production changes

The base is a runnable example, not a universal production configuration.
Before going to production:

- pin all three images to one immutable Vine release;
- use managed PostgreSQL and external NATS when persistence, independent
  scaling, or fixed messaging endpoints are required;
- change the headless Hub Service when external NATS removes the dynamic-port
  requirement;
- provide backend mTLS identities and private network policies;
- decide how Portal listeners are exposed and how public TLS certificates are
  issued and rotated;
- configure resource requests, limits, disruption policy, backups, and
  monitoring for the target cluster.

Continue with the [production-readiness checklist](./production-readiness.md)
before promoting the deployment to production.
