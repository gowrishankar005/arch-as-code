// SPDX-FileCopyrightText: 2026 CalmStudio Contributors
//
// SPDX-License-Identifier: Apache-2.0

/**
 * pattern-validation.ts — Secondary entry point for the CLI-grade,
 * validate-against-pattern engine.
 *
 * This is deliberately kept OUT of the package's main `index.ts` barrel. The
 * main entry stays light (basic schema validation only); this entry is the one
 * that pulls in `@finos/calm-shared` (Spectral + AJV pattern composition). By
 * shipping it as a separate entry (exposed at `@calmstudio/calm-core/pattern-validation`),
 * a consumer that `import()`s it lazily gets a real code-split chunk — Spectral
 * stays out of the initial bundle until the user validates against a pattern.
 */

export {
    validateAgainstPattern,
    toValidationIssues,
    elementIdFromPath,
} from './validation-with-pattern.js';
export { BundledDocumentLoader } from './bundled-document-loader.js';
