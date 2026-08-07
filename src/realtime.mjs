export function createRealtimeHub({ heartbeatMs = 20_000, bus = null } = {}) {
  const projects = new Map();
  function clients(projectId) { if (!projects.has(projectId)) projects.set(projectId, new Set()); return projects.get(projectId); }
  function localPublish(projectId,event){const message=`id: ${event.id||Date.now()}\nevent: ${event.kind||"activity"}\ndata: ${JSON.stringify(event)}\n\n`;for(const client of projects.get(projectId)||[])client.response.write(message);}
  const unsubscribe=bus?.subscribe((projectId,event)=>localPublish(projectId,event));
  return {
    connect(projectId, response) {
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" });
      response.write(`event: connected\ndata: ${JSON.stringify({ projectId, at: new Date().toISOString() })}\n\n`);
      const client = { response, heartbeat: setInterval(() => response.write(": heartbeat\n\n"), heartbeatMs) };
      clients(projectId).add(client);
      response.on("close", () => { clearInterval(client.heartbeat); clients(projectId).delete(client); if (!clients(projectId).size) projects.delete(projectId); });
    },
    publish(projectId, event) {
      localPublish(projectId,event);bus?.publish(projectId,event).catch(()=>{});
    },
    size(projectId) { return projects.get(projectId)?.size || 0; },
    close() { unsubscribe?.();bus?.close();for (const group of projects.values()) for (const client of group) { clearInterval(client.heartbeat); client.response.end(); } projects.clear(); },
  };
}
