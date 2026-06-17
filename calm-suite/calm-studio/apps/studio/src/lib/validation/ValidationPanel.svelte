<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  ValidationPanel.svelte — Bottom drawer validation panel.

  Displays all validation issues grouped by severity (errors first, warnings, then info).
  Supports two-way navigation:
    - Badge click (parent sets scrollToId) -> scrolls to matching row
    - Row click -> calls onnavigatetonode to center canvas on element

  Style: VS Code Problems panel inspired — compact rows, severity icons, monospace IDs.
-->
<script lang="ts">
	// Import from validation store to avoid direct @calmstudio/calm-core tsconfig resolution issues
	import type { ValidationIssue } from '$lib/stores/validation.svelte';

	// ─── Props ────────────────────────────────────────────────────────────────

	let {
		issues = [],
		scrollToId = null,
		onnavigatetonode,
		ondismiss,
	}: {
		issues?: ValidationIssue[];
		/** Element ID that the panel should scroll to (set by badge click in parent). */
		scrollToId?: string | null;
		/** Called when user clicks an issue row to navigate to that element on canvas. */
		onnavigatetonode?: (id: string) => void;
		/** Called when user clicks the close button. */
		ondismiss?: () => void;
	} = $props();

	// ─── Issue grouping ───────────────────────────────────────────────────────

	const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 } as const;

	const sortedIssues = $derived(
		[...issues].sort((a, b) => {
			const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
			if (severityDiff !== 0) return severityDiff;
			// Within severity: sort by elementId then message
			const aId = a.nodeId ?? a.relationshipId ?? '';
			const bId = b.nodeId ?? b.relationshipId ?? '';
			if (aId !== bId) return aId.localeCompare(bId);
			return a.message.localeCompare(b.message);
		})
	);

	// Issue count summary
	const errorCount = $derived(issues.filter((i) => i.severity === 'error').length);
	const warningCount = $derived(issues.filter((i) => i.severity === 'warning').length);
	const infoCount = $derived(issues.filter((i) => i.severity === 'info').length);

	const summaryText = $derived(() => {
		const parts: string[] = [];
		if (errorCount > 0) parts.push(`${errorCount} error${errorCount !== 1 ? 's' : ''}`);
		if (warningCount > 0) parts.push(`${warningCount} warning${warningCount !== 1 ? 's' : ''}`);
		if (infoCount > 0) parts.push(`${infoCount} info`);
		return parts.join(', ') || 'No issues';
	});

	// ─── Filters (severity + source) ──────────────────────────────────────────

	let hiddenSeverities = $state<Set<'error' | 'warning' | 'info'>>(new Set());
	let sourceFilter = $state<'all' | 'json-schema' | 'spectral'>('all');

	/** Source filter is only meaningful when issues carry a source (pattern validation). */
	const hasSources = $derived(issues.some((i) => i.source));

	const visibleIssues = $derived(
		sortedIssues.filter(
			(i) =>
				!hiddenSeverities.has(i.severity) &&
				(sourceFilter === 'all' || i.source === sourceFilter)
		)
	);

	function toggleSeverity(sev: 'error' | 'warning' | 'info') {
		const next = new Set(hiddenSeverities);
		if (next.has(sev)) next.delete(sev);
		else next.add(sev);
		hiddenSeverities = next;
	}

	// ─── Scroll-to support ────────────────────────────────────────────────────

	let listEl = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!scrollToId || !listEl) return;
		const row = listEl.querySelector<HTMLElement>(`[data-element-id="${CSS.escape(scrollToId)}"]`);
		if (row) {
			row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
		}
	});

	// ─── Row click handler ────────────────────────────────────────────────────

	function handleRowClick(issue: ValidationIssue) {
		const id = issue.nodeId ?? issue.relationshipId ?? '';
		if (id) {
			onnavigatetonode?.(id);
		}
	}
</script>

<div class="validation-panel">
	<!-- Header bar -->
	<div class="vp-header">
		<span class="vp-title">Problems</span>
		<span class="vp-summary">{summaryText()}</span>
		<button
			type="button"
			class="vp-close"
			onclick={ondismiss}
			aria-label="Dismiss validation panel"
			title="Close"
		>
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
				<line x1="18" y1="6" x2="6" y2="18" />
				<line x1="6" y1="6" x2="18" y2="18" />
			</svg>
		</button>
	</div>

	<!-- Filter bar: severity toggles + source filter -->
	{#if issues.length > 0}
		<div class="vp-filters">
			<button
				type="button"
				class="vp-filter vp-filter--error"
				class:off={hiddenSeverities.has('error')}
				onclick={() => toggleSeverity('error')}
				aria-pressed={!hiddenSeverities.has('error')}
				title="Toggle errors"
			>
				Errors {errorCount}
			</button>
			<button
				type="button"
				class="vp-filter vp-filter--warning"
				class:off={hiddenSeverities.has('warning')}
				onclick={() => toggleSeverity('warning')}
				aria-pressed={!hiddenSeverities.has('warning')}
				title="Toggle warnings"
			>
				Warnings {warningCount}
			</button>
			<button
				type="button"
				class="vp-filter vp-filter--info"
				class:off={hiddenSeverities.has('info')}
				onclick={() => toggleSeverity('info')}
				aria-pressed={!hiddenSeverities.has('info')}
				title="Toggle info"
			>
				Info {infoCount}
			</button>

			{#if hasSources}
				<span class="vp-filter-sep"></span>
				<select
					class="vp-source-select"
					bind:value={sourceFilter}
					aria-label="Filter by validation source"
					title="Filter by source"
				>
					<option value="all">All sources</option>
					<option value="json-schema">Schema</option>
					<option value="spectral">Spectral</option>
				</select>
			{/if}
		</div>
	{/if}

	<!-- Issue list -->
	<div class="vp-list" bind:this={listEl}>
		{#if visibleIssues.length === 0}
			<!-- Empty state -->
			<div class="vp-empty">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<polyline points="20 6 9 17 4 12" />
				</svg>
				<span>{issues.length === 0 ? 'No validation issues' : 'No issues match the current filters'}</span>
			</div>
		{:else}
			{#each visibleIssues as issue (issue.severity + ':' + (issue.nodeId ?? issue.relationshipId ?? '') + ':' + issue.message)}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="vp-row vp-row--{issue.severity}"
					data-element-id={issue.nodeId ?? issue.relationshipId ?? ''}
					onclick={() => handleRowClick(issue)}
					title={issue.message}
				>
					<!-- Severity icon -->
					<span class="vp-icon vp-icon--{issue.severity}" aria-label={issue.severity}>
						{#if issue.severity === 'error'}
							<!-- Red circle with X -->
							<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<circle cx="8" cy="8" r="7" fill="#dc2626" />
								<line x1="5.5" y1="5.5" x2="10.5" y2="10.5" stroke="white" stroke-width="1.8" stroke-linecap="round" />
								<line x1="10.5" y1="5.5" x2="5.5" y2="10.5" stroke="white" stroke-width="1.8" stroke-linecap="round" />
							</svg>
						{:else if issue.severity === 'warning'}
							<!-- Amber triangle -->
							<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<path d="M8 1.5L14.5 13.5H1.5L8 1.5Z" fill="#d97706" />
								<line x1="8" y1="6" x2="8" y2="10" stroke="white" stroke-width="1.8" stroke-linecap="round" />
								<circle cx="8" cy="12" r="0.8" fill="white" />
							</svg>
						{:else}
							<!-- Blue info "i" -->
							<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
								<circle cx="8" cy="8" r="7" fill="#3b82f6" />
								<circle cx="8" cy="5" r="0.9" fill="white" />
								<line x1="8" y1="7.5" x2="8" y2="11.5" stroke="white" stroke-width="1.8" stroke-linecap="round" />
							</svg>
						{/if}
					</span>

					<!-- Message text -->
					<span class="vp-message">{issue.message}</span>

					<!-- Element ID badge -->
					{#if issue.nodeId ?? issue.relationshipId}
						<span class="vp-id-badge">{issue.nodeId ?? issue.relationshipId}</span>
					{/if}
				</div>
			{/each}
		{/if}
	</div>
</div>

<style>
	.validation-panel {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background: var(--color-surface, #f8fafc);
		border-top: 1px solid var(--color-border, #e2e8f0);
		font-family: var(--font-sans, system-ui, sans-serif);
		overflow: hidden;
	}

	:global(.dark) .validation-panel {
		background: #0f172a;
		border-top-color: #1e293b;
	}

	/* ─── Header ──────────────────────────────────────────────────── */

	.vp-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 4px 10px;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
		background: var(--color-surface-secondary, #f1f5f9);
		flex-shrink: 0;
		min-height: 28px;
	}

	:global(.dark) .vp-header {
		background: #111827;
		border-bottom-color: #1e293b;
	}

	.vp-title {
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-secondary, #64748b);
		flex-shrink: 0;
	}

	:global(.dark) .vp-title {
		color: #94a3b8;
	}

	.vp-summary {
		font-size: 11px;
		color: var(--color-text-tertiary, #94a3b8);
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .vp-summary {
		color: #64748b;
	}

	.vp-close {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-tertiary, #94a3b8);
		display: flex;
		align-items: center;
		padding: 3px;
		border-radius: 4px;
		flex-shrink: 0;
		opacity: 0.7;
		transition: opacity 0.1s, background 0.1s;
	}

	.vp-close:hover {
		opacity: 1;
		background: rgba(0, 0, 0, 0.06);
	}

	:global(.dark) .vp-close {
		color: #64748b;
	}

	:global(.dark) .vp-close:hover {
		background: rgba(255, 255, 255, 0.06);
	}

	/* ─── Filter bar ──────────────────────────────────────────────── */

	.vp-filters {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
		background: var(--color-surface, #f8fafc);
		flex-shrink: 0;
	}

	:global(.dark) .vp-filters {
		background: #0f172a;
		border-bottom-color: #1e293b;
	}

	.vp-filter {
		font-size: 11px;
		font-family: var(--font-sans, system-ui, sans-serif);
		font-weight: 500;
		padding: 2px 8px;
		height: 20px;
		border-radius: 10px;
		border: 1px solid var(--color-border, #e2e8f0);
		background: var(--color-surface-secondary, #f1f5f9);
		color: var(--color-text-secondary, #64748b);
		cursor: pointer;
		white-space: nowrap;
		transition: opacity 0.1s, background 0.1s;
	}

	.vp-filter--error:not(.off) {
		border-color: #dc2626;
		color: #dc2626;
		background: rgba(220, 38, 38, 0.08);
	}

	.vp-filter--warning:not(.off) {
		border-color: #d97706;
		color: #d97706;
		background: rgba(217, 119, 6, 0.08);
	}

	.vp-filter--info:not(.off) {
		border-color: #3b82f6;
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.08);
	}

	.vp-filter.off {
		opacity: 0.5;
		text-decoration: line-through;
	}

	.vp-filter-sep {
		width: 1px;
		height: 14px;
		background: var(--color-border, #e2e8f0);
		margin: 0 2px;
	}

	:global(.dark) .vp-filter-sep {
		background: #1e293b;
	}

	.vp-source-select {
		height: 20px;
		font-size: 11px;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-secondary, #64748b);
		background: var(--color-surface-secondary, #f1f5f9);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 6px;
		padding: 0 4px;
		cursor: pointer;
		outline: none;
	}

	:global(.dark) .vp-source-select {
		background: #111827;
		border-color: #1e293b;
		color: #94a3b8;
	}

	/* ─── Issue list ──────────────────────────────────────────────── */

	.vp-list {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
	}

	/* ─── Empty state ─────────────────────────────────────────────── */

	.vp-empty {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 10px 12px;
		font-size: 12px;
		color: var(--color-text-tertiary, #94a3b8);
	}

	:global(.dark) .vp-empty {
		color: #475569;
	}

	/* ─── Issue rows ──────────────────────────────────────────────── */

	.vp-row {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 0 10px;
		min-height: 28px;
		cursor: pointer;
		border-bottom: 1px solid transparent;
		transition: background 0.1s;
		user-select: none;
	}

	.vp-row:hover {
		background: var(--color-surface-tertiary, #f1f5f9);
	}

	:global(.dark) .vp-row:hover {
		background: #1e293b;
	}

	.vp-row:last-child {
		border-bottom: none;
	}

	/* ─── Severity icons ──────────────────────────────────────────── */

	.vp-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}

	/* ─── Message text ────────────────────────────────────────────── */

	.vp-message {
		flex: 1;
		font-size: 12px;
		color: var(--color-text-primary, #1e293b);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		line-height: 1.4;
	}

	:global(.dark) .vp-message {
		color: #cbd5e1;
	}

	/* ─── Element ID badge ────────────────────────────────────────── */

	.vp-id-badge {
		font-family: var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace);
		font-size: 10px;
		color: var(--color-text-tertiary, #94a3b8);
		background: var(--color-surface-secondary, #f1f5f9);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 4px;
		padding: 1px 5px;
		flex-shrink: 0;
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .vp-id-badge {
		color: #64748b;
		background: #111827;
		border-color: #1e293b;
	}
</style>
