import { describe, expect, it } from "vitest";
import { anyPatternMatches, matchesUrl } from "../src/lib/glob";

describe("matchesUrl", () => {
  it("matches a pattern with a leading wildcard against the full URL", () => {
    expect(matchesUrl("*/customers/new", "https://app.com/customers/new")).toBe(true);
  });

  it("matches an exact pattern against an identical URL", () => {
    expect(matchesUrl("https://app.com/customers/new", "https://app.com/customers/new")).toBe(true);
  });

  it("does not match an exact pattern against a different URL", () => {
    expect(matchesUrl("https://app.com/customers/new", "https://app.com/customers")).toBe(false);
    expect(matchesUrl("https://app.com/customers/new", "https://app.com/customers/news")).toBe(false);
  });

  it("matches any URL with a lone star", () => {
    expect(matchesUrl("*", "https://anything.example/path?q=1")).toBe(true);
    expect(matchesUrl("*", "https://app.com/customers/new")).toBe(true);
  });

  it("matches one character with a question mark", () => {
    expect(matchesUrl("https://a.com/file?.html", "https://a.com/file1.html")).toBe(true);
    expect(matchesUrl("https://a.com/file?.html", "https://a.com/filex.html")).toBe(true);
  });

  it("requires exactly one character for a question mark", () => {
    expect(matchesUrl("https://a.com/file?.html", "https://a.com/file.html")).toBe(false);
    expect(matchesUrl("https://a.com/file?.html", "https://a.com/file12.html")).toBe(false);
  });

  it("matches a trailing wildcard", () => {
    expect(matchesUrl("https://app.com/*", "https://app.com/customers/new")).toBe(true);
  });

  it("matches a leading wildcard", () => {
    expect(matchesUrl("*customers", "https://app.com/customers")).toBe(true);
  });

  it("treats dots and slashes as literal characters", () => {
    expect(matchesUrl("*.com", "https://app.com")).toBe(true);
    expect(matchesUrl("*.com", "https://appxcom")).toBe(false);
    expect(matchesUrl("*/customers/new", "https://app.com/customers/news")).toBe(false);
  });

  it("treats regex metacharacters as literal characters", () => {
    expect(matchesUrl("https://app.com/a+b", "https://app.com/a+b")).toBe(true);
    expect(matchesUrl("https://app.com/a+b", "https://app.com/aab")).toBe(false);
    expect(matchesUrl("https://app.com/a.b", "https://app.com/aab")).toBe(false);
    expect(matchesUrl("https://app.com/(x)", "https://app.com/(x)")).toBe(true);
  });

  it("matches an empty pattern only against an empty URL", () => {
    expect(matchesUrl("", "")).toBe(true);
    expect(matchesUrl("", "https://app.com")).toBe(false);
  });

  it("does not allow a question mark to match zero characters", () => {
    expect(matchesUrl("a?c", "ac")).toBe(false);
    expect(matchesUrl("a?c", "abc")).toBe(true);
  });
});

describe("anyPatternMatches", () => {
  it("returns false for an empty patterns array", () => {
    expect(anyPatternMatches([], "https://app.com/customers/new")).toBe(false);
  });

  it("returns true when any pattern matches", () => {
    expect(anyPatternMatches(["*/customers/*", "*/login"], "https://app.com/customers/new")).toBe(true);
  });

  it("returns false when no pattern matches", () => {
    expect(anyPatternMatches(["*/login", "*/signup"], "https://app.com/customers/new")).toBe(false);
  });
});
