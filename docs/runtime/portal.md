---
slug: /portal
---

# Portal

Portal is Vine's northbound entry point. It reads entry, site, certificate, schema, and endpoint data from Hub Redis, then routes incoming HTTP, HTTPS, Rpc, and Web requests to the target application's Link endpoint.

```mermaid
flowchart LR
  Client["Browser / external client"] -->|"HTTP / HTTPS"| Portal["Portal"]
  Portal -->|"Read and subscribe"| Redis["Hub Redis"]
  Portal --> Link["Link ingress"] --> App["Business application"]
```

## Responsibilities

- **Entry listeners**: maintains HTTP and HTTPS listeners from Portal rules.
- **Site routing**: creates RpcGW or WebGW gateways from Portal site configuration and matches requests within each site.
- **Endpoint discovery**: continuously subscribes to Rpc and Web endpoint registrations and supplies available instances to gateways.
- **Authentication and authorization**: uses actor, service, and resource schemas to call backend authentication and permission services when required before forwarding Rpc requests.
- **TLS certificates**: reads and watches certificates stored in Hub and matches HTTPS certificates by SNI.

Portal only handles external entry points and gateway policy. It is not the configuration source of truth, does not register applications, and does not send heartbeats.

## Starting Portal

Portal requires a running Hub:

```bash
vine portal serve \
  --hub-endpoint http://127.0.0.1:7071
```

You can also set `--hub-endpoint` through `VINE_HUB_ENDPOINT`. Portal's actual HTTP and HTTPS listen addresses are not fixed command-line options; Portal entry and rule configuration stored in Hub determines them.

## How Configuration Takes Effect

Portal can load most gateway changes without restarting. It watches the following data in Hub Redis:

- `portal:rule:*`: determines the scheme, port, and site that receives a request.
- `portal:site:*`: defines Rpc or Web sites and their routing rules.
- Endpoint registrations: determine which Link instances can receive a request.
- Actor, service, and resource schemas: determine Rpc authentication and authorization admission.
- TLS certificates: provide SNI matching for HTTPS listeners.

After Hub publishes a change, Portal updates the corresponding listener, gateway, or cache. Endpoint discovery also updates as business instances register or expire.

## Inproc Mode

Portal can run in the same process as a standalone runtime. Its module boundaries and Redis subscription semantics remain the same, but both the Hub Redis connection and target Link endpoint may be in-process connections.

This mode can verify routing, schema subscriptions, admission, and gateway forwarding, but it cannot simulate independent process crashes, external network partitions, or unreachable TLS ports. Use separate processes to test those conditions.

## Related Documentation

- [Hub](/docs/hub): manages Portal entries, rules, sites, and certificates.
- [Link](/docs/link): hosts target application ingress and endpoint registrations.
- [Rpc](/docs/rpc): the Rpc abstraction used inside applications.
