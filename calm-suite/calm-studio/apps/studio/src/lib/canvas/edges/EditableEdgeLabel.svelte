<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<script lang="ts">
	let {
		edgeId,
		value,
	}: {
		edgeId: string;
		value: string;
	} = $props();

	const CALM_PROTOCOLS = [
		'HTTP', 'HTTPS', 'FTP', 'SFTP', 'JDBC',
		'WebSocket', 'SocketIO', 'LDAP', 'AMQP',
		'TLS', 'mTLS', 'TCP'
	] as const;

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
		if (e.key === 'Escape') {
			editValue = value;
			editing = false;
		}
	}

	function handleChange() {
		commit();
	}

	function focusOnMount(node: HTMLSelectElement) {
		node.focus();
	}
</script>

{#if editing}
	<select
		class="edge-label-edit nodrag nopan"
		bind:value={editValue}
		onchange={handleChange}
		onblur={commit}
		onkeydown={handleKeydown}
		onpointerdown={(e) => e.stopPropagation()}
		use:focusOnMount
	>
		{#each CALM_PROTOCOLS as protocol}
			<option value={protocol}>{protocol}</option>
		{/each}
	</select>
{:else}
	<span
		class="edge-label"
		role="button"
		tabindex="0"
		ondblclick={startEdit}
		onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); startEdit(); } }}
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
		cursor: pointer;
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
		padding: 2px 4px;
		box-sizing: border-box;
		min-width: 70px;
		outline: none;
		cursor: pointer;
	}

	:global(.dark) .edge-label-edit {
		background: #111827;
		color: #e2e8f0;
		border-color: #3b82f6;
	}
</style>
