// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { MxCell, TypeInferenceResult, ImportResult, ImportOptions } from './types.js';
import { parseDrawio } from './parser.js';
import { inferNodeType } from './inference.js';
import { buildPageResult } from './builder.js';

/**
 * Convert the text content of a .drawio file to CALM 1.2 architectures.
 *
 * Multi-page files produce one `PageImportResult` per page. Each result
 * includes the CALM `CalmArchitectureSchema` and a `confidenceReport`
 * listing inference results for every node, so the caller (Studio review
 * panel, CLI, Hub) can surface low-confidence items for human review.
 *
 * All geometry from the original diagram is preserved; auto-layout is never
 * applied here.
 *
 * @param content  - Raw .drawio file content (string).
 * @param options  - Optional injections (DOMParser, LLM provider, extra
 *                   catalogs/glossary). See `ImportOptions` for details.
 */
export async function importDrawio(
	content: string,
	options: ImportOptions = {}
): Promise<ImportResult> {
	const pages = parseDrawio(content, options.domParser);

	const results = await Promise.all(
		pages.map(async (page) => {
			const vertices = page.cells.filter((c) => c.vertex);

			// Run inference for every vertex in parallel
			const inferenceEntries = await Promise.all(
				vertices.map(async (v): Promise<[string, TypeInferenceResult]> => {
					const inferOpts: import('./inference.js').InferenceOptions = {};
					if (options.extraCatalogs) inferOpts.extraCatalogs = options.extraCatalogs;
					if (options.extraGlossary) inferOpts.extraGlossary = options.extraGlossary;
					if (options.llmProvider) inferOpts.llmProvider = options.llmProvider;
					const result = await inferNodeType(v, page.cells, inferOpts);
					return [v.id, result];
				})
			);

			const inferenceMap = new Map<string, TypeInferenceResult>(inferenceEntries);
			return buildPageResult(page, inferenceMap);
		})
	);

	return { pages: results };
}
