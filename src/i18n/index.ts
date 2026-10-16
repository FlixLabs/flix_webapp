import { createI18n } from "vue-i18n";
import { watch } from "vue";
import en from "./en.json";
import fr from "./fr.json";
import { interfaceLanguage, formatLocale } from "./preferences";
export * from "./preferences";

export const i18n = createI18n({
  legacy: false,
  locale: interfaceLanguage.value,
  fallbackLocale: "en",
  messages: { en, fr },
  missingWarn: false,
  fallbackWarn: false,
  messageResolver: (messages, key) =>
    Object.prototype.hasOwnProperty.call(messages, key)
      ? (messages as Record<string, string>)[key]!
      : null,
  pluralRules: {
    fr: (choice, length) =>
      length === 2
        ? new Intl.PluralRules("fr").select(choice) === "one"
          ? 0
          : 1
        : choice === 0
          ? 0
          : choice === 1
            ? 1
            : 2,
  },
});
watch(
  interfaceLanguage,
  (value) => {
    i18n.global.locale.value = value;
    if (typeof document !== "undefined" && document.documentElement)
      document.documentElement.lang = value;
  },
  { immediate: true, flush: "sync" },
);

const catalog = en as Record<string, string>;
const eventLabels: Record<string, string> = {
  grabbed: "Release grabbed",
  downloadFolderImported: "File imported",
  downloadFailed: "Download failed",
  movieFileDeleted: "File deleted",
  episodeFileDeleted: "File deleted",
  movieFileRenamed: "File renamed",
  episodeFileRenamed: "File renamed",
  downloadIgnored: "Download ignored",
};
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.keys(en)
  .filter((key) => /\{\w+\}/.test(key))
  .map((key) => {
    const names = [...key.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!);
    return {
      key,
      names,
      regex: new RegExp(
        `^${key
          .split(/\{\w+\}/)
          .map(escape)
          .join("(.*?)")}$`,
      ),
    };
  })
  .sort((a, b) => b.key.length - a.key.length);

/** Source messages stay readable; the resolver treats punctuation as literal keys. */
export function t(
  source: unknown,
  values: Record<string, unknown> = {},
): string {
  if (source == null) return "";
  const text = String(source);
  if (eventLabels[text]) return t(eventLabels[text], values);
  // Track the locale even for service messages without a known translation.
  void i18n.global.locale.value;
  if (Object.prototype.hasOwnProperty.call(catalog, text)) {
    const count = values.count ?? values.p0;
    const options = typeof count === "number" ? { plural: count } : {};
    return i18n.global.t(text, values, options);
  }
  const serviceError = /^(Radarr|Sonarr|TMDB|Flix API): (.+)$/s.exec(text);
  if (serviceError) {
    const separator = interfaceLanguage.value === "fr" ? " : " : ": ";
    return `${t(serviceError[1])}${separator}${t(serviceError[2])}`;
  }
  for (const pattern of patterns) {
    const match = pattern.regex.exec(text);
    if (match)
      return t(
        pattern.key,
        Object.fromEntries(
          pattern.names.map((name, index) => [name, match[index + 1]]),
        ),
      );
  }
  return text;
}
export function translatedChoices(
  items: readonly string[],
): { title: string; value: string }[];
export function translatedChoices<T extends { title?: string; label?: string }>(
  items: readonly T[],
): T[];
export function translatedChoices(
  items: readonly (string | { title?: string; label?: string })[],
) {
  return items.map((item) =>
    typeof item === "string"
      ? { title: t(item), value: item }
      : {
          ...item,
          ...(item.title ? { title: t(item.title) } : {}),
          ...(item.label ? { label: t(item.label) } : {}),
        },
  );
}
export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions = {},
) {
  return new Intl.NumberFormat(formatLocale.value, options).format(value);
}
export function decimal(value: number, digits = 2) {
  return formatNumber(value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}
export function formatDate(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  },
) {
  if (value == null) return t("Date not provided");
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00`)
      : new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat(formatLocale.value, options).format(date)
    : t("Date not provided");
}
