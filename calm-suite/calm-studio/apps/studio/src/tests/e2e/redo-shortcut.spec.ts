// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * redo-shortcut.spec.ts — E2E test for Cmd/Ctrl+Shift+Z redo.
 *
 * @svelte-put/shortcut's flat `modifier: ['meta', 'shift']` array means
 * "either held alone", not "both held together" (the library's own JSDoc
 * documents the nested-array form, `[['meta', 'shift']]`, for that). The
 * Redo trigger used the flat form, so pressing the real Cmd+Shift+Z chord
 * never matched either the meta-only or shift-only mask and the callback
 * never fired — redo was silently broken.
 */

import { test, expect } from '@playwright/test';

test('Cmd/Ctrl+Shift+Z redoes an undone inline rename', async ({ page }) => {
	const calmJson = JSON.stringify({
		nodes: [{ 'unique-id': 'svc-a', 'node-type': 'service', name: 'Original Name', description: 'A' }],
		relationships: [],
	});
	const escaped = calmJson.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
	await page.addInitScript(`
		window.showOpenFilePicker = async function() {
			var blob = new Blob([\`${escaped}\`], { type: 'application/json' });
			var mockFile = new File([blob], 'a.calm.json', { type: 'application/json' });
			return [{ kind: 'file', name: 'a.calm.json', getFile: async function() { return mockFile; } }];
		};
	`);
	await page.goto('/');
	await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: /open calm json file/i }).click();
	await expect(page.locator('.svelte-flow__node')).toHaveCount(1, { timeout: 10_000 });

	const label = page.getByText('Original Name', { exact: true });
	await expect(label).toBeVisible({ timeout: 10_000 });
	await label.dblclick();

	const input = page.locator('input.label-edit');
	await expect(input).toBeVisible();
	await input.fill('Renamed Thing');
	await input.press('Enter');
	await expect(page.getByText('Renamed Thing', { exact: true })).toBeVisible({ timeout: 5_000 });

	await page.keyboard.press('Meta+z');
	await expect(page.getByText('Original Name', { exact: true })).toBeVisible({ timeout: 5_000 });

	await page.keyboard.press('Meta+Shift+Z');
	await expect(page.getByText('Renamed Thing', { exact: true })).toBeVisible({ timeout: 5_000 });
});
