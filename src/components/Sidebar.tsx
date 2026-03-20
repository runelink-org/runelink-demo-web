import { ProfileSelector } from "@/components/ProfileSelector";

type SidebarProps = {
  onManageAccounts: () => void;
  onSelectAccount: () => void;
};

export function Sidebar({ onManageAccounts, onSelectAccount }: SidebarProps) {
  return (
    <aside className="flex h-screen w-24 shrink-0 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <img
          src="/runelink_logo.jpg"
          alt="RuneLink"
          className="w-full rounded-2xl object-cover shadow-sm"
        />
        <p className="text-sm font-semibold tracking-tight">RuneLink</p>
      </div>

      <div className="flex-1" />

      <ProfileSelector
        onManageAccounts={onManageAccounts}
        onSelectAccount={onSelectAccount}
      />
    </aside>
  );
}
