import test from "node:test";
import assert from "node:assert/strict";
import { assertBoundary, getDomain } from "../src/domains.mjs";
import { analyzeMission } from "../src/intelligence.mjs";

test("every specialist has explicit allowed roots", () => {
  for (const role of ["database", "auth", "frontend", "infrastructure", "intelligence", "billing"]) assert.ok(getDomain(role).roots.length);
});

test("boundary engine blocks traversal and cross-domain writes", () => {
  assert.equal(assertBoundary("auth", [{ path: "auth/policies/session.json" }]), true);
  assert.throws(() => assertBoundary("auth", [{ path: "db/users.sql" }]), error => error.code === "BOUNDARY_VIOLATION");
  assert.throws(() => assertBoundary("auth", [{ path: "auth/../../server.mjs" }]), error => error.code === "BOUNDARY_VIOLATION");
});

test("stack selection adapts to the described product", () => {
  assert.equal(analyzeMission("Create a double entry banking and payment platform").projectType, "Financial system");
  assert.equal(analyzeMission("Create a social fitness mobile application").projectType, "Mobile product");
  assert.equal(analyzeMission("Create a RAG AI agent for company knowledge").projectType, "AI application");
});
