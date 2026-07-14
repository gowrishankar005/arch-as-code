// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import type {
	MxCell,
	TypeInferenceResult,
	InferenceConfidence,
	LlmInferenceProvider,
	CatalogEntry,
	GlossaryEntry,
	LlmNodeContext,
} from './types.js';
import { matchStencilCatalogs } from './catalogs/index.js';
import defaultGlossary from './catalogs/glossary.json' with { type: 'json' };

const BUILT_IN_GLOSSARY: GlossaryEntry[] = defaultGlossary as GlossaryEntry[];

/**
 * Run the three-tier inference pipeline for a single vertex cell.
 *
 * T1 — stencil catalog match (deterministic, HIGH/MEDIUM confidence)
 * T2 — label/glossary heuristics (MEDIUM/LOW confidence)
 * T3 — optional LLM context inference (scored, lowest priority)
 *
 * Returns the highest-confidence result found, or a 'none' sentinel if
 * all tiers miss.
 */
export async function inferNodeType(
	cell: MxCell,
	allCells: MxCell[],
	options: InferenceOptions = {}
): Promise<TypeInferenceResult> {
	// T1: stencil catalog
	const t1 = inferT1(cell.style, options.extraCatalogs);
	if (t1) return t1;

	// T2: label glossary
	const t2 = inferT2(cell.value, options.extraGlossary);
	if (t2) return t2;

	// T3: LLM (optional)
	if (options.llmProvider) {
		const context = buildLlmContext(cell, allCells);
		const t3 = await options.llmProvider.inferNodeType(context);
		if (t3) return t3;
	}

	return {
		nodeType: 'system',
		confidence: 'none',
		tier: 2,
		reason: 'no stencil or glossary match — defaulting to "system"; review recommended',
	};
}

function inferT1(style: string, extraCatalogs?: CatalogEntry[][]): TypeInferenceResult | null {
	const match = matchStencilCatalogs(style, extraCatalogs);
	if (!match) return null;
	return {
		nodeType: match.type,
		confidence: match.confidence as InferenceConfidence,
		tier: 1,
		reason: `stencil catalog match: pattern "${match.pattern}"${match.name ? ` (${match.name})` : ''}`,
	};
}

function inferT2(
	label: string,
	extraGlossary?: GlossaryEntry[]
): TypeInferenceResult | null {
	if (!label.trim()) return null;

	const normalized = label.toLowerCase().trim();
	const glossary = [...(extraGlossary ?? []), ...BUILT_IN_GLOSSARY];

	// Exact match first, then substring
	for (const pass of ['exact', 'substring'] as const) {
		for (const entry of glossary) {
			const term = entry.term.toLowerCase();
			const matched =
				pass === 'exact' ? normalized === term : normalized.includes(term);
			if (matched) {
				return {
					nodeType: entry['node-type'],
					confidence: entry.confidence as InferenceConfidence,
					tier: 2,
					reason: `label ${pass} match: "${entry.term}"${entry.note ? ` — note: ${entry.note}` : ''}`,
				};
			}
		}
	}

	return null;
}

function buildLlmContext(cell: MxCell, allCells: MxCell[]): LlmNodeContext {
	const parent = allCells.find((c) => c.id === cell.parent && c.vertex);
	const neighbourIds = allCells
		.filter((c) => c.edge && (c.source === cell.id || c.target === cell.id))
		.flatMap((e) => [e.source, e.target])
		.filter((id): id is string => !!id && id !== cell.id);

	return {
		label: cell.value,
		style: cell.style,
		parentLabel: parent?.value ?? null,
		neighbourLabels: [
			...new Set(
				allCells
					.filter((c) => c.vertex && neighbourIds.includes(c.id))
					.map((c) => c.value)
			),
		],
		edgeLabels: allCells
			.filter((c) => c.edge && (c.source === cell.id || c.target === cell.id))
			.map((c) => c.value)
			.filter(Boolean),
	};
}

export interface InferenceOptions {
	extraCatalogs?: CatalogEntry[][];
	extraGlossary?: GlossaryEntry[];
	llmProvider?: LlmInferenceProvider;
}

/**
 * No-op LLM provider — use as default when no LLM is wired in.
 */
export const noOpLlmProvider: LlmInferenceProvider = {
	inferNodeType: (_ctx: LlmNodeContext) => Promise.resolve(null),
};
