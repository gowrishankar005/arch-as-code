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

/**
 * All built-in stencil catalogs, ordered by precedence.
 * org-custom is checked first so internal overrides win.
 */
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
 */
export function matchStencilCatalogs(
	style: string,
	extraCatalogs: CatalogEntry[][] = []
): CatalogEntry | null {
	const allCatalogs = [...extraCatalogs, ...BUILT_IN_CATALOGS];

	for (const catalog of allCatalogs) {
		const match = matchCatalog(style, catalog);
		if (match) return match;
	}
	return null;
}

function matchCatalog(style: string, catalog: CatalogEntry[]): CatalogEntry | null {
	for (const entry of catalog) {
		try {
			if (new RegExp(entry.pattern).test(style)) return entry;
		} catch {
			// Malformed regex in catalog — skip silently
		}
	}
	return null;
}
