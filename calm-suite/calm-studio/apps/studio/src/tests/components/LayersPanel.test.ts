// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import type { Node } from '@xyflow/svelte';
import LayersPanel from '$lib/canvas/LayersPanel.svelte';

function node(id: string, label: string, type: string, parentId?: string): Node {
	return {
		id,
		type,
		position: { x: 0, y: 0 },
		parentId,
		data: { label, calmId: id },
	};
}

describe('LayersPanel', () => {
	it('shows an empty state when there are no nodes', () => {
		const { getByText } = render(LayersPanel, { props: { nodes: [] } });
		expect(getByText('No nodes yet')).toBeTruthy();
	});

	it('lists top-level nodes as rows', () => {
		const nodes = [node('a', 'Alpha', 'service'), node('b', 'Beta', 'database')];
		const { getByText } = render(LayersPanel, { props: { nodes } });
		expect(getByText('Alpha')).toBeTruthy();
		expect(getByText('Beta')).toBeTruthy();
	});

	it('nests child nodes under their container via parentId', () => {
		const nodes = [
			node('vpc', 'VPC', 'container'),
			node('svc', 'Inner Service', 'service', 'vpc'),
		];
		const { container } = render(LayersPanel, { props: { nodes } });
		const rows = Array.from(container.querySelectorAll('.layer-row'));
		const child = rows.find((r) => r.textContent?.includes('Inner Service'));
		// Deeper nodes get more left padding than their parent.
		const parent = rows.find((r) => r.textContent?.includes('VPC'));
		const childPadding = parseInt((child as HTMLElement).style.paddingLeft, 10);
		const parentPadding = parseInt((parent as HTMLElement).style.paddingLeft, 10);
		expect(childPadding).toBeGreaterThan(parentPadding);
	});

	it('calls onselect with the node\'s calmId when a row is clicked', async () => {
		const nodes = [node('a', 'Alpha', 'service')];
		let selected: string | null = null;
		const { getByText } = render(LayersPanel, {
			props: { nodes, onselect: (id: string) => (selected = id) },
		});
		await fireEvent.click(getByText('Alpha'));
		expect(selected).toBe('a');
	});

	it('calls onclose when the close button is clicked', async () => {
		let closed = false;
		const { getByLabelText } = render(LayersPanel, {
			props: { nodes: [], onclose: () => (closed = true) },
		});
		await fireEvent.click(getByLabelText('Close layers panel'));
		expect(closed).toBe(true);
	});

	it('marks the row matching selectedNodeId as selected', () => {
		const nodes = [node('a', 'Alpha', 'service')];
		const { container } = render(LayersPanel, { props: { nodes, selectedNodeId: 'a' } });
		const row = container.querySelector('.layer-row');
		expect(row?.classList.contains('selected')).toBe(true);
	});
});
