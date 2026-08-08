import test from "node:test";
import assert from "node:assert/strict";
import { createArchitecturePlanner } from "../src/architecture-planner.mjs";

const domainNames = ["database", "auth", "frontend", "infrastructure", "intelligence", "billing"];
const validPlan = {
  version: 1,
  summary: "Contract-first product architecture",
  domains: Object.fromEntries(domainNames.map(domain => [domain, { brief: `Own ${domain} only` }])),
  contracts: [{ name: "user-api", producer: "database", consumers: ["auth", "frontend"], version: "1", protocol: "JSON", schema: { id: "string" }, invariants: ["id is stable"], security: ["never expose secrets"] }],
  buildOrder: domainNames,
  acceptanceCriteria: ["all domain tests pass"]
};

test("planner creates a validated cross-domain contract registry", async () => {
  let request;
  const planner = createArchitecturePlanner({ baseUrl: "https://planner.test/v1", apiKey: "secret", model: "planner", fetchImpl: async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(validPlan) } }] }) };
  }});
  const plan = await planner.plan({ mission: "Build a scheduling platform", analysis: { projectType: "Web application" } });
  assert.equal(plan.contracts[0].producer, "database");
  assert.equal(plan.domains.auth.brief, "Own auth only");
  assert.equal(request.response_format.type, "json_object");
});

test("planner rejects an incomplete specialist architecture", async () => {
  const incomplete = structuredClone(validPlan);
  delete incomplete.domains.billing;
  const planner = createArchitecturePlanner({ baseUrl: "https://planner.test/v1", apiKey: "secret", model: "planner", fetchImpl: async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(incomplete) } }] }) }) });
  await assert.rejects(() => planner.plan({ mission: "Build a scheduling platform" }), /billing/);
});
