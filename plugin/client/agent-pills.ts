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
  const reconcile = (agent: {
    id: string;
    workspaceId?: string | null;
    archivedAt?: unknown;
  }) => {
    if (stopped) return;
    const old = registrations.get(agent.id);
    if (old && (old.workspaceId !== agent.workspaceId || agent.archivedAt)) {
      old.remove();
      registrations.delete(agent.id);
    }
    if (agent.archivedAt || !agent.workspaceId || registrations.has(agent.id))
      return;
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
  };
  const stop = client.paseo.agents.subscribe((update) => {
    if (loading)
      touched.add(update.kind === "upsert" ? update.agent.id : update.agentId);
    if (update.kind === "upsert") reconcile(update.agent);
    else {
      registrations.get(update.agentId)?.remove();
      registrations.delete(update.agentId);
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
        for (const [id, reg] of registrations) {
          if (!seen.has(id) && !touched.has(id)) {
            reg.remove();
            registrations.delete(id);
          }
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
    for (const reg of registrations.values()) reg.remove();
    registrations.clear();
  };
}
