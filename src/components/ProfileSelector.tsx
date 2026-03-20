import {
  CheckCircle2,
  CircleDashed,
  LogOut,
  Plus,
  UserCircle2,
} from "lucide-react";
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
import { accountStorageKey } from "@/lib/account-storage";
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
  authenticating: "Authenticating",
  connected: "Connected",
};

export function ProfileSelector({
  onManageAccounts,
  onSelectAccount,
}: ProfileSelectorProps) {
  const accounts = useAuthStore((state) => state.config.accounts);
  const activeAccount = useAuthStore(getActiveAccount);
  const activeAuth = useAuthStore(getActiveAccountAuth);
  const openAccount = useAuthStore((state) => state.openAccount);
  const logoutActive = useAuthStore((state) => state.logoutActive);
  const connectionStatus = useRunelinkConnectionStore((state) => state.status);

  const activeKey = activeAccount ? accountStorageKey(activeAccount) : "";
  const triggerLabel = activeAccount?.name.slice(0, 2).toUpperCase() ?? "AC";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            className="size-12 rounded-2xl p-0"
            title={
              activeAccount
                ? `${activeAccount.name}@${activeAccount.host}`
                : "Account"
            }
          />
        }
      >
        {activeAccount ? (
          <span className="text-sm font-semibold">{triggerLabel}</span>
        ) : (
          <UserCircle2 className="size-7" />
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent side="right" align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {activeAccount
              ? `${activeAccount.name}@${activeAccount.host}`
              : "Accounts"}
          </DropdownMenuLabel>

          {activeAccount ? (
            <DropdownMenuItem disabled>
              {activeAuth ? <CheckCircle2 /> : <CircleDashed />}
              {activeAuth ? statusLabels[connectionStatus] : "Stored account"}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        {accounts.length > 0 ? (
          <DropdownMenuRadioGroup value={activeKey}>
            {accounts.map((account) => {
              const key = accountStorageKey(account);

              return (
                <DropdownMenuRadioItem
                  key={key}
                  value={key}
                  onClick={() => {
                    onSelectAccount();
                    openAccount(account);
                  }}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{account.name}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {account.host}
                    </span>
                  </div>
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
