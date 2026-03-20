import type { WsReply, WsRequest } from "@runelink/sdk";
import { requestRunelink } from "@/lib/runelink-connection-store";

type WsRequestType = WsRequest["type"];
type WsReplyType = WsReply["type"];

export type RequestFor<Type extends WsRequestType> = Extract<
  WsRequest,
  { type: Type }
>;

export type ReplyFor<Type extends WsReplyType> = Extract<
  WsReply,
  { type: Type }
>;

type ExpectedReplyTypeByRequestType = {
  ping: "pong";
  oidc_discovery: "oidc_discovery";
  oidc_jwks: "oidc_jwks";
  connection_state: "connection_state";
  auth_signup: "auth_signup";
  auth_token_password: "auth_token";
  auth_token_refresh: "auth_token";
  auth_token_access: "auth_token_access";
  users_create: "users_create";
  users_get_all: "users_get_all";
  users_get_by_ref: "users_get_by_ref";
  users_get_associated_hosts: "users_get_associated_hosts";
  users_delete: "users_delete";
  memberships_get_by_user: "memberships_get_by_user";
  memberships_get_members_by_server: "memberships_get_members_by_server";
  memberships_get_by_user_and_server: "memberships_get_by_user_and_server";
  memberships_create: "memberships_create";
  memberships_delete: "memberships_delete";
  servers_create: "servers_create";
  servers_get_all: "servers_get_all";
  servers_get_by_id: "servers_get_by_id";
  servers_get_with_channels: "servers_get_with_channels";
  servers_delete: "servers_delete";
  channels_create: "channels_create";
  channels_get_all: "channels_get_all";
  channels_get_by_server: "channels_get_by_server";
  channels_get_by_id: "channels_get_by_id";
  channels_delete: "channels_delete";
  messages_create: "messages_create";
  messages_get_all: "messages_get_all";
  messages_get_by_server: "messages_get_by_server";
  messages_get_by_channel: "messages_get_by_channel";
  messages_get_by_id: "messages_get_by_id";
  messages_delete: "messages_delete";
};

type SupportedRequestType = keyof ExpectedReplyTypeByRequestType;

const expectedReplyTypeByRequestType = {
  ping: "pong",
  oidc_discovery: "oidc_discovery",
  oidc_jwks: "oidc_jwks",
  connection_state: "connection_state",
  auth_signup: "auth_signup",
  auth_token_password: "auth_token",
  auth_token_refresh: "auth_token",
  auth_token_access: "auth_token_access",
  users_create: "users_create",
  users_get_all: "users_get_all",
  users_get_by_ref: "users_get_by_ref",
  users_get_associated_hosts: "users_get_associated_hosts",
  users_delete: "users_delete",
  memberships_get_by_user: "memberships_get_by_user",
  memberships_get_members_by_server: "memberships_get_members_by_server",
  memberships_get_by_user_and_server: "memberships_get_by_user_and_server",
  memberships_create: "memberships_create",
  memberships_delete: "memberships_delete",
  servers_create: "servers_create",
  servers_get_all: "servers_get_all",
  servers_get_by_id: "servers_get_by_id",
  servers_get_with_channels: "servers_get_with_channels",
  servers_delete: "servers_delete",
  channels_create: "channels_create",
  channels_get_all: "channels_get_all",
  channels_get_by_server: "channels_get_by_server",
  channels_get_by_id: "channels_get_by_id",
  channels_delete: "channels_delete",
  messages_create: "messages_create",
  messages_get_all: "messages_get_all",
  messages_get_by_server: "messages_get_by_server",
  messages_get_by_channel: "messages_get_by_channel",
  messages_get_by_id: "messages_get_by_id",
  messages_delete: "messages_delete",
} satisfies ExpectedReplyTypeByRequestType;

function isReplyOfType<Type extends WsReplyType>(
  reply: WsReply,
  type: Type
): reply is ReplyFor<Type> {
  return reply.type === type;
}

export async function requestExpected<Type extends SupportedRequestType>(
  type: Type,
  message: RequestFor<Type>
): Promise<ReplyFor<ExpectedReplyTypeByRequestType[Type]>> {
  const reply = await requestRunelink(message);
  const expectedType = expectedReplyTypeByRequestType[type];

  if (!isReplyOfType(reply, expectedType)) {
    throw new Error(
      `Unexpected reply type for ${type}: expected ${expectedType}, received ${reply.type}`
    );
  }

  return reply;
}
