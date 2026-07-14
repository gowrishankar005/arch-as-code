// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * @calmstudio/drawio-import
 *
 * Pure TypeScript package — no Svelte, no browser-only globals except DOMParser
 * (injectable for Node.js environments).
 *
 * Entry point:
 *   importDrawio(content, options?) → Promise<ImportResult>
 *
 * Consumed by CALM Studio, calm-cli, calm-hub independently.
 */

export { importDrawio } from './importer.js';
export { parseDrawio } from './parser.js';
export { inferNodeType, noOpLlmProvider } from './inference.js';
export { buildPageResult } from './builder.js';
export { matchStencilCatalogs, BUILT_IN_CATALOGS } from './catalogs/index.js';

export type {
	// mxGraph model types
	MxCell,
	MxGeometry,
	MxPage,

	// Inference types
	InferenceConfidence,
	TypeInferenceResult,
	LlmInferenceProvider,
	LlmNodeContext,

	// Import result types
	ConfidenceReportEntry,
	PageImportResult,
	ImportResult,

	// Options
	ImportOptions,

	// Catalog types
	CatalogEntry,
	GlossaryEntry,
} from './types.js';
