import { useEffect, useMemo, useState } from "react";
import { AuthScreen } from "@/components/AuthScreen";
import { Sidebar } from "@/components/Sidebar";
import {
  getActiveAccount,
  getActiveAccountAuth,
  useAuthStore,
} from "@/lib/auth-store";
import { initializeRunelinkConnectionStore } from "@/lib/runelink-connection-store";

export function App() {
  const [isManagingAccounts, setIsManagingAccounts] = useState(false);
  const [manageSessionId, setManageSessionId] = useState(0);
  const [shouldPrefillAccount, setShouldPrefillAccount] = useState(true);
  const [manageOriginAccountKey, setManageOriginAccountKey] = useState<
    string | null
  >(null);
  const activeAccount = useAuthStore(getActiveAccount);
  const activeAuth = useAuthStore(getActiveAccountAuth);
  const activeAccountKey = activeAccount
    ? `${activeAccount.name}@${activeAccount.host}`
    : null;

  useEffect(() => {
    initializeRunelinkConnectionStore();
  }, []);

  const switchedToReadyAccount =
    isManagingAccounts &&
    !!activeAccount &&
    !!activeAuth &&
    activeAccountKey !== manageOriginAccountKey;

  const shouldShowAuthScreen = useMemo(() => {
    return (isManagingAccounts && !switchedToReadyAccount) || !activeAccount || !activeAuth;
  }, [activeAccount, activeAuth, isManagingAccounts, switchedToReadyAccount]);

  return (
    <div className="flex min-h-screen bg-[radial-gradient(circle_at_top,_color-mix(in_oklab,var(--color-primary)_10%,transparent),transparent_35%),linear-gradient(180deg,color-mix(in_oklab,var(--color-muted)_45%,white),transparent_30%)]">
      <Sidebar
        onManageAccounts={() => {
          setManageOriginAccountKey(activeAccountKey);
          setShouldPrefillAccount(false);
          setManageSessionId((value) => value + 1);
          setIsManagingAccounts(true);
        }}
        onSelectAccount={() => {
          setShouldPrefillAccount(true);
          setManageSessionId((value) => value + 1);
          setIsManagingAccounts(true);
        }}
      />

      <main className="flex min-h-screen flex-1">
        {shouldShowAuthScreen ? (
          <AuthScreen
            key={
              `${manageSessionId}:${activeAccount ? `${activeAccount.name}@${activeAccount.host}` : "no-account"}`
            }
            canClose={!!activeAccount && !!activeAuth}
            prefillAccount={shouldPrefillAccount}
            onDone={() => {
              setIsManagingAccounts(false);
              setManageOriginAccountKey(null);
              setShouldPrefillAccount(true);
            }}
          />
        ) : (
          <div className="flex-1" />
        )}
      </main>
    </div>
  );
}

export default App;
