# React + TypeScript + Vite + shadcn/ui

This is a template for a new Vite project with React, TypeScript, and shadcn/ui.

The app tries secure host connections first. When served over HTTP, it can use an unencrypted connection after explicit approval, before sending credentials. Approval is remembered per host and port in the browser's `runelink.demo.host-transports` local storage entry, including across accounts, logouts, reloads, and reconnects. Clearing that entry removes approval. When served over HTTPS, the app requires secure host connections. Host connection redirects are rejected.

Builds use TypeScript 7 through `@typescript/native`. The `typescript` dependency aliases the [official TypeScript 6 compatibility package](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0) because typescript-eslint still requires its compiler API.
