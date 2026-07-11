// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * fit-to-selection.spec.ts — E2E test for Cmd/Ctrl+Shift+F "fit to
 * selection", which zooms/pans the viewport to just the selected nodes
 * instead of the whole diagram (useful when working on one section of a
 * large architecture). Distinct from the toolbar's "Fit to screen" button,
 * which always fits everything and is intentionally left unchanged.
 */

import { test, expect } from '@playwright/test';

const CHAIN_ARCH = {
	nodes: Array.from({ length: 5 }, (_, i) => ({
		'unique-id': `n${i + 1}`,
		'node-type': 'service',
		name: `Node ${i + 1}`,
		description: '',
	})),
	relationships: Array.from({ length: 4 }, (_, i) => ({
		'unique-id': `r${i + 1}`,
		'relationship-type': {
			connects: { source: { node: `n${i + 1}` }, destination: { node: `n${i + 2}` } },
		},
	})),
};

test('Cmd/Ctrl+Shift+F fits the viewport to the selected node, not the whole diagram', async ({ page }) => {
	const escaped = JSON.stringify(CHAIN_ARCH).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
	await page.addInitScript(`
		window.showOpenFilePicker = async function() {
			var blob = new Blob([\`${escaped}\`], { type: 'application/json' });
			var mockFile = new File([blob], 'chain.calm.json', { type: 'application/json' });
			return [{ kind: 'file', name: 'chain.calm.json', getFile: async function() { return mockFile; } }];
		};
	`);
	await page.setViewportSize({ width: 1400, height: 900 });
	await page.goto('/');
	await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: /open calm json file/i }).click();
	await expect(page.locator('.svelte-flow__node')).toHaveCount(5, { timeout: 10_000 });
	// Import triggers its own fitViewport() (duration: 300) — let it settle
	// before reading a baseline, or we may capture a mid-animation value.
	await page.waitForTimeout(600);

	// A 5-node vertical chain is taller than any single node, so "fit all"
	// zooms out further than fitting to just one node — capturing the
	// baseline confirms fit-to-selection actually changes the viewport
	// rather than being a no-op that happens to look the same.
	const zoomWidget = page.locator('.zoom-widget-percent');
	await expect(zoomWidget).toBeVisible({ timeout: 5_000 });
	const baselineZoomText = await zoomWidget.textContent();
	const baselineZoom = parseInt(baselineZoomText!.replace('%', ''), 10);

	// Select just the last node in the chain.
	await page.locator('.svelte-flow__node').last().click();

	await page.keyboard.press('Meta+Shift+F');
	await page.waitForTimeout(500); // fitView animation (duration: 300)

	const selectedZoomText = await zoomWidget.textContent();
	const selectedZoom = parseInt(selectedZoomText!.replace('%', ''), 10);

	// Fitting one small node into the same viewport should zoom in
	// noticeably more than fitting the whole 5-node chain did.
	expect(selectedZoom).toBeGreaterThan(baselineZoom);
});

test('Cmd/Ctrl+Shift+F is a no-op when nothing is selected', async ({ page }) => {
	const escaped = JSON.stringify(CHAIN_ARCH).replace(/\\/g, '\\\\').replace(/`/g, '\\`');
	await page.addInitScript(`
		window.showOpenFilePicker = async function() {
			var blob = new Blob([\`${escaped}\`], { type: 'application/json' });
			var mockFile = new File([blob], 'chain.calm.json', { type: 'application/json' });
			return [{ kind: 'file', name: 'chain.calm.json', getFile: async function() { return mockFile; } }];
		};
	`);
	await page.setViewportSize({ width: 1400, height: 900 });
	await page.goto('/');
	await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: /open calm json file/i }).click();
	await expect(page.locator('.svelte-flow__node')).toHaveCount(5, { timeout: 10_000 });
	await page.waitForTimeout(600);

	const zoomWidget = page.locator('.zoom-widget-percent');
	await expect(zoomWidget).toBeVisible({ timeout: 5_000 });
	const before = await zoomWidget.textContent();

	await page.keyboard.press('Meta+Shift+F');
	await page.waitForTimeout(500);

	const after = await zoomWidget.textContent();
	expect(after).toBe(before);
});
