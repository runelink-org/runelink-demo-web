import type { ComponentPropsWithRef } from "react";
import { supportsBrowserTabs } from "@/lib/constants";

type NavigationLinkProps = Omit<
  ComponentPropsWithRef<"a">,
  "onClick" | "onAuxClick"
> & {
  onNavigate: () => void;
};

export function NavigationLink({ onNavigate, ...props }: NavigationLinkProps) {
  return (
    <a
      {...props}
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
    />
  );
}
