// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * svg-export-markers.spec.ts — E2E test for arrowhead markers in SVG export.
 *
 * Reproduces the bug where EdgeMarkers.svelte's shared <defs> (arrowheads,
 * diamonds) render as a sibling of Svelte Flow's .svelte-flow__viewport, so
 * html-to-image's viewport-only capture never includes them — every exported
 * edge's markerEnd="url(#marker-*)" pointed at a marker that didn't exist in
 * the exported file.
 *
 * Flow: import a CALM JSON with a "connects" relationship (so a real edge
 * with a markerEnd renders) -> export SVG -> parse the SVG and assert the
 * referenced marker id actually exists in the document.
 */

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function injectDownloadInterceptor(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const win = window as unknown as Record<string, unknown>;
		const captured: { href: string; filename: string }[] = [];
		win['__capturedDownloads'] = captured;

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
						captured.push({ href: anchor.href, filename: anchor.download });
						win['__lastDownloadFilename'] = anchor.download;
						win['__lastDownloadHref'] = anchor.href;
					}
				};
			}
			return el;
		};
	});
}

async function readLastDownload(page: Page): Promise<{ content: string; filename: string } | null> {
	return page.evaluate(async () => {
		const win = window as unknown as Record<string, unknown>;
		const href = win['__lastDownloadHref'] as string | undefined;
		const filename = win['__lastDownloadFilename'] as string | undefined;
		if (!href || !filename) return null;

		const blobUrlMap = win['__blobUrlMap'] as Map<string, Blob> | undefined;
		if (blobUrlMap && blobUrlMap.has(href)) {
			const blob = blobUrlMap.get(href)!;
			return { content: await blob.text(), filename };
		}
		try {
			const resp = await fetch(href);
			return { content: await resp.text(), filename };
		} catch {
			return null;
		}
	});
}

test.describe('SVG export — edge arrowhead markers', () => {
	test.setTimeout(90_000);

	test('exported SVG includes the <marker> defs referenced by edge markerEnd', async ({ page }) => {
		await injectDownloadInterceptor(page);

		const calmJson = JSON.stringify({
			nodes: [
				{ 'unique-id': 'svc-a', 'node-type': 'service', name: 'Service A', description: 'A' },
				{ 'unique-id': 'svc-b', 'node-type': 'service', name: 'Service B', description: 'B' },
			],
			relationships: [
				{
					'unique-id': 'a-to-b',
					'relationship-type': {
						connects: { source: { node: 'svc-a' }, destination: { node: 'svc-b' } },
					},
				},
			],
		});

		const escapedJson = calmJson.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
		await page.addInitScript(`
			window.showOpenFilePicker = async function() {
				var content = \`${escapedJson}\`;
				var blob = new Blob([content], { type: 'application/json' });
				var mockFile = new File([blob], 'test-architecture.calm.json', { type: 'application/json' });
				var mockHandle = {
					kind: 'file',
					name: 'test-architecture.calm.json',
					getFile: async function() { return mockFile; }
				};
				return [mockHandle];
			};
		`);

		await page.goto('/');
		await expect(page.getByText('Components')).toBeVisible({ timeout: 30_000 });

		await page.getByRole('button', { name: /open calm json file/i }).click();

		const flowNodes = page.locator('.svelte-flow__node');
		await expect(flowNodes).toHaveCount(2, { timeout: 10_000 });

		const edgePath = page.locator('.svelte-flow__edge-path, path[marker-end]').first();
		await expect(edgePath).toBeVisible({ timeout: 10_000 });

		await page.getByRole('button', { name: /export diagram/i }).click();
		const exportMenu = page.getByRole('menu', { name: /export options/i });
		await expect(exportMenu).toBeVisible({ timeout: 5_000 });
		await page.getByRole('menuitem', { name: /^svg/i }).click();

		await page.waitForTimeout(1000);

		const download = await readLastDownload(page);
		expect(download).not.toBeNull();
		expect(download!.filename).toMatch(/\.svg$/);

		// download.content is already the decoded SVG body — fetch() on a data: URL
		// resolves to the actual resource, not the raw "data:...," string.
		const svgContent = download!.content;

		// The edge references its marker via markerEnd="url(#marker-arrow-filled)" —
		// confirm that marker id actually exists as a <marker> element in the export.
		const markerRefMatch = svgContent.match(/marker-end="url\(#([^)]+)\)"/);
		expect(markerRefMatch, 'exported SVG should contain an edge with a markerEnd reference').not.toBeNull();

		const markerId = markerRefMatch![1];
		const markerDefRegex = new RegExp(`<marker[^>]*id="${markerId}"`);
		expect(svgContent).toMatch(markerDefRegex);
	});
});
