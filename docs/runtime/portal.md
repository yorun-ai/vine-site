---
slug: /portal
sidebar_label: Portal Gateway
---

# Portal Gateway

Portal is Vine's northbound entry point. It reads entry, site, certificate,
descriptor, and endpoint data from Hub Redis, then routes incoming HTTP, HTTPS, Rpc,
and Web requests to the target application's Link endpoint.

```mermaid
flowchart LR
  Client["Browser / external client"] -->|"HTTP / HTTPS"| Portal["Portal"]
  Portal -->|"Read and subscribe"| Redis["Hub Redis"]
  Portal --> Link["Link ingress"] --> App["Business application"]
```

## Responsibilities

- **Entry listeners**: maintains HTTP and HTTPS listeners from Portal entries.
- **Site routing**: creates RpcGW or WebGW gateways from Portal site
  configuration and matches requests within each site.
- **Endpoint discovery**: continuously subscribes to Rpc and Web endpoint
  registrations and supplies available instances to gateways.
- **Authentication and authorization**: uses actor, service, and resource descriptors
  to call backend authentication and permission services when required before
  forwarding Rpc requests.
- **TLS certificates**: reads and watches certificates stored in Hub and matches
  HTTPS certificates by SNI.
- **Self-registration**: registers its own instance and Vine runtime version with
  Hub, then renews the registration while it runs, so Hub can report which Portal
  instances are serving.

Portal only handles external entry points and gateway policy. It isn't the
configuration source of truth, and it doesn't register applications or their
capabilities with Hub.

## Portal registration

In a separated deployment, Portal registers itself with Hub at startup, renews
the registration every 10 seconds, and unregisters on graceful shutdown. Hub
reports a Portal instance as serving until 30 seconds pass without a heartbeat,
so a terminated Portal disappears from the list on its own. The Hub Dashboard
shows registered Portal instances alongside application instances.

A restarted Hub reports no Portal instances until each Portal registers again on
its next heartbeat. Standalone Portal shares Hub's process and cannot outlive it,
so it registers once without a heartbeat.

## Starting Portal

Portal requires a running Hub:

```bash
vine portal serve \
  --hub-endpoint http://127.0.0.1:7071
```

`--hub-endpoint` can also be set through `VINE_PORTAL_HUB_ENDPOINT`. HTTP and HTTPS
listen addresses are not command-line options; the entry and rule configuration
stored in Hub determines them.

For a network deployment, configure Portal's `vine.portal` backend identity:

```bash
vine portal serve \
  --hub-endpoint https://hub.internal:7071 \
  --mtls-ca-file /run/vine/ca.pem \
  --mtls-cert-file /run/vine/portal.pem \
  --mtls-key-file /run/vine/portal-key.pem
```

Portal uses this certificate for the Hub Control Rpc calls it makes at startup
and while running — `InfoService` discovery plus registration, heartbeats, and
shutdown unregistration through `PortalRegistryService` — for the
Redis-protocol watch connection that loads and subscribes to Hub configuration,
and for calls to Link ingress. Its exact X.509-SVID is
`spiffe://<trust-domain>/vine/daemon/vine.portal`, using the same trust domain as Hub and
Link. These backend identity files are never served directly by browser-facing
HTTPS listeners. With mTLS enabled, Portal issues a separate, short-lived
self-signed Web certificate in memory when the SNI matches an HTTPS entry on the
listener and no configured certificate matches that host; the handshake rejects
unmatched SNI before certificate selection. Exact and wildcard certificates from
Hub always take precedence. Temporary certificates are not persisted and
disappear when Portal stops. They encrypt bootstrap traffic but are not
browser-trusted; configure a public certificate before production use.

## How Configuration Takes Effect

Portal can load most gateway changes without restarting. It watches the following
data in Hub Redis:

- Entry changes: determine listener addresses, HTTP/HTTPS ports, and automatic
  HTTPS redirects.
- Rule changes: determine the site that receives a request.
- Site changes: define Rpc or Web sites and their routing rules.
- Endpoint registrations: determine which Link instances can receive a request.
- Domain, actor, service, Web, and resource descriptors: determine authentication
  and authorization admission, and the contract catalog that API inspection and
  MCP serve.
- TLS certificates: provide SNI matching for HTTPS listeners.

Published configuration changes take effect in Portal without a restart, and
endpoint discovery refreshes as business instances register or expire.

A Hub restart needs no action on Portal: Portal reconnects to the running Hub and
continues serving without a restart. See
[Hub Restart and Endpoint Changes](./hub.md#hub-restart-and-endpoint-changes).

## WebGW timeout policies {#web-timeout}

A WEBGW Site can set `webTimeout` beside `cors` to give a Web site a total
execution budget, for example for package downloads:

```yaml
portalSites:
  - name: packages
    type: WEBGW
    actorSkelName: demo.UserActor
    webName: demo.PackageWeb
    cors:
      mode: SAME_DOMAIN
    webTimeout:
      default:
        total: 30s
      paths:
        - path: /go/**
          total: 15m
```

`total` is a positive Go duration. The first matching path rule wins over the
default; matching uses the decoded path after entry rewriting, without the query
string. A pattern without wildcards is exact, `*` matches within one segment, and
`**` occupies a whole segment and matches across segments, so `/go/**` covers
`/go`, `/go/`, and descendants but not `/gopher`. Patterns must start with `/`;
query strings, fragments, `.`/`..` segments, and other wildcard syntax are
rejected.

A configured policy is both the budget and its maximum: `vweb-options` may
shorten it, and a larger or absent request timeout uses the policy total. The
budget starts at WebGW admission and includes authentication and response
transfer; only the remaining time reaches the backend. SSE and WebSocket
connections also follow the policy and the ordinary Web
[cancellation rules](../framework/trace-timeout.md#client-cancellation).

Without a matching policy, ordinary Web requests default to 30 seconds and accept
a request option up to 120 seconds; SSE and WebSocket connections without a
request timeout keep their long-connection behavior.

The Dashboard edits the default and the ordered path list; saved changes apply to
new requests, while in-flight requests keep their deadline. An Admin update
replaces the whole block when present and clears it with an empty object;
omitting the field preserves it. The policy applies to WEBGW Sites only.

## Authentication modes

A service method inherits the service authentication mode when it declares none;
services and Web declarations cannot use `inherit`.

Rpc supports `required`, `optional`, and `anonymous`; Web also supports `off`.
Local descriptor registration and Hub reject explicit Rpc `off`:

| Mode | No credentials | Valid credentials | Invalid credentials |
| --- | --- | --- | --- |
| `required` | Reject | Authenticated actor | Reject |
| `optional` | Anonymous actor | Authenticated actor | Reject |
| `anonymous` | Anonymous actor | Reject | Reject |
| `off` (Web only) | No authentication | No authentication | No authentication |

Authentication-service failures also reject the request. Authentication admission
is followed by any applicable Rpc permission checks.

Web `off` skips Portal authentication and supplies an anonymous actor, preserving
`Authorization` so the application can authenticate it itself. Rpc and Web
`required`, `optional`, and `anonymous` remove `Authorization` after admission and
forward only the admitted actor.

An Rpc method without a mode uses its service mode; a service or Web declaration
without one is treated as `required`. Such a Web endpoint needs valid credentials
and an actor with authentication configured. Select `optional` or `off` for
anonymous access or handler-owned authentication.

Run Hub, Link, and Portal on the same version so authentication modes stay
consistent.

## Optional credentials

For Rpc and Web authentication, optional credential fields can be omitted from
`Authorization`. For example, when `token` is required and `tenant` is optional,
send `Authorization: token abc` if no tenant value is available, or
`Authorization: token abc, tenant team-a` to include it. An omitted field reaches
the authentication service as nil; do not send an empty value.

Every required field must be present, and every supplied value must be non-empty.
Unknown field names and malformed entries are rejected. Skel requires at least
one non-nullable credential field, so a valid request always supplies at least
one non-empty value.

## Inproc Mode

Portal can run in the same process as a standalone runtime, with the Hub Redis
connection and the target Link endpoint as in-process connections.

This mode can verify routing, descriptor subscriptions, admission, and gateway
forwarding, but it can't simulate independent process crashes, external network
partitions, or unreachable TLS ports. Use separate processes to test those
conditions.

## Portal entries

An entry defines the protocol, host, listener addresses, and ports Portal serves.
Every rule belongs to one entry, and the entry owns that access, so changing an
entry updates every rule it routes at once. The Dashboard lists entries beside
sites and rules, and the rule editor selects one when it creates a rule.

Seed YAML names entries in a `portalEntries` section, and rules in the same
document reference them by `entryName`:

```yaml
portalEntries:
  - name: web
    protocol: http
    http:
      host: api.example.com
      http: ENABLED
      httpPort: 80
      https: ENABLED
      httpsPort: 443
      autohttps: ENABLED
    listenIPs: ["0.0.0.0", "::"]

portalRules:
  - name: internal-api
    entryName: web
    matchPathPrefix: /api
    routeType: SITE
    routeSiteName: application-web
```

`protocol` accepts `http` and groups HTTP and HTTPS under one entry. The `http`
block is optional and requires `protocol`; it holds the request host and three
transport switches. In seed YAML a null block is rejected:

| Field | Value |
| --- | --- |
| `host` | Request Host to match; empty means IP access over HTTP only |
| `http` | HTTP transport: `ENABLED`, `DISABLED`, or `AUTO` |
| `httpPort` | HTTP listener port; `0` or omitted uses `80`, otherwise `1–65535` |
| `https` | HTTPS transport mode |
| `httpsPort` | HTTPS listener port; `0` or omitted uses `443`, otherwise `1–65535` |
| `autohttps` | HTTP-to-HTTPS redirect (`308`) mode |

Switch values are the exact upper-case words shown above; booleans, null, and
other values are rejected. An omitted switch is `AUTO`, which Hub resolves
against the entry host and its matching certificates:

- HTTP is enabled unless it is explicitly disabled.
- HTTPS is enabled only when the host is a domain with an enabled matching
  certificate. Certificate validity dates do not affect this decision, and a
  wildcard entry needs a certificate covering its whole wildcard namespace.
- The redirect is enabled only when the host is a domain and both transports
  are enabled.

An entry reports both the configured modes and an `effectiveHTTP` object with
`httpEnabled`, `httpsEnabled`, `autohttpsEnabled`, `httpsReason`, and the resolved
ports. An Admin update replaces the whole block when it sends `http`, so omitted
switches reset to `AUTO`; omitting the block keeps the current configuration.

An entry whose HTTPS is still waiting for a certificate still occupies its HTTPS
port for conflict checks. HTTP and HTTPS cannot use the same port, at least one
transport must be enabled, and two enabled entries may share a port only when
their addresses do not overlap or when they use the same address and scheme.
Portal opens listeners only for transports that are effective, so such an entry
starts serving HTTPS once a matching certificate appears.

Explicit settings must be satisfiable when they are saved:

- `https: ENABLED` requires a domain host and an enabled matching certificate.
- `autohttps: ENABLED` requires a domain host, both transports enabled, and an
  enabled matching certificate.
- A certificate change that would remove the last match for such an entry is
  rejected. Set the entry to `AUTO` or `DISABLED` before removing the
  certificate.

`AUTO` settings may wait for a certificate: upload it and Hub enables the
transport without an entry change. A seed can declare the certificate and the
entry in the same document.

With effective HTTP, HTTPS, and redirects all enabled, an HTTP request is
redirected to HTTPS only when its host matches a currently valid Portal TLS
certificate. The redirect keeps the request method, escaped path, and query
string, uses the concrete request host, including the host matched by a wildcard
certificate, and omits the port when `httpsPort` is `443`. Without a matching
valid certificate the request follows the normal HTTP rules, or receives `404`
when no rule matches. Certificate updates and expiry take effect without
restarting Portal. IP requests are never redirected. Set `autohttps: DISABLED` to
serve the same rules over both transports.

`listenIPs` selects the network addresses Portal binds for this entry; the
Dashboard exposes the same list. Omitting it, or setting `[]`, keeps the default
wildcard TCP listener, which serves IPv4 and IPv6 where the host supports both
families. An explicit address binds only its own family, so `["0.0.0.0", "::"]`
binds every interface in both families and `["127.0.0.1", "::1"]` binds loopback
only. Explicit IPv6 listeners require IPv6 support on the Portal host. Vine
normalizes and deduplicates the list, and rejects hostnames, ports, zone
identifiers, and overlapping wildcard and specific addresses. The `http.host` field
matches the request Host; it does not select a network interface.

Enabled entries that share a scheme, address, and port share one listener. Two
entries may share a port only when their addresses do not overlap or when they
use the same address and scheme, so a wildcard address and a specific address on
the same port conflict. Entries with the same host, scheme, and port must also
use the same HTTP configuration; configure the transports on one entry instead.
An enabled entry listens even without rules: requests that match no rule receive
`404`, and automatic HTTPS redirects still apply.

Listener changes are applied dynamically. If a new binding fails, Portal closes
the listeners it just opened and restores the previous configuration; startup
fails when the initial configuration cannot be bound. Changing a wildcard address
to a specific one can briefly interrupt connections.

Every seed rule references an entry declared in the same seed through
`entryName`; a rule that names an undeclared entry is rejected. An entry may
route no rule yet.

## Enabling and disabling configuration

Portal sites, entries, rules, and certificates carry an enable switch that the
Dashboard edits. Seed YAML uses `enabled`, which defaults to `true` when omitted;
an explicit empty or `null` value is rejected:

```yaml
portalRules:
  - name: legacy-api
    entryName: application
    enabled: false
    matchPathPrefix: /legacy
    routeType: SITE
    routeSiteName: application-web
```

A disabled rule is not served, and neither are the rules of a disabled entry or
the SITE rules of a disabled site. Redirect rules are not SITE rules, so they
stay published when their site is disabled. A disabled certificate is not served,
and may omit `certificate` and `privateKey` or carry incomplete PEM data; its
name, YAML shape, and field types are still validated. Enabling a certificate
requires a valid chain and a matching private key.

## Entry path mapping

When the Web contract behind a Web site declares a mount path, Portal uses that
path for both matching and forwarding, so the prefixes configured on the SITE
rules that target the site have no effect while the mount path exists:

- The rule editor shows the Web path and reports that the Web fixes both paths.
- Seed rules may omit both prefixes.
- A mount path of `/` serves from the root.
- The stored prefixes are kept, and apply again if the Web stops declaring a
  mount path.
- Site and contract changes refresh the effective paths without restarting Portal.

Redirect rules are unchanged: they keep their configured pattern and take no part
in mount-path resolution.

The following mapping options apply when the target Web has no mount path, or
when the target site is RpcGW.

SITE rules accept `routePathPrefix`, a path prefix within the target site. Portal
matches the original request using `matchPathPrefix`, replaces that prefix with
`routePathPrefix`, and then dispatches to the site's WebGW or RpcGW. This changes the
forwarded request, not the browser URL. It does not rewrite response bodies,
asset URLs, or redirect locations.

| `matchPathPrefix` | `routePathPrefix` | Request | Site receives |
| --- | --- | --- | --- |
| `/api` | empty | `/api/users` | `/users` |
| `/api` | `/internal` | `/api/users?x=1` | `/internal/users?x=1` |
| `/api` | `/api` | `/api/users` | `/api/users` |
| `/` | `/internal` | `/users` | `/internal/users` |
| `/api` | `/internal` | `/api` | `/internal` |
| `/api` | `/internal` | `/api/` | `/internal/` |

An empty value or `/` retains prefix stripping. Other values must start with `/` and
must not contain a scheme, host, query, fragment, backslash, control characters,
or `.` / `..` segments. Trailing slashes on the configured target prefix are
removed. Encoded request suffixes, query parameters, method, body, and request
context are preserved during entry rewriting. Matching still uses path-segment
boundaries (`/api` does not match `/api2`) and existing rule precedence.
For RpcGW, the resulting path must be a gateway path such as
`/invoke/demo.Service/Method`; `routePathPrefix` does not bypass gateway admission.
Redirect rules use `routeRedirectionPattern` and cannot specify `routePathPrefix`.

Configure **Target path prefix** in the Dashboard rule editor or include it in
Hub seed YAML:

```yaml
portalEntries:
  - name: application
    protocol: http
    http:
      host: api.example.com
      httpPort: 8080
      https: DISABLED
      autohttps: DISABLED
portalRules:
  - name: internal-api
    entryName: application
    matchPathPrefix: /api
    routeType: SITE
    routeSiteName: application-web
    routePathPrefix: /internal
```

Configure the target site before sending traffic to the rule. Rule updates
take effect without restarting Portal. Omitting `routePathPrefix`
from an API update leaves it unchanged; sending an empty string clears it.
Seed YAML is a complete rule value: omitting the field means empty.

## Rule validation

The following requirements apply to the Admin API and startup seed YAML.

An entry accepts `protocol: http` with the HTTP block described above. Its
`http.host` may be empty, a hostname, an IP address, or a wildcard such as
`*.example.com`; it must not include a URL or port, and only a leading `*.` is
accepted for a wildcard. Vine trims the host, lowercases it, and strips one
trailing dot before storing it. A rule requires a name and an `entryName`: a seed
must declare that entry in the same document, and the Admin API requires an entry
Hub already stores. The rule's `matchPathPrefix`, when set, must start with `/`
and cannot contain query or fragment delimiters, backslashes, whitespace, control
characters, or dot segments.

A wildcard host matches exactly one subdomain label, so `*.example.com` matches
`shop.example.com` but not `example.com` or `a.b.example.com`. Every rule in a
wildcard entry must target a Web site, and that site must already exist: Rpc
targets and redirects are rejected, and the rule stops serving if its target site
is later removed or becomes a non-Web type. Point wildcard DNS at Portal and
provide a matching certificate for HTTPS.

For HTTPS, each TLS handshake first matches SNI against the entries on that
listener and then selects a certificate. An exact entry host wins over a wildcard
entry, and a wildcard certificate alone does not admit other hosts. Missing, IP,
or unmatched SNI is rejected, including on session resumption. The request Host
must match the handshake SNI after ignoring the port, letter case, and a trailing
dot; otherwise the request receives `421`. Rules are then selected only from the
matched entry host, without falling back to a wildcard entry when no path matches.

For HTTP, Portal selects the entry by Host, preferring an exact host over a
wildcard, and uses only that entry's rules and automatic redirect. If neither
matches, the request receives `404` rather than falling back to a wildcard entry.
An empty host matches only requests whose Host is an IP address, and an exact IP
entry wins over it. Within the selected entry, the longest `matchPathPrefix`
wins.

`SITE` requires `routeSiteName` and rejects `routeRedirectionPattern`.
`PERMANENT_REDIRECT` and `TEMPORARY_REDIRECT` require `routeRedirectionPattern`
and reject site names and nonempty route path prefixes. Redirect placeholders
are `{scheme}`, `{host}`, `{uri}`, `{path}`, `{query}`, `{method}`, and `{remote}`;
unrecognized placeholders or unmatched braces are rejected.
Saving a rule does not check whether its target site exists, except in a wildcard
entry, whose target must already be a Web site. Configure the target site before
it needs to handle requests.

## Rule conflicts

Two rules conflict when they belong to the same entry and resolve to the same
match path, because Portal cannot order them. The rule whose name sorts first
serves the request; the other takes over as soon as the first stops serving it.
The Dashboard marks both rules and shows the request they match, and the Admin API
reports every pair through `listConflicts`.

Resolve a conflict by disabling one rule, creating the rule under a different
entry, or changing the mount path of its site, which changes the path its rules
resolve to.

## Certificate information

Certificates use PEM text in `certificate`, which carries the leaf certificate
followed by any intermediate certificates, and `privateKey`:

```yaml
portalCerts:
  - name: example
    certificate: |
      -----BEGIN CERTIFICATE-----
      ...
      -----END CERTIFICATE-----
    privateKey: |
      -----BEGIN PRIVATE KEY-----
      ...
      -----END PRIVATE KEY-----
```

Hub validates the certificate chain and its match with the private key before
saving. An Admin API update may omit `privateKey` to keep the stored key, which is
also how an empty Dashboard key field behaves, and certificate read APIs never
return private key contents.

Issuer, domains, and validity dates are read automatically from the certificate;
you do not need to fill them in. Certificate content takes precedence over any
metadata supplied in YAML. The domains a certificate covers decide which entry
hosts can enable HTTPS and automatic redirects, and Hub recomputes the affected
entries when the certificate set changes.

## API Service Boundaries

An `api service` is a client entry point reached through Portal. Only API services
are exposed to clients; plain backend services are not. An [extension
service](https://skel.yorun.ai/docs/services) (`ext service`) is not exposed to
clients either, even when the declaration carries `for`, `auth`, or `require` rules.
Backend authentication, permission, and resource-check services keep running
behind Portal and are not client entry points.

## RpcGW backend requests

`/invoke` and MCP forward a fixed set of headers to the backend: `Accept`,
`Content-Type`, `vrpc-client`, `vrpc-trace`, `vrpc-initiator`, `vrpc-actor`, and
`vrpc-options`, with trace, initiator, actor, and the remaining timeout filled in
by Portal. Cookies, arbitrary custom headers, forwarding headers, MCP headers,
and response-only vRPC headers are not forwarded; the User-Agent and client IP
remain available only as initiator metadata. Business identity belongs in
admitted actor information and per-call input in method parameters, so there is
no configurable header passthrough.

A request body must be uncompressed: only an absent or a single `identity`
`Content-Encoding` is accepted. Other or malformed encodings are rejected before
admission.

## Inspect API contracts

Enable **Inspect** on an RPCGW site in the Hub Dashboard, or set
`inspectEnabled: true` in its seed definition:

```yaml
portalSites:
  - name: public-api
    type: RPCGW
    actorSkelName: demo.UserActor
    inspectEnabled: true
```

The switch defaults to `false` and is supported only on RPCGW sites. Dashboard
changes take effect without restarting Portal. Inspection is read-only and does
not require credentials, so any client that can reach the site can read the
catalog. Calling an API still applies its normal authentication and permission
checks.

If a Portal rule mounts the site at `/api`, the endpoints are:

| GET path | Response body |
| --- | --- |
| `/api/inspect/_list` | `{ "services": [...] }` containing service summaries |
| `/api/inspect/demo.UserService/_list` | `{ "service": {...}, "methods": [...] }` containing method summaries for that service |
| `/api/inspect/demo.UserService/get` | Method metadata, `inputSchema`, and `outputSchema` |

`/api/inspect` and `/api/inspect/` also return the service list. Replace service
and method names with the `skelName` values returned by the lists, including any
version suffix. The `/api` prefix depends on your entry rule's path mapping.

Responses use `application/json`. Lists are returned in a `services` or `methods`
field; method details are returned as objects directly. For example, a service list:

```json
{
  "services": [
    {"name": "UserService", "skelName": "demo.UserService"}
  ]
}
```

Method lists also include the same service summary as the catalog in `service`:

```json
{
  "service": {
    "name": "UserService",
    "skelName": "demo.UserService"
  },
  "methods": [
    {"name": "get", "skelName": "get", "authMode": "required"}
  ]
}
```

Only API services configured for this site and accepting its Actor appear;
internal services and APIs belonging to other Actors are excluded. Summaries
carry names, descriptions, and deprecation information when declared. Method
summaries and details expose `authMode` and `require` as the effective invocation
policy, and a detail also identifies its `service`. Lists are sorted by
`skelName`, and an empty result returns an empty array in the corresponding
field, such as `{ "services": [] }` or `{ "service": {...}, "methods": [] }`. A
running backend instance is not required to inspect a registered contract.

### JSON Schema format

`inputSchema` and `outputSchema` are independent
[JSON Schema Draft 2020-12](https://json-schema.org/specification) documents.
The catalog and method metadata around them use Vine's inspect response shape.

- `inputSchema` describes the named argument object inside vRPC `params`.
  `outputSchema` describes the value inside `result`; a method without output
  has a `null` schema. The envelopes themselves are not part of these schemas.
- Each document contains its own `$schema` and the referenced Data/Enum
  definitions in `$defs`. Local `$ref` values support generic specializations
  and recursive structures; no other endpoint is needed to resolve them.
- Non-nullable members appear in `required`. Nullable members may be omitted or
  set to `null`. Unknown object members remain allowed for forward compatibility.
- Enums describe declared values and the generated `UNSPECIFIED` fallback.
  Lists are arrays, and maps are objects with key and value constraints.
- Scalars follow their JSON wire representation: decimal is a string, binary is
  a base64 string, and UUID, timestamp, and local date use the corresponding
  standard formats. Duration uses Go duration strings such as `1h30m0s`;
  local time and local date-time have no time zone. They do not use the JSON
  Schema `duration` or time-zone-bearing `time`/`date-time` formats.
- Descriptions, deprecation, and examples become schema annotations.
  `x-skel-type`, `x-skel-sensitive`, and `x-skel-deprecatedReason` preserve
  additional Skel metadata. Sensitivity is an annotation, not access control.

For example, extract a method's input schema with:

```bash
curl -s http://localhost:8080/api/inspect/demo.UserService/get \
  | jq '.inputSchema'
```

The schemas describe contracts; inspection does not add request validation to
`invoke`. Standard validators and tooling can consume the extracted schemas.

### Availability and errors

Failures use the corresponding HTTP status code and a body containing `code`
and `message` directly, for example:

```json
{
  "code": "SERVICE_UNAVAILABLE",
  "message": "inspect descriptors are syncing"
}
```

Disabled inspection, unknown paths, and services or methods outside the visible
catalog return HTTP 404. Methods other than GET return HTTP 400 with
`INVALID_REQUEST`; OPTIONS provides the site's CORS preflight for GET.

While descriptors are synchronizing, inspection returns HTTP 503 with
`SERVICE_UNAVAILABLE` and `Retry-After: 1`. Method details also return 503 if a
required type definition is missing or cannot be represented. Responses use
`Cache-Control: no-store`.

## MCP tools

Enable **MCP** on an RPCGW site in Hub Dashboard, or set `mcpEnabled: true`:

```yaml
portalSites:
  - name: api
    type: RPCGW
    actorSkelName: demo.UserActor
    mcpEnabled: true
```

The switch defaults to `false`, updates without a restart, and is independent of
Inspect. With an entry mapping `/api` to this site's root, configure an MCP
client's Streamable HTTP URL as `https://api.example.com/api/mcp`.

The endpoint implements MCP `2026-07-28`. Clients must send the
`MCP-Protocol-Version` header with that revision; any other value, or a missing
header, returns HTTP 400. Clients may call `server/discover` before listing or
calling tools. Responses are JSON, and the server keeps no session state. The
endpoint provides tools only, without prompts, resources, or tool-list change
notifications. GET and DELETE return 405.

### Discovery and calls

`tools/list` returns tools for the site's configured API services that accept
its Actor. Discovery requires neither credentials nor a live backend instance.
Each API method is one tool, normally named `{serviceSkelName}.{methodSkelName}`,
for example `demo.UserService.get`. Call tools by the returned `name`; a name
outside the MCP tool-name grammar is replaced by a stable generated identifier,
while `title` keeps the `Service/Method` wire path. Lists are sorted by tool name
and contain up to 100 tools per page. Pass `nextCursor` back as `cursor` until it
is absent.

Tools expose JSON Schema 2020-12 `inputSchema` and `outputSchema`, including
referenced Data and Enum definitions. A `tools/call` request supplies the tool
name and named arguments, for example:

```json
{
  "name": "demo.UserService.get",
  "arguments": {"id": 42}
}
```

This is the request's `params` content; the MCP client supplies the protocol
framing and version metadata. Input and successful output are schema-validated.
`structuredContent` contains the API value directly, with the same JSON in text
`content`. `outputSchema` describes that value, whether it is a scalar, array,
object, or `null`. Void methods return `"structuredContent": null`.

### Authentication and availability

Configure the client's HTTP `Authorization` header with the same Vine credential
format used by `/api/invoke`. Calls use the site's Actor and each method's
existing authentication and permission rules. Invalid credentials never fall
back to anonymous access. Credentials do not reach the business service.
This endpoint does not provide OAuth discovery or automatic login.

Disabled MCP returns 404. Unknown tools and malformed requests produce protocol
errors; API failures and invalid tool arguments produce a result with
`isError: true`. Descriptor synchronization produces a protocol error with
`Retry-After: 1`; unresolved schemas also fail until their contracts become
available. Responses are not cacheable.

Tool calls default to a server-controlled 30-second limit.
`params._meta["vmcp-options"]` accepts an options string such as
`"timeout=60s"`, up to 120 seconds, with the same syntax and validation as
`vrpc-options`; invalid values produce JSON-RPC Invalid Params, and unknown
options are ignored. The option is a Vine extension rather than a standard MCP
field, and it does not change the client SDK's own wait. Accepted calls are not
cancelled by client disconnects, caller deadlines, or MCP SDK cancellation; see
[client cancellation](../framework/trace-timeout.md#client-cancellation).

Browser requests must use the entry's own origin or an origin allowed by site
CORS. A disallowed or malformed Origin returns 403, including preflight requests.

## Related Documentation

- [Hub](./hub.md): manages Portal entries, rules, sites, and certificates.
- [Link](./link.md): hosts target application ingress and endpoint registrations.
- [Rpc](../infrastructure/rpc.md): the Rpc abstraction used inside applications.
