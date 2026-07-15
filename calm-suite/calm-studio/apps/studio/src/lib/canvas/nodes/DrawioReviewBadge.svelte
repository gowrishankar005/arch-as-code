<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  DrawioReviewBadge.svelte — Draw.io import review indicator overlay.

  Renders as an absolute-positioned circle in the top-left corner of the node
  (ValidationBadge already occupies top-right, NodeBadges occupies bottom-right).
  Shown only for nodes flagged by the draw.io Import Review panel as below-high
  confidence. Clicking sets the scroll-target so the Import Review panel scrolls
  to and highlights the matching entry — mirrors ValidationBadge's coordination
  with ValidationPanel via scrollToElementId.

  The parent .node div must have position: relative for the badge to anchor.
-->
<script lang="ts">
	import { setDrawioScrollToId } from '$lib/drawio/drawioReviewScroll.svelte';

	interface Props {
		needsReview: boolean;
		nodeId: string;
	}

	let { needsReview, nodeId }: Props = $props();

	function handleClick(e: MouseEvent) {
		e.stopPropagation();
		setDrawioScrollToId(nodeId);
	}
</script>

{#if needsReview}
	<button
		class="badge"
		title="Imported from draw.io — needs type review"
		aria-label="Needs review — imported from draw.io with low confidence"
		onclick={handleClick}
	>
		?
	</button>
{/if}

<style>
	.badge {
		position: absolute;
		top: -8px;
		left: -8px;
		z-index: 10;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: none;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--node-font, system-ui, sans-serif);
		font-size: 11px;
		font-weight: bold;
		color: white;
		background-color: #6366f1;
		cursor: pointer;
		padding: 0;
		line-height: 1;
		transition: transform 0.1s ease;
	}

	.badge:hover {
		transform: scale(1.15);
	}
</style>
