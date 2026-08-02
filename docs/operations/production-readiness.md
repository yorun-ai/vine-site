---
title: Production Checks
sidebar_label: Production Checks
description: Production boundaries and verification checks for a Vine deployment.
slug: /production-readiness
---

An application that passes in standalone mode has proved its business assembly,
not its distributed deployment. Before promoting a linked or separated topology,
verify the process, network, persistence, delivery, and shutdown boundaries below
against the Vine revision you will actually deploy.

## Choose a deployment topology

- [ ] Choose the topology from operational requirements, not only from the number
  of applications.
- [ ] Record where Hub, Portal, each Link, and each business application run.
- [ ] Draw the required network paths before assigning addresses or firewall
  rules.

| Topology | Process boundary | Production implication |
| --- | --- | --- |
| Standalone | Hub, Portal, Link, and applications share one process | Good for local development and integration tests; does not exercise network leases or independent failure |
| Linked | Hub and Portal are separate; Link shares the application process | Keeps network registration and heartbeat behavior while coupling each application to its Link lifecycle |
| Separated | Hub, Portal, Link, and applications are independent processes | Supports independent release, restart, and scaling, but demands every internal network path be configured explicitly |

Start with [Runtime and Deployment](../getting-started/deployment-modes.md), then use
[Hub](../runtime/hub.md), [Link](../runtime/link.md), and [Portal](../runtime/portal.md) for the
responsibility of each process.

## Pin versions before deployment

- [ ] Pin Go, Vine, and skelc rather than resolving `@latest` during a build.
- [ ] Run the exact `vine` binary that the deployment image contains.
- [ ] Regenerate and review contract code whenever Vine or skelc changes.

```bash
go version
vine version
vine version --json
skelc version
```

Current Vine source requires Go `1.26.5` or later and reports a minimum skelc
version of `v0.9.0`. The `next` site is not a frozen release; [Version
Compatibility](../getting-started/compatibility.md) explains how to record the
exact revisions used by a deployment.

## Secure the runtime network

:::danger Current security boundary

Native transport authentication and encryption remain TODOs across the complete
networked runtime data plane. Link-to-Hub and Portal-to-Hub Rpc,
application-to-Link Rpc, and Portal/Link proxy traffic currently use cleartext
h2c. Hub Redis uses cleartext RESP over TCP, and `nats://` traffic is also
unencrypted. The production target is mTLS for Vine component connections and
TLS plus authenticated client identities for NATS. Inproc transports do not
cross a network boundary and are outside this TODO.

The embedded Hub Redis server rejects anonymous data access and separates
`vine.hub`, `vine.link`, and `vine.portal` with least-privilege ACLs. The
`vine.hub` user has a random process-local password; Link and Portal use empty
passwords for inproc and separated-deployment debugging, so any client that can
reach Redis can still impersonate either role. The Portal role can read Portal
TLS private keys.

Do not expose Hub API, Hub Redis, Link API, Link ingress, application listeners,
or an embedded NATS listener to an untrusted network. Place them on loopback or a
trusted private network and enforce the boundary with firewall or network-policy
rules.

:::

Inventory every listener:

| Boundary | Current default | Required callers | Production action |
| --- | --- | --- | --- |
| Hub API | `127.0.0.1:7071` | Link, Portal, and trusted management clients | Bind to a reachable private address only |
| Hub Redis | `127.0.0.1:7073` | Link and Portal | Keep private; never publish it as a general Redis service |
| Link API | `127.0.0.1:7079` | Separately running business applications | Keep private and reachable only from its applications |
| Link ingress | `0.0.0.0:0` | Portal and remote Link instances | Set a fixed reachable address when network policy requires stable ports |
| Business application HTTP | `127.0.0.1:0` | Its Link | Keep Link in the same network namespace or set `app.RunFlag.ListenAddr` to a protected reachable address |
| Embedded NATS in normal Hub mode | Random TCP port | Link instances | Keep the discovered port private; use an external NATS endpoint when operations require a fixed endpoint |
| Portal entries | Defined by Hub Portal rules | External clients | Expose only the intended HTTP/HTTPS listeners |

- [ ] Permit only the caller sets shown in the table.
- [ ] Use `--ingress-listen` to avoid an unpredictable Link ingress port when a
  firewall needs an explicit rule.
- [ ] If an application and Link run in different containers or hosts, configure
  an application listener that Link can reach and do not expose it publicly.
- [ ] Treat access to Hub Redis as access to application configuration and TLS
  private-key material.
- [ ] Until native mTLS is implemented, treat Rpc metadata, Redis usernames, and
  network reachability as routing or ACL inputs rather than authenticated
  component identities.
- [ ] Verify external traffic enters through Portal instead of bypassing gateway
  routing and admission.

## Configure Hub persistence and messaging

Hub requires exactly one database source and exactly one NATS mode:

- [ ] Choose one of SQLite and PostgreSQL.
- [ ] Choose one of embedded NATS and an external NATS URL.
- [ ] For an external NATS service, enable JetStream and use a `nats://` endpoint
  accepted by the current CLI.

A production setup that needs independently operated persistence and messaging
can start Hub with PostgreSQL and external NATS:

```bash
vine hub serve \
  --api-listen 10.0.1.10:7071 \
  --redis-listen 10.0.1.10:7073 \
  --db-postgres-url "$VINE_DB_POSTGRES_URL" \
  --mq-external-nats-url "$VINE_MQ_EXTERNAL_NATS_URL"
```

The Hub database is the source of truth for imported configuration, Portal rules,
and certificates. Hub publishes runtime snapshots and changes through its Redis
distribution layer; Redis is not a replacement for the database.

:::warning Event and Task durability

Vine currently creates Event and Task JetStream streams with memory storage. An
external NATS service gives the runtime an independently operated endpoint, but
the current stream configuration is not disk-backed. Do not promise message
survival across NATS or cluster restarts without validating the exact failure
scenario.

:::

- [ ] Size and monitor PostgreSQL or SQLite according to the chosen topology.
- [ ] Verify the external NATS account has JetStream enabled before starting
  Link.
- [ ] Test NATS disconnect and reconnect behavior with the same topology used in
  production.
- [ ] Design Event listeners and Task runners for retry and duplicate delivery;
  do not use transport storage as the only business record.

## Validate registration and failure semantics

| Mode | TTL and registry sweeper | Link heartbeat | Local application health check |
| --- | --- | --- | --- |
| Separated application and Link | Enabled | Enabled | Enabled |
| Linked application with in-process Link and network Hub | Enabled | Enabled | Disabled; application and Link share one process |
| Standalone with inproc Hub | Disabled | Disabled | Disabled |

With a normal network Hub, registrations carry leases. Link renews them through
heartbeat, and Hub's registry sweeper unregisters expired application instances
and publishes deletion events. A separately running Link also checks the
applications it owns. Linked mode keeps network leases and heartbeat, but skips
the separate local application health check because Link and the application
share one process.

In standalone/inproc mode, registration stays until explicit unregister. There is
no heartbeat, lease-expiry sweep, or local application health check, so a passing
standalone test doesn't validate distributed liveness.

In the current source, a separately running Link checks each application every 5
seconds with a 2-second console-ping timeout and unregisters it after three
consecutive non-timeout failures. Invocation timeouts are logged but do not
increment that failure count. Hub leases last 30 seconds and the sweeper runs
every 5 seconds. These timings are current implementation constants, not CLI
tuning flags. Test a non-responsive application separately from a stopped
process: Link can continue renewing the Hub lease while its application is
wedged.

- [ ] Gracefully stop one application and verify its endpoint disappears.
- [ ] Terminate a separately running application without graceful shutdown and
  verify Link removes it after repeated non-timeout console-ping failures.
- [ ] Terminate or disconnect Link and verify Hub removes the remaining endpoints
  after their leases expire.
- [ ] Interrupt Link-to-Hub connectivity and verify discovery converges after
  connectivity returns.
- [ ] Confirm Portal and callers stop routing to an expired instance.
- [ ] Run these checks with separate processes; do not substitute an inproc test.

See [Runtime Mechanisms](../runtime/mechanisms.md) for registration and discovery
flow.

## Plan graceful shutdown

Within a business application, `StopGracefully()` runs in this order:

1. Module `BeforeAppStop()` hooks in reverse order.
2. Component `BeforeAppStop()` hooks in reverse order.
3. Application unregistration through Link, including Link-side propagation and
   drain.
4. Application server shutdown: HTTP shutdown waits for in-flight handlers, while
   inproc shutdown removes its route registrations.
5. Runtime context cancellation.
6. Module and component `AfterAppStop()` hooks in reverse order.

Across separated processes, preserve the dependencies needed for unregistration:

1. Stop sending new external traffic.
2. Gracefully stop business applications.
3. Stop their Link processes after the applications finish.
4. Stop Portal after external traffic has drained.
5. Stop Hub last.

`linked` mode performs the application-before-Link ordering automatically.
Standalone stops applications in reverse order, followed by Link, Portal, and
Hub.

- [ ] Use `StartAndWait()` or call `StopGracefully()` in the process signal path.
- [ ] Give the orchestrator a termination grace period long enough for lifecycle
  hooks and in-flight requests.
- [ ] Make shutdown hooks bounded and observable.
- [ ] Verify that a normal rollout does not rely on lease expiry as its
  unregister mechanism.

The detailed application lifecycle is documented in [App API](../framework/app.md).

## Protect configuration, certificates, and backups

- [ ] Store database credentials, NATS URLs, seed files, and TLS private keys
  outside source control.
- [ ] Restrict the Hub database, seed file, Hub Redis, and backups to the same
  trusted operator boundary.
- [ ] Back up the Hub database and test restoring it into an isolated
  environment.
- [ ] Do not treat a seed YAML file as the ongoing backup. It imports initial
  state; the database remains the source of truth afterward.
- [ ] After restoring, verify application configuration, Portal rules, sites,
  certificates, and endpoint subscriptions.
- [ ] Exercise certificate replacement and SNI matching before relying on HTTPS
  entries.

Remember the configuration lifecycle: `eternal` configuration is startup state,
while new executions can observe updated `instant` configuration. Plan an
application restart when changing startup-only values. See
[Configuration](../framework/configuration.md).

## Scale within current boundaries

- [ ] Verify that each business application instance has a distinct runtime
  instance identity and that every expected instance registers.
- [ ] Give every Link a reachable ingress endpoint; use fixed addresses when the
  infrastructure cannot allow dynamic ports.
- [ ] Confirm both local and remote service calls while more than one target
  instance is registered.
- [ ] Verify Portal endpoint selection and routing after instances are added and
  removed.
- [ ] Scale down through graceful application shutdown before terminating Link.

The documented control-plane topology has one Hub. The current documentation doesn't
define active-active Hub coordination or a failover protocol, so don't count
additional Hub processes as production HA without validating that architecture
separately.

Portal maintains its own endpoint subscriptions and uses round-robin selection
for Rpc and Web targets. Link also maintains discovery state for local and remote
calls. Registration changes are asynchronous, so test convergence during rollout
instead of assuming an endpoint list changes atomically.

## Run production verification

Complete these checks in a staging environment with the same process and network
boundaries as production:

- [ ] Start Hub, then Portal and Link, then the business applications.
- [ ] Make a request through each public Portal entry.
- [ ] Make at least one application-to-application Rpc call.
- [ ] Verify expected trace IDs and timeouts across the request path.
- [ ] Apply an `instant` configuration change and restart for an `eternal`
  configuration change.
- [ ] Exercise Event and Task retry behavior with an idempotent test action.
- [ ] Test graceful application replacement and abrupt instance loss.
- [ ] Restart Link and verify registration, subscriptions, and routing recover.
- [ ] Restore a recent Hub database backup and validate the restored control
  plane.
- [ ] Confirm no internal listener is reachable from an untrusted network.

Vine doesn't mount a generic `/healthz` route on business applications. If the
deployment platform requires an HTTP liveness or readiness endpoint, add an
application-owned route whose semantics match the application's actual
dependencies. Also keep an end-to-end request check: a process-level probe alone
doesn't verify Hub, Link, Portal, discovery, or forwarding.

For timeout and trace verification, see [Trace and
Timeout](../framework/trace-timeout.md). For logging and integration tests, see
[Logging and Testing](../framework/logging-testing.md).
