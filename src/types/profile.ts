import { z } from "zod";

export type FieldType = "text" | "select" | "checkbox" | "radio" | "date" | "autocomplete" | "button" | "button-group";
export type SelectMatch = "label" | "value";

export interface ProfileField {
  xpath: string;
  type?: FieldType;
  value: string | boolean;
  label?: string;
  selectBy?: SelectMatch;
  clearFirst?: boolean;
  skipIfFilled?: boolean;
  optional?: boolean;
  required?: boolean;
  delayMs?: number;
  waitForMs?: number;
  waitForNext?: boolean;
  step?: number;
}

export interface Profile {
  id: string;
  name: string;
  description?: string;
  urlPatterns: string[];
  delayMs?: number;
  waitForMs?: number;
  reVerifyFields?: boolean;
  fields: ProfileField[];
}

const fieldTypeSchema = z.enum(["text", "select", "checkbox", "radio", "date", "autocomplete", "button", "button-group"]);
const selectMatchSchema = z.enum(["label", "value"]);
const delaySchema = z.number().positive();
const valueSchema = z.union([z.string(), z.boolean()]);

const profileFieldSchema = z
  .object({
    xpath: z
      .string()
      .min(1, "xpath is required")
      .refine(
        (x) => x.startsWith("//"),
        'xpath must start with "//" (root-relative)'
      ),
    type: fieldTypeSchema.default("text"),
    value: valueSchema,
    label: z.string().optional(),
    selectBy: selectMatchSchema.optional(),
    clearFirst: z.boolean().default(true),
    skipIfFilled: z.boolean().default(false),
    optional: z.boolean().default(false),
    required: z.boolean().default(true),
    delayMs: delaySchema.optional(),
    waitForMs: delaySchema.optional(),
    waitForNext: z.boolean().default(false),
    step: z.number().int().positive().optional(),
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
  waitForMs: delaySchema.optional(),
  reVerifyFields: z.boolean().default(false),
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
