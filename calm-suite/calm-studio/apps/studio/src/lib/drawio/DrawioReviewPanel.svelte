<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  DrawioReviewPanel.svelte — Post-import review panel for draw.io imports.

  Shown automatically after a draw.io import when any nodes are below high
  confidence or any edges couldn't be resolved to both endpoints. Lists each
  item with its inferred type, confidence badge, and the inference reason.
  Type can be corrected inline via a dropdown — correcting or bulk-accepting
  an item resolves it out of the outstanding list (local to this panel;
  dismissing without resolving everything is also allowed).
-->

<script lang="ts">
	import type { ConfidenceReportEntry, DanglingEdgeEntry } from '@calmstudio/drawio-import';

	const CORE_NODE_TYPES = [
		'actor', 'system', 'service', 'database',
		'network', 'webclient', 'ecosystem', 'ldap', 'data-asset',
	] as const;

	let {
		report = [],
		danglingEdges = [],
		pageCount = 1,
		pageName = '',
		resolvedIds = new Set(),
		scrollToId = null,
		ondismiss,
		oncorrecttype,
		onacceptmedium,
	}: {
		report?: ConfidenceReportEntry[];
		danglingEdges?: DanglingEdgeEntry[];
		pageCount?: number;
		pageName?: string;
		/** calmIds already resolved (corrected or bulk-accepted) — shared with the canvas badge state. */
		resolvedIds?: Set<string>;
		/** calmId the panel should scroll to (set by a canvas badge click). */
		scrollToId?: string | null;
		ondismiss?: () => void;
		/** Called when the user picks a corrected type for a node in the panel. */
		oncorrecttype?: (calmId: string, newType: string) => void;
		/** Called with the calmIds to bulk-accept when "Accept all medium-confidence" is clicked. */
		onacceptmedium?: (calmIds: string[]) => void;
	} = $props();

	// ─── Scroll-to support (mirrors ValidationPanel's scrollToId pattern) ─────

	let bodyEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!scrollToId || !bodyEl) return;
		const row = bodyEl.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(scrollToId)}"]`);
		if (row) {
			row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	});

	const totalNodes = $derived(report.length);
	const autoTypedCount = $derived(report.filter((r) => r.confidence === 'high').length);
	const autoTypedPct = $derived(totalNodes > 0 ? Math.round((autoTypedCount / totalNodes) * 100) : 100);

	// Panel lists everything below high confidence — the "genuinely ambiguous"
	// shapes from the user story — minus anything already resolved this session.
	const reviewItems = $derived(
		report.filter((r) => r.confidence !== 'high' && !resolvedIds.has(r.calmId))
	);
	const mediumItems = $derived(reviewItems.filter((r) => r.confidence === 'medium'));
	const outstandingDangling = $derived(danglingEdges);

	function confidenceLabel(c: ConfidenceReportEntry['confidence']): string {
		return c === 'none' ? 'Unmatched' : c.charAt(0).toUpperCase() + c.slice(1);
	}

	function confidenceClass(c: ConfidenceReportEntry['confidence']): string {
		if (c === 'high') return 'badge-high';
		if (c === 'medium') return 'badge-medium';
		return 'badge-low';
	}

	function missingEndLabel(entry: DanglingEdgeEntry): string {
		if (entry.missingEnd === 'both') return 'both endpoints unresolved';
		return `${entry.missingEnd} unresolved`;
	}

	function acceptAllMedium() {
		onacceptmedium?.(mediumItems.map((item) => item.calmId));
	}

	function handleTypeCorrect(calmId: string, e: Event) {
		const newType = (e.target as HTMLSelectElement).value;
		oncorrecttype?.(calmId, newType);
	}
</script>

<aside class="review-panel" aria-label="draw.io import review">
	<header class="review-header">
		<div class="review-title-row">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
			</svg>
			<span class="review-title">Import Review</span>
		</div>
		<button
			type="button"
			class="review-close"
			onclick={ondismiss}
			aria-label="Dismiss import review"
		>
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</header>

	<div class="review-summary">
		<span class="summary-text">
			{totalNodes} nodes imported from <strong>{pageName}</strong>
			{#if pageCount > 1}<span class="page-note"> (1 of {pageCount} pages)</span>{/if}
			<br />
			<span class="auto-typed-note">{autoTypedPct}% auto-typed with high confidence</span>
		</span>
		<span class="needs-review-count">
			{reviewItems.length} need{reviewItems.length === 1 ? 's' : ''} review
		</span>
	</div>

	{#if reviewItems.length === 0 && outstandingDangling.length === 0}
		<div class="review-empty">
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
				<polyline points="22 4 12 14.01 9 11.01" />
			</svg>
			<span>All nodes and edges resolved.</span>
		</div>
	{:else}
		<div class="review-body" bind:this={bodyEl}>
			{#if mediumItems.length > 1}
				<button type="button" class="accept-all-btn" onclick={acceptAllMedium}>
					Accept all {mediumItems.length} medium-confidence types
				</button>
			{/if}

			{#if reviewItems.length > 0}
				<p class="review-hint">Correct the type below, or leave it and fix later in the Properties panel.</p>
				<ul class="review-list" role="list">
					{#each reviewItems as item (item.calmId)}
						<li class="review-item" data-element-id={item.calmId}>
							<div class="item-label-row">
								<span class="item-label" title={item.label || item.calmId}>
									{item.label || item.calmId}
								</span>
								<span class={`confidence-badge ${confidenceClass(item.confidence)}`}>
									{confidenceLabel(item.confidence)}
								</span>
							</div>
							<div class="item-type-row">
								<span class="item-type-label">Type:</span>
								<select
									class="item-type-select"
									value={CORE_NODE_TYPES.includes(item.inferredType as typeof CORE_NODE_TYPES[number]) ? item.inferredType : '__inferred__'}
									onchange={(e) => handleTypeCorrect(item.calmId, e)}
									aria-label="Correct type for {item.label || item.calmId}"
								>
									{#if !CORE_NODE_TYPES.includes(item.inferredType as typeof CORE_NODE_TYPES[number])}
										<option value="__inferred__" disabled>{item.inferredType} (inferred)</option>
									{/if}
									{#each CORE_NODE_TYPES as t}
										<option value={t}>{t}</option>
									{/each}
								</select>
							</div>
							<p class="item-reason">{item.reason}</p>
						</li>
					{/each}
				</ul>
			{/if}

			{#if outstandingDangling.length > 0}
				<p class="review-hint dangling-hint">Edges that couldn't be fully connected:</p>
				<ul class="review-list dangling-list" role="list">
					{#each outstandingDangling as edge (edge.cellId)}
						<li class="review-item dangling-item">
							<div class="item-label-row">
								<span class="item-label" title={edge.label || edge.cellId}>
									{edge.label || `edge ${edge.cellId}`}
								</span>
								<span class="confidence-badge badge-low">{missingEndLabel(edge)}</span>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}

	<footer class="review-footer">
		<button type="button" class="review-done-btn" onclick={ondismiss}>
			Got it
		</button>
	</footer>
</aside>

<style>
	.review-panel {
		position: absolute;
		top: 8px;
		right: 8px;
		width: 300px;
		max-height: calc(100% - 16px);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.14);
		display: flex;
		flex-direction: column;
		z-index: 50;
		overflow: hidden;
		font-family: var(--font-sans);
	}

	:global(.dark) .review-panel {
		background: #111827;
		border-color: #1e293b;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
	}

	/* ─── Header ─────────────────────────────────── */

	.review-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 12px 8px;
		border-bottom: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	:global(.dark) .review-header {
		border-color: #1e293b;
	}

	.review-title-row {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--color-text-secondary);
	}

	:global(.dark) .review-title-row {
		color: #64748b;
	}

	.review-title {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-text-secondary);
	}

	:global(.dark) .review-title {
		color: #94a3b8;
	}

	.review-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		border: none;
		background: none;
		color: var(--color-text-secondary);
		cursor: pointer;
		border-radius: 4px;
		transition: background 0.1s, color 0.1s;
		padding: 0;
	}

	.review-close:hover {
		background: var(--color-surface-tertiary);
		color: var(--color-text-primary);
	}

	:global(.dark) .review-close {
		color: #64748b;
	}

	:global(.dark) .review-close:hover {
		background: #1e293b;
		color: #e2e8f0;
	}

	/* ─── Summary bar ────────────────────────────── */

	.review-summary {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 8px 12px 6px;
		background: rgba(245, 158, 11, 0.06);
		border-bottom: 1px solid rgba(245, 158, 11, 0.12);
		flex-shrink: 0;
	}

	:global(.dark) .review-summary {
		background: rgba(245, 158, 11, 0.08);
		border-bottom-color: rgba(245, 158, 11, 0.15);
	}

	.summary-text {
		font-size: 11px;
		color: var(--color-text-secondary);
		line-height: 1.5;
	}

	.summary-text strong {
		color: var(--color-text-primary);
		font-weight: 600;
	}

	:global(.dark) .summary-text {
		color: #94a3b8;
	}

	:global(.dark) .summary-text strong {
		color: #e2e8f0;
	}

	.page-note {
		font-size: 10px;
		color: var(--color-text-secondary);
		opacity: 0.7;
	}

	.auto-typed-note {
		font-size: 10px;
		font-weight: 600;
		color: #16a34a;
	}

	:global(.dark) .auto-typed-note {
		color: #4ade80;
	}

	.needs-review-count {
		font-size: 11px;
		font-weight: 600;
		color: #d97706;
		white-space: nowrap;
		margin-left: 8px;
		flex-shrink: 0;
	}

	:global(.dark) .needs-review-count {
		color: #fbbf24;
	}

	/* ─── Empty state ────────────────────────────── */

	.review-empty {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 16px 12px;
		color: #16a34a;
		font-size: 12px;
	}

	:global(.dark) .review-empty {
		color: #4ade80;
	}

	/* ─── Body / scroll container ────────────────── */

	.review-body {
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		flex: 1;
		min-height: 0;
	}

	/* ─── Accept-all bulk action ──────────────────── */

	.accept-all-btn {
		margin: 8px 12px 0;
		padding: 6px 10px;
		border-radius: 6px;
		border: 1px solid rgba(37, 99, 235, 0.3);
		background: rgba(37, 99, 235, 0.08);
		color: #2563eb;
		font-size: 11px;
		font-weight: 600;
		font-family: var(--font-sans);
		cursor: pointer;
		text-align: left;
		flex-shrink: 0;
		transition: background 0.1s;
	}

	.accept-all-btn:hover {
		background: rgba(37, 99, 235, 0.14);
	}

	:global(.dark) .accept-all-btn {
		border-color: rgba(96, 165, 250, 0.3);
		background: rgba(96, 165, 250, 0.1);
		color: #60a5fa;
	}

	:global(.dark) .accept-all-btn:hover {
		background: rgba(96, 165, 250, 0.16);
	}

	/* ─── Hint + list ────────────────────────────── */

	.review-hint {
		font-size: 11px;
		color: var(--color-text-secondary);
		margin: 0;
		padding: 8px 12px 4px;
		flex-shrink: 0;
	}

	:global(.dark) .review-hint {
		color: #64748b;
	}

	.dangling-hint {
		border-top: 1px solid var(--color-border);
		margin-top: 4px;
	}

	:global(.dark) .dangling-hint {
		border-top-color: #1e293b;
	}

	.review-list {
		list-style: none;
		margin: 0;
		padding: 4px 8px;
		flex-shrink: 0;
	}

	.review-item {
		padding: 8px;
		margin-bottom: 4px;
		border-radius: 6px;
		border: 1px solid var(--color-border);
		background: var(--color-surface-secondary, #f8fafc);
	}

	:global(.dark) .review-item {
		background: #0f172a;
		border-color: #1e293b;
	}

	.dangling-item {
		padding: 6px 8px;
	}

	.item-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		margin-bottom: 4px;
	}

	.item-label {
		font-size: 12px;
		font-weight: 600;
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .item-label {
		color: #e2e8f0;
	}

	.confidence-badge {
		font-size: 10px;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 9px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.badge-high { background: #dcfce7; color: #16a34a; }
	.badge-medium { background: #fef3c7; color: #d97706; }
	.badge-low { background: #fee2e2; color: #dc2626; }

	:global(.dark) .badge-high { background: rgba(22, 163, 74, 0.2); color: #4ade80; }
	:global(.dark) .badge-medium { background: rgba(217, 119, 6, 0.2); color: #fbbf24; }
	:global(.dark) .badge-low { background: rgba(220, 38, 38, 0.2); color: #f87171; }

	.item-type-row {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-bottom: 3px;
	}

	.item-type-label {
		font-size: 10px;
		color: var(--color-text-secondary);
		font-weight: 500;
	}

	:global(.dark) .item-type-label {
		color: #64748b;
	}

	.item-type-select {
		font-size: 10px;
		font-family: var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace);
		color: #6366f1;
		background: rgba(99, 102, 241, 0.08);
		border: 1px solid rgba(99, 102, 241, 0.2);
		padding: 1px 4px;
		border-radius: 3px;
		cursor: pointer;
	}

	:global(.dark) .item-type-select {
		color: #a5b4fc;
		background: rgba(165, 180, 252, 0.1);
		border-color: rgba(165, 180, 252, 0.25);
	}

	.item-reason {
		font-size: 10px;
		color: var(--color-text-secondary);
		margin: 0;
		line-height: 1.5;
	}

	:global(.dark) .item-reason {
		color: #475569;
	}

	/* ─── Footer ─────────────────────────────────── */

	.review-footer {
		padding: 8px 12px;
		border-top: 1px solid var(--color-border);
		flex-shrink: 0;
	}

	:global(.dark) .review-footer {
		border-color: #1e293b;
	}

	.review-done-btn {
		width: 100%;
		padding: 6px 0;
		border-radius: 6px;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-secondary);
		font-size: 12px;
		font-family: var(--font-sans);
		font-weight: 500;
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}

	.review-done-btn:hover {
		background: var(--color-surface-tertiary);
		color: var(--color-text-primary);
	}

	:global(.dark) .review-done-btn {
		background: #1e293b;
		border-color: #334155;
		color: #94a3b8;
	}

	:global(.dark) .review-done-btn:hover {
		background: #334155;
		color: #e2e8f0;
	}
</style>
