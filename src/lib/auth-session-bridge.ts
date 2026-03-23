import type { TokenResponse, UserRef } from "@runelink/sdk";
import type { StoredAccountAuth } from "@/lib/account-storage";

export type AuthSessionSnapshot = {
  activeAccount: UserRef | null;
  activeAuth: StoredAccountAuth | null;
  authError: string | null;
};

type AuthSessionStateBridge = {
  getSnapshot: () => AuthSessionSnapshot;
  subscribe: (listener: () => void) => () => void;
  storeAccountToken: (
    userRef: UserRef,
    tokenResponse: TokenResponse,
    clientId: string
  ) => void;
};

type AuthSessionActionsBridge = {
  loginWithConnection: (
    userRef: UserRef,
    password: string,
    clientId: string
  ) => Promise<TokenResponse>;
  signupAndLoginWithConnection: (
    userRef: UserRef,
    password: string
  ) => Promise<{ tokenResponse: TokenResponse; clientId: string }>;
  refreshConnectionAuth: (
    userRef: UserRef,
    auth: StoredAccountAuth
  ) => Promise<string>;
};

let authSessionStateBridge: AuthSessionStateBridge | null = null;
let authSessionActionsBridge: AuthSessionActionsBridge | null = null;

export function registerAuthSessionStateBridge(
  bridge: AuthSessionStateBridge
): void {
  authSessionStateBridge = bridge;
}

export function registerAuthSessionActionsBridge(
  bridge: AuthSessionActionsBridge
): void {
  authSessionActionsBridge = bridge;
}

export function getAuthSessionSnapshot(): AuthSessionSnapshot {
  if (!authSessionStateBridge) {
    throw new Error("Auth session state bridge is not registered");
  }

  return authSessionStateBridge.getSnapshot();
}

export function subscribeToAuthSession(listener: () => void): () => void {
  if (!authSessionStateBridge) {
    throw new Error("Auth session state bridge is not registered");
  }

  return authSessionStateBridge.subscribe(listener);
}

export function storeAuthSessionToken(
  userRef: UserRef,
  tokenResponse: TokenResponse,
  clientId: string
): void {
  if (!authSessionStateBridge) {
    throw new Error("Auth session state bridge is not registered");
  }

  authSessionStateBridge.storeAccountToken(userRef, tokenResponse, clientId);
}

export function loginAuthSessionWithConnection(
  userRef: UserRef,
  password: string,
  clientId: string
): Promise<TokenResponse> {
  if (!authSessionActionsBridge) {
    throw new Error("Auth session actions bridge is not registered");
  }

  return authSessionActionsBridge.loginWithConnection(
    userRef,
    password,
    clientId
  );
}

export function signupAuthSessionWithConnection(
  userRef: UserRef,
  password: string
): Promise<{ tokenResponse: TokenResponse; clientId: string }> {
  if (!authSessionActionsBridge) {
    throw new Error("Auth session actions bridge is not registered");
  }

  return authSessionActionsBridge.signupAndLoginWithConnection(
    userRef,
    password
  );
}

export function refreshAuthSessionConnection(
  userRef: UserRef,
  auth: StoredAccountAuth
): Promise<string> {
  if (!authSessionActionsBridge) {
    throw new Error("Auth session actions bridge is not registered");
  }

  return authSessionActionsBridge.refreshConnectionAuth(userRef, auth);
}
