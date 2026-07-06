<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  EditableLabel.svelte — shared double-click-to-rename label for node
  components. Double-click swaps the label span for a text input; Enter or
  blur commits (if non-empty and changed), Escape cancels.

  Dispatches `node:rename` on `document` (bubbles, composed) rather than
  mutating the CALM model directly — matches ContainerNode.svelte's
  `node:toggle-collapse` convention. CalmCanvas.svelte listens centrally so
  readonly (C4 drill-down) mode can gate the mutation in one place instead of
  threading a readonly flag into every node component.
-->
<script lang="ts">
	let {
		nodeId,
		value,
		style = '',
	}: {
		/** CALM unique-id of the owning node (same as Svelte Flow node.id for CALM-projected nodes). */
		nodeId: string;
		value: string;
		/** Inline style passed through to both the display span and the edit input, so callers can match their own label sizing (max-width, text-align). */
		style?: string;
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
			new CustomEvent('node:rename', {
				detail: { nodeId, name: trimmed },
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

	function handleLabelKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			startEdit();
		}
	}

	function focusOnMount(node: HTMLInputElement) {
		node.focus();
		node.select();
	}
</script>

{#if editing}
	<input
		class="label-edit nodrag nopan"
		{style}
		bind:value={editValue}
		onblur={commit}
		onkeydown={handleKeydown}
		onpointerdown={(e) => e.stopPropagation()}
		use:focusOnMount
	/>
{:else}
	<span
		class="label"
		{style}
		role="button"
		tabindex="0"
		ondblclick={startEdit}
		onkeydown={handleLabelKeydown}
	>{value}</span>
{/if}

<style>
	.label {
		font-size: 11.5px;
		font-weight: 600;
		color: var(--node-label-color);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: inline-block;
	}
	.label-edit {
		font-size: 11.5px;
		font-weight: 600;
		font-family: inherit;
		color: var(--node-label-color);
		background: var(--color-surface);
		border: 1px solid var(--node-selected-ring);
		border-radius: 3px;
		padding: 0 3px;
		box-sizing: border-box;
	}
</style>
