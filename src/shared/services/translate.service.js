import { Logger } from '../../config/logger.js';
import { config } from '../../config/config.js';

const log = new Logger('TranslateService');

export const SUPPORTED_LOCALES = ['en', 'nl'];
export const SOURCE_LOCALE = 'en';
const TRANSLATE_URL = 'https://translation.googleapis.com/language/translate/v2';
const PLACEHOLDER_PATTERN = /\{\{[^}]+\}\}/g;

function getApiKey() {
  return config.GOOGLE_TRANSLATE_API_KEY || process.env.GOOGLE_TRANSLATE_API_KEY;
}

function protectPlaceholders(text) {
  const placeholders = [];
  const protectedText = String(text).replace(PLACEHOLDER_PATTERN, (match) => {
    const token = `__PH_${placeholders.length}__`;
    placeholders.push(match);
    return token;
  });
  return { protectedText, placeholders };
}

function restorePlaceholders(text, placeholders) {
  let restored = String(text);
  placeholders.forEach((placeholder, index) => {
    restored = restored.split(`__PH_${index}__`).join(placeholder);
  });
  return restored;
}

export function normalizeLocale(value) {
  if (!value) return SOURCE_LOCALE;
  const short = String(value).toLowerCase().split(/[-_,]/)[0].trim();
  if (short === 'nl' || short === 'nld' || short === 'dutch') return 'nl';
  if (short === 'en' || short === 'eng' || short === 'english') return 'en';
  return SOURCE_LOCALE;
}

export function isI18nObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  return keys.every((key) => SUPPORTED_LOCALES.includes(key));
}

export function isI18nArrayObject(value) {
  return isI18nObject(value) && SUPPORTED_LOCALES.some((locale) => Array.isArray(value[locale]));
}

export function pickSourceText(value, preferredLocale = SOURCE_LOCALE) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (!isI18nObject(value)) return '';
  return (
    value[preferredLocale]?.toString?.().trim() ||
    value.en?.toString?.().trim() ||
    value.nl?.toString?.().trim() ||
    Object.values(value).find((entry) => typeof entry === 'string' && entry.trim()) ||
    ''
  );
}

export async function translateText(text, targetLocale, sourceLocale = SOURCE_LOCALE, { html = false } = {}) {
  if (!text || targetLocale === sourceLocale) return text;

  const apiKey = getApiKey();
  if (!apiKey) {
    log.warn('GOOGLE_TRANSLATE_API_KEY not set — skipping translation');
    return text;
  }

  const { protectedText, placeholders } = protectPlaceholders(text);

  try {
    const response = await fetch(`${TRANSLATE_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        q: protectedText,
        source: sourceLocale,
        target: targetLocale,
        format: html ? 'html' : 'text',
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      log.error(`Translate API error [${sourceLocale}→${targetLocale}]: ${err}`);
      return text;
    }

    const data = await response.json();
    const translated = data?.data?.translations?.[0]?.translatedText ?? text;
    return restorePlaceholders(translated, placeholders);
  } catch (error) {
    log.error(`translateText failed [${targetLocale}]: ${error.message}`);
    return text;
  }
}

export async function translatePair(text, sourceLocale = SOURCE_LOCALE, { html = false } = {}) {
  const source = normalizeLocale(sourceLocale);
  const target = source === 'en' ? 'nl' : 'en';
  const translated = await translateText(text, target, source, { html });
  return source === 'en'
    ? { en: text, nl: translated }
    : { nl: text, en: translated };
}

export async function expandI18n(value, { html = false, sourceLocale = SOURCE_LOCALE } = {}) {
  if (value == null || value === '') return null;

  if (typeof value === 'string') {
    return translatePair(value.trim(), sourceLocale, { html });
  }

  if (isI18nArrayObject(value) || Array.isArray(value)) {
    return expandI18nArray(value, { sourceLocale, html });
  }

  if (typeof value === 'object') {
    const en = typeof value.en === 'string' ? value.en.trim() : '';
    const nl = typeof value.nl === 'string' ? value.nl.trim() : '';

    if (en && nl) return { en, nl };
    if (en) {
      const translated = await translateText(en, 'nl', 'en', { html });
      return { en, nl: translated };
    }
    if (nl) {
      const translated = await translateText(nl, 'en', 'nl', { html });
      return { en: translated, nl };
    }
  }

  return value;
}

export async function expandI18nArray(value, { sourceLocale = SOURCE_LOCALE, html = false } = {}) {
  if (!value) return { en: [], nl: [] };

  if (Array.isArray(value)) {
    const items = await Promise.all(value.map((item) => expandI18n(String(item), { sourceLocale, html })));
    return {
      en: items.map((item) => item?.en || ''),
      nl: items.map((item) => item?.nl || ''),
    };
  }

  const enArr = Array.isArray(value.en) ? value.en : [];
  const nlArr = Array.isArray(value.nl) ? value.nl : [];

  if (enArr.length && nlArr.length) return { en: enArr, nl: nlArr };

  if (enArr.length) {
    const nl = await Promise.all(enArr.map((item) => translateText(String(item), 'nl', 'en', { html })));
    return { en: enArr, nl };
  }

  if (nlArr.length) {
    const en = await Promise.all(nlArr.map((item) => translateText(String(item), 'en', 'nl', { html })));
    return { en, nl: nlArr };
  }

  return { en: [], nl: [] };
}

export function t(i18nJson, locale = SOURCE_LOCALE) {
  if (i18nJson == null) return '';
  if (typeof i18nJson === 'string') return i18nJson;
  if (!isI18nObject(i18nJson)) return '';

  const resolved = normalizeLocale(locale);
  return (
    (typeof i18nJson[resolved] === 'string' && i18nJson[resolved]) ||
    i18nJson.en ||
    i18nJson.nl ||
    Object.values(i18nJson).find((entry) => typeof entry === 'string' && entry) ||
    ''
  );
}

export function localizeArrayField(arrayObj, locale = SOURCE_LOCALE) {
  if (!arrayObj) return [];
  if (Array.isArray(arrayObj)) return arrayObj;
  if (!isI18nArrayObject(arrayObj)) return [];

  const resolved = normalizeLocale(locale);
  const result = arrayObj[resolved] || arrayObj.en || arrayObj.nl || [];
  return Array.isArray(result) ? result : [];
}

export function jsonLocaleSearch(fields, search) {
  if (!search?.trim()) return [];
  const term = search.trim();
  return fields.flatMap((field) => [
    { [field]: { path: ['en'], string_contains: term } },
    { [field]: { path: ['nl'], string_contains: term } },
  ]);
}

export function localizeTree(value, locale = SOURCE_LOCALE) {
  if (value == null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (typeof value.toNumber === 'function') return value;
  if (Array.isArray(value)) return value.map((item) => localizeTree(item, locale));

  if (isI18nArrayObject(value)) return localizeArrayField(value, locale);
  if (isI18nObject(value)) return t(value, locale);

  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (key.endsWith('I18n')) {
      result[key] = nested;
      continue;
    }
    if (isI18nArrayObject(nested)) {
      result[key] = localizeArrayField(nested, locale);
      result[`${key}I18n`] = nested;
    } else if (isI18nObject(nested)) {
      result[key] = t(nested, locale);
      result[`${key}I18n`] = nested;
    } else {
      result[key] = localizeTree(nested, locale);
    }
  }
  return result;
}
