import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseProfile, type Profile } from "../src/types/profile";
import {
  clearProfileCache,
  deleteImportedProfile,
  getAllProfiles,
  loadBundledProfiles,
  loadImportedProfiles,
  saveImportedProfile,
  saveStep,
  loadStep,
  clearStepCache,
} from "../src/lib/storage";

const IMPORTED_KEY = "importedProfiles";

const createCustomerRaw = {
  id: "create-customer",
  name: "Create Customer",
  urlPatterns: ["*/customers/new"],
  fields: [{ xpath: "//input[@name='firstName']", value: "Jane" }],
};

const loginRaw = {
  id: "login",
  name: "Login",
  urlPatterns: ["*/login"],
  fields: [{ xpath: "//input[@name='user']", value: "admin" }],
};

const createCustomer = parseProfile(createCustomerRaw);
const login = parseProfile(loginRaw);

interface FileEntry {
  ok: boolean;
  body?: unknown;
}

let store: Record<string, unknown>;
let files: Map<string, FileEntry>;
let fetchMock: ReturnType<typeof vi.fn>;

function installChromeMock() {
  (globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (key?: string | string[] | Record<string, unknown>) => {
          if (typeof key === "string") {
            return { [key]: store[key] };
          }
          if (Array.isArray(key)) {
            const out: Record<string, unknown> = {};
            for (const k of key) {
              out[k] = store[k];
            }
            return out;
          }
          return { ...store };
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete store[key];
        }),
      },
    },
    runtime: {
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    },
  };
}

function installFetchMock() {
  fetchMock = vi.fn(async (input: string) => {
    const entry = files.get(String(input));
    if (!entry || !entry.ok) {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => entry.body };
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
}

function addBundledFiles(list: Record<string, unknown>) {
  for (const [name, body] of Object.entries(list)) {
    files.set(`chrome-extension://test/profiles/${name}`, { ok: true, body });
  }
}

beforeEach(() => {
  store = {};
  files = new Map();
  installChromeMock();
  installFetchMock();
  clearProfileCache();
  clearStepCache();
});

describe("loadImportedProfiles", () => {
  it("returns stored valid profiles and skips invalid entries", async () => {
    store[IMPORTED_KEY] = [createCustomerRaw, loginRaw, { id: "" }, "not a profile", 42, null];
    const profiles = await loadImportedProfiles();
    expect(profiles.map((p) => p.id)).toEqual(["create-customer", "login"]);
  });

  it("returns an empty array when nothing is stored", async () => {
    expect(await loadImportedProfiles()).toEqual([]);
  });

  it("returns an empty array when the stored value is not an array", async () => {
    store[IMPORTED_KEY] = "oops";
    expect(await loadImportedProfiles()).toEqual([]);
  });
});

describe("saveImportedProfile", () => {
  it("appends a new profile", async () => {
    await saveImportedProfile(createCustomer);
    await saveImportedProfile(login);
    const profiles = await loadImportedProfiles();
    expect(profiles.map((p) => p.id)).toEqual(["create-customer", "login"]);
  });

  it("replaces an existing profile with the same id and keeps other entries", async () => {
    await saveImportedProfile(createCustomer);
    await saveImportedProfile(login);
    await saveImportedProfile({ ...createCustomer, name: "Create Customer v2" });
    const profiles = await loadImportedProfiles();
    expect(profiles).toHaveLength(2);
    const updated = profiles.find((p) => p.id === "create-customer");
    expect(updated?.name).toBe("Create Customer v2");
    expect(profiles.find((p) => p.id === "login")?.name).toBe("Login");
  });
});

describe("deleteImportedProfile", () => {
  it("removes the profile with the matching id", async () => {
    await saveImportedProfile(createCustomer);
    await saveImportedProfile(login);
    await deleteImportedProfile("create-customer");
    const profiles = await loadImportedProfiles();
    expect(profiles.map((p) => p.id)).toEqual(["login"]);
  });

  it("is a no-op when the id does not exist", async () => {
    await saveImportedProfile(createCustomer);
    await deleteImportedProfile("missing");
    const profiles = await loadImportedProfiles();
    expect(profiles.map((p) => p.id)).toEqual(["create-customer"]);
  });
});

describe("loadBundledProfiles", () => {
  it("reads the index and profile files and returns parsed profiles", async () => {
    addBundledFiles({
      "index.json": ["create-customer.json", "login.json"],
      "create-customer.json": createCustomerRaw,
      "login.json": loginRaw,
    });
    const profiles = await loadBundledProfiles();
    expect(profiles.map((p) => p.id)).toEqual(["create-customer", "login"]);
  });

  it("skips a file that fails parseProfile", async () => {
    addBundledFiles({
      "index.json": ["create-customer.json", "broken.json", "login.json"],
      "create-customer.json": createCustomerRaw,
      "broken.json": { id: "" },
      "login.json": loginRaw,
    });
    const profiles = await loadBundledProfiles();
    expect(profiles.map((p) => p.id)).toEqual(["create-customer", "login"]);
  });

  it("skips a missing profile file and continues", async () => {
    addBundledFiles({
      "index.json": ["create-customer.json", "missing.json", "login.json"],
      "create-customer.json": createCustomerRaw,
      "login.json": loginRaw,
    });
    const profiles = await loadBundledProfiles();
    expect(profiles.map((p) => p.id)).toEqual(["create-customer", "login"]);
  });

  it("returns an empty array when the index fetch returns an error status", async () => {
    files.set("chrome-extension://test/profiles/index.json", { ok: false });
    expect(await loadBundledProfiles()).toEqual([]);
  });

  it("returns an empty array when the index fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network error"));
    expect(await loadBundledProfiles()).toEqual([]);
  });
});

describe("getAllProfiles", () => {
  it("returns both bundled and imported profiles", async () => {
    addBundledFiles({
      "index.json": ["create-customer.json"],
      "create-customer.json": createCustomerRaw,
    });
    await saveImportedProfile(login);
    const result = await getAllProfiles();
    expect(result.bundled.map((p) => p.id)).toEqual(["create-customer"]);
    expect(result.imported.map((p) => p.id)).toEqual(["login"]);
  });

  it("keeps a bundled profile and an imported profile with the same id separate", async () => {
    addBundledFiles({
      "index.json": ["create-customer.json"],
      "create-customer.json": createCustomerRaw,
    });
    await saveImportedProfile({ ...createCustomer, name: "Imported Create Customer" });
    const result = await getAllProfiles();
    expect(result.bundled).toHaveLength(1);
    expect(result.imported).toHaveLength(1);
    expect(result.bundled[0].name).toBe("Create Customer");
    expect(result.imported[0].name).toBe("Imported Create Customer");
  });
});

describe("saveStep and loadStep", () => {
  it("returns 1 when no step is stored", async () => {
    expect(await loadStep("profile-1")).toBe(1);
  });

  it("saves and loads a step for a profile", async () => {
    saveStep("profile-1", 3);
    expect(await loadStep("profile-1")).toBe(3);
  });

  it("stores steps independently per profile", async () => {
    saveStep("profile-1", 2);
    saveStep("profile-2", 5);
    expect(await loadStep("profile-1")).toBe(2);
    expect(await loadStep("profile-2")).toBe(5);
  });

  it("overwrites a previously saved step", async () => {
    saveStep("profile-1", 1);
    saveStep("profile-1", 4);
    expect(await loadStep("profile-1")).toBe(4);
  });

  it("returns 1 for invalid stored values", async () => {
    store["step:profile-1"] = 0;
    expect(await loadStep("profile-1")).toBe(1);
    store["step:profile-1"] = -3;
    expect(await loadStep("profile-1")).toBe(1);
    store["step:profile-1"] = "oops";
    expect(await loadStep("profile-1")).toBe(1);
  });
});
