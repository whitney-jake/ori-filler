const regexMeta = /[.*+?^${}()|[\]\\]/;

function globToRegExp(pattern: string): RegExp {
  let source = "";
  for (const char of pattern) {
    if (char === "*") {
      source += "[\\s\\S]*";
    } else if (char === "?") {
      source += "[\\s\\S]";
    } else if (regexMeta.test(char)) {
      source += "\\" + char;
    } else {
      source += char;
    }
  }
  return new RegExp("^" + source + "$");
}

export function matchesUrl(pattern: string, url: string): boolean {
  return globToRegExp(pattern).test(url);
}

export function anyPatternMatches(patterns: string[], url: string): boolean {
  return patterns.some((pattern) => matchesUrl(pattern, url));
}
