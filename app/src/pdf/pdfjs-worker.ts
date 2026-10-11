/**
 * The pdf.js worker, with the shims in front of it. pdf.js's own worker script
 * is a finished module we cannot edit, and a worker's globals are its own, so
 * the page's shims do not reach it. This wrapper is what `workerSrc` points
 * at: Vite bundles it as a module worker under /assets/, where the CSP covers
 * it. Imports evaluate in order, so the shims are in place before pdf.js runs.
 */
import './shims';
import 'pdfjs-dist/build/pdf.worker.min.mjs';
