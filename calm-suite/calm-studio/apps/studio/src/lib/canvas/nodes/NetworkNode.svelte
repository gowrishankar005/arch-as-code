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
	<svg width="64" height="38" viewBox="0 0 64 38" fill="none" aria-hidden="true">
		<path
			d="M16 34 Q4 34 4 26 Q4 18 12 16 Q12 6 22 6 Q28 6 32 11 Q35 8 40 8 Q50 8 50 18 Q56 18 56 26 Q56 34 46 34 Z"
			fill="var(--node-network-bg)"
			stroke="var(--node-network-stroke)"
			stroke-width="1.5"
			stroke-linejoin="round"
		/>
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
		padding: 2px 4px;
		cursor: default;
		user-select: none;
		font-family: var(--node-font);
	}
	.node.selected svg path {
		stroke: var(--node-selected-ring);
		stroke-width: 2;
	}
</style>
