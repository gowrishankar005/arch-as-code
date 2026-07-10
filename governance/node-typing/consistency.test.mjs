// Consistency guard for the node-typing governance artifacts.
// Run: node --test governance/node-typing/consistency.test.mjs
//
// Prevents silent drift between:
//   node-typing-rules.json  (source of truth for allowed types)
//   spectral-node-typing.yaml (lint enumeration — must match exactly)
//   packages/extensions/src/packs/*.ts (pack type IDs — registry must reuse them)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const rules = JSON.parse(readFileSync(join(here, 'node-typing-rules.json'), 'utf8'));
const spectral = readFileSync(join(here, 'spectral-node-typing.yaml'), 'utf8');

const allowed = [...rules['core-enum'], ...Object.keys(rules.registry)];

test('spectral enumeration matches core-enum + registry exactly', () => {
	const block = spectral.match(/values:\n((?:\s+- .*\n)+)/);
	assert.ok(block, 'values block not found in spectral yaml');
	const yamlValues = block[1]
		.split('\n')
		.map((l) => l.trim().replace(/^- /, '').replace(/^"|"$/g, ''))
		.filter(Boolean);
	assert.deepEqual(yamlValues.sort(), [...allowed].sort());
});

test('every glossary entry maps to an allowed node-type', () => {
	for (const [term, entry] of Object.entries(rules.glossary)) {
		assert.ok(allowed.includes(entry['node-type']),
			`glossary '${term}' maps to unlisted type '${entry['node-type']}'`);
	}
});

test('messaging registry IDs exist in the extensions messaging pack', () => {
	const pack = readFileSync(
		join(here, '../../calm-suite/calm-studio/packages/extensions/src/packs/messaging.ts'),
		'utf8'
	);
	for (const id of Object.keys(rules.registry).filter((k) => k.startsWith('messaging:'))) {
		assert.ok(pack.includes(`'${id}'`),
			`registry type '${id}' not found in extensions messaging pack — packs are the source of truth (R4)`);
	}
});

test('fixtures: positive uses only allowed types; negative uses at least one violation', () => {
	const load = (f) => JSON.parse(readFileSync(join(here, 'fixtures', f), 'utf8'));
	const types = (a) => a.nodes.map((n) => n['node-type']);
	for (const t of types(load('positive.calm.json'))) {
		assert.ok(allowed.includes(t), `positive fixture uses unlisted type '${t}'`);
	}
	assert.ok(types(load('negative.calm.json')).some((t) => !allowed.includes(t)),
		'negative fixture must contain at least one disallowed type');
});
