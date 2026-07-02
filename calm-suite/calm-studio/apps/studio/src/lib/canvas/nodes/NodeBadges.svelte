<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  NodeBadges.svelte — Shared metadata badge strip for node components.

  Surfaces CALM 1.2 fields that aren't otherwise visible on the canvas:
  controls (count), data-classification, and details (drill-down link).
  These are read-only wayfinding badges — editing happens in the
  Properties panel, not here.

  Renders as an absolute-positioned row in the bottom-right corner of the
  node. The parent `.node` div must have position: relative for the badge
  strip to anchor (same requirement as ValidationBadge.svelte, which anchors
  top-right so the two never overlap).
-->
<script lang="ts">
	interface NodeDetails {
		'detailed-architecture'?: string;
		'required-pattern'?: string;
	}

	let {
		controls,
		dataClassification,
		details,
	}: {
		controls?: Record<string, unknown>;
		dataClassification?: string;
		details?: NodeDetails;
	} = $props();

	const controlsCount = $derived(controls ? Object.keys(controls).length : 0);
	const hasDetails = $derived(
		!!(details && (details['detailed-architecture'] || details['required-pattern']))
	);
	const detailsTitle = $derived(
		details?.['detailed-architecture']
			? `Detailed architecture: ${details['detailed-architecture']}`
			: details?.['required-pattern']
				? `Required pattern: ${details['required-pattern']}`
				: ''
	);

	/** Matches the classification color mapping already used by ExtensionNode/GenericNode. */
	function classificationStyle(dc: string): string {
		switch (dc.toLowerCase()) {
			case 'pii': return 'background:#fef2f2;color:#dc2626;border-color:#fca5a5;';
			case 'confidential': return 'background:#fffbeb;color:#d97706;border-color:#fcd34d;';
			case 'public': return 'background:#f0fdf4;color:#16a34a;border-color:#86efac;';
			default: return 'background:#f1f5f9;color:#64748b;border-color:#cbd5e1;';
		}
	}
</script>

{#if controlsCount > 0 || dataClassification || hasDetails}
	<div class="node-badges">
		{#if controlsCount > 0}
			<span
				class="badge-pill"
				title="{controlsCount} control{controlsCount !== 1 ? 's' : ''} applied"
			>
				<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
				</svg>
				{controlsCount}
			</span>
		{/if}
		{#if dataClassification}
			<span
				class="badge-pill classification"
				style={classificationStyle(dataClassification)}
				title="Data classification: {dataClassification}"
			>{dataClassification}</span>
		{/if}
		{#if hasDetails}
			<span class="badge-pill" title={detailsTitle}>
				<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
					<polyline points="15 3 21 3 21 9" />
					<line x1="10" y1="14" x2="21" y2="3" />
				</svg>
			</span>
		{/if}
	</div>
{/if}

<style>
	.node-badges {
		position: absolute;
		bottom: -8px;
		right: -4px;
		z-index: 5;
		display: flex;
		gap: 2px;
	}
	.badge-pill {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: 8px;
		font-weight: 700;
		font-family: var(--node-font, system-ui, sans-serif);
		padding: 1px 5px;
		border-radius: 6px;
		border: 1px solid var(--color-border, #cbd5e1);
		background: var(--color-surface, #fff);
		color: var(--node-label-color);
		white-space: nowrap;
		line-height: 1.4;
	}
	.classification {
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
</style>
