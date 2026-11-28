import { ChosenPresenceStatusSchema } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Cog, MonitorSmartphone, Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRESENCE_STATUS_DISPLAY } from "@/components/members/member-display";
import { useAtomValue } from "@effect/atom-react";
import { presenceAtom, updateChosenPresenceStatus } from "@/lib/presence-store";
import { sameUserRef } from "@/lib/account-storage";
import { authAtom, getActiveAccount } from "@/lib/auth-store";
import { connectionAtom } from "@/lib/runelink-session";
import { runPromise } from "@/lib/runtime";
import { cn } from "@/lib/utils";
import { toastFailure } from "@/lib/toast-failure";
import {
  initializeThemeStore,
  resolveTheme,
  setSelectedTheme,
  themeAtom,
} from "@/lib/theme";

const isChosenPresenceStatus = Schema.is(ChosenPresenceStatusSchema);

function chooseStatus(status: unknown): void {
  if (!isChosenPresenceStatus(status)) return;
  void runPromise(
    updateChosenPresenceStatus(status).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          toastFailure("Couldn't change your status", error);
        })
      )
    )
  );
}

// Hidden on hosts without statuses, and disabled until the host sends the
// current one.
function PresenceStatusItems() {
  const chosenStatus = useAtomValue(
    presenceAtom,
    (state) => state.chosenStatus
  );
  // The active account's socket, not one it is switching away from
  const connectedAccount = useAtomValue(
    connectionAtom,
    (state) => state.connectedAccount
  );
  const activeAccount = useAtomValue(authAtom, getActiveAccount);
  const canChoose =
    connectedAccount !== null && sameUserRef(connectedAccount, activeAccount);
  const isSupported = useAtomValue(
    connectionAtom,
    (state) =>
      !state.capabilityIssues.some(
        (issue) => issue.capability === "presence.status"
      )
  );
  if (!isSupported) return null;

  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuRadioGroup
        value={chosenStatus ?? ""}
        onValueChange={chooseStatus}
      >
        {ChosenPresenceStatusSchema.literals.map((status) => {
          const display = PRESENCE_STATUS_DISPLAY[status];
          return (
            <DropdownMenuRadioItem
              key={status}
              value={status}
              disabled={!canChoose || chosenStatus === null}
              closeOnClick={false}
              className="cursor-pointer gap-3 rounded-xl px-3 py-2"
            >
              <display.Icon className={cn("size-4", display.className)} />
              <span className="font-medium">{display.label}</span>
            </DropdownMenuRadioItem>
          );
        })}
      </DropdownMenuRadioGroup>
    </>
  );
}

export function ServerRailSettingsMenu() {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const contextMenu = useContextActionsMenu();
  const isMenuOpen = contextMenu.menuProps.open;
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const selectedTheme = useAtomValue(themeAtom, (state) => state.selectedTheme);
  const systemTheme = useAtomValue(themeAtom, (state) => state.systemTheme);

  const effectiveTheme = resolveTheme(selectedTheme, systemTheme);
  const isFollowingSystem = selectedTheme === "system";

  useEffect(() => {
    initializeThemeStore();
  }, []);

  useEffect(() => {
    if (!isTooltipVisible) return undefined;

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
    if (isMenuOpen) return;

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
      <DropdownMenu {...contextMenu.menuProps}>
        <DropdownMenuTrigger
          {...contextMenu.targetProps}
          render={<button type="button" aria-label="Settings" />}
        >
          <span
            ref={triggerRef}
            className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-sidebar-border bg-sidebar-accent text-sidebar-foreground transition hover:border-sidebar-foreground/35 hover:bg-sidebar-accent/80"
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
              <span className="font-medium">Match System Theme</span>
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
              <span className="font-medium">Dark Mode</span>
            </DropdownMenuCheckboxItem>
          </DropdownMenuGroup>

          <PresenceStatusItems />
        </DropdownMenuContent>
      </DropdownMenu>

      {isTooltipVisible &&
      !isMenuOpen &&
      tooltipPosition &&
      typeof document !== "undefined"
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
