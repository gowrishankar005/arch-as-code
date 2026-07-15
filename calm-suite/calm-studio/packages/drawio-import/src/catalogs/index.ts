// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { CatalogEntry } from '../types.js';

import aws4 from './aws4.json' with { type: 'json' };
import azure from './azure.json' with { type: 'json' };
import gcp2 from './gcp2.json' with { type: 'json' };
import kubernetes from './kubernetes.json' with { type: 'json' };
import network from './network.json' with { type: 'json' };
import orgCustom from './org-custom.json' with { type: 'json' };

interface CompiledEntry {
	regex: RegExp;
	entry: CatalogEntry;
}

function compileEntries(entries: CatalogEntry[]): CompiledEntry[] {
	const compiled: CompiledEntry[] = [];
	for (const entry of entries) {
		try {
			compiled.push({ regex: new RegExp(entry.pattern), entry });
		} catch {
			// Malformed regex — skip silently
		}
	}
	return compiled;
}

/**
 * All built-in stencil catalogs, ordered by precedence.
 * org-custom is checked first so internal overrides win.
 * Regexes are pre-compiled once at module load.
 */
const COMPILED_BUILT_IN: CompiledEntry[][] = [
	compileEntries(orgCustom as CatalogEntry[]),
	compileEntries(aws4 as CatalogEntry[]),
	compileEntries(azure as CatalogEntry[]),
	compileEntries(gcp2 as CatalogEntry[]),
	compileEntries(kubernetes as CatalogEntry[]),
	compileEntries(network as CatalogEntry[]),
];

export const BUILT_IN_CATALOGS: CatalogEntry[][] = [
	orgCustom as CatalogEntry[],
	aws4 as CatalogEntry[],
	azure as CatalogEntry[],
	gcp2 as CatalogEntry[],
	kubernetes as CatalogEntry[],
	network as CatalogEntry[],
];

/**
 * Match a cell style string against a prioritized list of catalog arrays.
 * Returns the first match found, or null if no catalog recognizes the style.
 *
 * Extra catalogs (e.g. org-specific) are checked before built-in ones.
 * Extra catalog regexes are compiled on each call (they come from user config at runtime).
 */
export function matchStencilCatalogs(
	style: string,
	extraCatalogs: CatalogEntry[][] = []
): CatalogEntry | null {
	// Extra catalogs compiled per-call (small, infrequent, from runtime config)
	for (const catalog of extraCatalogs) {
		const match = matchCompiled(style, compileEntries(catalog));
		if (match) return match;
	}
	// Built-in catalogs pre-compiled at module load
	for (const compiled of COMPILED_BUILT_IN) {
		const match = matchCompiled(style, compiled);
		if (match) return match;
	}
	return null;
}

function matchCompiled(style: string, compiled: CompiledEntry[]): CatalogEntry | null {
	for (const { regex, entry } of compiled) {
		if (regex.test(style)) return entry;
	}
	return null;
}
