import type { ReactNode } from "react";
import { AdminAssets } from "../render/page";

const THEME_SCRIPT = `(function () {
  var t = localStorage.getItem("admin-theme") || "system";
  var dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  if (dark) document.documentElement.classList.add("dark");
})();`;

/** The centered single-card shell of the sign-in, setup, invite and password pages. */
export function AuthDocument({
  title,
  theme = false,
  children,
}: {
  title: string;
  theme?: boolean;
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="icon" href="/favicon.ico" />
        <title>{title}</title>
        {theme && <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />}
        <AdminAssets />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <div className="flex min-h-screen items-center justify-center px-4">
          <div className="w-full max-w-sm space-y-6">{children}</div>
        </div>
      </body>
    </html>
  );
}
