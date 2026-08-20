import { normalizeLocale, SOURCE_LOCALE } from '../../services/translate.service.js';

export function localeMiddleware(req, _res, next) {
  const header = req.headers['accept-language'];
  const queryLang = req.query?.lang || req.query?.locale;

  req.locale = normalizeLocale(queryLang || header || SOURCE_LOCALE);
  next();
}
