import type {
  PluginClientContext,
  PluginButton,
} from "@getpaseo/plugin/client";
export function followAgentPills(
  client: PluginClientContext,
  button: PluginButton,
) {
  const registrations = new Map<
    string,
    { workspaceId: string; remove(): void }
  >();
  let stopped = false,
    loading = false;
  const touched = new Set<string>();
  const failed = new Set<string>();
  const warn = (message: string, error: unknown) =>
    console.warn(`[Paseobility] ${message}`, error);
  const remove = (id: string) => {
    const reg = registrations.get(id);
    if (!reg) return;
    registrations.delete(id);
    try {
      reg.remove();
    } catch (error) {
      warn(`Could not remove the composer pill for agent ${id}`, error);
    }
  };
  const reconcile = (agent: {
    id: string;
    workspaceId?: string | null;
    archivedAt?: unknown;
  }) => {
    if (stopped) return;
    const old = registrations.get(agent.id);
    if (old && (old.workspaceId !== agent.workspaceId || agent.archivedAt))
      remove(agent.id);
    if (agent.archivedAt || !agent.workspaceId || registrations.has(agent.id))
      return;
    const key = `${agent.id}\0${agent.workspaceId}`;
    if (failed.has(key)) return;
    try {
      const reg = client.addComposerPill({
        id: `skills-${agent.id}`,
        workspaceId: agent.workspaceId,
        agentId: agent.id,
        button,
      });
      registrations.set(agent.id, {
        workspaceId: agent.workspaceId,
        remove: () => reg.remove(),
      });
    } catch (error) {
      // The + menu attachment source stays usable when the draft adapter fails.
      failed.add(key);
      warn(`Composer pill unavailable for agent ${agent.id}`, error);
    }
  };
  const stop = client.paseo.agents.subscribe((update) => {
    try {
      if (loading)
        touched.add(
          update.kind === "upsert" ? update.agent.id : update.agentId,
        );
      if (update.kind === "upsert") reconcile(update.agent);
      else remove(update.agentId);
    } catch (error) {
      warn("Could not update a composer pill", error);
    }
  });
  async function refresh() {
    if (loading || stopped) return;
    loading = true;
    touched.clear();
    const seen = new Set<string>();
    try {
      let cursor: string | undefined;
      do {
        const page = await client.paseo.agents.list({
          filter: { includeArchived: false },
          page: { limit: 200, cursor },
        });
        if (stopped) return;
        for (const entry of page.entries) {
          seen.add(entry.agent.id);
          if (!touched.has(entry.agent.id)) reconcile(entry.agent);
        }
        cursor = page.pageInfo.hasMore
          ? (page.pageInfo.nextCursor ?? undefined)
          : undefined;
      } while (cursor && !stopped);
      if (!stopped)
        for (const id of [...registrations.keys()]) {
          if (!seen.has(id) && !touched.has(id)) remove(id);
        }
    } catch {
      /* Offline hosts retain their own contributions; never use another host. */
    } finally {
      loading = false;
    }
  }
  void refresh();
  const timer = setInterval(() => void refresh(), 30000);
  return () => {
    stopped = true;
    clearInterval(timer);
    stop();
    for (const id of [...registrations.keys()]) remove(id);
    registrations.clear();
  };
}
