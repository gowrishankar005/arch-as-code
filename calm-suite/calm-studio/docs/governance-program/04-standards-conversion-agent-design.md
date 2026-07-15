# Track C — Standards Conversion Agent: Confluence → Governance Artifacts

Status: DRAFT · Depends on: Track K, Track D layout · Gate: real fixture pack (R6)

## 1. Shape: skill + agent pipeline

- **Skill** (versioned methodology, reviewed once): IR schema, CALM/Rego
  generation idioms, Track K typing rules + org glossary, few-shot examples per
  document style (pattern-language, formal standard, best-practice list,
  reference architecture).
- **Agent pipeline** (per document, batchable; runs only against the
  org-approved LLM endpoint — BR-7):

```
1 INGEST    Confluence API storage-format XHTML + attachments (diagrams);
            capture page ancestry (space/tree position = applicability context)
            and cross-page links (dependency-ordered conversion)
2 CLASSIFY  pattern | standard | guideline | config | not-convertible;
            skip drafts/superseded (lifecycle metadata required)
3 EXTRACT   text + diagrams → IR: governance statements
            {modality MUST/SHOULD/MAY, subject-kind, constraint,
             verbatim source quote + anchor}
            diagram/text cross-check — conflicts flagged, never resolved by guess
4 GENERATE  IR → bundle per Track D taxonomy:
            MUST+shape → pattern.json | MUST+graph → .rego (+_test.rego)
            SHOULD → Spectral warn | MAY → docs note
            + provenance record per rule
5 VERIFY    (a) compile: AJV vs CALM 1.2 meta-schemas; enum lint (protocols, types)
            (b) positive fixture passes both engines
            (c) ADVERSARIAL negative fixtures — written by a separate agent
                instance that sees only the IR (not the artifacts) — one per
                MUST statement; each must fail with the expected rule id
            (d) traceability audit: every const/enum/rule cites an IR quote;
                uncited ⇒ reject as hallucination
6 SCORE     high-confidence → auto-publish to governance/ repo (PR)
            flagged → triage queue with a specific question attached
7 PUBLISH   PR into governance repo; provenance + content-hash recorded;
            Confluence webhook re-triggers on source change (drift report)
```

## 2. Honest HITL budget (not zero)

| Human touch | When | Est. volume |
|---|---|---|
| Glossary/typing workshop | once | half-day |
| Triage queue (ambiguous modality, diagram/text conflict, cross-doc contradiction) | per flagged doc | 20–30% of corpus initially |
| QA sample (IR-vs-source audit — catches misreads verification cannot) | ongoing | 10% random sample |
| Policy-conflict resolution between documents | corpus pass | governance decision, not conversion |

Verification limits (stated plainly): steps 5a–5d guarantee artifacts
faithfully implement **the IR**; they cannot detect an IR that misread the
prose. That is what the QA sample is for.

## 3. Corpus-level passes (before per-document conversion)

1. Inventory + lifecycle triage (active/draft/superseded).
2. Contradiction detection across pages (report to governance, do not auto-pick).
3. Control canonicalization (one canonical control per real rule).

## 4. Implementation vehicle

Claude Agent SDK batch job; the existing `@calmstudio/mcp-server` (20 tools)
is the integration point for CALM-aware operations (validate, schema lookups)
so the agent never hand-rolls schema knowledge.

## 5. Test plan

- Golden-file tests: each fixture document (public proxies + real pack R6) →
  expected IR → expected bundle; diffs reviewed like code.
- Verification-loop self-test: seeded hallucination (uncited const) must be
  rejected; seeded under-strict pattern must fail adversarial fixture step.
- `opa test` green for all generated policies; `calm validate` green for all
  generated patterns against their positive fixtures.
- No Playwright surface (headless pipeline) — except the triage queue UI if
  built into Studio later (separate design).

## 6. Acceptance criteria
- End-to-end run on the real fixture pack: ≥1 page fully auto-converted green;
  flagged items produce specific, answerable questions; zero uncited elements
  in published artifacts.
