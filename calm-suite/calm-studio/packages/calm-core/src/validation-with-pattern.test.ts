// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom

/**
 * Tests for the pattern-validation engine and its ValidationOutput ->
 * ValidationIssue adapter. Runs under jsdom to mirror the Tauri renderer.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ValidationOutcome, ValidationOutput } from '@finos/calm-shared';
import type { CalmArchitecture } from './types.js';
import {
    validateAgainstPattern,
    toValidationIssues,
    elementIdFromPath,
} from './validation-with-pattern.js';

const CORE_1_2 = 'https://calm.finos.org/release/1.2/meta/core.json';

const architecture: CalmArchitecture = {
    $schema: CORE_1_2,
    nodes: [
        {
            'unique-id': 'web',
            'node-type': 'webclient',
            name: 'Web Client',
            description: 'The conference signup web client',
        },
    ],
    relationships: [
        {
            'unique-id': 'web-to-api',
            'relationship-type': {
                connects: { source: { node: 'web' }, destination: { node: 'web' } },
            },
        },
    ],
} as unknown as CalmArchitecture;

/** Pattern requiring the first node's unique-id to be `required-web`. */
const pattern = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://calm.finos.org/spike/test-pattern.json',
    type: 'object',
    properties: {
        nodes: {
            type: 'array',
            minItems: 1,
            prefixItems: [
                {
                    $ref: `${CORE_1_2}#/defs/node`,
                    properties: { 'unique-id': { const: 'required-web' } },
                },
            ],
        },
        // A real CALM pattern declares both top-level properties; the Spectral
        // pattern ruleset errors otherwise.
        relationships: { type: 'array' },
    },
    required: ['nodes'],
};

describe('elementIdFromPath', () => {
    it('resolves a node index to its unique-id', () => {
        expect(elementIdFromPath('/nodes/0/unique-id', architecture)).toEqual({ nodeId: 'web' });
    });

    it('resolves a relationship index to its unique-id', () => {
        expect(elementIdFromPath('/relationships/0/relationship-type', architecture)).toEqual({
            relationshipId: 'web-to-api',
        });
    });

    it('returns empty for document-level and unindexed paths', () => {
        expect(elementIdFromPath('/', architecture)).toEqual({});
        expect(elementIdFromPath('/nodes', architecture)).toEqual({});
    });

    it('returns empty when the index is out of range', () => {
        expect(elementIdFromPath('/nodes/5/unique-id', architecture)).toEqual({});
    });
});

describe('toValidationIssues', () => {
    it('maps both channels, tags source, and sorts errors before warnings', () => {
        const outcome = new ValidationOutcome(
            [new ValidationOutput('json-schema', 'error', 'must be equal to constant', '/nodes/0/unique-id', undefined, undefined, undefined, undefined, undefined, 'architecture')],
            [new ValidationOutput('some-rule', 'warning', 'node should have a description', '/nodes/0/description', '', 1, 1, 0, 0, 'architecture')],
            true,
            true,
        );

        const issues = toValidationIssues(outcome, architecture);

        expect(issues).toHaveLength(2);
        // Error sorts first.
        expect(issues[0]!.severity).toBe('error');
        expect(issues[0]!.source).toBe('json-schema');
        expect(issues[0]!.nodeId).toBe('web');
        expect(issues[0]!.message).toBe('/nodes/0/unique-id: must be equal to constant');
        expect(issues[0]!.path).toBe('/nodes/0/unique-id');

        expect(issues[1]!.severity).toBe('warning');
        expect(issues[1]!.source).toBe('spectral');
        expect(issues[1]!.nodeId).toBe('web');
    });

    it('does not prefix the message for document-level paths', () => {
        const outcome = new ValidationOutcome(
            [new ValidationOutput('json-schema', 'error', 'pattern failed to compile', '/', undefined, undefined, undefined, undefined, undefined, 'pattern')],
            [],
            true,
            false,
        );

        const issues = toValidationIssues(outcome, architecture);
        expect(issues[0]!.message).toBe('pattern failed to compile');
        expect(issues[0]!.nodeId).toBeUndefined();
    });

    it("collapses unknown/hint severities to 'info'", () => {
        const outcome = new ValidationOutcome(
            [],
            [new ValidationOutput('hint-rule', 'hint', 'a hint', '/nodes/0/name', '', 0, 0, 0, 0, 'architecture')],
            false,
            false,
        );

        const issues = toValidationIssues(outcome, architecture);
        expect(issues[0]!.severity).toBe('info');
    });
});

describe('validateAgainstPattern (end-to-end, offline)', () => {
    it('returns a node-scoped json-schema issue when the architecture breaks the pattern', async () => {
        const issues = await validateAgainstPattern(architecture, pattern);

        const idViolation = issues.find((i) => i.path === '/nodes/0/unique-id');
        expect(idViolation).toBeDefined();
        expect(idViolation!.severity).toBe('error');
        expect(idViolation!.source).toBe('json-schema');
        expect(idViolation!.nodeId).toBe('web');
    });

    it('returns no error-severity issues when the architecture satisfies the pattern', async () => {
        const conformingArch = {
            $schema: CORE_1_2,
            nodes: [{ ...architecture.nodes![0], 'unique-id': 'required-web' }],
            relationships: [],
        } as unknown as CalmArchitecture;

        const issues = await validateAgainstPattern(conformingArch, pattern);
        expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    });
});

describe('validateAgainstPattern offline guarantee', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('resolves all bundled $refs without any network access (fetch is never called)', async () => {
        // If the bundled loader ever tried to hit the network for a meta-schema,
        // this spy would record it. With allowRemoteFetch defaulting to false and
        // every $ref resolving to a bundled schema, fetch must stay untouched.
        const fetchSpy = vi.spyOn(globalThis, 'fetch');

        const issues = await validateAgainstPattern(architecture, pattern);

        expect(fetchSpy).not.toHaveBeenCalled();
        // And it still did real work: the node-id violation is reported.
        expect(issues.some((i) => i.path === '/nodes/0/unique-id' && i.severity === 'error')).toBe(true);
    });
});
