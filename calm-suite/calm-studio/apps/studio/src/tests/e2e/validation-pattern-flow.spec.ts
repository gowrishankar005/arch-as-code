// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * validation-pattern-flow.spec.ts — E2E for validate-against-pattern.
 *
 * Exercises the Phase 3 UI end to end in a real browser (web build, so the
 * Pattern picker uses the <input type=file> fallback that Playwright drives via
 * the filechooser event):
 *   1. Add a node so the model has content
 *   2. Click "Pattern" → supply a pattern file → active-pattern chip appears
 *   3. Click Validate → panel opens, issues are sourced (Schema/Spectral filter
 *      appears), and at least one error row is shown for the pattern violation
 *   4. The source + severity filters narrow the list
 *   5. Dismiss the pattern chip → reverts to base-schema validation
 *
 * The pattern requires the first node's unique-id to be a fixed value the model
 * cannot have, so a json-schema error is guaranteed regardless of the
 * auto-generated node id. It declares both `nodes` and `relationships` as
 * top-level properties (required by the Spectral pattern ruleset).
 */

import { test, expect, type Page } from '@playwright/test';

const PATTERN = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://calm.finos.org/e2e/pattern.json',
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      minItems: 1,
      prefixItems: [
        {
          $ref: 'https://calm.finos.org/release/1.2/meta/core.json#/defs/node',
          properties: { 'unique-id': { const: 'must-be-exactly-this' } },
        },
      ],
    },
    relationships: { type: 'array' },
  },
  required: ['nodes'],
});

async function addNodeFromPalette(page: Page, nodeLabel: string): Promise<void> {
  const btn = page.getByRole('button', {
    name: new RegExp(`drag or double-click to place ${nodeLabel} node`, 'i'),
  });
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await btn.dblclick();
  await page.waitForTimeout(500);
}

/** Open the pattern picker, then upload the e2e pattern via the file chooser. */
async function selectPattern(page: Page): Promise<void> {
  await openPicker(page);

  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: /upload a pattern file/i }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: 'e2e-standard.json',
    mimeType: 'application/json',
    buffer: Buffer.from(PATTERN),
  });
}

/** Click the "Pattern" toolbar button to open the picker modal. */
async function openPicker(page: Page): Promise<void> {
  const patternBtn = page.getByRole('button', { name: /validate against a pattern or standard/i });
  await expect(patternBtn).toBeVisible({ timeout: 5_000 });
  await patternBtn.click();
  await expect(page.getByRole('dialog', { name: /pattern picker/i })).toBeVisible({ timeout: 5_000 });
}

test.describe('Validate against a pattern', () => {
  test.setTimeout(90_000);

  test('selecting a pattern shows a chip and pattern validation reports a sourced error', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await addNodeFromPalette(page, 'Service');

    // Uploading a pattern selects it AND validates automatically.
    await selectPattern(page);

    // Active-pattern chip appears with the file name.
    const chip = page.locator('.pattern-chip');
    await expect(chip).toBeVisible({ timeout: 5_000 });
    await expect(chip).toContainText('e2e-standard.json');

    // The panel opened on its own; issues carry a source, so the source filter
    // <select> renders, and the pattern violation shows an error row.
    await expect(page.getByText('Problems', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.vp-source-select')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.vp-row.vp-row--error').first()).toBeVisible({ timeout: 10_000 });
  });

  test('selecting a pattern from the shared catalog validates immediately', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
    await addNodeFromPalette(page, 'Service');

    await openPicker(page);

    // Pick a curated catalog pattern (in the default "General" tab). A single
    // Service node has no database, so "Must Have a Database" reports an error.
    await page.locator('.pattern-card', { hasText: 'Must Have a Database' }).click();

    // Chip reflects the catalog pattern name, and validation ran automatically.
    const chip = page.locator('.pattern-chip');
    await expect(chip).toBeVisible({ timeout: 5_000 });
    await expect(chip).toContainText('Must Have a Database');
    await expect(page.getByText('Problems', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.vp-row.vp-row--error').first()).toBeVisible({ timeout: 10_000 });
  });

  test('source and severity filters narrow the issue list', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
    await addNodeFromPalette(page, 'Service');
    await selectPattern(page); // auto-validates and opens the panel
    await expect(page.getByText('Problems', { exact: true })).toBeVisible({ timeout: 15_000 });

    const errorRows = page.locator('.vp-row.vp-row--error');
    await expect(errorRows.first()).toBeVisible({ timeout: 10_000 });

    // Hide errors via the severity filter chip → error rows disappear.
    const errorFilter = page.locator('.vp-filter--error');
    await errorFilter.click();
    await expect(errorRows).toHaveCount(0, { timeout: 5_000 });

    // Restore.
    await errorFilter.click();
    await expect(errorRows.first()).toBeVisible({ timeout: 5_000 });

    // Filter source to Spectral only → json-schema error rows are hidden.
    await page.locator('.vp-source-select').selectOption('spectral');
    await expect(errorRows).toHaveCount(0, { timeout: 5_000 });
  });

  test('dismissing the pattern chip reverts to base-schema validation', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
    await addNodeFromPalette(page, 'Service');
    await selectPattern(page);

    const chip = page.locator('.pattern-chip');
    await expect(chip).toBeVisible({ timeout: 5_000 });

    // Dismiss the chip.
    await page.getByRole('button', { name: /remove pattern/i }).click();
    await expect(chip).toHaveCount(0, { timeout: 5_000 });

    // The "Pattern" button is back (no active pattern).
    await expect(
      page.getByRole('button', { name: /validate against a pattern or standard/i })
    ).toBeVisible({ timeout: 5_000 });
  });
});
