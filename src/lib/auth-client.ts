import {
  SignupRequestSchema,
  TokenResponseSchema,
  UserSchema,
  getApiUrl,
  type TokenResponse,
  type User,
} from "@runelink/sdk";

type TokenRequestInput = {
  host: string;
  username: string;
  password: string;
  clientId: string;
};

type RefreshRequestInput = {
  host: string;
  refreshToken: string;
  clientId?: string;
  scope?: string;
};

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text.trim() || `${response.status} ${response.statusText}`;
}

async function parseJsonResponse<T>(
  response: Response,
  schema: {
    parse: (value: unknown) => T;
  }
): Promise<T> {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  const payload = (await response.json()) as unknown;
  return schema.parse(payload);
}

export async function signupAccount(input: {
  host: string;
  name: string;
  password: string;
}): Promise<User> {
  const body = SignupRequestSchema.parse({
    name: input.name,
    password: input.password,
  });

  const response = await fetch(`${getApiUrl(input.host)}/auth/signup`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return parseJsonResponse(response, UserSchema);
}

export async function loginWithPassword(
  input: TokenRequestInput
): Promise<TokenResponse> {
  const form = new URLSearchParams({
    grant_type: "password",
    username: input.username,
    password: input.password,
    client_id: input.clientId,
  });

  const response = await fetch(`${getApiUrl(input.host)}/auth/token`, {
    method: "POST",
    body: form,
  });

  return parseJsonResponse(response, TokenResponseSchema);
}

export async function refreshAccessToken(
  input: RefreshRequestInput
): Promise<TokenResponse> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });

  if (input.clientId) {
    form.set("client_id", input.clientId);
  }

  if (input.scope) {
    form.set("scope", input.scope);
  }

  const response = await fetch(`${getApiUrl(input.host)}/auth/token`, {
    method: "POST",
    body: form,
  });

  return parseJsonResponse(response, TokenResponseSchema);
}
