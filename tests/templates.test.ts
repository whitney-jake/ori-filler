import { describe, expect, it } from "vitest";
import { expand, TemplateError } from "../src/lib/templates";

const V4_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const ISO_8601_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("expand", () => {
  it("returns a plain string unchanged", () => {
    expect(expand("Jane")).toBe("Jane");
  });

  it("returns an empty string unchanged", () => {
    expect(expand("")).toBe("");
  });

  it("returns a string with no tokens unchanged", () => {
    expect(expand("a/b/c")).toBe("a/b/c");
  });

  it("expands {{uuid}} to a valid v4 UUID", () => {
    expect(expand("{{uuid}}")).toMatch(V4_UUID_PATTERN);
  });

  it("expands two {{uuid}} occurrences to different values", () => {
    const first = expand("{{uuid}}");
    const second = expand("{{uuid}}");
    expect(first).not.toBe(second);
  });

  it("expands {{email}} to a lowercase address", () => {
    const result = expand("{{email}}");
    expect(result).toBe(result.toLowerCase());
  });

  it("expands {{email}} to an address containing @", () => {
    expect(expand("{{email}}")).toContain("@");
  });

  it("expands two {{email}} occurrences to different values", () => {
    const first = expand("{{email}}");
    const second = expand("{{email}}");
    expect(first).not.toBe(second);
  });

  it("expands {{timestamp}} to an ISO 8601 timestamp", () => {
    expect(expand("{{timestamp}}")).toMatch(ISO_8601_PATTERN);
  });

  it("expands {{timestamp}} to a parseable date", () => {
    const result = new Date(expand("{{timestamp}}"));
    expect(Number.isNaN(result.getTime())).toBe(false);
  });

  it("expands multiple tokens in one value", () => {
    const result = expand("{{email}}/{{uuid}}/{{timestamp}}");
    const parts = result.split("/");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toMatch(/^user-[0-9a-f]{12}@example\.com$/);
    expect(parts[1]).toMatch(V4_UUID_PATTERN);
    expect(parts[2]).toMatch(ISO_8601_PATTERN);
  });

  it("expands a repeated token in one value independently", () => {
    const result = expand("{{uuid}}/{{uuid}}");
    const parts = result.split("/");
    expect(parts[0]).toMatch(V4_UUID_PATTERN);
    expect(parts[1]).toMatch(V4_UUID_PATTERN);
    expect(parts[0]).not.toBe(parts[1]);
  });

  it("expands a repeated {{email}} in one value independently", () => {
    const result = expand("{{email}}/{{email}}");
    const parts = result.split("/");
    expect(parts[0]).not.toBe(parts[1]);
  });

  it("throws TemplateError for an unknown token", () => {
    expect(() => expand("{{bogus}}")).toThrow(TemplateError);
  });

  it("names the offending token in the error", () => {
    try {
      expand("a{{bogus}}b");
      throw new Error("expected expand to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateError);
      if (error instanceof TemplateError) {
        expect(error.message).toContain("{{bogus}}");
      }
    }
  });

  it("throws TemplateError for whitespace inside the braces", () => {
    expect(() => expand("{{ uuid }}")).toThrow(TemplateError);
  });

  it("throws TemplateError when an unknown token follows a valid token", () => {
    expect(() => expand("{{uuid}}-{{bogus}}")).toThrow(TemplateError);
  });
});
