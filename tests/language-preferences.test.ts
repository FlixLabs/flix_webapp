import { afterEach, expect, it, vi } from "vitest";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("detects French Canadian preferences without coupling the interface and content choices", async () => {
  vi.resetModules();
  const saved = new Map<string, string>();
  vi.stubGlobal("navigator", { languages: ["fr-CA"], language: "fr-CA" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  });
  const prefs = await import("@/i18n/preferences");
  expect(prefs.interfaceLanguage.value).toBe("fr");
  expect(prefs.region.value).toBe("CA");
  prefs.interfaceLanguage.value = "en";
  expect(prefs.contentLanguage.value).toBe("fr");
  expect(JSON.parse(saved.get("flix.preferences.language.interface")!)).toBe(
    "en",
  );
});
it("rejects unsupported saved values and continues when browser storage is blocked", async () => {
  vi.resetModules();
  vi.stubGlobal("navigator", { language: "en-US" });
  vi.stubGlobal("localStorage", {
    getItem: () => '"invalid"',
    setItem: () => {
      throw new Error("blocked");
    },
  });
  const prefs = await import("@/i18n/preferences");
  expect(prefs.interfaceLanguage.value).toBe("en");
  expect(prefs.region.value).toBe("US");
  expect(() => {
    prefs.interfaceLanguage.value = "fr";
  }).not.toThrow();
});
