// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';
import EditableLabel from '$lib/canvas/nodes/EditableLabel.svelte';

afterEach(() => {
	cleanup();
});

function listenForRename(): { calls: Array<{ nodeId: string; name: string }> } {
	const calls: Array<{ nodeId: string; name: string }> = [];
	const handler = (e: Event) => {
		calls.push((e as CustomEvent<{ nodeId: string; name: string }>).detail);
	};
	document.addEventListener('node:rename', handler);
	return { calls };
}

describe('EditableLabel', () => {
	it('renders the value as a span by default', () => {
		const { getByText, queryByRole } = render(EditableLabel, {
			props: { nodeId: 'n1', value: 'My Node' },
		});
		expect(getByText('My Node')).toBeTruthy();
		expect(queryByRole('textbox')).toBeNull();
	});

	it('double-click swaps the span for an input pre-filled with the current value', async () => {
		const { getByText, getByRole } = render(EditableLabel, {
			props: { nodeId: 'n1', value: 'My Node' },
		});
		await fireEvent.dblClick(getByText('My Node'));
		const input = getByRole('textbox') as HTMLInputElement;
		expect(input.value).toBe('My Node');
	});

	it('dispatches node:rename on document with the trimmed new value when Enter is pressed', async () => {
		const { getByText, getByRole } = render(EditableLabel, {
			props: { nodeId: 'svc-1', value: 'Old Name' },
		});
		const { calls } = listenForRename();

		await fireEvent.dblClick(getByText('Old Name'));
		const input = getByRole('textbox') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: '  New Name  ' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual({ nodeId: 'svc-1', name: 'New Name' });
	});

	it('dispatches node:rename on blur (commit without pressing Enter)', async () => {
		const { getByText, getByRole } = render(EditableLabel, {
			props: { nodeId: 'svc-1', value: 'Old Name' },
		});
		const { calls } = listenForRename();

		await fireEvent.dblClick(getByText('Old Name'));
		const input = getByRole('textbox') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Blurred Name' } });
		await fireEvent.blur(input);

		expect(calls).toHaveLength(1);
		expect(calls[0].name).toBe('Blurred Name');
	});

	it('does not dispatch node:rename when the value is unchanged', async () => {
		const { getByText, getByRole } = render(EditableLabel, {
			props: { nodeId: 'svc-1', value: 'Same Name' },
		});
		const { calls } = listenForRename();

		await fireEvent.dblClick(getByText('Same Name'));
		const input = getByRole('textbox') as HTMLInputElement;
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(calls).toHaveLength(0);
	});

	it('does not dispatch node:rename when the trimmed value is empty', async () => {
		const { getByText, getByRole } = render(EditableLabel, {
			props: { nodeId: 'svc-1', value: 'Has Value' },
		});
		const { calls } = listenForRename();

		await fireEvent.dblClick(getByText('Has Value'));
		const input = getByRole('textbox') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: '   ' } });
		await fireEvent.keyDown(input, { key: 'Enter' });

		expect(calls).toHaveLength(0);
	});

	it('Escape cancels the edit without dispatching node:rename', async () => {
		const { getByText, getByRole, queryByRole } = render(EditableLabel, {
			props: { nodeId: 'svc-1', value: 'Original' },
		});
		const { calls } = listenForRename();

		await fireEvent.dblClick(getByText('Original'));
		const input = getByRole('textbox') as HTMLInputElement;
		await fireEvent.input(input, { target: { value: 'Changed' } });
		await fireEvent.keyDown(input, { key: 'Escape' });

		expect(calls).toHaveLength(0);
		expect(queryByRole('textbox')).toBeNull();
		expect(getByText('Original')).toBeTruthy();
	});
});
