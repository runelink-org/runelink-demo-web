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
  X,
} from "lucide-react";
import type { UserRef } from "@runelink/sdk";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
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
  const [accountPendingDelete, setAccountPendingDelete] =
    useState<UserRef | null>(null);
  const accounts = useAuthStore((state) => state.config.accounts);
  const accountAuthByKey = useAuthStore((state) => state.authCache.accounts);
  const activeAccount = useAuthStore(getActiveAccount);
  const activeAuth = useAuthStore(getActiveAccountAuth);
  const openAccount = useAuthStore((state) => state.openAccount);
  const logoutActive = useAuthStore((state) => state.logoutActive);
  const removeAccount = useAuthStore((state) => state.removeAccount);
  const connectionStatus = useRunelinkConnectionStore((state) => state.status);
  const capabilityIssues = useRunelinkConnectionStore(
    (state) => state.capabilityIssues
  );
  const incompatibleHost = useRunelinkConnectionStore(
    (state) => state.incompatibleHost
  );
  const isLimited =
    connectionStatus === "connected" && capabilityIssues.length > 0;
  const warning = incompatibleHost
    ? {
        label: "Incompatible Host",
        detail: incompatibleHost,
        color: "text-destructive",
      }
    : isLimited
      ? {
          label: "Connected (Limited)",
          detail: `${activeAccount?.host}: ${capabilityIssues.map((issue) => issue.message).join("; ")}`,
          color: "text-amber-500",
        }
      : null;
  const warningIcon = warning ? (
    <TriangleAlert className={warning.color} />
  ) : null;

  const activeKey = activeAccount ? accountStorageKey(activeAccount) : "";

  // Close the dialog if its account loses its session or is removed.
  if (
    accountPendingDelete &&
    !accountAuthByKey[accountStorageKey(accountPendingDelete)]
  ) {
    setAccountPendingDelete(null);
  }

  function selectAccount(account: UserRef) {
    onSelectAccount();
    openAccount(account);
  }

  function handleDeleteAccount(account: UserRef) {
    contextMenu.closeMenu();
    if (!sameUserRef(account, activeAccount)) {
      selectAccount(account);
    }
    // Deleting requires a session, so the confirmation is only shown once
    // the account can be used, and never twice.
    if (accountAuthByKey[accountStorageKey(account)]) {
      setAccountPendingDelete(account);
    } else {
      toast("Log in to delete this account.");
    }
  }
  const triggerLabel = activeAccount?.name.slice(0, 2).toUpperCase() ?? "AC";

  return (
    <>
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
                      ? "Login Required"
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
                  <AccountMenuItem
                    key={key}
                    account={account}
                    icon={
                      isActive && warning ? (
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
                      )
                    }
                    onSelect={() => selectAccount(account)}
                    onRemove={() => removeAccount(account)}
                    onDelete={() => handleDeleteAccount(account)}
                  />
                );
              })}
            </DropdownMenuRadioGroup>
          ) : (
            <DropdownMenuItem disabled>No Stored Accounts Yet</DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={onManageAccounts}>
            <Plus />
            Add or Log In Account
          </DropdownMenuItem>

          <DropdownMenuItem
            onClick={logoutActive}
            disabled={!activeAccount || !activeAuth}
          >
            <LogOut />
            Log Out Current Account
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteAccountDialog
        account={accountPendingDelete}
        onOpenChange={(open) => {
          if (!open) setAccountPendingDelete(null);
        }}
      />
    </>
  );
}

type AccountMenuItemProps = {
  account: UserRef;
  icon: ReactNode;
  onSelect: () => void;
  onRemove: () => void;
  onDelete: () => void;
};

function AccountMenuItem({
  account,
  icon,
  onSelect,
  onRemove,
  onDelete,
}: AccountMenuItemProps) {
  const contextMenu = useContextActionsMenu();
  const isActionsOpen = contextMenu.menuProps.open;
  const label = `${account.name}@${account.host}`;

  return (
    <DropdownMenuRadioItem
      {...contextMenu.targetProps}
      value={accountStorageKey(account)}
      className={[
        "group/account hover:bg-accent hover:text-accent-foreground hover:**:text-accent-foreground",
        isActionsOpen
          ? "bg-accent text-accent-foreground **:text-accent-foreground"
          : "",
      ].join(" ")}
      onClick={(event) => {
        event.currentTarget.blur();
        onSelect();
      }}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{account.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {account.host}
        </span>
      </div>
      <DropdownMenu {...contextMenu.menuProps}>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              className={[
                "bg-accent text-accent-foreground absolute right-1 size-6 items-center justify-center rounded-sm",
                isActionsOpen
                  ? "flex"
                  : "hidden group-hover/account:flex group-focus-within/account:flex",
              ].join(" ")}
              aria-label={`Account actions for ${label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
            />
          }
        >
          <MoreHorizontal className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          anchor={contextMenu.anchor}
          side={contextMenu.anchor ? "bottom" : "right"}
          align="start"
          className="w-52"
        >
          <DropdownMenuItem
            className="whitespace-nowrap"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
          >
            <X />
            Remove Saved Account
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            className="whitespace-nowrap"
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 />
            Delete Account...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </DropdownMenuRadioItem>
  );
}
