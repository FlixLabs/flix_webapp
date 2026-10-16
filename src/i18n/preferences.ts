import { computed } from "vue";
import { usePersistentPreference } from "@/composables/usePersistentPreference";

export type InterfaceLanguage = "en" | "fr";
export type ContentLanguage = InterfaceLanguage | "original";
const browserLanguage =
  typeof navigator === "undefined"
    ? "en-US"
    : navigator.languages?.[0] || navigator.language || "en-US";
const detectedLanguage: InterfaceLanguage = /^fr(?:-|$)/i.test(browserLanguage)
  ? "fr"
  : "en";
export const interfaceLanguage = usePersistentPreference<InterfaceLanguage>(
  "language.interface",
  detectedLanguage,
  (value): value is InterfaceLanguage => value === "en" || value === "fr",
);
export const contentLanguage = usePersistentPreference<ContentLanguage>(
  "language.content",
  detectedLanguage,
  (value): value is ContentLanguage =>
    value === "en" || value === "fr" || value === "original",
);
export const regionCodes =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
const isRegion = (value: unknown): value is string =>
  typeof value === "string" && regionCodes.includes(value);
let detectedRegion = detectedLanguage === "fr" ? "FR" : "US";
try {
  const country = new Intl.Locale(browserLanguage).maximize().region;
  if (isRegion(country)) detectedRegion = country;
} catch {
  /* Unsupported browser locale. */
}
export const region = usePersistentPreference(
  "language.region",
  detectedRegion,
  isRegion,
);
export const formatLocale = computed(
  () => `${interfaceLanguage.value}-${region.value}`,
);
export const metadataLocale = computed(() =>
  contentLanguage.value === "original"
    ? "original"
    : `${contentLanguage.value}-${region.value}`,
);
export const metadataContext = computed(
  () => `${metadataLocale.value}:${region.value}`,
);
export const weekStart = computed(() => {
  const locale = new Intl.Locale(formatLocale.value) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  const info = locale.getWeekInfo?.() ?? locale.weekInfo;
  return info
    ? info.firstDay % 7
    : ["US", "CA", "JP", "PH"].includes(region.value)
      ? 0
      : 1;
});
export const weekdays = computed(() =>
  Array.from({ length: 7 }, (_, day) => (weekStart.value + day) % 7),
);
