// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import type { CalmArchitectureSchema } from '@finos/calm-models/types';

// ─── mxGraph model types ─────────────────────────────────────────────────────

export interface MxGeometry {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** A single cell from the mxGraph XML model. */
export interface MxCell {
	id: string;
	value: string;
	style: string;
	/** true for shape/node cells. */
	vertex: boolean;
	/** true for connection cells. */
	edge: boolean;
	/** Parent cell id — default layer is typically "1". */
	parent: string;
	/** Source vertex id (edges only). */
	source?: string;
	/** Target vertex id (edges only). */
	target?: string;
	geometry: MxGeometry | null;
}

/** A single diagram page parsed from a .drawio file. */
export interface MxPage {
	id: string;
	name: string;
	cells: MxCell[];
}

// ─── Inference types ──────────────────────────────────────────────────────────

export type InferenceConfidence = 'high' | 'medium' | 'low' | 'none';

export interface TypeInferenceResult {
	/** A CALM core type or registry extension type (e.g. "messaging:message-queue"). */
	nodeType: string;
	confidence: InferenceConfidence;
	/** Which inference tier produced this result. */
	tier: 1 | 2 | 3;
	/** Human-readable reason shown in the Import Review panel. */
	reason: string;
}

/**
 * Pluggable LLM inference provider for T3.
 * Callers (Studio, CLI, Hub) inject their own implementation.
 * The default import produces no T3 results (noOpLlmProvider).
 */
export interface LlmInferenceProvider {
	inferNodeType(context: LlmNodeContext): Promise<TypeInferenceResult | null>;
}

export interface LlmNodeContext {
	label: string;
	style: string;
	parentLabel: string | null;
	neighbourLabels: string[];
	edgeLabels: string[];
}

// ─── Import result types ──────────────────────────────────────────────────────

export interface ConfidenceReportEntry {
	/** draw.io cell id. */
	cellId: string;
	/** CALM unique-id assigned to this element. */
	calmId: string;
	label: string;
	inferredType: string;
	confidence: InferenceConfidence;
	tier: 1 | 2 | 3;
	reason: string;
	/** true for low/none confidence — this item should appear in the Review panel. */
	needsReview: boolean;
}

/** Preserved mxGeometry by CALM unique-id. The caller decides how to persist
 *  this (layout decorator, sidecar, DB column). Never written into the CALM
 *  architecture document itself so the output stays schema-valid. */
export type GeometryMap = Record<string, { x: number; y: number; width: number; height: number }>;

/** Raw mxCell style string by CALM unique-id — visual properties (fill color,
 *  shape family, etc.) that the CALM node-type system can't represent. Never
 *  written into the CALM document; callers persist it out-of-band (e.g. a
 *  CalmStudio sidecar file) so nothing about the original diagram is silently
 *  discarded, per the importer's "nothing dropped silently" invariant. */
export type StyleMap = Record<string, string>;

export interface DanglingEdgeEntry {
	/** draw.io cell id of the edge. */
	cellId: string;
	label: string;
	/** CALM unique-id of the resolvable endpoint, if any. */
	resolvedEndpoint: string | null;
	/** Which endpoint is missing. */
	missingEnd: 'source' | 'target' | 'both';
}

export interface PageImportResult {
	name: string;
	architecture: CalmArchitectureSchema;
	/** One entry per node that was type-inferred. */
	confidenceReport: ConfidenceReportEntry[];
	/** Original mxGeometry values keyed by CALM unique-id. */
	geometry: GeometryMap;
	/** Original mxCell style strings keyed by CALM unique-id. */
	styles: StyleMap;
	/** Edges whose source and/or target cell could not be resolved to a CALM node. */
	danglingEdges: DanglingEdgeEntry[];
}

export interface ImportResult {
	pages: PageImportResult[];
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface ImportOptions {
	/**
	 * DOMParser implementation to use for XML parsing.
	 * Required in Node.js — inject from @xmldom/xmldom or similar.
	 * Defaults to the global `DOMParser` in browser environments.
	 */
	domParser?: DOMParser;
	/**
	 * Optional T3 LLM provider. No LLM inference is run if omitted.
	 */
	llmProvider?: LlmInferenceProvider;
	/**
	 * Additional stencil catalogs to search before the built-in ones.
	 * Useful for org-specific shape libraries without code changes.
	 */
	extraCatalogs?: CatalogEntry[][];
	/**
	 * Additional glossary entries to use for T2 inference before the
	 * built-in glossary (node-typing-rules.json).
	 */
	extraGlossary?: GlossaryEntry[];
}

// ─── Catalog types ────────────────────────────────────────────────────────────

export interface CatalogEntry {
	/**
	 * Regex pattern matched against the mxCell style string.
	 * Use anchored patterns like `shape=mxgraph\\.aws4\\.s3` for precision.
	 */
	pattern: string;
	/** CALM node type or registry extension type. */
	type: string;
	/** Display name hint (not written to CALM output). */
	name?: string;
	confidence: 'high' | 'medium';
}

export interface GlossaryEntry {
	term: string;
	'node-type': string;
	confidence: 'high' | 'medium' | 'low';
	rule?: string;
	note?: string;
}
