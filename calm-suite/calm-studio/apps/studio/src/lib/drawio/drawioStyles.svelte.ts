// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * drawioStyles.svelte.ts — Session store for raw draw.io mxCell styles.
 *
 * CALM has no representation for visual properties (fill color, shape family,
 * etc.), so the importer returns them out-of-band as a StyleMap. This store
 * holds the current diagram's styles in memory so exportAsCalm can fold them
 * into the .calmstudio.json sidecar — the importer's "nothing dropped
 * silently" invariant, satisfied without polluting the CALM document.
 */

import type { StyleMap } from '@calmstudio/drawio-import';

let styles = $state<StyleMap>({});

export function getDrawioStyles(): StyleMap {
	return styles;
}

export function setDrawioStyles(next: StyleMap): void {
	styles = next;
}

export function clearDrawioStyles(): void {
	styles = {};
}
