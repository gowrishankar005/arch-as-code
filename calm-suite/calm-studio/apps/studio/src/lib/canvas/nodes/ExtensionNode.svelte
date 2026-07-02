<!-- SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import ValidationBadge from './ValidationBadge.svelte';
	import NodeBadges from './NodeBadges.svelte';
	import EditableLabel from './EditableLabel.svelte';
	import { resolvePackNode } from '@calmstudio/extensions';

	let { id, data, selected }: NodeProps = $props();

	const errorCount = $derived((data as Record<string, unknown>).validationErrors as number ?? 0);
	const warnCount = $derived((data as Record<string, unknown>).validationWarnings as number ?? 0);
	const calmType = $derived((data as Record<string, unknown>).calmType as string ?? '');
	const meta = $derived(resolvePackNode(calmType));

	const strokeColor = $derived(meta?.color.stroke ?? 'currentColor');
	const label = $derived((data as Record<string, unknown>).label as string ?? (data as Record<string, unknown>).calmId as string ?? calmType);

	/** Scale 16x16 SVG icons up to 40x40 for canvas rendering */
	const scaledIcon = $derived(meta?.icon ? meta.icon.replace(/width="16" height="16"/, 'width="40" height="40"') : '');
</script>

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
	{#if scaledIcon}
		<span class="icon" style="color: {strokeColor};">
			{@html scaledIcon}
		</span>
	{:else}
		<svg class="icon-fallback" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 2" aria-hidden="true">
			<rect x="3" y="3" width="18" height="18" rx="3"/>
		</svg>
	{/if}
	<EditableLabel
		nodeId={(data as Record<string, unknown>).calmId as string ?? id}
		value={label}
		style="text-align: center; max-width: 80px;"
	/>
</div>

<style>
	.node {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		padding: 4px 6px;
		cursor: default;
		user-select: none;
		font-family: var(--node-font);
	}

	.node.selected :global(svg) {
		filter: drop-shadow(0 0 2px var(--node-selected-ring));
	}

	.icon {
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.icon-fallback {
		color: var(--node-generic-stroke, currentColor);
	}
</style>
