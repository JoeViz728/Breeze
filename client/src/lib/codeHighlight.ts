import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import php from 'highlight.js/lib/languages/php';
import python from 'highlight.js/lib/languages/python';
import ruby from 'highlight.js/lib/languages/ruby';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import swift from 'highlight.js/lib/languages/swift';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGE_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  html: 'xml',
  plaintext: '',
  text: '',
  none: '',
};

const REGISTERED = [
  ['bash', bash],
  ['c', c],
  ['cpp', cpp],
  ['csharp', csharp],
  ['css', css],
  ['go', go],
  ['java', java],
  ['javascript', javascript],
  ['json', json],
  ['kotlin', kotlin],
  ['markdown', markdown],
  ['php', php],
  ['python', python],
  ['ruby', ruby],
  ['rust', rust],
  ['sql', sql],
  ['swift', swift],
  ['typescript', typescript],
  ['xml', xml],
  ['yaml', yaml],
] as const;

let initialized = false;

function ensureHighlightJs() {
  if (initialized) return;
  for (const [name, language] of REGISTERED) {
    hljs.registerLanguage(name, language);
  }
  initialized = true;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function normalizeHighlightLanguage(language: string): string | null {
  const trimmed = language.trim().toLowerCase();
  if (!trimmed) return null;

  const alias = LANGUAGE_ALIASES[trimmed];
  if (alias === '') return null;
  if (alias) return alias;

  ensureHighlightJs();
  return hljs.getLanguage(trimmed) ? trimmed : null;
}

export function highlightCode(code: string, language?: string): string {
  const normalized = language ? normalizeHighlightLanguage(language) : null;

  if (!normalized) {
    return escapeHtml(code);
  }

  ensureHighlightJs();
  return hljs.highlight(code, { language: normalized }).value;
}