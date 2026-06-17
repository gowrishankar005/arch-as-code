// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom

/**
 * Phase 1 de-risk spike (see CALM_STUDIO_VALIDATION_MIGRATION.md).
 *
 * Goal: prove that the CLI-grade validation engine in `@finos/calm-shared`
 * (`validate()` + Spectral + AJV pattern composition) runs entirely
 * CLIENT-SIDE, with no Node-only API, when driven by our browser/Tauri-safe
 * `BundledDocumentLoader`.
 *
 * This test deliberately runs under the `jsdom` environment (see the docblock
 * directive above) so a regression that reaches for `fs`/`path` or otherwise
 * assumes Node would fail here the same way it would in the Tauri renderer.
 *
 * Fixtures are authored inline against CALM 1.2 so the whole run is OFFLINE:
 * every `$ref` resolves to a meta-schema bundled into this package.
 */

import { describe, it, expect } from 'vitest';
import { validate, SchemaDirectory } from '@finos/calm-shared';
import { BundledDocumentLoader } from './bundled-document-loader.js';

const CORE_1_2 = 'https://calm.finos.org/release/1.2/meta/core.json';

/** A minimal, schema-valid CALM 1.2 architecture. */
const validArchitecture = {
    $schema: CORE_1_2,
    nodes: [
        {
            'unique-id': 'web',
            'node-type': 'webclient',
            name: 'Web Client',
            description: 'The conference signup web client',
        },
    ],
    relationships: [],
};

/**
 * A pattern (curated CALM 1.2 schema) that requires the first node to have a
 * specific `unique-id`. It `$ref`s the bundled core meta-schema, exercising the
 * pattern-composition + schema-resolution path through the document loader.
 */
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
                    properties: {
                        'unique-id': { const: 'required-web' },
                    },
                },
            ],
        },
        // A real CALM pattern declares both top-level properties; the Spectral
        // pattern ruleset errors otherwise.
        relationships: { type: 'array' },
    },
    required: ['nodes'],
};

async function makeDirectory(): Promise<SchemaDirectory> {
    const directory = new SchemaDirectory(new BundledDocumentLoader());
    await directory.loadSchemas();
    return directory;
}

describe('Phase 1 spike: client-side validate() via BundledDocumentLoader', () => {
    it('loads the bundled CALM 1.2 meta-schemas into the directory', async () => {
        const directory = await makeDirectory();
        const loaded = directory.getLoadedSchemas();
        expect(loaded).toContain(CORE_1_2);
        expect(loaded).toContain('https://calm.finos.org/release/1.2/meta/control.json');
        // 8 bundled meta-schemas, all keyed by $id.
        expect(loaded.length).toBe(8);
    });

    it('validates a well-formed architecture against the bundled core schema with no errors', async () => {
        const directory = await makeDirectory();

        const outcome = await validate(validArchitecture, undefined, undefined, directory, false);

        expect(outcome).toBeDefined();
        expect(outcome.hasErrors).toBe(false);
        expect(outcome.jsonSchemaValidationOutputs).toHaveLength(0);
    });

    it('reports a JSON-schema violation when the architecture breaks the pattern', async () => {
        const directory = await makeDirectory();

        const outcome = await validate(validArchitecture, pattern, undefined, directory, false);

        expect(outcome.hasErrors).toBe(true);
        // The architecture's node id is `web`, the pattern requires `required-web`.
        const idViolation = outcome.jsonSchemaValidationOutputs.find(
            (o) => o.path === '/nodes/0/unique-id'
        );
        expect(idViolation).toBeDefined();
    });

    it('produces structured ValidationOutput with both spectral and json-schema channels available', async () => {
        const directory = await makeDirectory();

        const outcome = await validate(validArchitecture, pattern, undefined, directory, false);

        // Both arrays exist (the merged getter is what the UI adapter will map).
        expect(Array.isArray(outcome.jsonSchemaValidationOutputs)).toBe(true);
        expect(Array.isArray(outcome.spectralSchemaValidationOutputs)).toBe(true);
        for (const output of outcome.jsonSchemaValidationOutputs) {
            expect(typeof output.severity).toBe('string');
            expect(typeof output.message).toBe('string');
            expect(typeof output.path).toBe('string');
        }
    });
});
