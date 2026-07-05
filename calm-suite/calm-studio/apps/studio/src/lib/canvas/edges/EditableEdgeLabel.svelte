<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  EditableEdgeLabel.svelte — inline double-click-to-edit label for edge
  protocol labels. Mirrors EditableLabel.svelte's pattern for nodes.

  Dispatches `edge:rename-label` on `document` (bubbles, composed) with
  { edgeId, value } — CalmCanvas listens centrally and gates on readonly.
-->
<script lang="ts">
	let {
		edgeId,
		value,
	}: {
		edgeId: string;
		value: string;
	} = $props();

	let editing = $state(false);
	let editValue = $state('');

	function startEdit() {
		editValue = value;
		editing = true;
	}

	function commit() {
		editing = false;
		const trimmed = editValue.trim();
		if (!trimmed || trimmed === value) return;
		document.dispatchEvent(
			new CustomEvent('edge:rename-label', {
				detail: { edgeId, value: trimmed },
				bubbles: true,
				composed: true,
			})
		);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commit();
		} else if (e.key === 'Escape') {
			editValue = value;
			editing = false;
		}
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}
</script>

{#if editing}
	<input
		class="edge-label-edit nodrag nopan"
		bind:value={editValue}
		onblur={commit}
		onkeydown={handleKeydown}
		onpointerdown={(e) => e.stopPropagation()}
		use:focusOnMount
	/>
{:else}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<span
		class="edge-label"
		ondblclick={startEdit}
	>{value}</span>
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
		cursor: text;
	}

	.edge-label:hover {
		border-color: var(--color-text-tertiary, #94a3b8);
	}

	:global(.dark) .edge-label {
		background: #111827;
		border-color: #334155;
		color: #94a3b8;
	}

	:global(.dark) .edge-label:hover {
		border-color: #64748b;
	}

	.edge-label-edit {
		font-family: var(--node-font);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--color-text-secondary);
		background: var(--color-surface);
		border: 1px solid var(--node-selected-ring, #3b82f6);
		border-radius: 6px;
		padding: 2px 8px;
		box-sizing: border-box;
		min-width: 60px;
		outline: none;
	}

	:global(.dark) .edge-label-edit {
		background: #111827;
		color: #e2e8f0;
		border-color: #3b82f6;
	}
</style>
