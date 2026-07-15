// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * drawio-import.spec.ts — E2E tests for the draw.io import flow.
 *
 * Tests the "Import draw.io" toolbar button end to end:
 *   1. Click "Import" in the toolbar → file picker opens (stubbed)
 *   2. Stub provides a minimal .drawio XML with 2 nodes and 1 edge
 *   3. Canvas renders the imported nodes using draw.io geometry (no ELK run)
 *   4. Review panel appears when nodes have low-confidence type inference
 *   5. Review panel dismisses via "Got it" button
 *   6. High-confidence imports (stencil-matched) skip the review panel
 *   7. Geometry preserved (relative layout, not ELK-rearranged)
 *   8. Containment renders as a container with children inside its bounds
 *   9. Undo removes imported elements entirely
 *  10. Dangling edges surface in the review panel, not silently dropped
 *  11. Multi-page files show a page picker; selecting a page loads it
 *  12. "Accept all medium-confidence" bulk-resolves the review list
 *  13. Large file (300 nodes) imports within a performance budget
 *  14. Visual regression baseline for the review panel
 *
 * File picker stubbing strategy:
 *   We intercept document.createElement('input') when type=file and accept
 *   includes ".drawio", auto-triggering its onchange with a mock FileList.
 *   This is necessary because the draw.io importer uses a hidden <input> rather
 *   than showOpenFilePicker (draw.io is not a CALM JSON file type).
 */

import { test, expect, Page } from '@playwright/test';

// ─── Fixture XML strings ──────────────────────────────────────────────────────

/**
 * Two generic nodes with no stencil style → T2 label match only.
 * "Custom Widget" will not match any glossary term → confidence=none → review panel.
 */
const GENERIC_DRAWIO = `<mxfile>
  <diagram id="d1" name="Generic">
    <mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Custom Widget" style="" vertex="1" parent="1">
        <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="3" value="Another Widget" style="" vertex="1" parent="1">
        <mxGeometry x="300" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="4" value="" style="" edge="1" parent="1" source="2" target="3">
        <mxGeometry as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
</mxfile>`;

/**
 * Two AWS4-stencil nodes → T1 stencil match → high confidence → no review panel.
 * Same y coordinate, different x — a left-right layout. If ELK ran instead of
 * preserving geometry, the default 'DOWN' direction would stack these vertically.
 */
const AWS_DRAWIO = `<mxfile>
  <diagram id="d1" name="AWS Example">
    <mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Lambda API" style="shape=mxgraph.aws4.lambda;" vertex="1" parent="1">
        <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="3" value="RDS Database" style="shape=mxgraph.aws4.rds;" vertex="1" parent="1">
        <mxGeometry x="300" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="4" value="HTTPS" style="" edge="1" parent="1" source="2" target="3">
        <mxGeometry as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
</mxfile>`;

/** A container (VPC) with two children nested via the parent attribute. */
const CONTAINMENT_DRAWIO = `<mxfile>
  <diagram id="d1" name="Containment">
    <mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="10" value="Production VPC" style="shape=mxgraph.aws4.vpc;" vertex="1" parent="1">
        <mxGeometry x="0" y="0" width="440" height="240" as="geometry"/>
      </mxCell>
      <mxCell id="11" value="Web App" style="shape=mxgraph.aws4.lambda;" vertex="1" parent="10">
        <mxGeometry x="40" y="80" width="120" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="12" value="API" style="shape=mxgraph.aws4.lambda;" vertex="1" parent="10">
        <mxGeometry x="240" y="80" width="120" height="60" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
</mxfile>`;

/** One resolvable node plus one edge with a missing target endpoint. */
const DANGLING_EDGE_DRAWIO = `<mxfile>
  <diagram id="d1" name="Dangling">
    <mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Orphan App" style="shape=mxgraph.aws4.lambda;" vertex="1" parent="1">
        <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="4" value="calls" style="" edge="1" parent="1" source="2">
        <mxGeometry as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
</mxfile>`;

/** Two pages, each with one distinctly-labeled node. */
const MULTI_PAGE_DRAWIO = `<mxfile>
  <diagram id="p1" name="Page One">
    <mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Alpha Service" style="shape=mxgraph.aws4.lambda;" vertex="1" parent="1">
        <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
  <diagram id="p2" name="Page Two">
    <mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="Beta Service" style="shape=mxgraph.aws4.rds;" vertex="1" parent="1">
        <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
</mxfile>`;

/**
 * Two nodes matching medium-confidence glossary terms ("cache" -> database,
 * "zone" -> network per catalogs/glossary.json), so the "Accept all
 * medium-confidence" bulk action (shown only when there are 2+) appears.
 */
const MEDIUM_CONFIDENCE_DRAWIO = `<mxfile>
  <diagram id="d1" name="Medium Confidence">
    <mxGraphModel><root>
      <mxCell id="0"/><mxCell id="1" parent="0"/>
      <mxCell id="2" value="cache" style="" vertex="1" parent="1">
        <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
      <mxCell id="3" value="zone" style="" vertex="1" parent="1">
        <mxGeometry x="300" y="100" width="120" height="60" as="geometry"/>
      </mxCell>
    </root></mxGraphModel>
  </diagram>
</mxfile>`;

/** Synthetic large diagram — 300 unconnected vertices — for the perf budget test. */
function buildLargeDrawio(count: number): string {
  const cells: string[] = [];
  const cols = 20;
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * 160;
    const y = Math.floor(i / cols) * 100;
    cells.push(
      `<mxCell id="${i + 2}" value="Node ${i}" style="shape=mxgraph.aws4.lambda;" vertex="1" parent="1">` +
        `<mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`
    );
  }
  return `<mxfile><diagram id="d1" name="Large"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells.join('')}</root></mxGraphModel></diagram></mxfile>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Inject a script that intercepts document.createElement('input') for draw.io
 * file inputs and auto-triggers onchange with a synthetic file.
 */
async function stubDrawioFilePicker(page: Page, xmlContent: string, filename = 'test.drawio'): Promise<void> {
  // Escape for embedding in a JS string literal (single-quoted)
  const escaped = xmlContent
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');

  await page.addInitScript(`(function() {
    var _xml = '${escaped}';
    var _filename = '${filename}';

    var origCreateElement = document.createElement.bind(document);
    document.createElement = function(tagName, options) {
      var el = origCreateElement(tagName, options);
      if (tagName.toLowerCase() === 'input') {
        var origClick = el.click.bind(el);
        el.click = function() {
          var input = el;
          if (input.type === 'file' && input.accept && input.accept.includes('.drawio')) {
            // Create a mock file and fire onchange asynchronously
            var blob = new Blob([_xml], { type: 'text/xml' });
            var file = new File([blob], _filename, { type: 'text/xml' });
            Object.defineProperty(input, 'files', {
              value: { 0: file, length: 1 },
              configurable: true,
            });
            setTimeout(function() {
              if (input.onchange) {
                input.onchange({ target: input });
              }
            }, 20);
          } else {
            origClick();
          }
        };
      }
      return el;
    };
  })();`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe('draw.io import', () => {
  test.setTimeout(90_000);

  test('Import button is visible in the toolbar', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    const importBtn = page.getByRole('button', { name: /import draw\.io diagram/i });
    await expect(importBtn).toBeVisible({ timeout: 5_000 });
  });

  test('importing a draw.io file renders nodes on the canvas', async ({ page }) => {
    await stubDrawioFilePicker(page, AWS_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();

    // Wait for nodes to appear on the canvas
    const firstNode = page.locator('.svelte-flow__node').first();
    await expect(firstNode).toBeVisible({ timeout: 15_000 });

    // At least 2 nodes (Lambda + RDS)
    const allNodes = page.locator('.svelte-flow__node');
    await expect(allNodes).toHaveCount(2, { timeout: 10_000 });
  });

  test('high-confidence import (stencil-matched) does not show the review panel', async ({ page }) => {
    await stubDrawioFilePicker(page, AWS_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // Wait for a stable post-import signal (code panel reflects the import)
    // before asserting the review panel's absence — avoids a flaky bounded wait.
    const codePanel = page.locator('.cm-content');
    await expect(codePanel).toContainText('lambda-api-mx2', { timeout: 10_000 });

    // Review panel should NOT appear — all nodes are high-confidence via stencil
    const reviewPanel = page.getByRole('complementary', { name: /draw\.io import review/i });
    await expect(reviewPanel).not.toBeVisible();
  });

  test('low-confidence import shows review panel with items needing review', async ({ page }) => {
    await stubDrawioFilePicker(page, GENERIC_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // Review panel should appear — generic nodes have confidence=none
    const reviewPanel = page.getByRole('complementary', { name: /draw\.io import review/i });
    await expect(reviewPanel).toBeVisible({ timeout: 8_000 });

    // Should show "Import Review" heading
    await expect(reviewPanel.getByText('Import Review')).toBeVisible();

    // Should list nodes needing review
    const reviewItems = reviewPanel.locator('.review-item');
    await expect(reviewItems.first()).toBeVisible({ timeout: 5_000 });
  });

  test('review panel dismisses when "Got it" is clicked', async ({ page }) => {
    await stubDrawioFilePicker(page, GENERIC_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node').first()).toBeVisible({ timeout: 15_000 });

    const reviewPanel = page.getByRole('complementary', { name: /draw\.io import review/i });
    await expect(reviewPanel).toBeVisible({ timeout: 8_000 });

    // Click "Got it" to dismiss
    await reviewPanel.getByRole('button', { name: /got it/i }).click();
    await expect(reviewPanel).not.toBeVisible({ timeout: 3_000 });
  });

  test('imported CALM JSON is visible in the code panel', async ({ page }) => {
    await stubDrawioFilePicker(page, AWS_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node').first()).toBeVisible({ timeout: 15_000 });

    // Code panel should show CALM JSON with our node IDs (slug-mxCellId format)
    const codePanel = page.locator('.cm-content');
    await expect(codePanel).toBeVisible({ timeout: 5_000 });
    const codeText = await codePanel.textContent();
    expect(codeText).toContain('lambda-api-mx2');
    expect(codeText).toContain('rds-database-mx3');
  });

  test('geometry is preserved — nodes keep their relative left-right layout, not ELK-rearranged', async ({ page }) => {
    await stubDrawioFilePicker(page, AWS_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 15_000 });

    const nodes = page.locator('.svelte-flow__node');
    const box0 = await nodes.nth(0).boundingBox();
    const box1 = await nodes.nth(1).boundingBox();
    expect(box0).not.toBeNull();
    expect(box1).not.toBeNull();

    // Source geometry has both nodes at the same y (100) and Lambda (x=100)
    // to the left of RDS (x=300). If ELK had run with the default 'DOWN'
    // direction, a 2-node chain would stack vertically instead.
    const yDiff = Math.abs(box0!.y - box1!.y);
    expect(yDiff).toBeLessThan(20); // same row, allowing for sub-pixel/border rendering
    expect(box0!.x).toBeLessThan(box1!.x); // left-right order preserved
  });

  test('containment renders as a container with children inside its bounds', async ({ page }) => {
    await stubDrawioFilePicker(page, CONTAINMENT_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node')).toHaveCount(3, { timeout: 15_000 });

    const containerNode = page.locator('.svelte-flow__node', { hasText: 'Production VPC' });
    await expect(containerNode).toBeVisible({ timeout: 10_000 });
    const containerBox = await containerNode.boundingBox();
    expect(containerBox).not.toBeNull();

    for (const label of ['Web App', 'API']) {
      const child = page.locator('.svelte-flow__node', { hasText: label }).first();
      const childBox = await child.boundingBox();
      expect(childBox).not.toBeNull();
      const childCenterX = childBox!.x + childBox!.width / 2;
      const childCenterY = childBox!.y + childBox!.height / 2;
      expect(childCenterX).toBeGreaterThan(containerBox!.x);
      expect(childCenterX).toBeLessThan(containerBox!.x + containerBox!.width);
      expect(childCenterY).toBeGreaterThan(containerBox!.y);
      expect(childCenterY).toBeLessThan(containerBox!.y + containerBox!.height);
    }
  });

  test('undo (Cmd+Z) removes imported elements entirely', async ({ page }) => {
    await stubDrawioFilePicker(page, AWS_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 15_000 });

    await page.keyboard.press('Meta+z');
    await expect(page.locator('.svelte-flow__node')).toHaveCount(0, { timeout: 5_000 });
  });

  test('dangling edges surface in the review panel instead of being silently dropped', async ({ page }) => {
    await stubDrawioFilePicker(page, DANGLING_EDGE_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node')).toHaveCount(1, { timeout: 15_000 });

    const reviewPanel = page.getByRole('complementary', { name: /draw\.io import review/i });
    await expect(reviewPanel).toBeVisible({ timeout: 8_000 });
    await expect(reviewPanel.getByText(/couldn't be fully connected/i)).toBeVisible();
    await expect(reviewPanel.getByText('calls', { exact: true })).toBeVisible();
    await expect(reviewPanel.getByText(/target unresolved/i)).toBeVisible();
  });

  test('multi-page file shows a page picker; selecting a page imports it', async ({ page }) => {
    await stubDrawioFilePicker(page, MULTI_PAGE_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();

    const picker = page.getByRole('dialog', { name: /select draw\.io page to import/i });
    await expect(picker).toBeVisible({ timeout: 10_000 });
    await expect(picker.getByText('Page One')).toBeVisible();
    await expect(picker.getByText('Page Two')).toBeVisible();

    // Select the second page
    await picker.getByRole('button', { name: /import page 2: page two/i }).click();
    await expect(picker).not.toBeVisible({ timeout: 5_000 });

    await expect(page.locator('.svelte-flow__node')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.getByText('Beta Service', { exact: true })).toBeVisible();
  });

  test('"Accept all medium-confidence" bulk-resolves the review list', async ({ page }) => {
    await stubDrawioFilePicker(page, MEDIUM_CONFIDENCE_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 15_000 });

    const reviewPanel = page.getByRole('complementary', { name: /draw\.io import review/i });
    await expect(reviewPanel).toBeVisible({ timeout: 8_000 });

    const acceptAllBtn = reviewPanel.getByRole('button', { name: /accept all 2 medium-confidence types/i });
    await expect(acceptAllBtn).toBeVisible({ timeout: 5_000 });
    await expect(reviewPanel.locator('.review-item')).toHaveCount(2);

    await acceptAllBtn.click();

    // Both medium items resolved -> empty state, panel still open (not auto-dismissed)
    await expect(reviewPanel.getByText('All nodes and edges resolved.')).toBeVisible({ timeout: 5_000 });
  });

  test('large file (300 nodes) imports within the performance budget', async ({ page }) => {
    const largeDrawio = buildLargeDrawio(300);
    await stubDrawioFilePicker(page, largeDrawio, 'large.drawio');
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    const start = Date.now();
    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node')).toHaveCount(300, { timeout: 15_000 });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3_000);
  });

  test('review panel visual regression baseline', async ({ page }) => {
    await stubDrawioFilePicker(page, GENERIC_DRAWIO);
    await page.goto('/');
    await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

    await page.getByRole('button', { name: /import draw\.io diagram/i }).click();
    await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 15_000 });

    const reviewPanel = page.getByRole('complementary', { name: /draw\.io import review/i });
    await expect(reviewPanel).toBeVisible({ timeout: 8_000 });

    await expect(reviewPanel).toHaveScreenshot('drawio-review-panel.png');
  });
});
