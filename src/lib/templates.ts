import type { ProfileField } from "../types/profile";

export class TemplateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TemplateError";
  }
}

const TOKENS: Record<string, () => string> = {
  uuid: () => crypto.randomUUID(),
  email: () => `user-${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}@example.com`,
  timestamp: () => new Date().toISOString(),
};

const FIELD_PATTERN = /^field\.(\w+)$/;
const TOKEN_PATTERN = /\{\{(.*?)\}\}/g;

export function expand(
  value: string,
  currentField?: ProfileField
): string {
  if (!value.includes("{{")) {
    return value;
  }
  return value.replace(TOKEN_PATTERN, (whole: string, name: string) => {
    const fieldMatch = name.match(FIELD_PATTERN);
    if (fieldMatch && currentField) {
      const propName = fieldMatch[1];
      if (propName in currentField) {
        const v = currentField[propName as keyof ProfileField];
        if (typeof v === "string") {
          return v;
        }
      }
    }
    const expander = TOKENS[name];
    if (expander) {
      return expander();
    }
    throw new TemplateError(`Unknown template token: ${whole}`);
  });
}
