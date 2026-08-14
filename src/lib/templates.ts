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

const TOKEN_PATTERN = /\{\{(.*?)\}\}/g;

export function expand(value: string): string {
  return value.replace(TOKEN_PATTERN, (whole: string, name: string) => {
    const expander = TOKENS[name];
    if (!expander) {
      throw new TemplateError(`Unknown template token: ${whole}`);
    }
    return expander();
  });
}
