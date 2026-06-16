// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * validation-with-pattern.ts — CLI-grade validation for CALM Studio.
 *
 * Delegates to the `@finos/calm-shared` engine (`validate()` + Spectral + AJV
 * pattern composition) — the same engine the `calm validate` CLI uses — to
 * validate a drawn architecture against a chosen pattern / standard / control
 * set. (In CALM these are one mechanism: a standard is a curated pattern, and
 * controls are enforced through the composed JSON schema + Spectral rules.)
 *
 * The shared engine returns `ValidationOutput[]` keyed by JSON-Pointer path;
 * this module maps that back to Studio's `ValidationIssue[]` UI contract so the
 * canvas/panel can highlight the offending node or relationship.
 *
 * Runs entirely client-side via {@link BundledDocumentLoader} — no backend, no
 * filesystem. Use {@link validateCalmArchitecture} as the no-pattern fast path.
 */

// Deep imports (not the package index) so the renderer bundle pulls only the
// validate subgraph. See bundled-document-loader.ts for the rationale.
import { validate } from '@finos/calm-shared/dist/commands/validate/validate.js';
import { SchemaDirectory } from '@finos/calm-shared/dist/schema-directory.js';
import type { ValidationOutcome, ValidationOutput } from '@finos/calm-shared/dist/commands/validate/validation.output.js';
import type { CalmArchitecture } from './types.js';
import type { ValidationIssue } from './validation.js';
import { BundledDocumentLoader } from './bundled-document-loader.js';

/**
 * Validate an architecture against a pattern (or standard/control set) using the
 * shared CALM engine, and return issues in Studio's `ValidationIssue` shape.
 *
 * @param architecture The drawn architecture as a plain CALM object.
 * @param pattern The pattern/standard schema to validate against.
 * @param allowRemoteFetch Allow the loader to `fetch()` non-bundled (e.g. CALM
 *        Hub) `$ref`s. Defaults to `false` so validation is fully offline.
 */
export async function validateAgainstPattern(
    architecture: CalmArchitecture,
    pattern: object,
    allowRemoteFetch: boolean = false,
): Promise<ValidationIssue[]> {
    const directory = new SchemaDirectory(new BundledDocumentLoader(allowRemoteFetch));
    await directory.loadSchemas();

    const outcome = await validate(architecture, pattern, undefined, directory, false);
    return toValidationIssues(outcome, architecture);
}

/**
 * Map a shared {@link ValidationOutcome} to Studio's `ValidationIssue[]`.
 *
 * Merges the json-schema and spectral channels, tags each issue with its
 * `source`, and resolves the JSON-Pointer path to a `nodeId`/`relationshipId`
 * so the canvas can highlight the element. Sorted errors → warnings → info to
 * match {@link validateCalmArchitecture}.
 */
export function toValidationIssues(outcome: ValidationOutcome, architecture: CalmArchitecture): ValidationIssue[] {
    // The engine channel (json-schema vs spectral) is determined by which array
    // the output came from, NOT by ValidationOutput.source (that field carries
    // the document type: 'architecture' | 'pattern' | 'timeline').
    const issues: ValidationIssue[] = [
        ...outcome.jsonSchemaValidationOutputs.map((o) => outputToIssue(o, architecture, 'json-schema')),
        ...outcome.spectralSchemaValidationOutputs.map((o) => outputToIssue(o, architecture, 'spectral')),
    ];

    const severityOrder = { error: 0, warning: 1, info: 2 };
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    return issues;
}

function outputToIssue(
    output: ValidationOutput,
    architecture: CalmArchitecture,
    source: 'json-schema' | 'spectral',
): ValidationIssue {
    const { nodeId, relationshipId } = elementIdFromPath(output.path, architecture);
    const path = output.path;
    const message = output.message ?? '';

    return {
        severity: normaliseSeverity(output.severity),
        message: path && path !== '/' ? `${path}: ${message}` : message,
        ...(nodeId !== undefined ? { nodeId } : {}),
        ...(relationshipId !== undefined ? { relationshipId } : {}),
        path,
        source,
    };
}

/**
 * Derive the `unique-id` of the node or relationship a JSON-Pointer path refers
 * to, by resolving the array index against the architecture. Returns an empty
 * object for document-level paths (e.g. `/`, `/nodes` from a `minItems` error).
 */
export function elementIdFromPath(
    path: string,
    architecture: CalmArchitecture,
): { nodeId?: string; relationshipId?: string } {
    const nodeMatch = path.match(/^\/nodes\/(\d+)/);
    if (nodeMatch) {
        const node = architecture.nodes?.[parseInt(nodeMatch[1]!, 10)];
        const id = node?.['unique-id'];
        return id ? { nodeId: id } : {};
    }

    const relMatch = path.match(/^\/relationships\/(\d+)/);
    if (relMatch) {
        const rel = architecture.relationships?.[parseInt(relMatch[1]!, 10)];
        const id = rel?.['unique-id'];
        return id ? { relationshipId: id } : {};
    }

    return {};
}

/** The shared engine can emit 'hint' / unknown; collapse to the UI's 'info'. */
function normaliseSeverity(severity: string): ValidationIssue['severity'] {
    if (severity === 'error' || severity === 'warning' || severity === 'info') {
        return severity;
    }
    return 'info';
}
