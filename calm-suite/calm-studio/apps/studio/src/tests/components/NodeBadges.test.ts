// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import NodeBadges from '$lib/canvas/nodes/NodeBadges.svelte';

describe('NodeBadges', () => {
	it('renders nothing when there are no controls, classification, or details', () => {
		const { container } = render(NodeBadges, { props: {} });
		expect(container.querySelector('.node-badges')).toBeNull();
	});

	it('shows a controls count badge when controls are present', () => {
		const { getByTitle } = render(NodeBadges, {
			props: { controls: { 'edge-protection': { description: 'x', requirements: [] } } },
		});
		expect(getByTitle('1 control applied')).toBeTruthy();
	});

	it('pluralizes the controls count title for multiple controls', () => {
		const { getByTitle } = render(NodeBadges, {
			props: {
				controls: {
					'edge-protection': { description: 'x', requirements: [] },
					'data-encryption': { description: 'y', requirements: [] },
				},
			},
		});
		expect(getByTitle('2 controls applied')).toBeTruthy();
	});

	it('shows a data-classification badge with the classification text', () => {
		const { getByText } = render(NodeBadges, {
			props: { dataClassification: 'Confidential' },
		});
		expect(getByText('Confidential')).toBeTruthy();
	});

	it('shows a details badge when detailed-architecture is present', () => {
		const { getByTitle } = render(NodeBadges, {
			props: { details: { 'detailed-architecture': 'https://example.com/detailed.json' } },
		});
		expect(getByTitle('Detailed architecture: https://example.com/detailed.json')).toBeTruthy();
	});

	it('shows a details badge when required-pattern is present', () => {
		const { getByTitle } = render(NodeBadges, {
			props: { details: { 'required-pattern': 'https://example.com/pattern.json' } },
		});
		expect(getByTitle('Required pattern: https://example.com/pattern.json')).toBeTruthy();
	});

	it('does not show a details badge when details is an empty object', () => {
		const { container } = render(NodeBadges, { props: { details: {} } });
		expect(container.querySelector('.node-badges')).toBeNull();
	});

	it('renders all three badges together when all fields are present', () => {
		const { getByText, getByTitle } = render(NodeBadges, {
			props: {
				controls: { 'edge-protection': { description: 'x', requirements: [] } },
				dataClassification: 'PII',
				details: { 'detailed-architecture': 'https://example.com/a.json' },
			},
		});
		expect(getByTitle('1 control applied')).toBeTruthy();
		expect(getByText('PII')).toBeTruthy();
		expect(getByTitle('Detailed architecture: https://example.com/a.json')).toBeTruthy();
	});
});
