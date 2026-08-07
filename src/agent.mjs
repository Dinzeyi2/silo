import { assertBoundary, getDomain } from "./domains.mjs";

function extractJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed.changes) || !parsed.changes.length) throw new Error("Agent response did not include changes");
  return parsed;
}

export function createAgent(config = {}) {
  const endpoint = config.endpoint ?? process.env.SILO_AI_BASE_URL;
  const apiKey = config.apiKey ?? process.env.SILO_AI_API_KEY;
  const model = config.model ?? process.env.SILO_AI_MODEL;
  const fetcher = config.fetcher || fetch;
  const researcher = config.researcher;

  return {
    configured: Boolean(endpoint && apiKey && model),
    async generate({ domain: domainName, prompt, analysis, files = [] }) {
      const domain = getDomain(domainName);
      if (!endpoint || !apiKey || !model) {
        throw Object.assign(new Error("SILO_AI_BASE_URL, SILO_AI_API_KEY, and SILO_AI_MODEL are required; SILO never substitutes templates for a coding model"), { status: 503, code: "AI_NOT_CONFIGURED" });
      }
      let research=[];if(researcher){const ecosystem=/python/i.test(analysis.language)?"pypi":/rust/i.test(analysis.language)?"crates":"npm";research=(await researcher.search(ecosystem,prompt.split(/\s+/).slice(0,6).join(" "))).packages;}
      const response = await fetcher(`${endpoint.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: `You are SILO's ${domain.label}. ${domain.system} You may create or edit ONLY these roots: ${domain.roots.join(", ")}. Never emit traversal paths. Return JSON: {"changes":[{"path":"...","content":"..."}],"contracts":[{"name":"...","version":"...","direction":"provides|consumes"}],"summary":"..."}. Generate complete production-quality files, not snippets.` },
            { role: "user", content: JSON.stringify({ missionAnalysis: analysis, task: prompt, liveDependencyResearch:research, existingDomainFiles: files.slice(0, 40) }) },
          ],
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(payload.error?.message || `AI provider returned ${response.status}`), { status: 502, code: "AI_PROVIDER_ERROR" });
      const result = extractJson(payload.choices?.[0]?.message?.content);
      assertBoundary(domainName, result.changes);
      return { changes: result.changes, contracts: result.contracts || [], summary: result.summary, source: "ai", model };
    },
  };
}
