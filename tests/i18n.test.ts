import { afterEach, expect, it } from "vitest";
import { computed } from "vue";
import {
  t,
  interfaceLanguage,
  contentLanguage,
  region,
  decimal,
  formatNumber,
  formatDate,
  translatedChoices,
  weekStart,
} from "@/i18n";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";
import { calendarRange, calendarDay } from "@/composables/useCalendar";

afterEach(() => {
  interfaceLanguage.value = "en";
  contentLanguage.value = "en";
  region.value = "US";
});
it("has matching catalogs and matching interpolation parameters for every message", () => {
  expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort());
  const params = (s: string) =>
    [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    expect(fr[key].trim(), key).not.toBe("");
    expect(params(fr[key]), key).toEqual(params(en[key]));
  }
});
it("switches existing reactive labels and errors without changing user-provided text", () => {
  const label = computed(() => t("Movies"));
  expect(label.value).toBe("Movies");
  interfaceLanguage.value = "fr";
  expect(label.value).toBe("Films");
  expect(t("Unable to load data (HTTP 503).")).toContain(
    "Impossible de charger",
  );
  expect(t("A.Custom.Release.2026")).toBe("A.Custom.Release.2026");
  expect(t("Download missing ({p0})", { p0: 2 })).toBe(
    "Télécharger les films manquants (2)",
  );
});
it("formats dates, counts and decimals using the chosen locale and region", () => {
  interfaceLanguage.value = "fr";
  region.value = "FR";
  expect(decimal(1.25)).toBe("1,25");
  expect(formatNumber(1234)).toMatch(/1\s234/);
  expect(formatDate("2026-10-15", { dateStyle: "short" })).toBe("15/10/2026");
  expect(weekStart.value).toBe(1);
  const range = calendarRange("2026-10-15", "week", weekStart.value);
  expect(calendarDay(range.start)).toBe("2026-10-12");
  region.value = "US";
  expect(weekStart.value).toBe(0);
});
it("handles plurals without mutating select values or the content-language preference", () => {
  contentLanguage.value = "original";
  interfaceLanguage.value = "fr";
  expect(t("{p0} films", { p0: 1 })).toBe("1 film");
  expect(t("{p0} films", { p0: 2 })).toBe("2 films");
  expect(translatedChoices([{ title: "Movies", value: "movies" }])).toEqual([
    { title: "Films", value: "movies" },
  ]);
  expect(contentLanguage.value).toBe("original");
});
it('translates known API failures and prefixed service errors without dropping diagnostics', () => {
  interfaceLanguage.value = 'fr';
  expect(t('Wrong username or password.')).toBe('Nom d’utilisateur ou mot de passe incorrect.');
  expect(t('Radarr: Access denied (HTTP 401). Check the credentials.')).toContain('Radarr : Accès refusé (HTTP 401)');
});
