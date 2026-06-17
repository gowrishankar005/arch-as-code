// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * bundled-document-loader.ts — A browser/Tauri-safe {@link DocumentLoader} for
 * CALM Studio.
 *
 * The CLI engine in `@finos/calm-shared` resolves schema `$ref`s through a
 * pluggable `DocumentLoader`. Its default `FileSystemDocumentLoader` reads from
 * disk, which is unavailable in the Studio renderer. This loader instead serves
 * the CALM 1.2 meta-schemas that are already vendored (bundled) into this
 * package under `./schemas/*.json`, keyed by their `$id`.
 *
 * References that are not bundled (e.g. a CALM Hub URL) fall back to `fetch()`
 * when a network is available; otherwise resolution fails gracefully so the
 * `SchemaDirectory` can emit a "schema not found" warning rather than throwing.
 *
 * No `fs`, `path`, or other Node-only APIs are used here, so the whole
 * validate-against-pattern path runs client-side.
 */

// Deep imports (not the package index) so the renderer bundle pulls only the
// validate subgraph — importing from '@finos/calm-shared' would drag in the
// whole CLI surface (docify/templating → mkdirp + extra fs/path usage).
import type { SchemaDirectory } from '@finos/calm-shared/dist/schema-directory.js';
import {
    type DocumentLoader,
    type CalmDocumentType,
    DocumentLoadError,
} from '@finos/calm-shared/dist/document-loader/document-loader.js';

import calmSchema from './schemas/calm.json' with { type: 'json' };
import coreSchema from './schemas/core.json' with { type: 'json' };
import controlSchema from './schemas/control.json' with { type: 'json' };
import controlRequirementSchema from './schemas/control-requirement.json' with { type: 'json' };
import interfaceSchema from './schemas/interface.json' with { type: 'json' };
import flowSchema from './schemas/flow.json' with { type: 'json' };
import evidenceSchema from './schemas/evidence.json' with { type: 'json' };
import unitsSchema from './schemas/units.json' with { type: 'json' };

/** The CALM 1.2 meta-schemas bundled into this package. */
const BUNDLED_SCHEMAS: object[] = [
    coreSchema,
    controlSchema,
    controlRequirementSchema,
    interfaceSchema,
    flowSchema,
    evidenceSchema,
    unitsSchema,
    calmSchema,
];

const CALM_HUB_PROTOS = ['http:', 'https:', 'calm:'];

export class BundledDocumentLoader implements DocumentLoader {
    /** Map of schema `$id` -> schema object, built from the bundled schemas. */
    private readonly bundled: Map<string, object> = new Map();
    /** Whether to attempt a network `fetch()` for non-bundled references. */
    private readonly allowRemoteFetch: boolean;

    constructor(allowRemoteFetch: boolean = false) {
        this.allowRemoteFetch = allowRemoteFetch;
        for (const schema of BUNDLED_SCHEMAS) {
            const id = (schema as { $id?: string }).$id;
            if (id) {
                this.bundled.set(id, schema);
            }
        }
    }

    /**
     * Register every bundled schema with the directory up-front, keyed by `$id`,
     * mirroring how {@link FileSystemDocumentLoader} loads a directory at startup.
     */
    async initialise(schemaDirectory: SchemaDirectory): Promise<void> {
        for (const [id, schema] of this.bundled) {
            schemaDirectory.storeDocument(id, 'schema', schema);
        }
    }

    /**
     * Resolve a reference that was not pre-loaded. Tries the bundled set first,
     * then an optional network fetch for remote (e.g. CALM Hub) schemas.
     */
    async loadMissingDocument(documentId: string, type: CalmDocumentType): Promise<object> {
        const bundled = this.bundled.get(documentId);
        if (bundled) {
            return bundled;
        }

        if (this.allowRemoteFetch && this.isRemoteReference(documentId)) {
            const fetched = await this.fetchRemote(documentId);
            if (fetched) {
                return fetched;
            }
        }

        // Not recognised by this loader. Reported as OPERATION_NOT_IMPLEMENTED so
        // SchemaDirectory.getSchema warns and returns undefined rather than
        // surfacing a fatal error to the user.
        throw new DocumentLoadError({
            name: 'OPERATION_NOT_IMPLEMENTED',
            message:
                `Document with id [${documentId}] and type [${type}] is not bundled with CALM Studio` +
                (this.allowRemoteFetch ? ' and could not be fetched remotely.' : '. Remote fetch is disabled.'),
        });
    }

    /**
     * This loader has no local filesystem, so it can never resolve a reference
     * to a local file path.
     */
    resolvePath(): string | undefined {
        return undefined;
    }

    private isRemoteReference(reference: string): boolean {
        try {
            const proto = new URL(reference).protocol;
            return CALM_HUB_PROTOS.includes(proto);
        } catch {
            return false;
        }
    }

    private async fetchRemote(documentId: string): Promise<object | undefined> {
        if (typeof fetch !== 'function') {
            return undefined;
        }
        try {
            const response = await fetch(documentId);
            if (!response.ok) {
                return undefined;
            }
            const json = await response.json();
            return typeof json === 'object' && json !== null && !Array.isArray(json)
                ? (json as object)
                : undefined;
        } catch {
            return undefined;
        }
    }
}
