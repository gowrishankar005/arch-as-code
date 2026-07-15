<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  DrawioPagePicker.svelte — Modal for choosing which page of a multi-page
  .drawio file to import as a CALM architecture.

  Each draw.io page becomes an independent CALM architecture (per the Track B
  design doc invariant); only one page is loaded onto the canvas at a time, so
  when a file has more than one page the user picks which one.

  Props (Svelte 5 $props):
    pages: { name: string; nodeCount: number }[]
    onselect: (index: number) => void
    oncancel: () => void
-->

<script lang="ts">
	let {
		pages,
		onselect,
		oncancel,
	}: {
		pages: { name: string; nodeCount: number }[];
		onselect: (index: number) => void;
		oncancel: () => void;
	} = $props();

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
<div class="modal-backdrop" onclick={handleBackdropClick} role="dialog" aria-modal="true" aria-label="Select draw.io page to import">
	<div class="modal-content">
		<div class="modal-header">
			<div class="modal-title-group">
				<h2 class="modal-title">Select a page to import</h2>
				<p class="modal-subtitle">This file has {pages.length} pages — each imports as a separate architecture</p>
			</div>
			<button type="button" class="close-btn" onclick={oncancel} aria-label="Cancel import">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>

		<ul class="page-list" role="list">
			{#each pages as page, i (page.name + i)}
				<li>
					<button
						type="button"
						class="page-item"
						onclick={() => onselect(i)}
						aria-label="Import page {i + 1}: {page.name} ({page.nodeCount} nodes)"
					>
						<span class="page-index">{i + 1}</span>
						<span class="page-name">{page.name}</span>
						<span class="page-node-count">{page.nodeCount} node{page.nodeCount !== 1 ? 's' : ''}</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>
</div>

<style>
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

	.modal-content {
		background: var(--color-surface, #ffffff);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 16px;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
		width: 100%;
		max-width: 420px;
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

	.page-list {
		list-style: none;
		margin: 0;
		padding: 8px;
		overflow-y: auto;
	}

	.page-item {
		display: flex;
		align-items: center;
		gap: 10px;
		width: 100%;
		padding: 10px 12px;
		border-radius: 8px;
		border: 1px solid transparent;
		background: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.12s ease, border-color 0.12s ease;
	}

	.page-item:hover {
		background: var(--color-surface-tertiary, #f1f5f9);
		border-color: var(--color-border, #e2e8f0);
	}

	:global(.dark) .page-item:hover {
		background: #1e293b;
		border-color: #334155;
	}

	.page-index {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 6px;
		background: var(--color-surface-tertiary, #f1f5f9);
		color: var(--color-text-secondary, #64748b);
		font-size: 11px;
		font-weight: 700;
		font-family: var(--font-sans, system-ui, sans-serif);
		flex-shrink: 0;
	}

	:global(.dark) .page-index {
		background: #1e293b;
		color: #94a3b8;
	}

	.page-name {
		flex: 1;
		font-size: 13px;
		font-weight: 500;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-primary, #0f172a);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .page-name {
		color: #e2e8f0;
	}

	.page-node-count {
		font-size: 11px;
		color: var(--color-text-secondary, #64748b);
		font-family: var(--font-sans, system-ui, sans-serif);
		white-space: nowrap;
		flex-shrink: 0;
	}

	:global(.dark) .page-node-count {
		color: #64748b;
	}
</style>
