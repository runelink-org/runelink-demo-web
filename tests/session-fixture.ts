import assert from "node:assert/strict";
import { REPLY_TYPE_BY_REQUEST_TYPE } from "@runelink/sdk";
import type { ReplyFor, WsReply, WsRequest } from "@runelink/sdk";
import * as Effect from "effect/Effect";
import type {
  RequestFailure,
  RunelinkSession,
} from "../src/lib/runelink-session.ts";

export interface PendingRequest {
  request: WsRequest;
  resolve(reply: WsReply): void;
  reject(error: RequestFailure): void;
}

export function controlledSession(
  requests: PendingRequest[]
): RunelinkSession["Service"] {
  return {
    request: <Request extends WsRequest>(request: Request) =>
      Effect.callback<ReplyFor<Request["type"]>, RequestFailure>((resume) => {
        const matches = (reply: WsReply): reply is ReplyFor<Request["type"]> =>
          reply.type === REPLY_TYPE_BY_REQUEST_TYPE[request.type];
        requests.push({
          request,
          resolve: (reply) => {
            assert.ok(matches(reply));
            resume(Effect.succeed(reply));
          },
          reject: (error) => resume(Effect.fail(error)),
        });
      }),
    login: () => Effect.die("Unexpected login"),
    signup: () => Effect.die("Unexpected signup"),
    cancelPendingAuthentication: Effect.die("Unexpected cancellation"),
  };
}
