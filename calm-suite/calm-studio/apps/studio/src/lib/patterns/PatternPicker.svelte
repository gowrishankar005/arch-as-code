<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  PatternPicker.svelte — Full-screen modal for choosing a pattern / standard to
  validate against. Mirrors TemplatePicker.

  - Loads the shared catalog (static/patterns/index.json) on mount.
  - Category tabs + a responsive grid of pattern cards (name, description, tags).
  - Clicking a card fires onselect(entry); the parent fetches the pattern doc.
  - A footer "Upload a pattern file…" affordance keeps the ad-hoc file flow.
  - Cancel / Escape / backdrop click fire oncancel().

  Props (Svelte 5 $props):
    onselect: (entry: PatternCatalogEntry) => void
    onupload: () => void
    oncancel: () => void
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import {
		fetchPatternCatalog,
		catalogCategories,
		type PatternCatalogEntry,
	} from './catalog';

	let {
		onselect,
		onupload,
		oncancel,
	}: {
		onselect: (entry: PatternCatalogEntry) => void;
		onupload: () => void;
		oncancel: () => void;
	} = $props();

	// ─── State ────────────────────────────────────────────────────────────────

	let entries = $state<PatternCatalogEntry[]>([]);
	let loading = $state(true);
	let activeCategory = $state<string | null>(null);

	onMount(async () => {
		entries = await fetchPatternCatalog();
		activeCategory = catalogCategories(entries)[0] ?? null;
		loading = false;
	});

	const categories = $derived(catalogCategories(entries));
	const activeEntries = $derived(
		activeCategory ? entries.filter((e) => e.category === activeCategory) : entries
	);

	// ─── Category display helpers ─────────────────────────────────────────────

	function categoryLabel(cat: string): string {
		const map: Record<string, string> = {
			general: 'General',
			security: 'Security',
			'ai-governance': 'AI Governance',
			compliance: 'Compliance',
		};
		return map[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1);
	}

	function categoryColor(cat: string): string {
		const map: Record<string, string> = {
			general: '#3b82f6',
			security: '#dc2626',
			'ai-governance': '#8b5cf6',
			compliance: '#16a34a',
		};
		return map[cat] ?? '#64748b';
	}

	function countIn(cat: string): number {
		return entries.filter((e) => e.category === cat).length;
	}

	// ─── Keyboard + backdrop ──────────────────────────────────────────────────

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			oncancel();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
			oncancel();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="modal-backdrop" onclick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Pattern picker">
	<div class="modal-content">
		<!-- Header -->
		<div class="modal-header">
			<div class="modal-title-group">
				<h2 class="modal-title">Validate against a pattern</h2>
				<p class="modal-subtitle">Choose a pattern, standard, or control set to validate the current architecture</p>
			</div>
			<button type="button" class="close-btn" onclick={oncancel} aria-label="Close pattern picker">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<!-- Category tabs -->
		{#if categories.length > 1}
			<div class="category-tabs" role="tablist" aria-label="Pattern categories">
				{#each categories as cat}
					<button
						type="button"
						role="tab"
						class="category-tab"
						class:active={activeCategory === cat}
						onclick={() => (activeCategory = cat)}
						aria-selected={activeCategory === cat}
						aria-controls="pattern-grid"
					>
						<span class="cat-dot" style="background: {categoryColor(cat)}"></span>
						{categoryLabel(cat)}
						<span class="cat-count">{countIn(cat)}</span>
					</button>
				{/each}
			</div>
		{/if}

		<!-- Pattern grid -->
		<div class="pattern-grid" id="pattern-grid" role="tabpanel">
			{#if loading}
				<p class="grid-message">Loading patterns…</p>
			{:else if entries.length === 0}
				<p class="grid-message">
					No patterns found. Add pattern files to <code>static/patterns/</code> and list them in
					<code>index.json</code>, or upload one below.
				</p>
			{:else}
				{#each activeEntries as entry (entry.id)}
					<button
						type="button"
						class="pattern-card"
						onclick={() => onselect(entry)}
						aria-label="Validate against pattern: {entry.name}"
					>
						<div class="card-header">
							<span class="card-dot" style="background: {categoryColor(entry.category)}"></span>
							<span class="card-name">{entry.name}</span>
						</div>
						<p class="card-description">{entry.description}</p>
						<div class="card-tags" aria-label="Tags">
							{#each entry.tags.slice(0, 4) as tag}
								<span class="tag-pill">{tag}</span>
							{/each}
						</div>
					</button>
				{/each}
			{/if}
		</div>

		<!-- Footer: upload custom -->
		<div class="modal-footer">
			<span class="footer-hint">Have your own pattern?</span>
			<button type="button" class="upload-btn" onclick={onupload}>
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
					<polyline points="17 8 12 3 7 8" />
					<line x1="12" y1="3" x2="12" y2="15" />
				</svg>
				Upload a pattern file…
			</button>
		</div>
	</div>
</div>

<style>
	/* ─── Backdrop ───────────────────────────────────────────────── */

	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1000;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}

	/* ─── Modal container ────────────────────────────────────────── */

	.modal-content {
		background: var(--color-surface, #ffffff);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 16px;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
		width: 100%;
		max-width: 820px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	:global(.dark) .modal-content {
		background: #0f172a;
		border-color: #1e293b;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
	}

	/* ─── Header ─────────────────────────────────────────────────── */

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding: 20px 24px 16px;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
		flex-shrink: 0;
	}

	:global(.dark) .modal-header {
		border-color: #1e293b;
	}

	.modal-title-group {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.modal-title {
		font-size: 16px;
		font-weight: 600;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-primary, #0f172a);
		margin: 0;
	}

	:global(.dark) .modal-title {
		color: #f1f5f9;
	}

	.modal-subtitle {
		font-size: 12px;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-secondary, #64748b);
		margin: 0;
	}

	:global(.dark) .modal-subtitle {
		color: #64748b;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 6px;
		border: 1px solid var(--color-border, #e2e8f0);
		background: var(--color-surface, #ffffff);
		color: var(--color-text-secondary, #64748b);
		cursor: pointer;
		flex-shrink: 0;
		transition: background 0.12s ease, color 0.12s ease;
	}

	.close-btn:hover {
		background: var(--color-surface-tertiary, #f1f5f9);
		color: var(--color-text-primary, #0f172a);
	}

	:global(.dark) .close-btn {
		background: #111827;
		border-color: #334155;
		color: #94a3b8;
	}

	:global(.dark) .close-btn:hover {
		background: #1e293b;
		color: #e2e8f0;
	}

	/* ─── Category tabs ──────────────────────────────────────────── */

	.category-tabs {
		display: flex;
		gap: 0;
		padding: 0 24px;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
		flex-shrink: 0;
		overflow-x: auto;
	}

	:global(.dark) .category-tabs {
		border-color: #1e293b;
	}

	.category-tab {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 14px;
		border: none;
		border-bottom: 2px solid transparent;
		background: none;
		color: var(--color-text-secondary, #64748b);
		font-size: 12px;
		font-weight: 500;
		font-family: var(--font-sans, system-ui, sans-serif);
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.12s ease, border-color 0.12s ease;
		margin-bottom: -1px;
	}

	.category-tab:hover {
		color: var(--color-text-primary, #0f172a);
	}

	.category-tab.active {
		color: var(--color-accent, #3b82f6);
		border-bottom-color: var(--color-accent, #3b82f6);
	}

	:global(.dark) .category-tab {
		color: #64748b;
	}

	:global(.dark) .category-tab:hover {
		color: #e2e8f0;
	}

	:global(.dark) .category-tab.active {
		color: #60a5fa;
		border-bottom-color: #60a5fa;
	}

	.cat-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.cat-count {
		background: var(--color-surface-tertiary, #f1f5f9);
		color: var(--color-text-secondary, #64748b);
		font-size: 10px;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 10px;
		line-height: 1.4;
	}

	:global(.dark) .cat-count {
		background: #1e293b;
		color: #64748b;
	}

	/* ─── Pattern grid ───────────────────────────────────────────── */

	.pattern-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 12px;
		padding: 20px 24px;
		overflow-y: auto;
		flex: 1;
	}

	.grid-message {
		grid-column: 1 / -1;
		text-align: center;
		font-size: 13px;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-secondary, #64748b);
		padding: 40px 0;
		margin: 0;
		line-height: 1.6;
	}

	.grid-message code {
		font-family: var(--font-mono, 'JetBrains Mono', monospace);
		font-size: 12px;
		background: var(--color-surface-tertiary, #f1f5f9);
		border-radius: 4px;
		padding: 1px 5px;
	}

	:global(.dark) .grid-message code {
		background: #1e293b;
	}

	/* ─── Pattern card ───────────────────────────────────────────── */

	.pattern-card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 10px;
		background: var(--color-surface, #ffffff);
		text-align: left;
		cursor: pointer;
		transition: border-color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease;
	}

	.pattern-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.12);
	}

	:global(.dark) .pattern-card {
		background: #111827;
		border-color: #1e293b;
	}

	:global(.dark) .pattern-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);
		background: #1a2234;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.card-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.card-name {
		flex: 1;
		font-size: 12px;
		font-weight: 600;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-primary, #0f172a);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .card-name {
		color: #e2e8f0;
	}

	.card-description {
		font-size: 11px;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-secondary, #64748b);
		line-height: 1.5;
		margin: 0;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	:global(.dark) .card-description {
		color: #64748b;
	}

	.card-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.tag-pill {
		font-size: 10px;
		font-family: var(--font-sans, system-ui, sans-serif);
		font-weight: 500;
		color: var(--color-text-secondary, #64748b);
		background: var(--color-surface-tertiary, #f1f5f9);
		border-radius: 10px;
		padding: 2px 7px;
		white-space: nowrap;
	}

	:global(.dark) .tag-pill {
		background: #1e293b;
		color: #64748b;
	}

	/* ─── Footer ─────────────────────────────────────────────────── */

	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		padding: 12px 24px;
		border-top: 1px solid var(--color-border, #e2e8f0);
		flex-shrink: 0;
	}

	:global(.dark) .modal-footer {
		border-color: #1e293b;
	}

	.footer-hint {
		font-size: 12px;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-secondary, #64748b);
	}

	.upload-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 8px;
		border: 1px solid var(--color-border, #e2e8f0);
		background: var(--color-surface, #ffffff);
		color: var(--color-text-primary, #0f172a);
		font-size: 12px;
		font-weight: 500;
		font-family: var(--font-sans, system-ui, sans-serif);
		cursor: pointer;
		transition: background 0.12s ease, border-color 0.12s ease;
	}

	.upload-btn:hover {
		border-color: #3b82f6;
		background: var(--color-surface-tertiary, #f1f5f9);
	}

	:global(.dark) .upload-btn {
		background: #111827;
		border-color: #334155;
		color: #e2e8f0;
	}

	:global(.dark) .upload-btn:hover {
		border-color: #3b82f6;
		background: #1e293b;
	}
</style>
