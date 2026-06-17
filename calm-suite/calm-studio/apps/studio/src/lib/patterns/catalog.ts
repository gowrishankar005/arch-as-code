// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * catalog.ts — Shared pattern catalog for CALM Studio.
 *
 * Patterns (and standards / control sets) live as static assets under
 * `static/patterns/`, listed in `static/patterns/index.json`. This is the
 * "shared space" architects curate: drop a pattern `.json` into that folder and
 * add a manifest entry — no app rebuild for a deployed instance, and it works
 * offline in the Tauri build because static assets are bundled into the app.
 *
 * The manifest carries the display metadata (name/description/category/tags) so
 * the picker can render cards without fetching every pattern; the actual pattern
 * JSON is fetched only when one is selected ({@link fetchPattern}).
 */

/** One entry in the shared pattern catalog (`static/patterns/index.json`). */
export interface PatternCatalogEntry {
	/** Stable id, used as the React-less keyed identity and selection token. */
	id: string;
	/** Display name for the picker card. */
	name: string;
	/** One-line description for the picker card. */
	description: string;
	/** Grouping key — drives the picker's category tabs. */
	category: string;
	/** Display tag pills. */
	tags: string[];
	/** Filename within `static/patterns/`. */
	file: string;
}

const CATALOG_URL = '/patterns/index.json';
const PATTERNS_BASE = '/patterns/';

let cache: PatternCatalogEntry[] | null = null;

/**
 * Fetch and cache the pattern catalog manifest. Returns an empty list (rather
 * than throwing) if the manifest is missing or malformed, so the picker can show
 * an empty state instead of crashing.
 */
export async function fetchPatternCatalog(): Promise<PatternCatalogEntry[]> {
	if (cache) return cache;
	try {
		const response = await fetch(CATALOG_URL);
		if (!response.ok) return [];
		const data = (await response.json()) as { patterns?: unknown };
		const entries = Array.isArray(data.patterns) ? data.patterns : [];
		cache = entries.filter(isValidEntry);
		return cache;
	} catch {
		return [];
	}
}

/**
 * Fetch the actual pattern document for a catalog entry. The returned object is
 * a CALM pattern / curated schema ready to pass to `validateAgainstPattern`.
 *
 * @throws if the pattern file cannot be fetched or parsed.
 */
export async function fetchPattern(entry: PatternCatalogEntry): Promise<object> {
	const response = await fetch(PATTERNS_BASE + entry.file);
	if (!response.ok) {
		throw new Error(`Could not load pattern "${entry.name}" (${response.status})`);
	}
	const json = (await response.json()) as unknown;
	if (typeof json !== 'object' || json === null || Array.isArray(json)) {
		throw new Error(`Pattern "${entry.name}" is not a JSON object`);
	}
	return json as object;
}

/** Distinct categories present in the catalog, in first-seen order. */
export function catalogCategories(entries: PatternCatalogEntry[]): string[] {
	const seen: string[] = [];
	for (const e of entries) {
		if (!seen.includes(e.category)) seen.push(e.category);
	}
	return seen;
}

/** Clear the cached manifest (test/hot-reload helper). */
export function clearCatalogCache(): void {
	cache = null;
}

function isValidEntry(value: unknown): value is PatternCatalogEntry {
	if (typeof value !== 'object' || value === null) return false;
	const e = value as Record<string, unknown>;
	return (
		typeof e.id === 'string' &&
		typeof e.name === 'string' &&
		typeof e.description === 'string' &&
		typeof e.category === 'string' &&
		typeof e.file === 'string' &&
		Array.isArray(e.tags) &&
		e.tags.every((t) => typeof t === 'string')
	);
}
