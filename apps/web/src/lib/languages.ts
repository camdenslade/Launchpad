/**
 * Language colours, matching GitHub's (github/linguist) so they look familiar.
 * Only common languages are listed; anything else gets a neutral dot.
 */
const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572a5",
  Go: "#00add8",
  Rust: "#dea584",
  Java: "#b07219",
  Kotlin: "#a97bff",
  Swift: "#f05138",
  "C#": "#178600",
  "C++": "#f34b7d",
  C: "#555555",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Dart: "#00b4ab",
  Scala: "#c22d40",
  Elixir: "#6e4a7e",
  Lua: "#000080",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Vue: "#41b883",
  Svelte: "#ff3e00",
  Astro: "#ff5a03",
  Shell: "#89e051",
  PowerShell: "#012456",
  HCL: "#844fba",
  Dockerfile: "#384d54",
  "Jupyter Notebook": "#da5b0b",
  MDX: "#fcb32c"
};

export function languageColor(language: string): string {
  return LANGUAGE_COLORS[language] ?? "#6c7571";
}
