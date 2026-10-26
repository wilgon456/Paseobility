import type { PluginServerContext } from "@getpaseo/plugin/server";
import { statusRpc, resultRpc, syncRpc, actionRpc } from "./shared/contracts";
import { requestBridge, SAFE_ERROR } from "./server/transport";

export default function contribute(server: PluginServerContext) {
  const safe = async (request: Record<string, unknown>) => {
    try {
      return await requestBridge(request);
    } catch {
      throw Error(SAFE_ERROR);
    }
  };
  server.handle(statusRpc, async ({ offset }) =>
    statusRpc.output.parse(await safe({ action: "status", offset })),
  );
  server.handle(resultRpc, async ({ id }) =>
    resultRpc.output.parse(await safe({ action: "result", id })),
  );
  server.handle(syncRpc, async (input) =>
    syncRpc.output.parse(await safe({ action: "sync", ...input })),
  );
  server.handle(actionRpc, async (input) =>
    actionRpc.output.parse(await safe(input)),
  );
  return () => {};
}
