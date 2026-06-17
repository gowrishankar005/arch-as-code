// SPDX-FileCopyrightText: 2024 CalmStudio contributors - see NOTICE file
//
// SPDX-License-Identifier: Apache-2.0
import path from 'path';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Browser stubs for the Node-only modules statically pulled in (but never
 * executed) by the CLI-grade validation engine in `@finos/calm-shared`, reached
 * via `@calmstudio/calm-core`'s `validateAgainstPattern`. All DEAD code for
 * Studio's client:
 *   - `FileSystemDocumentLoader` / `CalmHubDocumentLoader` import `fs`/`path`,
 *     but we drive validation with the browser-safe `BundledDocumentLoader` and
 *     never call `buildDocumentLoader`.
 *   - `logger.ts` imports `winston`, but at runtime picks the `loglevel` browser
 *     logger when `window` is defined.
 *   - `validate.ts` imports the junit/pretty output formatters (→
 *     `junit-report-builder`, which touches `process`), but we call `validate()`
 *     directly and never `formatOutput()`.
 * The static imports still drag this code into the renderer graph, which a
 * browser build cannot resolve — hence the stubs.
 */
const NODE_STUBS: Record<string, string> = {
	// winston is referenced only inside the never-in-browser Node logger branch.
	winston: 'export default {};\n',
	// junit-report-builder (default + TestSuite named) is only used by the junit
	// formatter, which we never invoke.
	'junit-report-builder': 'export const TestSuite = class {};\nexport default {};\n',
	fs: 'export const existsSync = () => false;\nexport default { existsSync };\n',
	'fs/promises':
		"const fail = () => { throw new Error('fs/promises is unavailable in the browser build'); };\n" +
		'export const readFile = fail;\nexport const readdir = fail;\nexport default { readFile, readdir };\n',
	path:
		'export function isAbsolute(p){ return typeof p === "string" && p.startsWith("/"); }\n' +
		'export function join(...parts){ return parts.filter(Boolean).join("/").replace(/\\/+/g, "/"); }\n' +
		'export function normalize(p){ return String(p).replace(/\\/+/g, "/"); }\n' +
		'export function dirname(p){ const s = String(p).replace(/\\/+$/, ""); const i = s.lastIndexOf("/"); return i <= 0 ? (i === 0 ? "/" : ".") : s.slice(0, i); }\n' +
		'export function basename(p){ return String(p).split("/").pop() ?? String(p); }\n' +
		'export function extname(p){ const b = basename(p); const i = b.lastIndexOf("."); return i > 0 ? b.slice(i) : ""; }\n' +
		'export function resolve(...parts){ return join(...parts); }\n' +
		'export const sep = "/";\nexport const delimiter = ":";\n' +
		'export default { isAbsolute, join, normalize, dirname, basename, extname, resolve, sep, delimiter };\n',
};

const STUB_FILTER = new RegExp(
	'^(' + Object.keys(NODE_STUBS).map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')$'
);

/**
 * Rollup-side stubs for the production build. Scoped to `!ssr` so the SvelteKit
 * prerender/server pass keeps the real Node modules. Only bare specifiers are
 * intercepted; the `node:`-prefixed forms used by Node-side test files are left
 * untouched.
 */
function clientNodeBuiltinStubs(): Plugin {
	const PREFIX = '\0calmstudio-node-stub:';
	return {
		name: 'calmstudio:client-node-builtin-stubs',
		enforce: 'pre',
		resolveId(id, _importer, options) {
			if (options?.ssr) return null;
			if (Object.prototype.hasOwnProperty.call(NODE_STUBS, id)) {
				return PREFIX + id;
			}
			return null;
		},
		load(id, options) {
			if (id.startsWith(PREFIX)) {
				return NODE_STUBS[id.slice(PREFIX.length)];
			}
			// The shared `validate()` statically imports the junit/pretty output
			// formatters, whose module bodies touch `process` at load time. We
			// never call `formatOutput()`, so replace them with a no-op default
			// export in the client. Scoped to `!ssr` so the CLI/SSR keep the real
			// formatters.
			if (!options?.ssr && id.includes('/commands/validate/output-formats/')) {
				return 'export default () => "";\n';
			}
			// `consts.js` computes a filesystem path from `__dirname` at load time
			// (only used by the FS document loader, which is dead for us).
			if (!options?.ssr && id.includes('/shared/dist/consts.js')) {
				return 'export const CALM_META_SCHEMA_DIRECTORY = "";\n';
			}
			// The `document-loader.js` barrel statically imports every loader
			// strategy (FileSystem→fs, DirectUrl→net, CalmHub, …) just to build
			// `buildDocumentLoader`, which we never call. `schema-directory.js`
			// and our `BundledDocumentLoader` only need `DocumentLoadError` /
			// `assertJsonObject` from it. Replace the barrel with a minimal,
			// strategy-free version so none of those Node-only loaders are pulled.
			if (!options?.ssr && id.includes('/shared/dist/document-loader/document-loader.js')) {
				return [
					"export const CALM_HUB_PROTOS = ['http:', 'https:', 'calm:'];",
					'export class DocumentLoadError extends Error {',
					'  constructor({ name, message, cause, recoverable = true }) {',
					'    super();',
					'    this.name = name;',
					'    this.message = message;',
					'    this.cause = cause;',
					'    this.recoverable = recoverable;',
					'  }',
					'}',
					'export function assertJsonObject(data, source) {',
					"  if (typeof data !== 'object' || data === null || Array.isArray(data)) {",
					"    const kind = data === null ? 'null' : Array.isArray(data) ? 'array' : typeof data;",
					"    throw new DocumentLoadError({ name: 'UNKNOWN', message: `Expected a JSON object from ${source} but received: ${kind}`, recoverable: false });",
					'  }',
					'}',
					'export function buildDocumentLoader() {',
					"  throw new Error('buildDocumentLoader is unavailable in the browser build; use BundledDocumentLoader.');",
					'}',
					'',
				].join('\n');
			}
			return null;
		},
	};
}

/**
 * esbuild-side stubs for Vite's dev-time dependency pre-bundling (`optimizeDeps`),
 * which does NOT run the Rollup plugin above. optimizeDeps is client-only, so no
 * SSR guard is needed here.
 */
const esbuildNodeStubPlugin = {
	name: 'calmstudio:client-node-builtin-stubs-esbuild',
	setup(build: { onResolve: Function; onLoad: Function }) {
		build.onResolve({ filter: STUB_FILTER }, (args: { path: string }) => ({
			path: args.path,
			namespace: 'calmstudio-node-stub',
		}));
		build.onLoad({ filter: /.*/, namespace: 'calmstudio-node-stub' }, (args: { path: string }) => ({
			contents: NODE_STUBS[args.path],
			loader: 'js',
		}));
	},
};

export default defineConfig({
	plugins: [clientNodeBuiltinStubs(), tailwindcss(), sveltekit(), svelteTesting()],
	server: {
		fs: {
			// npm-workspaces installs some deps (e.g. @sveltejs/kit) into
			// calm-suite/calm-studio/node_modules, outside Vite's default
			// allow root at apps/studio. Allow up to the repo root.
			allow: [path.resolve('../../../..')],
		},
	},
	resolve: {
		alias: {
			// Allow tests to import @calmstudio/calm-core/test-fixtures directly from source.
			// The package.json exports map only exposes '.', so test-fixtures must be aliased here.
			'@calmstudio/calm-core/test-fixtures': path.resolve('../../packages/calm-core/test-fixtures/index.ts'),
		},
		// CodeMirror uses internal symbols + instanceof checks across @codemirror/state,
		// @codemirror/view and @codemirror/language. Multiple module copies break those
		// checks ("Unrecognized extension value in extension set"). Force single instance.
		dedupe: [
			'codemirror',
			'svelte-codemirror-editor',
			'@codemirror/state',
			'@codemirror/view',
			'@codemirror/language',
			'@codemirror/lang-json',
			'@codemirror/lint',
			'@codemirror/theme-one-dark',
		],
	},
	ssr: {
		noExternal: ['@xyflow/svelte']
	},
	optimizeDeps: {
		include: ['ajv', 'ajv-formats'],
		esbuildOptions: {
			plugins: [esbuildNodeStubPlugin],
		},
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'jsdom',
		globals: true,
		passWithNoTests: true,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html', 'lcov'],
			include: ['src/**/*.ts', 'src/**/*.svelte.ts'],
			exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/tests/e2e/**'],
			thresholds: {
				lines: 60,
				functions: 60,
				branches: 60,
				statements: 60,
			},
		},
	}
});
