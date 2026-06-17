<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Validate Against a Pattern — Quick Start

CALM Studio can validate a drawn architecture against a **pattern, standard, or
control set** using the same CLI-grade engine the `calm validate` CLI uses
(JSON-Schema pattern composition + Spectral rules). It runs entirely
client-side and offline.

This guide covers: **build & run** → **add patterns to the shared catalog** →
**validate**.

---

## 1. Prerequisites

- **Node 22** (CI baseline; the repo pins `22.22.2` in `.nvmrc`).
  ```bash
  node --version   # must be v22.x
  nvm use          # if you use nvm
  ```
- Run all `npm` commands from the **repository root** (npm workspaces).

---

## 2. Build & run

From the repo root:

```bash
# 1. Install once (first time, or after dependency changes)
npm install

# 2. Build the libraries the Studio app consumes, in order:
npm run build --workspace=@finos/calm-shared      # validation engine
npm run build --workspace=@calmstudio/calm-core   # Studio core + pattern-validation entry

# 3. Run the app (Vite dev server on http://localhost:5173)
npm run dev --workspace=@calmstudio/studio
```

Open **http://localhost:5173**.

> The validate-against-pattern engine is **lazy-loaded** — it only downloads when
> you first validate against a pattern.

### Production build / preview

```bash
npm run build   --workspace=@calmstudio/studio   # static build → apps/studio/build/
npm run preview --workspace=@calmstudio/studio   # serve the production build
```

### Desktop (Tauri, offline-first)

From `calm-suite/calm-studio/apps/studio`:

```bash
npm run tauri dev     # dev desktop build
npm run tauri build   # packaged desktop app
```

The shared pattern catalog (below) is bundled into the desktop app, so pattern
validation works with no network.

---

## 3. Add patterns to the shared catalog

The shared catalog lives at:

```
calm-suite/calm-studio/apps/studio/static/patterns/
├── index.json                       ← the manifest the picker reads
├── permissive-baseline.pattern.json
├── must-have-database.pattern.json
└── strict-public-web.pattern.json
```

These are **static assets** (served at `/patterns/…`), so adding a pattern needs
**no app rebuild** for a deployed instance, and it ships with the desktop app.

### Step 1 — copy your pattern file in

A pattern is a CALM pattern / curated JSON Schema. Drop the file into the folder:

```bash
cp my-team-standard.pattern.json \
   calm-suite/calm-studio/apps/studio/static/patterns/
```

### Step 2 — add a manifest entry

Edit `static/patterns/index.json` and add an object to the `patterns` array:

```jsonc
{
  "patterns": [
    // …existing entries…
    {
      "id": "my-team-standard",                 // stable, unique
      "name": "My Team Standard",               // card title
      "description": "Every service must declare an interface and a control.",
      "category": "security",                   // groups patterns into picker tabs
      "tags": ["controls", "interfaces"],       // display pills
      "file": "my-team-standard.pattern.json"   // filename in this folder
    }
  ]
}
```

| Field | Required | Purpose |
|-------|----------|---------|
| `id` | yes | Stable identity (must be unique). |
| `name` | yes | Card title in the picker. |
| `description` | yes | One-line card description. |
| `category` | yes | Picker tab grouping (e.g. `general`, `security`). |
| `tags` | yes | Array of strings shown as pills (`[]` is fine). |
| `file` | yes | Filename within `static/patterns/`. |

The picker renders cards straight from the manifest; the actual pattern file is
fetched only when a card is selected. If `index.json` is missing or malformed,
the picker shows an empty state rather than failing.

> **Tip — writing the pattern itself:** a CALM pattern is a JSON Schema over a
> CALM document. Declare both `nodes` and `relationships` as top-level
> `properties` (the Spectral pattern ruleset requires it). Reference the CALM
> 1.2 node/relationship shapes via
> `"$ref": "https://calm.finos.org/release/1.2/meta/core.json#/defs/node"`.
> See the seeded examples in `static/patterns/` for `prefixItems` (positional)
> and `contains` (any-node) styles.

---

## 4. Validate

1. Load or draw an architecture (toolbar **Demos**, or the **Components**
   palette).
2. Click **Pattern** in the toolbar → the **picker** opens, showing the catalog
   grouped by category.
3. Click a pattern card. CALM Studio fetches it, marks it active (an
   **active-pattern chip** appears), and **validates immediately**.
   - Click the chip label to **switch** patterns; click **×** to clear and
     return to plain base-schema validation.
   - Need a one-off pattern not in the catalog? Use **Upload a pattern file…**
     in the picker footer.
4. Read results in the **Problems** panel:
   - Node **badges** and **edge colors** mark offending elements on the canvas.
   - Filter by **severity** (errors / warnings / info) and by **source**
     (**Schema** = JSON-Schema composition, **Spectral** = semantic rules).
   - Click an issue row to reveal that element on the canvas.

---

## 5. Tests

```bash
# Engine + adapter + loader parity + offline guarantee
npm test --workspace=@calmstudio/calm-core

# Studio store, pattern catalog, components
npm test --workspace=@calmstudio/studio

# End-to-end pattern flow (real browser; needs Chromium)
cd calm-suite/calm-studio/apps/studio
npx playwright install chromium   # first time
npm run test:e2e -- validation-pattern-flow
```

---

## Where things live

| Concern | Path |
|---|---|
| Validation engine entry | `packages/calm-core/src/pattern-validation.ts` (`validateAgainstPattern`) |
| Browser/Tauri schema loader | `packages/calm-core/src/bundled-document-loader.ts` |
| Shared pattern catalog | `apps/studio/static/patterns/` |
| Catalog loader | `apps/studio/src/lib/patterns/catalog.ts` |
| Pattern picker UI | `apps/studio/src/lib/patterns/PatternPicker.svelte` |
| Validation store | `apps/studio/src/lib/stores/validation.svelte.ts` |
| Problems panel | `apps/studio/src/lib/validation/ValidationPanel.svelte` |
