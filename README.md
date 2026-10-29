# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

The app tries secure host connections first. When served over HTTP, it can use an unencrypted connection after explicit approval, before sending credentials. Approval is remembered per host and port in the browser's `runelink.demo.host-transports` local storage entry, including across accounts, logouts, reloads, and reconnects. Clearing that entry removes approval. When served over HTTPS, the app requires secure host connections. Host connection redirects are rejected.

Builds use TypeScript 7 and Vite, linting uses Oxlint, and formatting uses Prettier. Run `pnpm dev` for development, `pnpm lint` for linting, and `pnpm build` for a production build.
