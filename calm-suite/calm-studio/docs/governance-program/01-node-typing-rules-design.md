# Track K — Node-Typing Decision Rules (Solution Design)

Status: DRAFT · Blocks: Tracks B and C · Task ref: #7

## 1. Why this exists

CALM 1.2's `node-type` is `anyOf: [enum, string]` — **any string is
schema-valid**. Consistency therefore cannot come from the schema; it must
come from conventions that bind three consumers equally:

1. the draw.io importer (Track B type inference),
2. the standards conversion agent (Track C artifact generation),
3. human architects drawing in Studio.

Without one ruleset, validation false-fails on correct architectures and the
program's credibility dies with it.

## 2. Deliverable

A single versioned document `node-typing-rules.md` + machine-readable
companion `node-typing-rules.json` (consumed by importer tier-2 and the
conversion agent), containing:

- decision rules for every ambiguous pairing (below),
- the org glossary (enterprise vocabulary → CALM type),
- the custom-type registry (extension types beyond the core enum, e.g. queues),
- a lint profile (Spectral) that flags violations in any `.calm.json`.

## 3. The decision rules (draft positions to be ratified at workshop)

| Ambiguity | Rule (draft) | Rationale |
|---|---|---|
| **system vs service** | `system` = deployable boundary owned by a team, appears on org landscape (C4 L1). `service` = independently runnable unit inside a system (C4 L2/container). A node is `system` iff it contains (composed-of/deployed-in) other nodes or is external. | Anchors the choice to containment, which is observable in the model, not judgment |
| **API gateway / LB / WAF / proxy / CDN** | `network` when it only routes/filters (LB, WAF, CDN, firewall). `service` when it executes business/aggregation logic (BFF, API gateway with transformation). Default for "API Gateway" label alone: `network` + review flag | Matches FINOS conference examples (load-balancer as network); logic-bearing gateways behave like services in validation rules |
| **database vs data-asset** | `database` = the running store (has interfaces, connections). `data-asset` = the data itself when a standard governs the *data* (classification, residency). Both may coexist; controls about encryption-at-rest attach to `database`, controls about data classification attach to `data-asset` | Lets prose standards about data map deterministically |
| **queues/topics/brokers** | Custom extension type `messaging:queue` / `messaging:topic` (registry entry), rendered by the existing Messaging pack. Never plain `service` | Core enum has no async primitive; typing them `service` destroys rule precision ("services must not connect directly to databases" ≠ broker semantics) |
| **security zones / DMZ / VPC** | Zones are `network`-typed **container** nodes; membership via `deployed-in`. Zone-traversal rules are Rego policies over containment, never nodes-as-boundaries | Preserves zone semantics for the hybrid validation tier |
| **actor edges: interacts vs connects** | `interacts` iff source is `actor` and the edge means human/organization usage. System-to-system always `connects`. Importer rule: actor-stencil source ⇒ `interacts` | Deterministic; matches CALM intent |
| **on-prem appliances (mainframe, LDAP, SFTP server…)** | Map via glossary: `ldap` where applicable; else custom registry types (`onprem:mainframe` etc.) with a required `metadata.hosting: on-prem` | Keeps cloud/on-prem queryable by Rego |
| **casing/custom strings** | Only enum values or registry entries pass lint. `"Service"`, `"microservice"` → lint error with fix-it | Closes the open-string escape hatch |

## 4. Acceptance criteria

- Every rule has ≥1 positive and ≥1 negative example architecture snippet.
- `node-typing-rules.json` consumed by importer T2 in a unit test.
- Spectral lint profile flags all negative examples, passes all positive.
- Ratified (or amended) in the glossary workshop; version 1.0 tagged.

## 5. Testing

Unit tests only (no UI surface). Vitest: rules JSON round-trip, lint profile
against example fixtures. Playwright not required for this track.
