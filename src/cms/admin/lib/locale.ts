import type { AstroCookies } from "astro";

const COOKIE = "kide_locale";

/** The language the editor last worked in; documents and lists open in it when they can. */
export const getWorkingLocale = (cookies: AstroCookies, locales: string[]): string | undefined => {
  const value = cookies.get(COOKIE)?.value;
  return value && locales.includes(value) ? value : undefined;
};

export const setWorkingLocale = (cookies: AstroCookies, locale: string) => {
  cookies.set(COOKIE, locale, { path: "/admin", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
};
