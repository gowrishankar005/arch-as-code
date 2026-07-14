// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

import type {
	CalmArchitectureSchema,
	CalmNodeSchema,
	CalmRelationshipSchema,
	CalmRelationshipTypeSchema,
	CalmProtocolSchema,
} from '@finos/calm-models/types';
import type {
	MxCell,
	MxPage,
	TypeInferenceResult,
	ConfidenceReportEntry,
	PageImportResult,
} from './types.js';

/** Valid CALM protocol values per the 1.2 schema. */
const CALM_PROTOCOLS = new Set<string>([
	'HTTP', 'HTTPS', 'FTP', 'SFTP', 'JDBC', 'WebSocket',
	'SocketIO', 'LDAP', 'AMQP', 'TLS', 'mTLS', 'TCP',
]);

/**
 * Build a CALM architecture + confidence report from a parsed mxGraph page
 * and its pre-computed inference results.
 *
 * @param page - Parsed mxGraph page.
 * @param inferenceMap - Map from cell id → TypeInferenceResult for every vertex.
 */
export function buildPageResult(
	page: MxPage,
	inferenceMap: Map<string, TypeInferenceResult>
): PageImportResult {
	// The default layer id is "1"; any vertex whose parent is "1" is top-level.
	const DEFAULT_LAYER_ID = '1';

	const vertices = page.cells.filter((c) => c.vertex);
	const edges = page.cells.filter((c) => c.edge);

	// Build a set of vertex ids for quick lookup
	const vertexIds = new Set(vertices.map((v) => v.id));

	// Assign stable CALM unique-ids
	const idMap = new Map<string, string>(); // mxCell id → CALM unique-id
	const usedSlugs = new Map<string, number>(); // base slug → counter
	for (const v of vertices) {
		const slug = labelToSlug(v.value);
		const count = usedSlugs.get(slug) ?? 0;
		usedSlugs.set(slug, count + 1);
		idMap.set(v.id, count === 0 ? slug : `${slug}-${count}`);
	}

	const nodes: CalmNodeSchema[] = [];
	const relationships: CalmRelationshipSchema[] = [];
	const confidenceReport: ConfidenceReportEntry[] = [];

	// ── Nodes ────────────────────────────────────────────────────────────────
	for (const v of vertices) {
		const calmId = idMap.get(v.id)!;
		const inference = inferenceMap.get(v.id) ?? {
			nodeType: 'system',
			confidence: 'none' as const,
			tier: 2 as const,
			reason: 'no inference result provided',
		};

		nodes.push({
			'unique-id': calmId,
			'node-type': inference.nodeType,
			name: v.value || calmId,
			description: `[Imported from draw.io — review description]`,
			...(v.geometry
				? {
					'x-position': v.geometry.x,
					'y-position': v.geometry.y,
					'x-size': v.geometry.width,
					'y-size': v.geometry.height,
				  }
				: {}),
		} as unknown as CalmNodeSchema);

		confidenceReport.push({
			cellId: v.id,
			calmId,
			label: v.value,
			inferredType: inference.nodeType,
			confidence: inference.confidence,
			tier: inference.tier,
			reason: inference.reason,
			needsReview: inference.confidence === 'low' || inference.confidence === 'none',
		});
	}

	// ── Containment relationships (from parentId) ─────────────────────────
	// Group children by parent vertex (excluding the default layer "1")
	const containmentMap = new Map<string, string[]>(); // parent calmId → child calmIds
	for (const v of vertices) {
		if (v.parent === DEFAULT_LAYER_ID) continue;
		if (!vertexIds.has(v.parent)) continue; // parent is a non-vertex layer
		const parentCalmId = idMap.get(v.parent);
		const childCalmId = idMap.get(v.id);
		if (!parentCalmId || !childCalmId) continue;
		if (!containmentMap.has(parentCalmId)) containmentMap.set(parentCalmId, []);
		containmentMap.get(parentCalmId)!.push(childCalmId);
	}

	let relCounter = 0;
	for (const [container, children] of containmentMap) {
		relationships.push({
			'unique-id': `containment-${++relCounter}`,
			'relationship-type': {
				'deployed-in': { container, nodes: children },
			} as CalmRelationshipTypeSchema,
		});
	}

	// ── Actor→interacts relationships ─────────────────────────────────────
	// Actors (node-type = 'actor') that connect to other nodes via edges become
	// interacts relationships instead of connects.
	const actorIds = new Set(
		nodes
			.filter((n) => n['node-type'] === 'actor')
			.map((n) => n['unique-id'])
	);

	const processedEdges = new Set<string>();

	for (const e of edges) {
		if (!e.source || !e.target) continue; // dangling edge — skip
		if (!vertexIds.has(e.source) || !vertexIds.has(e.target)) continue;

		const sourceCalmId = idMap.get(e.source);
		const targetCalmId = idMap.get(e.target);
		if (!sourceCalmId || !targetCalmId) continue;

		const edgeUid = `rel-${++relCounter}`;
		processedEdges.add(e.id);

		if (actorIds.has(sourceCalmId)) {
			// actor → nodes: use interacts
			relationships.push({
				'unique-id': edgeUid,
				'relationship-type': {
					interacts: { actor: sourceCalmId, nodes: [targetCalmId] },
				} as CalmRelationshipTypeSchema,
				...(e.value ? { description: e.value } : {}),
			});
		} else {
			// General directed connection
			const protocol = toProtocol(e.value);
			relationships.push({
				'unique-id': edgeUid,
				'relationship-type': {
					connects: {
						source: { node: sourceCalmId },
						destination: { node: targetCalmId },
					},
				} as CalmRelationshipTypeSchema,
				...(protocol ? { protocol } : {}),
				...(!protocol && e.value ? { description: e.value } : {}),
			});
		}
	}

	const architecture: CalmArchitectureSchema = { nodes, relationships };

	return { name: page.name, architecture, confidenceReport };
}

/** Convert a draw.io edge label to a CALM protocol if it matches the enum. */
function toProtocol(label: string): CalmProtocolSchema | null {
	if (!label) return null;
	const upper = label.trim().toUpperCase();
	// Handle common aliases
	const normalized =
		upper === 'WSS' || upper === 'WS' ? 'WebSocket' :
		upper === 'MTLS' ? 'mTLS' :
		label.trim();
	if (CALM_PROTOCOLS.has(normalized)) return normalized as CalmProtocolSchema;
	// Try the upper-cased version as well
	if (CALM_PROTOCOLS.has(upper)) return upper as CalmProtocolSchema;
	return null;
}

/**
 * Convert a free-text label to a URL-safe slug suitable as a CALM unique-id.
 * Strips HTML, lowercases, replaces spaces with dashes, removes non-slug chars.
 */
function labelToSlug(label: string): string {
	const clean = label
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.trim()
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-');
	return clean || 'node';
}
