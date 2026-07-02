<!-- SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  ComposedOfEdge.svelte — CALM "composed-of" relationship edge.
  Visual style: dashed line (6 4) + filled diamond marker.
  Represents a composition relationship (node composed of sub-components).
  Flow overlays render as sibling group (outside the dimmed wrapper).
-->
<script lang="ts">
	import { BaseEdge, EdgeReconnectAnchor, getSmoothStepPath, type EdgeProps } from '@xyflow/svelte';
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
		data,
		style
	}: EdgeProps = $props();

	// Prefer ELK's computed orthogonal route when available; fall back to
	// Svelte Flow's smooth-step path otherwise (see ConnectsEdge.svelte).
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

	const validationStyle = $derived(
		(data as Record<string, unknown>)?.validationSeverity === 'error'
			? 'stroke: #dc2626; stroke-width: 2.5;'
			: (data as Record<string, unknown>)?.validationSeverity === 'warning'
				? 'stroke: #d97706; stroke-width: 2;'
				: undefined
	);
	// Explicit fallback stroke so the edge stays visible when exported to a
	// standalone SVG/PNG — see ConnectsEdge.svelte for why this is needed.
	const finalStyle = $derived(
		`stroke: var(--xy-edge-stroke, #94a3b8); color: var(--xy-edge-stroke, #94a3b8); stroke-dasharray: 6 4; ${style ?? ''} ${validationStyle ?? ''}`
	);

	const flowTransition = $derived((data as Record<string, unknown>)?.flowTransition as CalmTransition | null | undefined);
	const dimmed = $derived((data as Record<string, unknown>)?.dimmed === true);
</script>

<g style={dimmed ? 'opacity: 0.3' : ''}>
	<BaseEdge
		{id}
		path={edgePath}
		markerEnd="url(#marker-diamond-filled)"
		style={finalStyle}
	/>
	<EdgeReconnectAnchor type="source" position={{ x: sourceX, y: sourceY }} />
	<EdgeReconnectAnchor type="target" position={{ x: targetX, y: targetY }} />
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
