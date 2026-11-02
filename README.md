# RuneLink Demo Web

This is the demo web client for [RuneLink](https://github.com/runelink-org/runelink), a federated messaging network with a Slack/Discord-style model: **servers** contain **channels**, and channels contain **messages**.

> Status: **WIP**. Features and UI may change. Not security-audited.

Public instance: [**app.runelink.chat**](https://app.runelink.chat).

## What is this?

- A browser client for RuneLink hosts, built with React, TypeScript, Vite, and shadcn/ui.
- It talks to hosts over the HTTP/WebSocket API using the [`@runelink/sdk`](https://github.com/runelink-org/runelink-sdk-js) package.
- It serves as a reference for building your own RuneLink clients.

## Getting started (local dev)

### Prerequisites

- Node.js and [pnpm](https://pnpm.io/)
- A RuneLink host to connect to. To run one locally, see [Run the server](https://github.com/runelink-org/runelink#run-the-server).

### Install and run

```bash
pnpm install
pnpm dev
```

Then open the URL printed by Vite and log in or create an account on your home host.

### Using a local SDK checkout

The app uses the `@runelink/sdk` npm package. When a `runelink-sdk-js` checkout sits next to this repository, development and local builds use its source instead, so SDK changes apply right away. Run `pnpm install` in both repositories, so TypeScript can resolve the SDK's dependencies.

## Host connections

The app tries secure host connections first. When served over HTTP, it can use an unencrypted connection after explicit approval, before sending credentials. Approval is remembered per host and port in the browser's `runelink.demo.host-transports` local storage entry, including across accounts, logouts, reloads, and reconnects. Clearing that entry removes approval. When served over HTTPS, the app requires secure host connections. Host connection redirects are rejected.

## Contributing

Builds use TypeScript 7 and Vite, linting uses Oxlint, and formatting uses Prettier. Useful commands:

- `pnpm dev`: start the development server.
- `pnpm format`: format the code.
- `pnpm lint`: lint the code.
- `pnpm test`: run the tests.
- `pnpm build`: create a production build.

The `main` branch deploys automatically to [app.runelink.chat](https://app.runelink.chat) through Vercel.
