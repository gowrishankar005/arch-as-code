<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  ShortcutHelp.svelte — Keyboard shortcut reference modal.
  Triggered by pressing "?" key (industry standard: Figma, GitHub, Notion).
  Lists all keyboard shortcuts organized by category.
  Dismissible via Escape, clicking outside, or the close button.
-->
<script lang="ts">
	let {
		onclose,
	}: {
		onclose: () => void;
	} = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onclose();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			onclose();
		}
	}

	const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
	const mod = isMac ? '⌘' : 'Ctrl';
	const shift = isMac ? '⇧' : 'Shift';

	const sections = [
		{
			title: 'Edit',
			shortcuts: [
				{ keys: [`${mod}Z`], action: 'Undo' },
				{ keys: [`${mod}${shift}Z`], action: 'Redo' },
				{ keys: [`${mod}C`], action: 'Copy selected nodes' },
				{ keys: [`${mod}V`], action: 'Paste' },
				{ keys: [`${mod}A`], action: 'Select all' },
				{ keys: ['Delete', 'Backspace'], action: 'Delete selected' },
				{ keys: ['Double-click'], action: 'Rename node / edge label' },
			],
		},
		{
			title: 'Canvas',
			shortcuts: [
				{ keys: ['↑ ↓ ← →'], action: 'Nudge selected 1px' },
				{ keys: [`${shift} + ↑ ↓ ← →`], action: 'Nudge selected 10px' },
				{ keys: ['Scroll wheel'], action: 'Zoom in/out' },
				{ keys: ['Click + drag'], action: 'Pan canvas' },
				{ keys: ['Shift + click'], action: 'Add to selection' },
				{ keys: [`${mod} + click`], action: 'Toggle selection' },
				{ keys: ['Click + drag (empty)'], action: 'Marquee select' },
				{ keys: ['Right-click node'], action: 'Duplicate / Delete menu' },
				{ keys: ['Right-click edge'], action: 'Change type / Delete' },
			],
		},
		{
			title: 'Navigation',
			shortcuts: [
				{ keys: [`${mod}F`], action: 'Search nodes' },
				{ keys: ['?'], action: 'Show this help' },
			],
		},
		{
			title: 'File',
			shortcuts: [
				{ keys: [`${mod}O`], action: 'Open file' },
				{ keys: [`${mod}S`], action: 'Save' },
				{ keys: [`${mod}${shift}S`], action: 'Save as' },
				{ keys: [`${isMac ? '⌥' : 'Alt'}N`], action: 'New diagram' },
			],
		},
		{
			title: 'C4 Views',
			shortcuts: [
				{ keys: ['1'], action: 'All (exit C4 mode)' },
				{ keys: ['2'], action: 'Context level' },
				{ keys: ['3'], action: 'Container level' },
				{ keys: ['4'], action: 'Component level' },
			],
		},
	];
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={handleBackdropClick}>
	<div class="modal" role="dialog" aria-label="Keyboard shortcuts">
		<div class="modal-header">
			<h2 class="modal-title">Keyboard Shortcuts</h2>
			<button
				type="button"
				class="close-btn"
				onclick={onclose}
				aria-label="Close"
			>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
		<div class="modal-body">
			{#each sections as section}
				<div class="section">
					<h3 class="section-title">{section.title}</h3>
					{#each section.shortcuts as shortcut}
						<div class="shortcut-row">
							<span class="shortcut-action">{shortcut.action}</span>
							<span class="shortcut-keys">
								{#each shortcut.keys as key, i}
									{#if i > 0}<span class="key-sep">/</span>{/if}
									<kbd class="key">{key}</kbd>
								{/each}
							</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.modal {
		background: var(--color-surface, #fff);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 12px;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
		width: 480px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	:global(.dark) .modal {
		background: #111827;
		border-color: #334155;
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px 12px;
		border-bottom: 1px solid var(--color-border, #e2e8f0);
	}

	:global(.dark) .modal-header {
		border-color: #1e293b;
	}

	.modal-title {
		font-size: 15px;
		font-weight: 700;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-primary, #0f172a);
		margin: 0;
	}

	:global(.dark) .modal-title {
		color: #e2e8f0;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--color-text-tertiary, #94a3b8);
		cursor: pointer;
	}

	.close-btn:hover {
		background: var(--color-surface-tertiary, #f1f5f9);
		color: var(--color-text-primary, #0f172a);
	}

	:global(.dark) .close-btn:hover {
		background: #1e293b;
		color: #e2e8f0;
	}

	.modal-body {
		padding: 12px 20px 20px;
		overflow-y: auto;
	}

	.section {
		margin-bottom: 16px;
	}

	.section:last-child {
		margin-bottom: 0;
	}

	.section-title {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-text-tertiary, #94a3b8);
		margin: 0 0 6px;
		font-family: var(--font-sans, system-ui, sans-serif);
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 4px 0;
	}

	.shortcut-action {
		font-size: 12.5px;
		color: var(--color-text-primary, #0f172a);
		font-family: var(--font-sans, system-ui, sans-serif);
	}

	:global(.dark) .shortcut-action {
		color: #cbd5e1;
	}

	.shortcut-keys {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.key {
		display: inline-block;
		padding: 2px 7px;
		font-size: 11px;
		font-weight: 600;
		font-family: var(--font-sans, system-ui, sans-serif);
		color: var(--color-text-secondary, #475569);
		background: var(--color-surface-tertiary, #f1f5f9);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 5px;
		white-space: nowrap;
	}

	:global(.dark) .key {
		background: #1e293b;
		border-color: #334155;
		color: #94a3b8;
	}

	.key-sep {
		font-size: 11px;
		color: var(--color-text-tertiary, #94a3b8);
	}
</style>
