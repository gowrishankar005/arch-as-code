<!-- SPDX-FileCopyrightText: 2026 CalmStudio Contributors -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

<!--
  AlignToolbar.svelte — Floating toolbar for align and distribute operations.
  Shown when 2+ nodes are selected. Matches draw.io's Format > Align / Distribute.

  6 align operations (2+ nodes): Left, Center-H, Right, Top, Middle-V, Bottom
  2 distribute operations (3+ nodes): Distribute Horizontal, Distribute Vertical
-->
<script lang="ts">
	let {
		selectedCount,
		onalign,
		ondistribute,
	}: {
		selectedCount: number;
		onalign: (direction: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => void;
		ondistribute: (axis: 'horizontal' | 'vertical') => void;
	} = $props();
</script>

{#if selectedCount >= 2}
	<div class="align-toolbar" role="toolbar" aria-label="Align and distribute">
		<!-- Align group -->
		<div class="align-group" role="group" aria-label="Align nodes">
			<button type="button" class="align-btn" onclick={() => onalign('left')} title="Align left" aria-label="Align left">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<line x1="4" y1="2" x2="4" y2="22" />
					<rect x="7" y="4" width="10" height="5" rx="1" />
					<rect x="7" y="14" width="14" height="5" rx="1" />
				</svg>
			</button>
			<button type="button" class="align-btn" onclick={() => onalign('center')} title="Align center (horizontal)" aria-label="Align center horizontally">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<line x1="12" y1="2" x2="12" y2="22" />
					<rect x="7" y="4" width="10" height="5" rx="1" />
					<rect x="5" y="14" width="14" height="5" rx="1" />
				</svg>
			</button>
			<button type="button" class="align-btn" onclick={() => onalign('right')} title="Align right" aria-label="Align right">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<line x1="20" y1="2" x2="20" y2="22" />
					<rect x="7" y="4" width="10" height="5" rx="1" />
					<rect x="3" y="14" width="14" height="5" rx="1" />
				</svg>
			</button>

			<div class="align-sep"></div>

			<button type="button" class="align-btn" onclick={() => onalign('top')} title="Align top" aria-label="Align top">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<line x1="2" y1="4" x2="22" y2="4" />
					<rect x="4" y="7" width="5" height="10" rx="1" />
					<rect x="14" y="7" width="5" height="14" rx="1" />
				</svg>
			</button>
			<button type="button" class="align-btn" onclick={() => onalign('middle')} title="Align middle (vertical)" aria-label="Align middle vertically">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<line x1="2" y1="12" x2="22" y2="12" />
					<rect x="4" y="7" width="5" height="10" rx="1" />
					<rect x="14" y="5" width="5" height="14" rx="1" />
				</svg>
			</button>
			<button type="button" class="align-btn" onclick={() => onalign('bottom')} title="Align bottom" aria-label="Align bottom">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<line x1="2" y1="20" x2="22" y2="20" />
					<rect x="4" y="7" width="5" height="10" rx="1" />
					<rect x="14" y="3" width="5" height="14" rx="1" />
				</svg>
			</button>
		</div>

		<!-- Distribute group (only with 3+ selected) -->
		{#if selectedCount >= 3}
			<div class="align-sep-v"></div>
			<div class="align-group" role="group" aria-label="Distribute nodes">
				<button type="button" class="align-btn" onclick={() => ondistribute('horizontal')} title="Distribute horizontal spacing" aria-label="Distribute horizontal spacing">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<rect x="2" y="7" width="4" height="10" rx="1" />
						<rect x="10" y="7" width="4" height="10" rx="1" />
						<rect x="18" y="7" width="4" height="10" rx="1" />
					</svg>
				</button>
				<button type="button" class="align-btn" onclick={() => ondistribute('vertical')} title="Distribute vertical spacing" aria-label="Distribute vertical spacing">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<rect x="7" y="2" width="10" height="4" rx="1" />
						<rect x="7" y="10" width="10" height="4" rx="1" />
						<rect x="7" y="18" width="10" height="4" rx="1" />
					</svg>
				</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.align-toolbar {
		position: absolute;
		right: 12px;
		top: 52px;
		z-index: 50;
		display: flex;
		align-items: center;
		gap: 4px;
		background: var(--color-surface, #fff);
		border: 1px solid var(--color-border, #e2e8f0);
		border-radius: 9px;
		padding: 3px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
	}

	:global(.dark) .align-toolbar {
		background: #111827;
		border-color: #334155;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
	}

	.align-group {
		display: flex;
		align-items: center;
		gap: 1px;
	}

	.align-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--color-text-secondary, #64748b);
		cursor: pointer;
		transition: all 0.12s ease;
	}

	.align-btn:hover {
		background: var(--color-surface-tertiary, #f1f5f9);
		color: var(--color-text-primary, #0f172a);
	}

	:global(.dark) .align-btn:hover {
		background: #1e293b;
		color: #e2e8f0;
	}

	.align-sep {
		width: 1px;
		height: 16px;
		background: var(--color-border, #e2e8f0);
		margin: 0 2px;
	}

	.align-sep-v {
		width: 1px;
		height: 20px;
		background: var(--color-border, #e2e8f0);
		margin: 0 2px;
	}

	:global(.dark) .align-sep,
	:global(.dark) .align-sep-v {
		background: #334155;
	}
</style>
