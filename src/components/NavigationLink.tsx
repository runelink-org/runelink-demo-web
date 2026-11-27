import type { ComponentPropsWithRef } from "react";
import { supportsBrowserTabs } from "@/lib/constants";

type NavigationLinkProps = Omit<
  ComponentPropsWithRef<"a">,
  "onClick" | "onAuxClick" | "href"
> & {
  href: string;
  onNavigate: () => void;
};

export function NavigationLink({
  onNavigate,
  children,
  href,
  ...props
}: NavigationLinkProps) {
  return (
    <a
      {...props}
      href={href}
      draggable={false}
      onClick={(event) => {
        if (event.defaultPrevented) return;
        if (
          supportsBrowserTabs &&
          (event.button !== 0 ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey ||
            event.altKey)
        ) {
          return;
        }
        event.preventDefault();
        onNavigate();
      }}
      onAuxClick={(event) => {
        if (event.defaultPrevented) return;
        if (!supportsBrowserTabs && event.button === 1) {
          event.preventDefault();
          onNavigate();
        }
      }}
    >
      {children}
    </a>
  );
}
