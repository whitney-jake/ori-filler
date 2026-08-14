import { z } from "zod";

export type FieldType = "text" | "select" | "checkbox" | "radio" | "date";
export type SelectMatch = "label" | "value";

export interface ProfileField {
  anchor: string;
  xpath: string;
  type?: FieldType;
  value: string | boolean;
  selectBy?: SelectMatch;
  fallback?: string[];
  placeholder?: string;
  clearFirst?: boolean;
  skipIfFilled?: boolean;
  optional?: boolean;
  required?: boolean;
  delayMs?: number;
}

export interface Profile {
  id: string;
  name: string;
  description?: string;
  urlPatterns: string[];
  delayMs?: number;
  fields: ProfileField[];
}

const fieldTypeSchema = z.enum(["text", "select", "checkbox", "radio", "date"]);
const selectMatchSchema = z.enum(["label", "value"]);
const delaySchema = z.number().positive();
const valueSchema = z.union([z.string(), z.boolean()]);

const profileFieldSchema = z
  .object({
    anchor: z.string().min(1, "anchor is required"),
    xpath: z
      .string()
      .min(1, "xpath is required")
      .refine(
        (x) => x.startsWith("./") || x.startsWith(".//"),
        'xpath must start with "./" or ".//"'
      ),
    type: fieldTypeSchema.default("text"),
    value: valueSchema,
    selectBy: selectMatchSchema.optional(),
    fallback: z.array(z.string()).default(["id", "name", "data-testid"]),
    placeholder: z.string().optional(),
    clearFirst: z.boolean().default(true),
    skipIfFilled: z.boolean().default(false),
    optional: z.boolean().default(false),
    required: z.boolean().default(true),
    delayMs: delaySchema.optional(),
  })
  .superRefine((field, ctx) => {
    if (field.type === "checkbox") {
      if (typeof field.value !== "boolean") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: `checkbox value must be a boolean, received ${describeValue(field.value)}`,
        });
      }
    } else if (typeof field.value !== "string") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `${field.type} value must be a string, received ${describeValue(field.value)}`,
      });
    }
    if (field.type === "select" && field.selectBy === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectBy"],
        message: 'selectBy is required when type is "select"',
      });
    }
  });

const profileSchema = z.object({
  id: z.string().min(1, "id is required"),
  name: z.string().min(1, "name is required"),
  description: z.string().optional(),
  urlPatterns: z
    .array(z.string().min(1, "each urlPattern must be a non-empty string"))
    .min(1, "urlPatterns must be a non-empty array"),
  delayMs: delaySchema.optional(),
  fields: z.array(profileFieldSchema).min(1, "fields must be a non-empty array"),
});

export function parseProfile(raw: unknown): Profile {
  const result = profileSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${formatPath(issue.path)}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid profile: ${details}`);
  }
  const profile = result.data;
  for (const field of profile.fields) {
    if (field.type === "radio" && field.selectBy === undefined) {
      field.selectBy = "value";
    }
  }
  return profile;
}

export function validateProfile(p: Profile): string[] {
  const result = profileSchema.safeParse(p);
  if (result.success) {
    return [];
  }
  return result.error.issues.map((issue) => `${formatPath(issue.path)}: ${issue.message}`);
}

function formatPath(parts: PropertyKey[]): string {
  if (parts.length === 0) {
    return "profile";
  }
  return parts.map((part) => String(part)).join(".");
}

function describeValue(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value === undefined) {
    return "undefined";
  }
  return typeof value === "string" ? JSON.stringify(value) : String(value);
}
