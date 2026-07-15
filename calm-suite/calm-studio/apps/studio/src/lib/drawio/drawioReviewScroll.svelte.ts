// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * drawioReviewScroll.svelte.ts — Scroll-target coordination between the
 * canvas draw.io review badge and the Import Review panel.
 *
 * Mirrors the scrollToElementId pattern in validation.svelte.ts (badge sets
 * the id, panel scrolls to the matching row) but kept independent so the two
 * features never interfere if both are visible at once.
 */

let scrollToId = $state<string | null>(null);

export function getDrawioScrollToId(): string | null {
	return scrollToId;
}

export function setDrawioScrollToId(id: string | null): void {
	scrollToId = id;
}
