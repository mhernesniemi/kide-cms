import { getCookie } from "./cookies";

const COOKIE = "kide_locale";

/** The language the editor last worked in; documents and lists open in it when they can. */
export const getWorkingLocale = (request: Request, locales: string[]): string | undefined => {
  const value = getCookie(request, COOKIE);
  return value && locales.includes(value) ? value : undefined;
};

export const workingLocaleCookie = (locale: string) =>
  `${COOKIE}=${encodeURIComponent(locale)}; Path=/admin; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
