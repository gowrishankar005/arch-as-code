<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  AlignmentGuides.svelte — Renders dashed snap-line hints computed by
  alignmentGuides.ts. Mounted inside a Svelte Flow <ViewportPortal target="front">
  so lines are drawn in flow-coordinate space and pan/zoom with the canvas.

  Lines span a fixed large range around the guide position rather than the
  true canvas extent — Svelte Flow doesn't expose viewport-space bounds
  cheaply, and a generously long line reads the same visually as one that
  stops exactly at the canvas edge.
-->
<script lang="ts">
	import type { AlignmentGuide } from './alignmentGuides';

	let { guides }: { guides: AlignmentGuide[] } = $props();

	/** Half-length of each guide line in flow units, centered near the origin. */
	const SPAN = 4000;
</script>

{#if guides.length > 0}
	<svg class="alignment-guides" width="1" height="1" aria-hidden="true">
		{#each guides as guide, i (i)}
			{#if guide.axis === 'x'}
				<line x1={guide.pos} y1={-SPAN} x2={guide.pos} y2={SPAN} class="guide-line" />
			{:else}
				<line x1={-SPAN} y1={guide.pos} x2={SPAN} y2={guide.pos} class="guide-line" />
			{/if}
		{/each}
	</svg>
{/if}

<style>
	.alignment-guides {
		/* width/height=1 keeps the SVG's own (0,0) at flow-space (0,0); line
		   coordinates are then plain flow coordinates. overflow:visible lets
		   the lines draw far outside this 1x1 box in every direction. */
		position: absolute;
		top: 0;
		left: 0;
		overflow: visible;
		pointer-events: none;
	}
	.guide-line {
		stroke: var(--node-selected-ring, #6366f1);
		stroke-width: 1;
		stroke-dasharray: 4 3;
		opacity: 0.8;
	}
</style>
