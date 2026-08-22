const regexMeta = /[.*+?^${}()|[\]\\]/;

const regexCache = new Map<string, RegExp>();

function globToRegExp(pattern: string): RegExp {
  const cached = regexCache.get(pattern);
  if (cached) {
    return cached;
  }
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
  const regex = new RegExp("^" + source + "$");
  regexCache.set(pattern, regex);
  return regex;
}

export function matchesUrl(pattern: string, url: string): boolean {
  return globToRegExp(pattern).test(url);
}

export function anyPatternMatches(patterns: string[], url: string): boolean {
  return patterns.some((pattern) => matchesUrl(pattern, url));
}
