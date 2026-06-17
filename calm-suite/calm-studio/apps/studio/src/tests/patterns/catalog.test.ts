// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	fetchPatternCatalog,
	fetchPattern,
	catalogCategories,
	clearCatalogCache,
	type PatternCatalogEntry,
} from '$lib/patterns/catalog';

const VALID_MANIFEST = {
	patterns: [
		{ id: 'a', name: 'A', description: 'first', category: 'general', tags: ['x'], file: 'a.json' },
		{ id: 'b', name: 'B', description: 'second', category: 'security', tags: [], file: 'b.json' },
		// invalid entries must be filtered out
		{ id: 'bad', name: 'no file' },
		{ nope: true },
	],
};

function mockFetch(handler: (url: string) => { ok: boolean; body: unknown }) {
	vi.stubGlobal('fetch', vi.fn(async (url: string) => {
		const { ok, body } = handler(url);
		return { ok, status: ok ? 200 : 404, json: async () => body } as Response;
	}));
}

beforeEach(() => {
	clearCatalogCache();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('fetchPatternCatalog', () => {
	it('parses the manifest and drops malformed entries', async () => {
		mockFetch(() => ({ ok: true, body: VALID_MANIFEST }));
		const entries = await fetchPatternCatalog();
		expect(entries.map((e) => e.id)).toEqual(['a', 'b']);
	});

	it('caches after the first load (second call does not re-fetch)', async () => {
		const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => VALID_MANIFEST }) as Response);
		vi.stubGlobal('fetch', fetchImpl);
		await fetchPatternCatalog();
		await fetchPatternCatalog();
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('returns an empty list when the manifest is missing', async () => {
		mockFetch(() => ({ ok: false, body: null }));
		expect(await fetchPatternCatalog()).toEqual([]);
	});

	it('returns an empty list when fetch throws (offline / malformed)', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
		expect(await fetchPatternCatalog()).toEqual([]);
	});
});

describe('fetchPattern', () => {
	const entry: PatternCatalogEntry = {
		id: 'a', name: 'A', description: 'first', category: 'general', tags: [], file: 'a.json',
	};

	it('fetches the pattern document for an entry', async () => {
		const doc = { $schema: 'x', type: 'object' };
		mockFetch((url) => ({ ok: url.endsWith('a.json'), body: doc }));
		expect(await fetchPattern(entry)).toEqual(doc);
	});

	it('throws when the pattern file is missing', async () => {
		mockFetch(() => ({ ok: false, body: null }));
		await expect(fetchPattern(entry)).rejects.toThrow(/Could not load pattern/);
	});

	it('throws when the pattern is not a JSON object', async () => {
		mockFetch(() => ({ ok: true, body: [1, 2, 3] }));
		await expect(fetchPattern(entry)).rejects.toThrow(/not a JSON object/);
	});
});

describe('catalogCategories', () => {
	it('returns distinct categories in first-seen order', () => {
		const entries = VALID_MANIFEST.patterns.slice(0, 2) as PatternCatalogEntry[];
		expect(catalogCategories(entries)).toEqual(['general', 'security']);
	});
});
