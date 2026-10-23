import { Copy } from "lucide-react";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { copyToClipboard } from "@/lib/clipboard";

export type CopyOption = {
  label: string;
  value: string;
  successLabel: string;
};

// Less common copy actions, kept out of the top level of a menu
export function CopyMoreSubmenu({ options }: { options: CopyOption[] }) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="cursor-pointer gap-3 rounded-xl px-3 py-2">
        <Copy className="size-4" />
        <span className="font-medium">Copy more</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.label}
            className="cursor-pointer rounded-xl px-3 py-2"
            onClick={() => {
              void copyToClipboard(option.value, option.successLabel);
            }}
          >
            <span className="font-medium">{option.label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
