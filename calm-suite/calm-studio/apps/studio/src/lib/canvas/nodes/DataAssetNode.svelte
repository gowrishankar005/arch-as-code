<!-- SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import ValidationBadge from './ValidationBadge.svelte';
	import DrawioReviewBadge from './DrawioReviewBadge.svelte';
	import NodeBadges from './NodeBadges.svelte';
	import EditableLabel from './EditableLabel.svelte';
	let { id, data, selected }: NodeProps = $props();
	const errorCount = $derived((data as Record<string, unknown>).validationErrors as number ?? 0);
	const warnCount = $derived((data as Record<string, unknown>).validationWarnings as number ?? 0);
</script>

<Handle type="target" position={Position.Top} id="top-target" />
<Handle type="source" position={Position.Top} id="top-source" />
<Handle type="target" position={Position.Bottom} id="bottom-target" />
<Handle type="source" position={Position.Bottom} id="bottom-source" />
<Handle type="target" position={Position.Left} id="left-target" />
<Handle type="source" position={Position.Left} id="left-source" />
<Handle type="target" position={Position.Right} id="right-target" />
<Handle type="source" position={Position.Right} id="right-source" />

{#if data.interfaces}
	{#each data.interfaces as iface, i}
		<Handle type="source" position={Position.Right} id={iface['unique-id']} style="top: {20 + i * 20}%" />
	{/each}
{/if}

<div class="node" class:selected title={(data as Record<string, unknown>).description as string ?? ""}>
	<ValidationBadge {errorCount} {warnCount} nodeId={(data as Record<string, unknown>).calmId as string ?? id} />
		<DrawioReviewBadge needsReview={(data as Record<string, unknown>).drawioNeedsReview as boolean ?? false} nodeId={(data as Record<string, unknown>).calmId as string ?? id} />
	<NodeBadges
		controls={(data as Record<string, unknown>).controls as Record<string, unknown> | undefined}
		dataClassification={(data as Record<string, unknown>)['data-classification'] as string | undefined}
		details={(data as Record<string, unknown>).details as { 'detailed-architecture'?: string; 'required-pattern'?: string } | undefined}
	/>
	<svg width="40" height="48" viewBox="0 0 40 48" fill="none" aria-hidden="true">
		<path d="M4 4 L28 4 L36 12 L36 44 L4 44 Z" fill="var(--node-data-asset-bg)" stroke="var(--node-data-asset-stroke)" stroke-width="1.5" stroke-linejoin="round" />
		<path d="M28 4 L28 12 L36 12" fill="var(--node-data-asset-bg)" stroke="var(--node-data-asset-stroke)" stroke-width="1.5" />
		<path d="M10 20h20M10 26h20M10 32h14" stroke="var(--node-data-asset-stroke)" stroke-width="1" opacity="0.4" stroke-linecap="round" />
	</svg>
	<EditableLabel
		nodeId={(data as Record<string, unknown>).calmId as string ?? id}
		value={(data.label ?? data.calmId) as string}
		style="text-align: center; max-width: 108px;"
	/>
</div>

<style>
	.node {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		width: 100%;
		height: 100%;
		padding: 6px 8px;
		background: var(--node-data-asset-bg);
		border: 1.5px solid var(--node-data-asset-border);
		border-radius: 10px;
		cursor: default;
		user-select: none;
		font-family: var(--node-font);
	}
	.node.selected {
		border-color: var(--node-selected-ring);
		box-shadow: 0 0 0 1.5px var(--node-selected-ring);
	}
	.node.selected svg path {
		stroke: var(--node-selected-ring);
	}
</style>
