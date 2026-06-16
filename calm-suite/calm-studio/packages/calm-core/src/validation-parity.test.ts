// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * validation-parity.test.ts — Parity between Studio's browser-safe
 * BundledDocumentLoader and the CLI's canonical FileSystemDocumentLoader.
 *
 * Studio reuses the exact same `validate()` engine the `calm validate` CLI
 * uses; the only thing it swaps is the DocumentLoader. This test drives the
 * SAME architecture + pattern through `validate()` twice — once with the CLI's
 * filesystem loader (reading the real `calm/release/1.2/meta` schemas) and once
 * with Studio's bundled loader — and asserts the validation outcomes match.
 *
 * If the bundled meta-schema set ever drifts from the canonical release, this
 * test fails and surfaces the gap.
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validate, SchemaDirectory, FileSystemDocumentLoader, type ValidationOutput } from '@finos/calm-shared';
import { BundledDocumentLoader } from './bundled-document-loader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// calm-core/src -> repo root is five levels up.
const META_1_2_DIR = path.resolve(__dirname, '../../../../../calm/release/1.2/meta');

const CORE_1_2 = 'https://calm.finos.org/release/1.2/meta/core.json';

const architecture = {
    $schema: CORE_1_2,
    nodes: [
        { 'unique-id': 'web', 'node-type': 'webclient', name: 'Web Client', description: 'A web client' },
        { 'unique-id': 'db', 'node-type': 'database', name: 'Database', description: 'A database' },
    ],
    relationships: [
        {
            'unique-id': 'web-db',
            'relationship-type': { connects: { source: { node: 'web' }, destination: { node: 'db' } } },
            protocol: 'HTTPS',
        },
    ],
};

const pattern = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://calm.finos.org/test/parity-pattern.json',
    type: 'object',
    properties: {
        nodes: {
            type: 'array',
            minItems: 1,
            prefixItems: [
                { $ref: `${CORE_1_2}#/defs/node`, properties: { 'unique-id': { const: 'required-web' } } },
            ],
        },
        relationships: { type: 'array' },
    },
    required: ['nodes'],
};

/** Stable, loader-agnostic signature of an outcome: sorted (severity, path) per channel. */
function signature(outputs: ValidationOutput[]): string[] {
    return outputs.map((o) => `${o.severity}|${o.path}`).sort();
}

describe('BundledDocumentLoader parity with FileSystemDocumentLoader', () => {
    it('produces identical validation outcomes for the same architecture + pattern', async () => {
        const fsDir = new SchemaDirectory(new FileSystemDocumentLoader([META_1_2_DIR], false));
        await fsDir.loadSchemas();
        const fsOutcome = await validate(architecture, pattern, undefined, fsDir, false);

        const bundledDir = new SchemaDirectory(new BundledDocumentLoader());
        await bundledDir.loadSchemas();
        const bundledOutcome = await validate(architecture, pattern, undefined, bundledDir, false);

        expect(bundledOutcome.hasErrors).toBe(fsOutcome.hasErrors);
        expect(bundledOutcome.hasWarnings).toBe(fsOutcome.hasWarnings);
        expect(signature(bundledOutcome.jsonSchemaValidationOutputs)).toEqual(
            signature(fsOutcome.jsonSchemaValidationOutputs)
        );
        expect(signature(bundledOutcome.spectralSchemaValidationOutputs)).toEqual(
            signature(fsOutcome.spectralSchemaValidationOutputs)
        );

        // Sanity: the fixtures actually exercise the json-schema path.
        expect(fsOutcome.jsonSchemaValidationOutputs.some((o) => o.path === '/nodes/0/unique-id')).toBe(true);
    });
});
