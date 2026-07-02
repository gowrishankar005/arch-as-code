<!-- SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { Handle, Position, NodeResizer, type NodeProps } from '@xyflow/svelte';
	import ValidationBadge from './ValidationBadge.svelte';
	import NodeBadges from './NodeBadges.svelte';
	import EditableLabel from './EditableLabel.svelte';
	let { id, data, selected }: NodeProps = $props();
	const errorCount = $derived((data as Record<string, unknown>).validationErrors as number ?? 0);
	const warnCount = $derived((data as Record<string, unknown>).validationWarnings as number ?? 0);
</script>

<NodeResizer minWidth={90} minHeight={50} isVisible={selected} />
<Handle type="target" position={Position.Top} />
<Handle type="source" position={Position.Bottom} />
<Handle type="target" position={Position.Left} />
<Handle type="source" position={Position.Right} />

{#if data.interfaces}
	{#each data.interfaces as iface, i}
		<Handle type="source" position={Position.Right} id={iface['unique-id']} style="top: {20 + i * 20}%" />
	{/each}
{/if}

<div class="node" class:selected>
	<ValidationBadge {errorCount} {warnCount} nodeId={(data as Record<string, unknown>).calmId as string ?? id} />
	<NodeBadges
		controls={(data as Record<string, unknown>).controls as Record<string, unknown> | undefined}
		dataClassification={(data as Record<string, unknown>)['data-classification'] as string | undefined}
		details={(data as Record<string, unknown>).details as { 'detailed-architecture'?: string; 'required-pattern'?: string } | undefined}
	/>
	<div class="icon">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--node-system-stroke)" stroke-width="1.5" aria-hidden="true">
			<rect x="3" y="3" width="18" height="18" rx="2" /><rect x="7" y="7" width="10" height="10" rx="1" stroke-width="1.2" />
		</svg>
	</div>
	<EditableLabel
		nodeId={(data as Record<string, unknown>).calmId as string ?? id}
		value={(data.label ?? data.calmId) as string}
	/>
</div>

<style>
	.node {
		position: relative;
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		height: 100%;
		padding: 8px 10px;
		background: var(--node-system-bg);
		border: 1.5px solid var(--node-system-border);
		border-radius: 3px;
		font-family: var(--node-font);
		cursor: default;
		user-select: none;
	}
	.node.selected {
		border-color: var(--node-selected-ring);
		box-shadow: 0 0 0 1.5px var(--node-selected-ring);
	}
	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
</style>
