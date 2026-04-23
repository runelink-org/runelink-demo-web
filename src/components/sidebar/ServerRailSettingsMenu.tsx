import { Cog, MonitorSmartphone, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initializeThemeStore, resolveTheme, useThemeStore } from "@/lib/theme";

export function ServerRailSettingsMenu() {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const selectedTheme = useThemeStore((state) => state.selectedTheme);
  const systemTheme = useThemeStore((state) => state.systemTheme);
  const setSelectedTheme = useThemeStore((state) => state.setSelectedTheme);

  const effectiveTheme = resolveTheme(selectedTheme, systemTheme);
  const isFollowingSystem = selectedTheme === "system";

  useEffect(() => {
    initializeThemeStore();
  }, []);

  useEffect(() => {
    if (!isTooltipVisible) {
      return;
    }

    function updateTooltipPosition() {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      setTooltipPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 12,
      });
    }

    updateTooltipPosition();

    window.addEventListener("scroll", updateTooltipPosition, true);
    window.addEventListener("resize", updateTooltipPosition);

    return () => {
      window.removeEventListener("scroll", updateTooltipPosition, true);
      window.removeEventListener("resize", updateTooltipPosition);
    };
  }, [isTooltipVisible]);

  function showTooltip() {
    if (isMenuOpen) {
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    setTooltipPosition({
      top: rect.top + rect.height / 2,
      left: rect.right + 12,
    });
    setIsTooltipVisible(true);
  }

  function hideTooltip() {
    setIsTooltipVisible(false);
  }

  return (
    <>
      <DropdownMenu
        open={isMenuOpen}
        onOpenChange={(open) => {
          setIsMenuOpen(open);
          if (open) {
            setIsTooltipVisible(false);
          }
        }}
      >
        <DropdownMenuTrigger render={<button type="button" />}>
          <span
            ref={triggerRef}
            className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground transition hover:border-sidebar-foreground/35 hover:bg-sidebar-accent/80"
            aria-label="Settings"
            onMouseEnter={showTooltip}
            onMouseLeave={hideTooltip}
          >
            <Cog className="size-5" />
          </span>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="right"
          align="end"
          sideOffset={10}
          className="w-72 rounded-2xl p-2"
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-3 py-2 text-xs uppercase">
              Settings
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuCheckboxItem
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              checked={isFollowingSystem}
              onCheckedChange={(checked) => {
                setSelectedTheme(checked ? "system" : effectiveTheme);
              }}
            >
              <MonitorSmartphone className="size-4" />
              <span className="font-medium">Match system theme</span>
            </DropdownMenuCheckboxItem>

            <DropdownMenuCheckboxItem
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
              checked={effectiveTheme === "dark"}
              onCheckedChange={(checked) => {
                setSelectedTheme(checked ? "dark" : "light");
              }}
            >
              {effectiveTheme === "dark" ? (
                <Moon className="size-4" />
              ) : (
                <Sun className="size-4" />
              )}
              <span className="font-medium">Dark mode</span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      {isTooltipVisible && tooltipPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[100] rounded-xl border border-sidebar-border/80 bg-sidebar px-4 py-3 shadow-lg shadow-black/8"
              style={{
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                transform: "translateY(-50%)",
              }}
            >
              <p className="whitespace-nowrap text-sm font-medium text-sidebar-foreground">
                Settings
              </p>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
