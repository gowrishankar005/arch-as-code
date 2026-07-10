# Node-Typing Decision Rules — v0.1 (DRAFT, pending workshop ratification)

The single ruleset governing how architecture concepts map to CALM 1.2 node
types and relationship variants. It binds equally: the draw.io importer
(Track B), the standards conversion agent (Track C), and human architects
drawing in CALM Studio.

Why this exists: CALM 1.2's `node-type` is `anyOf: [enum, string]` — any
string is schema-valid, so consistency must come from convention, not schema.
Without one ruleset, validation false-fails on correct architectures.

Machine-readable companion: `node-typing-rules.json` (consumed by importer
Tier-2 and the conversion agent). Lint: `spectral-node-typing.yaml`.

---

## R1 — system vs service (abstraction level)

A node is a **`system`** iff it satisfies either:
- it contains other nodes (`composed-of` or `deployed-in` container), or
- it is external/third-party and modeled as a black box (C4 Level-1 System).

Otherwise a deployable/runnable unit is a **`service`** (C4 Level-2 Container).

The test is *observable in the model* (containment), not judgment. If a node
starts as `service` and later gains children, it becomes `system` at that
point.

✅ `{"unique-id": "payments", "node-type": "system"}` + `composed-of` children
✅ `{"unique-id": "orders-api", "node-type": "service"}` — leaf, runnable
❌ `payments` typed `service` while being a `composed-of` container

## R2 — gateways, load balancers, WAFs, proxies, CDNs

- **`network`** when the node only routes, filters, or terminates traffic:
  load balancer, WAF, firewall, CDN, reverse proxy, plain API gateway.
- **`service`** when it executes business or aggregation logic: BFF, GraphQL
  federation layer, gateway with transformation/orchestration.
- Label "API Gateway" with no further signal → `network` + review flag
  (importer confidence MEDIUM, never HIGH).

✅ `{"name": "WAF", "node-type": "network"}`
✅ `{"name": "Mobile BFF", "node-type": "service"}`
❌ `{"name": "Load Balancer", "node-type": "service"}`

## R3 — database vs data-asset

- **`database`** = the running store (has interfaces/connections attached).
- **`data-asset`** = the data itself, used when a standard governs the *data*
  (classification, residency, retention).
- Both may coexist for the same underlying thing. Control attachment rule:
  encryption-at-rest / backup / availability controls → the `database` node;
  classification / residency / PII controls → the `data-asset` node.

✅ `orders-db` (`database`) connected via JDBC; `customer-pii` (`data-asset`)
  with `data-classification: "restricted"`
❌ a `data-asset` node as the destination of a JDBC `connects`

## R4 — queues, topics, brokers (custom registry type)

CALM core has no async primitive. Use registry types, never plain `service`:
- **`messaging:queue`** — point-to-point (SQS, RabbitMQ queue)
- **`messaging:topic`** — pub/sub (SNS, Kafka topic)
- **`messaging:broker`** — the broker infrastructure itself (Kafka cluster,
  RabbitMQ server) when modeled as a node; individual topics/queues may be
  `deployed-in` it.

Rationale: typing these `service` destroys rule precision — "only services
connect to databases" must not accidentally license a queue to do so.

## R5 — security zones, DMZ, VPCs, subnets

Zones are **`network`-typed container nodes**; membership is expressed with
`deployed-in`. Zones are never expressed as flat labels or metadata only.
Zone-traversal rules ("PAZ→RZ traffic must pass a gateway") are **Rego
policies over containment**, never patterns.

✅ `{"unique-id": "prod-vpc", "node-type": "network"}` +
  `deployed-in { container: "prod-vpc", nodes: [...] }`
❌ zone recorded only as `metadata.zone: "DMZ"` with no container node

## R6 — actor edges: interacts vs connects

- **`interacts`** iff the source is an `actor` node and the edge means human
  or organizational usage.
- System-to-system communication is always **`connects`** (with protocol
  where known).
- Importer rule: actor-stencil source ⇒ `interacts`.

✅ `interacts { actor: "customer", nodes: ["web-app"] }`
❌ `connects { source: {node: "customer"} ... }` where `customer` is an actor

## R7 — on-prem and appliance nodes

- Directory services → core **`ldap`** where applicable.
- Other on-prem appliances (mainframe, SFTP server, HSM) → registry types
  (`onprem:mainframe`, `onprem:sftp`, `onprem:hsm`) **plus** required
  `metadata: [{"hosting": "on-prem"}]` so Rego rules can scope by hosting.

## R8 — casing and the open-string escape hatch

Only these pass lint:
1. the CALM 1.2 core enum: `actor`, `ecosystem`, `system`, `service`,
   `database`, `network`, `ldap`, `webclient`, `data-asset`;
2. registry entries in `node-typing-rules.json#/registry` (namespaced
   `<pack>:<type>`, e.g. `messaging:queue`, or vendor packs like `aws:lambda`).

Anything else — `"Service"`, `"microservice"`, `"DB"` — is a lint **error**
with a fix-it suggestion from the glossary. This rule is what closes CALM's
`anyOf: [enum, string]` escape hatch in practice.

---

## Governance of this document

- Changes require a version bump here and in `node-typing-rules.json`
  (`version` field) and re-run of the lint fixtures.
- The glossary (`#/glossary`) may grow without a rules change (patch bump).
- Ratification: architecture workshop sign-off converts v0.x → v1.0.
