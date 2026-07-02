<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  LayersPanel.svelte — Floating outline/layers panel listing every node in
  the diagram as a containment tree, for navigating large diagrams without
  scrolling/zooming to find a specific node (draw.io calls this the
  "Outline"/shape tree). Distinct from MiniMap, which shows a spatial
  thumbnail rather than a name-searchable hierarchy.
-->
<script lang="ts">
	import type { Node } from '@xyflow/svelte';

	let {
		nodes = [],
		selectedNodeId = null,
		onselect,
		onclose,
	}: {
		nodes?: Node[];
		selectedNodeId?: string | null;
		/** Called with the CALM unique-id of the clicked node. */
		onselect?: (nodeId: string) => void;
		onclose?: () => void;
	} = $props();

	type TreeNode = { node: Node; children: TreeNode[] };

	/** Builds a containment tree from Svelte Flow's parentId links, preserving canvas order. */
	function buildTree(flatNodes: Node[]): TreeNode[] {
		const byId = new Map(flatNodes.map((n) => [n.id, { node: n, children: [] as TreeNode[] }]));
		const roots: TreeNode[] = [];
		for (const n of flatNodes) {
			const entry = byId.get(n.id)!;
			if (n.parentId && byId.has(n.parentId)) {
				byId.get(n.parentId)!.children.push(entry);
			} else {
				roots.push(entry);
			}
		}
		return roots;
	}

	let tree = $derived(buildTree(nodes));

	function labelOf(n: Node): string {
		return (n.data?.label as string) ?? (n.data?.calmId as string) ?? n.id;
	}

	function calmIdOf(n: Node): string {
		return (n.data?.calmId as string) ?? n.id;
	}
</script>

{#snippet row(entry: TreeNode, depth: number)}
	<li>
		<button
			type="button"
			class="layer-row"
			class:selected={selectedNodeId === calmIdOf(entry.node)}
			style="padding-left: {8 + depth * 16}px"
			onclick={() => onselect?.(calmIdOf(entry.node))}
		>
			<span class="layer-type">{entry.node.type ?? 'node'}</span>
			<span class="layer-label">{labelOf(entry.node)}</span>
		</button>
		{#if entry.children.length > 0}
			<ul>
				{#each entry.children as child (child.node.id)}
					{@render row(child, depth + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<div class="layers-panel" role="tree" aria-label="Diagram layers">
	<div class="layers-header">
		<span>LAYERS</span>
		<button type="button" class="close-btn" onclick={() => onclose?.()} aria-label="Close layers panel">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M18 6 6 18M6 6l12 12" />
			</svg>
		</button>
	</div>
	{#if tree.length === 0}
		<div class="layers-empty">No nodes yet</div>
	{:else}
		<ul class="layers-tree">
			{#each tree as entry (entry.node.id)}
				{@render row(entry, 0)}
			{/each}
		</ul>
	{/if}
</div>

<style>
	.layers-panel {
		position: absolute;
		left: 12px;
		top: 12px;
		z-index: 50;
		width: 220px;
		max-height: 320px;
		display: flex;
		flex-direction: column;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 10px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04);
		font-family: var(--node-font);
		overflow: hidden;
	}

	:global(.dark) .layers-panel {
		background: #111827;
		border-color: #334155;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
	}

	.layers-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary);
		border-bottom: 1px solid var(--color-border-subtle);
		flex-shrink: 0;
	}

	:global(.dark) .layers-header {
		border-color: #1e293b;
	}

	.close-btn {
		width: 18px;
		height: 18px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--color-text-tertiary);
		border-radius: 4px;
		padding: 2px;
	}

	.close-btn:hover {
		color: var(--color-text-primary);
		background: var(--color-surface-tertiary);
	}

	.close-btn svg {
		width: 12px;
		height: 12px;
	}

	.layers-tree {
		list-style: none;
		margin: 0;
		padding: 4px 0;
		overflow-y: auto;
	}

	.layers-tree ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.layers-empty {
		padding: 12px 10px;
		font-size: 12px;
		color: var(--color-text-tertiary);
	}

	.layer-row {
		display: flex;
		align-items: baseline;
		gap: 6px;
		width: 100%;
		padding-top: 5px;
		padding-bottom: 5px;
		padding-right: 8px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
	}

	.layer-row:hover {
		background: var(--color-surface-tertiary);
	}

	.layer-row.selected {
		background: rgba(59, 130, 246, 0.1);
	}

	.layer-type {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-tertiary);
		flex-shrink: 0;
	}

	.layer-label {
		font-size: 12px;
		color: var(--color-text-primary);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.dark) .layer-label {
		color: #e2e8f0;
	}
</style>
