// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * autosave.svelte.ts — Browser localStorage auto-save for crash recovery.
 *
 * Mirrors draw.io's approach: saves a recovery draft to localStorage on every
 * change (debounced 2s). On page load, if a draft exists, the app can offer
 * to restore it. This is NOT file-level auto-save — it's crash protection.
 *
 * Storage key: `calmstudio:autosave`
 * Stored shape: { json: string, filename: string | null, timestamp: number }
 */

const STORAGE_KEY = 'calmstudio:autosave';
const DEBOUNCE_MS = 2000;

export interface AutosaveDraft {
	json: string;
	filename: string | null;
	timestamp: number;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a debounced save of the current model JSON to localStorage.
 * Resets the timer on every call so rapid edits don't thrash storage.
 */
export function scheduleAutosave(json: string, filename: string | null): void {
	if (debounceTimer) clearTimeout(debounceTimer);
	debounceTimer = setTimeout(() => {
		try {
			const draft: AutosaveDraft = {
				json,
				filename,
				timestamp: Date.now(),
			};
			localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
		} catch {
			// localStorage full or unavailable — silently ignore
		}
	}, DEBOUNCE_MS);
}

/**
 * Check if a recovery draft exists in localStorage.
 * Returns the draft if found, null otherwise.
 */
export function getAutosaveDraft(): AutosaveDraft | null {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const draft = JSON.parse(raw) as AutosaveDraft;
		if (!draft.json || !draft.timestamp) return null;
		// Ignore drafts with empty architectures
		const parsed = JSON.parse(draft.json) as { nodes?: unknown[] };
		if (!parsed.nodes || parsed.nodes.length === 0) return null;
		return draft;
	} catch {
		return null;
	}
}

/**
 * Clear the auto-save draft from localStorage.
 * Called after explicit save, new file, or when the user dismisses recovery.
 */
export function clearAutosave(): void {
	if (debounceTimer) clearTimeout(debounceTimer);
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// silently ignore
	}
}
