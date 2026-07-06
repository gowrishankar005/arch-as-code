<!-- SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import ValidationBadge from './ValidationBadge.svelte';
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
	<NodeBadges
		controls={(data as Record<string, unknown>).controls as Record<string, unknown> | undefined}
		dataClassification={(data as Record<string, unknown>)['data-classification'] as string | undefined}
		details={(data as Record<string, unknown>).details as { 'detailed-architecture'?: string; 'required-pattern'?: string } | undefined}
	/>
	<svg width="32" height="40" viewBox="0 0 32 40" fill="none" aria-hidden="true">
		<circle cx="16" cy="9" r="7" fill="var(--node-actor-bg)" stroke="var(--node-actor-stroke)" stroke-width="1.5" />
		<path d="M6 36 Q6 22 16 22 Q26 22 26 36" fill="var(--node-actor-bg)" stroke="var(--node-actor-stroke)" stroke-width="1.5" />
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
		gap: 3px;
		width: 100%;
		height: 100%;
		padding: 6px 8px;
		background: var(--node-actor-bg);
		border: 1.5px solid var(--node-actor-border);
		border-radius: 10px;
		cursor: default;
		user-select: none;
		font-family: var(--node-font);
	}
	.node.selected {
		border-color: var(--node-selected-ring);
		box-shadow: 0 0 0 1.5px var(--node-selected-ring);
	}
	.node.selected svg circle,
	.node.selected svg path {
		stroke: var(--node-selected-ring);
		stroke-width: 2;
	}
</style>
