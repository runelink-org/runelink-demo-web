import type { ComponentProps } from "react";

export function IdIcon(props: ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path
        fillRule="evenodd"
        d="M5 2h14a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3ZM6 7v10h2V7H6Zm4 0v10h3a5 5 0 0 0 0-10h-3Zm2 2h1a3 3 0 0 1 0 6h-1V9Z"
      />
    </svg>
  );
}
