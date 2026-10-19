import {
  CheckCircle2,
  CircleDashed,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Plus,
  Trash2,
  TriangleAlert,
  UserCircle2,
} from "lucide-react";
import { useState } from "react";
import { useContextActionsMenu } from "@/lib/use-context-actions-menu";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountStorageKey, sameUserRef } from "@/lib/account-storage";
import {
  getActiveAccount,
  getActiveAccountAuth,
  useAuthStore,
} from "@/lib/auth-store";
import { useRunelinkConnectionStore } from "@/lib/runelink-connection-store";

type ProfileSelectorProps = {
  onManageAccounts: () => void;
  onSelectAccount: () => void;
};

const statusLabels = {
  disconnected: "Offline",
  connecting: "Connecting",
  reconnecting: "Reconnecting",
  unauthenticated: "Unauthenticated",
  authenticating: "Authenticating",
  connected: "Connected",
};

export function ProfileSelector({
  onManageAccounts,
  onSelectAccount,
}: ProfileSelectorProps) {
  const contextMenu = useContextActionsMenu();
  const [openActionsKey, setOpenActionsKey] = useState<string | null>(null);
  const accounts = useAuthStore((state) => state.config.accounts);
  const accountAuthByKey = useAuthStore((state) => state.authCache.accounts);
  const activeAccount = useAuthStore(getActiveAccount);
  const activeAuth = useAuthStore(getActiveAccountAuth);
  const openAccount = useAuthStore((state) => state.openAccount);
  const logoutActive = useAuthStore((state) => state.logoutActive);
  const removeAccount = useAuthStore((state) => state.removeAccount);
  const connectionStatus = useRunelinkConnectionStore((state) => state.status);
  const unsupportedCapabilities = useRunelinkConnectionStore(
    (state) => state.unsupportedCapabilities
  );
  const incompatibleHost = useRunelinkConnectionStore(
    (state) => state.incompatibleHost
  );
  const isLimited =
    connectionStatus === "connected" && unsupportedCapabilities.length > 0;
  const warning = incompatibleHost
    ? {
        label: "Incompatible host",
        detail: incompatibleHost,
        color: "text-destructive",
      }
    : isLimited
      ? {
          label: "Connected (limited)",
          detail: `${activeAccount?.host} doesn't support ${unsupportedCapabilities.join(", ")}`,
          color: "text-amber-500",
        }
      : null;
  const warningIcon = warning ? (
    <TriangleAlert className={warning.color} />
  ) : null;

  const activeKey = activeAccount ? accountStorageKey(activeAccount) : "";
  const triggerLabel = activeAccount?.name.slice(0, 2).toUpperCase() ?? "AC";

  return (
    <DropdownMenu {...contextMenu.menuProps}>
      <DropdownMenuTrigger
        {...contextMenu.targetProps}
        render={
          <Button
            variant="outline"
            className="relative size-12 rounded-2xl p-0"
            title={[
              activeAccount
                ? `${activeAccount.name}@${activeAccount.host}`
                : "Account",
              warning?.label,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        }
      >
        {activeAccount ? (
          <span className="text-sm font-semibold">{triggerLabel}</span>
        ) : (
          <UserCircle2 className="size-7" />
        )}
        {warning ? (
          <span
            className={`border-background absolute top-1 right-1 size-2.5 rounded-full border-2 bg-current ${warning.color}`}
            aria-hidden
          />
        ) : null}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="right"
        align="end"
        sideOffset={4}
        className="w-64"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {activeAccount
              ? `${activeAccount.name}@${activeAccount.host}`
              : "Accounts"}
          </DropdownMenuLabel>

          {activeAccount ? (
            // Warnings stay readable instead of dimmed like other status text.
            <DropdownMenuItem
              disabled
              className={warning ? "data-disabled:opacity-100" : undefined}
            >
              {!activeAuth ? (
                <CircleDashed />
              ) : (
                (warningIcon ?? <CheckCircle2 />)
              )}
              <div className="flex min-w-0 flex-col">
                <span>
                  {!activeAuth
                    ? "Login required"
                    : (warning?.label ?? statusLabels[connectionStatus])}
                </span>
                {activeAuth && warning ? (
                  <span className="text-muted-foreground text-xs wrap-anywhere">
                    {warning.detail}
                  </span>
                ) : null}
              </div>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {accounts.length > 0 ? (
          <DropdownMenuRadioGroup value={activeKey}>
            {accounts.map((account) => {
              const key = accountStorageKey(account);
              const storedAuth = accountAuthByKey[key];
              const isActive = sameUserRef(account, activeAccount);
              const isLoggedIn =
                isActive && connectionStatus === "connected" && !!storedAuth;
              const isChecking =
                isActive &&
                (connectionStatus === "connecting" ||
                  connectionStatus === "authenticating" ||
                  connectionStatus === "reconnecting");

              return (
                <DropdownMenuRadioItem
                  key={key}
                  value={key}
                  className={[
                    "group/account hover:bg-accent hover:text-accent-foreground hover:**:text-accent-foreground",
                    openActionsKey === key
                      ? "bg-accent text-accent-foreground **:text-accent-foreground"
                      : "",
                  ].join(" ")}
                  onClick={(event) => {
                    setOpenActionsKey(null);
                    event.currentTarget.blur();
                    onSelectAccount();
                    openAccount(account);
                  }}
                >
                  {isActive && warning ? (
                    <>
                      {warningIcon}
                      <span className="sr-only">{warning.label}</span>
                    </>
                  ) : isLoggedIn ? (
                    <CheckCircle2 />
                  ) : isChecking ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <CircleDashed />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{account.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {account.host}
                    </span>
                  </div>
                  <DropdownMenu
                    open={openActionsKey === key}
                    onOpenChange={(open) => {
                      setOpenActionsKey(open ? key : null);
                    }}
                  >
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          className={[
                            "bg-accent text-accent-foreground absolute right-1 size-6 items-center justify-center rounded-sm",
                            openActionsKey === key
                              ? "flex"
                              : "hidden group-hover/account:flex group-focus-within/account:flex",
                          ].join(" ")}
                          aria-label={`Account actions for ${account.name}@${account.host}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => event.stopPropagation()}
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      side="right"
                      align="start"
                      className="w-52"
                    >
                      <DropdownMenuItem
                        variant="destructive"
                        className="whitespace-nowrap"
                        onClick={(event) => {
                          event.stopPropagation();
                          removeAccount(account);
                        }}
                      >
                        <Trash2 />
                        Remove saved account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        ) : (
          <DropdownMenuItem disabled>No stored accounts yet</DropdownMenuItem>
        )}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onManageAccounts}>
          <Plus />
          Add or log in account
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={logoutActive}
          disabled={!activeAccount || !activeAuth}
        >
          <LogOut />
          Log out current account
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
