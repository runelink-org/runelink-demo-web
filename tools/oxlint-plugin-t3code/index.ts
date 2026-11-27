// This entry point registers the same vendored rules in both Runelink repos.
// Update runelink-sdk-js/tools/oxlint-plugin-t3code/index.ts and
// runelink-demo-web/tools/oxlint-plugin-t3code/index.ts together.
import { definePlugin } from "@oxlint/plugins";
import rule0 from "./rules/prefer-effect-fn.ts";
import rule1 from "./rules/require-suppression-reason.ts";
import rule2 from "./rules/no-real-time-wait-in-tests.ts";
import rule3 from "./rules/no-wall-clock-in-tests.ts";

export default definePlugin({
  meta: { name: "t3code" },
  rules: {
    "prefer-effect-fn": rule0,
    "require-suppression-reason": rule1,
    "no-real-time-wait-in-tests": rule2,
    "no-wall-clock-in-tests": rule3,
  },
});
