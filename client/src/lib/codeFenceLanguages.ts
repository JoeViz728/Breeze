export interface CodeFenceLanguage {
  id: string;
  label: string;
  insertText: string;
  description: string;
}

export const CODE_FENCE_NONE: CodeFenceLanguage = {
  id: 'none',
  label: '(none)',
  insertText: '\n',
  description: 'Skip language and start writing code',
};

export const CODE_FENCE_LANGUAGES: CodeFenceLanguage[] = [
  CODE_FENCE_NONE,
  {
    id: 'javascript',
    label: 'JavaScript',
    insertText: 'javascript\n',
    description: 'Insert javascript and start writing code',
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    insertText: 'typescript\n',
    description: 'Insert typescript and start writing code',
  },
  {
    id: 'python',
    label: 'Python',
    insertText: 'python\n',
    description: 'Insert python and start writing code',
  },
  {
    id: 'rust',
    label: 'Rust',
    insertText: 'rust\n',
    description: 'Insert rust and start writing code',
  },
  {
    id: 'go',
    label: 'Go',
    insertText: 'go\n',
    description: 'Insert go and start writing code',
  },
  {
    id: 'java',
    label: 'Java',
    insertText: 'java\n',
    description: 'Insert java and start writing code',
  },
  {
    id: 'c',
    label: 'C',
    insertText: 'c\n',
    description: 'Insert c and start writing code',
  },
  {
    id: 'cpp',
    label: 'C++',
    insertText: 'cpp\n',
    description: 'Insert cpp and start writing code',
  },
  {
    id: 'csharp',
    label: 'C#',
    insertText: 'csharp\n',
    description: 'Insert csharp and start writing code',
  },
  {
    id: 'ruby',
    label: 'Ruby',
    insertText: 'ruby\n',
    description: 'Insert ruby and start writing code',
  },
  {
    id: 'php',
    label: 'PHP',
    insertText: 'php\n',
    description: 'Insert php and start writing code',
  },
  {
    id: 'swift',
    label: 'Swift',
    insertText: 'swift\n',
    description: 'Insert swift and start writing code',
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    insertText: 'kotlin\n',
    description: 'Insert kotlin and start writing code',
  },
  {
    id: 'sql',
    label: 'SQL',
    insertText: 'sql\n',
    description: 'Insert sql and start writing code',
  },
  {
    id: 'html',
    label: 'HTML',
    insertText: 'html\n',
    description: 'Insert html and start writing code',
  },
  {
    id: 'css',
    label: 'CSS',
    insertText: 'css\n',
    description: 'Insert css and start writing code',
  },
  {
    id: 'json',
    label: 'JSON',
    insertText: 'json\n',
    description: 'Insert json and start writing code',
  },
  {
    id: 'yaml',
    label: 'YAML',
    insertText: 'yaml\n',
    description: 'Insert yaml and start writing code',
  },
  {
    id: 'markdown',
    label: 'Markdown',
    insertText: 'markdown\n',
    description: 'Insert markdown and start writing code',
  },
  {
    id: 'bash',
    label: 'Bash',
    insertText: 'bash\n',
    description: 'Insert bash and start writing code',
  },
  {
    id: 'shell',
    label: 'Shell',
    insertText: 'shell\n',
    description: 'Insert shell and start writing code',
  },
  {
    id: 'plaintext',
    label: 'Plain text',
    insertText: 'plaintext\n',
    description: 'Insert plaintext and start writing code',
  },
];

function languageSearchTerms(language: CodeFenceLanguage): string[] {
  return [language.id, language.label];
}

function matchesLanguageQuery(language: CodeFenceLanguage, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return languageSearchTerms(language).some((term) => term.toLowerCase().includes(normalized));
}

function languageSortScore(language: CodeFenceLanguage, query: string): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return language.id === 'none' ? 0 : 1;

  const id = language.id.toLowerCase();
  const label = language.label.toLowerCase();

  if (language.id === 'none' && ('none'.startsWith(normalized) || normalized.startsWith('('))) {
    return 0;
  }
  if (id.startsWith(normalized)) return 1;
  if (label.startsWith(normalized)) return 2;
  if (id.includes(normalized) || label.includes(normalized)) return 3;
  return 4;
}

export function getCodeFenceLanguageLabel(languageId: string): string {
  const normalized = languageId.trim().toLowerCase();
  const found = CODE_FENCE_LANGUAGES.find((language) => language.id === normalized);
  if (found && found.id !== 'none') return found.label;
  if (!normalized) return 'Plain text';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function filterCodeFenceLanguages(query: string): CodeFenceLanguage[] {
  const matches = CODE_FENCE_LANGUAGES.filter((language) => matchesLanguageQuery(language, query));
  return matches
    .sort((a, b) => {
      const scoreDiff = languageSortScore(a, query) - languageSortScore(b, query);
      if (scoreDiff !== 0) return scoreDiff;
      return a.label.localeCompare(b.label);
    })
    .slice(0, 10);
}