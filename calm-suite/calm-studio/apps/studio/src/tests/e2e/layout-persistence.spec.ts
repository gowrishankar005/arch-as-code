// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * layout-persistence.spec.ts — E2E coverage for the layout-persistence bug:
 * rearranged node positions were lost on Save/Save As/Export — nowhere
 * persisted them, and Open always ran ELK auto-layout fresh. Fixed by
 * embedding a calmstudio-layout decorator (projection.ts) in the saved
 * CALM JSON and reading it back on Open instead of re-running ELK.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function injectDownloadInterceptor(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const win = window as unknown as Record<string, unknown>;
		// This browser supports the real File System Access API, which would
		// otherwise show a native save dialog Playwright can't drive. Force
		// the app's existing Blob-download fallback so Save is interceptable
		// the same way Export already is.
		delete win['showSaveFilePicker'];

		const blobUrlMap = new Map<string, Blob>();
		const origCreateObjectURL = URL.createObjectURL.bind(URL);
		URL.createObjectURL = (blob: Blob | MediaSource) => {
			const url = origCreateObjectURL(blob);
			if (blob instanceof Blob) {
				blobUrlMap.set(url, blob);
				win['__blobUrlMap'] = blobUrlMap;
			}
			return url;
		};

		const origCreateElement = document.createElement.bind(document);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(document as any).createElement = function (tagName: string, options?: ElementCreationOptions) {
			const el = origCreateElement(tagName, options);
			if (tagName.toLowerCase() === 'a') {
				el.click = function () {
					const anchor = el as HTMLAnchorElement;
					if (anchor.download && anchor.href) {
						win['__lastDownloadFilename'] = anchor.download;
						win['__lastDownloadHref'] = anchor.href;
					}
				};
			}
			return el;
		};
	});
}

async function readLastDownload(page: Page): Promise<string | null> {
	return page.evaluate(async () => {
		const win = window as unknown as Record<string, unknown>;
		const href = win['__lastDownloadHref'] as string | undefined;
		if (!href) return null;
		const blobUrlMap = win['__blobUrlMap'] as Map<string, Blob> | undefined;
		if (blobUrlMap && blobUrlMap.has(href)) {
			return (await blobUrlMap.get(href)!.text());
		}
		try {
			const resp = await fetch(href);
			return await resp.text();
		} catch {
			return null;
		}
	});
}

async function openContent(page: Page, content: string, filename = 'a.calm.json'): Promise<void> {
	const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
	await page.evaluate(
		({ escaped, filename }) => {
			(window as unknown as Record<string, unknown>)['showOpenFilePicker'] = async function () {
				const blob = new Blob([escaped], { type: 'application/json' });
				const mockFile = new File([blob], filename, { type: 'application/json' });
				return [{ kind: 'file', name: filename, getFile: async () => mockFile }];
			};
		},
		{ escaped: content, filename }
	);
	await page.getByRole('button', { name: /open calm json file/i }).click();
}

test.describe('Layout persistence', () => {
	test.setTimeout(90_000);

	test('a dragged node keeps its exact position after Save and reopen', async ({ page }) => {
		await injectDownloadInterceptor(page);
		await page.goto('/');
		await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

		const actorButton = page.getByRole('button', { name: /drag or double-click to place actor node/i });
		await actorButton.dblclick();
		await page.waitForTimeout(500);

		const node = page.locator('.svelte-flow__node').first();
		await expect(node).toBeVisible({ timeout: 10_000 });

		// Drag the node to a distinctive position.
		const box = await node.boundingBox();
		expect(box).not.toBeNull();
		await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
		await page.mouse.down();
		await page.mouse.move(box!.x + 300, box!.y + 220, { steps: 10 });
		await page.mouse.up();
		await page.waitForTimeout(300);

		// Save (no file handle yet -> falls back to a Blob download, which the
		// interceptor above catches, same as the Export flow).
		await page.getByRole('button', { name: /save diagram/i }).click();
		await page.waitForTimeout(300);

		const saved = await readLastDownload(page);
		expect(saved).not.toBeNull();
		const savedArch = JSON.parse(saved!);

		// The saved CALM JSON must carry a calmstudio-layout decorator —
		// this is what makes reopen skip ELK instead of scrambling the diagram.
		const layoutDecorator = savedArch.decorators?.find(
			(d: { 'unique-id': string }) => d['unique-id'] === 'calmstudio-layout'
		);
		expect(layoutDecorator).toBeDefined();
		const savedPosition = layoutDecorator.data.positions[savedArch.nodes[0]['unique-id']];

		// Reopen that exact saved content, then save again. Comparing the
		// underlying saved coordinates (rather than on-screen pixels, which
		// differ across reopen because Open re-fits the viewport) is what
		// actually proves ELK didn't scramble the diagram on the way back in.
		await openContent(page, saved!);
		await expect(page.locator('.svelte-flow__node')).toHaveCount(1, { timeout: 10_000 });
		await page.waitForTimeout(500);

		await page.getByRole('button', { name: /save diagram/i }).click();
		await page.waitForTimeout(300);
		const resaved = await readLastDownload(page);
		const resavedArch = JSON.parse(resaved!);
		const resavedDecorator = resavedArch.decorators.find(
			(d: { 'unique-id': string }) => d['unique-id'] === 'calmstudio-layout'
		);
		const resavedPosition = resavedDecorator.data.positions[resavedArch.nodes[0]['unique-id']];

		expect(resavedPosition).toEqual(savedPosition);
	});

	test('reopening a file with no layout decorator still auto-layouts (first-ever import)', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

		const arch = {
			nodes: [
				{ 'unique-id': 'a', 'node-type': 'service', name: 'A', description: '' },
				{ 'unique-id': 'b', 'node-type': 'service', name: 'B', description: '' },
			],
			relationships: [
				{ 'unique-id': 'r1', 'relationship-type': { connects: { source: { node: 'a' }, destination: { node: 'b' } } } },
			],
		};
		await openContent(page, JSON.stringify(arch));
		await expect(page.locator('.svelte-flow__node')).toHaveCount(2, { timeout: 10_000 });
		// No crash, no stuck-at-origin nodes — ELK ran and placed them sensibly.
		const box0 = await page.locator('.svelte-flow__node').first().boundingBox();
		const box1 = await page.locator('.svelte-flow__node').nth(1).boundingBox();
		expect(box0).not.toBeNull();
		expect(box1).not.toBeNull();
	});
});
