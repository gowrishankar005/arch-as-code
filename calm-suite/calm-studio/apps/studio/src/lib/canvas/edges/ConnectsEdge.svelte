<!-- SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  ConnectsEdge.svelte — CALM "connects" relationship edge.
  Visual style: solid line + filled arrowhead.
  Protocol labels render as inline pill on the path.
  Flow overlays render as sibling group (outside the dimmed wrapper).
-->
<script lang="ts">
	import { BaseEdge, EdgeLabel, EdgeReconnectAnchor, getSmoothStepPath, type EdgeProps } from '@xyflow/svelte';
	import FlowOverlay from './FlowOverlay.svelte';
	import type { CalmTransition } from '@calmstudio/calm-core';

	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		label,
		data,
		markerEnd,
		style
	}: EdgeProps = $props();

	// Prefer ELK's computed orthogonal route (with obstacle-aware bend points)
	// when available; fall back to Svelte Flow's naive smooth-step path for
	// edges that haven't been through an ELK layout pass yet (e.g. just
	// manually connected, or touching a pinned node).
	const elkPath = $derived((data as Record<string, unknown>)?.elkPath as string | undefined);
	const [fallbackPath, fallbackLabelX, fallbackLabelY] = $derived(
		getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
	);
	const edgePath = $derived(elkPath ?? fallbackPath);
	const labelX = $derived(
		elkPath ? ((data as Record<string, unknown>)?.elkLabelX as number) : fallbackLabelX
	);
	const labelY = $derived(
		elkPath ? ((data as Record<string, unknown>)?.elkLabelY as number) : fallbackLabelY
	);

	const protocolLabel = $derived((data as Record<string, unknown>)?.protocol ?? label);

	const validationStyle = $derived(
		(data as Record<string, unknown>)?.validationSeverity === 'error'
			? 'stroke: #dc2626; stroke-width: 2.5;'
			: (data as Record<string, unknown>)?.validationSeverity === 'warning'
				? 'stroke: #d97706; stroke-width: 2;'
				: undefined
	);
	// Explicit fallback stroke so the edge stays visible when exported to a
	// standalone SVG/PNG — the app normally relies on the external
	// .svelte-flow__edge-path CSS class for stroke color, but html-to-image
	// does not inline that class's rule onto these <path> elements, and
	// SVG's default stroke is `none`, not black, so unstyled exported edges
	// were rendering fully invisible. The var() fallback keeps live
	// dark-mode theming working while guaranteeing a color when the CSS
	// variable isn't in scope (e.g. a standalone exported file).
	const finalStyle = $derived(
		`stroke: var(--xy-edge-stroke, #94a3b8); color: var(--xy-edge-stroke, #94a3b8); ${style ?? ''} ${validationStyle ?? ''}`
	);

	const flowTransition = $derived((data as Record<string, unknown>)?.flowTransition as CalmTransition | null | undefined);
	const dimmed = $derived((data as Record<string, unknown>)?.dimmed === true);
</script>

<g style={dimmed ? 'opacity: 0.3' : ''}>
	<BaseEdge
		{id}
		path={edgePath}
		markerEnd="url(#marker-arrow-filled)"
		style={finalStyle}
	/>
	<EdgeReconnectAnchor type="source" position={{ x: sourceX, y: sourceY }} />
	<EdgeReconnectAnchor type="target" position={{ x: targetX, y: targetY }} />

	{#if protocolLabel}
		<EdgeLabel x={labelX} y={labelY} class="nodrag nopan">
			<span class="edge-label">
				{protocolLabel}
			</span>
		</EdgeLabel>
	{/if}
</g>

{#if flowTransition}
	<FlowOverlay
		edgePath={edgePath}
		edgeId={id}
		sequenceNumber={flowTransition['sequence-number']}
		summary={flowTransition.summary}
		direction={flowTransition.direction ?? 'source-to-destination'}
		labelX={labelX}
		labelY={labelY}
	/>
{/if}

<style>
	.edge-label {
		display: inline-block;
		padding: 2px 8px;
		font-family: var(--node-font);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 6px;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
	}

	:global(.dark) .edge-label {
		background: #111827;
		border-color: #334155;
		color: #94a3b8;
	}
</style>
