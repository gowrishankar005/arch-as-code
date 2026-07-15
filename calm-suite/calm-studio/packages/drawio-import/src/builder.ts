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
	GeometryMap,
	StyleMap,
	DanglingEdgeEntry,
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

	// Assign stable CALM unique-ids — anchored to the mxCell id so reimports
	// of the same file always produce the same CALM ids regardless of order.
	const idMap = new Map<string, string>(); // mxCell id → CALM unique-id
	for (const v of vertices) {
		idMap.set(v.id, `${labelToSlug(v.value)}-mx${v.id}`);
	}

	const nodes: CalmNodeSchema[] = [];
	const relationships: CalmRelationshipSchema[] = [];
	const confidenceReport: ConfidenceReportEntry[] = [];
	const geometry: GeometryMap = {};
	const styles: StyleMap = {};

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
		});

		// Geometry is kept out of the CALM document (no CALM 1.2 position fields).
		// Callers persist it via layout decorator, sidecar, or DB column.
		if (v.geometry) {
			geometry[calmId] = {
				x: v.geometry.x,
				y: v.geometry.y,
				width: v.geometry.width,
				height: v.geometry.height,
			};
		}

		// Raw visual style (fill color, shape family, etc.) has no CALM
		// representation — preserved out-of-band so nothing is silently lost.
		if (v.style) {
			styles[calmId] = v.style;
		}

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

	const danglingEdges: DanglingEdgeEntry[] = [];

	for (const e of edges) {
		const sourceOk = !!e.source && vertexIds.has(e.source);
		const targetOk = !!e.target && vertexIds.has(e.target);

		if (!sourceOk || !targetOk) {
			const missingEnd: DanglingEdgeEntry['missingEnd'] =
				!sourceOk && !targetOk ? 'both' : !sourceOk ? 'source' : 'target';
			danglingEdges.push({
				cellId: e.id,
				label: e.value,
				resolvedEndpoint: sourceOk
					? idMap.get(e.source!)!
					: targetOk
						? idMap.get(e.target!)!
						: null,
				missingEnd,
			});
			continue;
		}

		const sourceCalmId = idMap.get(e.source!)!;
		const targetCalmId = idMap.get(e.target!)!;

		const edgeUid = `rel-${++relCounter}`;

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

	// CalmCoreSchema type has no $schema field but the output JSON needs it so
	// consumers (calm-validate, Hub) can identify the schema version independently.
	const architecture = {
		$schema: 'https://calm.finos.org/release/1.2/meta/core.json',
		nodes,
		relationships,
	} as unknown as CalmArchitectureSchema;

	return { name: page.name, architecture, confidenceReport, geometry, styles, danglingEdges };
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
