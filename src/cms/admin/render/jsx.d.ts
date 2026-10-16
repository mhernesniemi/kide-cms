import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "kide-island": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        ssr?: string;
        component: string;
        prefix: string;
        props: string;
      };
      "kide-slot": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
