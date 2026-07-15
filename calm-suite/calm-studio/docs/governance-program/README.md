# Architecture Governance Automation Program — Document Set

Converts the org's prose standards (Confluence) and diagram estate (draw.io)
into automatically validated CALM architectures, without adding day-to-day
burden on delivery teams.

| Doc | Contents |
|---|---|
| [00-program-brief.md](00-program-brief.md) | BRD: problem, objectives, business requirements BR-1…7, success metrics, risk register R1…8, org dependencies |
| [01-node-typing-rules-design.md](01-node-typing-rules-design.md) | Track K (keystone): node-typing decision rules — the ontology conventions binding importer, conversion agent, and humans |
| [02-drawio-importer-design.md](02-drawio-importer-design.md) | Track B: draw.io → CALM importer (multi-CSP + on-prem stencils, tiered inference, review panel, Playwright visual test plan) |
| [03-hybrid-validation-design.md](03-hybrid-validation-design.md) | Track D: hybrid CALM patterns + OPA/Rego validation, CI enforcement via github-action, controls anti-explosion strategy |
| [04-standards-conversion-agent-design.md](04-standards-conversion-agent-design.md) | Track C: Confluence → governance artifacts agent pipeline with self-verification and honest HITL budget |
| [05-implementation-roadmap.md](05-implementation-roadmap.md) | Phases 0–5, gates, dependencies, program-wide test strategy, ownership map, competent-authority additions |

Status: all DRAFT, pending review. Feasibility prototypes referenced in the
docs were executed 2026-07 (draw.io conversion passing `calm validate`;
hybrid Rego approach validated by research).
