import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.mjs";

async function fixture() {
  const roots={database:"db/generated.sql",auth:"auth/generated.ts",frontend:"ui/generated.tsx",infrastructure:"infra/generated.yaml",intelligence:"intelligence/generated.py",billing:"billing/generated.json"};
  const agent={configured:true,generate:async({domain,prompt})=>({source:"test-model",model:"test",changes:[{path:roots[domain],content:`generated for ${prompt}`}],contracts:[]})};
  const app = createApp({ root: fileURLToPath(new URL("../", import.meta.url)), databasePath: ":memory:",agent });
  const server = createServer(app.handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { app, base, close: async () => { await new Promise(resolve => server.close(resolve)); app.close(); } };
}

const json = (method, body, token) => ({ method, headers: { "content-type": "application/json", ...(token && { authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });

test("creates an intelligent project analysis and persists it", async () => {
  const ctx = await fixture();
  const response = await fetch(`${ctx.base}/api/projects`, json("POST", { name: "NOVA", mission: "Build an autonomous warehouse robot with safe navigation", ownerRole: "database" }));
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.analysis.projectType, "Robotics system");
  assert.ok(result.analysis.libraries.includes("ROS 2"));
  assert.ok(result.analysis.estimatedLines.high > result.analysis.estimatedLines.low);
  const project = await fetch(`${ctx.base}/api/projects/${result.project.id}`, { headers: { authorization: `Bearer ${result.credentials.token}` } });
  assert.equal(project.status, 200);
  await ctx.close();
});

test("enforces user role and filesystem boundaries before code can be applied", async () => {
  const ctx = await fixture();
  const created = await (await fetch(`${ctx.base}/api/projects`, json("POST", { mission: "Build a secure commerce application for international teams", ownerRole: "database" }))).json();
  const url = `${ctx.base}/api/projects/${created.project.id}/tasks`;
  const wrongRole = await fetch(url, json("POST", { domain: "auth", prompt: "Create login" }, created.credentials.token));
  assert.equal(wrongRole.status, 403);
  assert.equal((await wrongRole.json()).code, "ROLE_VIOLATION");
  const escape = await fetch(url, json("POST", { prompt: "Change auth", changes: [{ path: "auth/login.ts", content: "unsafe" }] }, created.credentials.token));
  assert.equal(escape.status, 403);
  assert.equal((await escape.json()).code, "BOUNDARY_VIOLATION");
  const proposed = await (await fetch(url, json("POST", { prompt: "Create the product event schema" }, created.credentials.token))).json();
  assert.match(proposed.task.changes[0].path, /^db\//);
  const applied = await fetch(`${url}/${proposed.task.id}/apply`, json("POST", {}, created.credentials.token));
  assert.equal(applied.status, 200);
  const files = await (await fetch(`${ctx.base}/api/projects/${created.project.id}/files`, { headers: { authorization: `Bearer ${created.credentials.token}` } })).json();
  assert.equal(files.files.length, 1);
  assert.equal(files.files[0].domain, "database");
  await ctx.close();
});

test("requires authentication and handles malformed requests", async () => {
  const ctx = await fixture();
  assert.equal((await fetch(`${ctx.base}/api/health`)).status, 200);
  assert.equal((await fetch(`${ctx.base}/api/ready`)).status, 200);
  assert.equal((await fetch(`${ctx.base}/api/projects`, json("POST", { mission: "short" }))).status, 400);
  const created = await (await fetch(`${ctx.base}/api/projects`, json("POST", { mission: "Build a collaborative project management web application" }))).json();
  assert.equal((await fetch(`${ctx.base}/api/projects/${created.project.id}`)).status, 401);
  assert.equal((await fetch(`${ctx.base}/api/not-a-route`)).status, 404);
  await ctx.close();
});

test("project owner can describe and build a complete six-domain application",async()=>{const ctx=await fixture();const created=await(await fetch(`${ctx.base}/api/projects`,json("POST",{mission:"Build a collaborative appointment booking application",ownerRole:"infrastructure"}))).json();const response=await fetch(`${ctx.base}/api/projects/${created.project.id}/builds`,json("POST",{synchronous:true,runTests:false},created.credentials.token));assert.equal(response.status,201);const result=await response.json();assert.equal(result.build.status,"ready");assert.equal(result.build.result.steps.length,6);const project=await(await fetch(`${ctx.base}/api/projects/${created.project.id}`,{headers:{authorization:`Bearer ${created.credentials.token}`}})).json();assert.equal(project.files.length,6);await ctx.close();});
