import test from "node:test";
import assert from "node:assert/strict";
import { publishProject } from "../src/github.mjs";

test("publishes generated files through GitHub's atomic git data flow", async () => {
  const calls=[];
  const responses=[{object:{sha:"parent"}},{tree:{sha:"base-tree"}},{sha:"blob"},{sha:"tree"},{sha:"commit"},{}];
  const fetcher=async (url,options)=>{calls.push({url,options});return {ok:true,json:async()=>responses.shift()};};
  const result=await publishProject({owner:"acme",repo:"app",branch:"main",token:"secret",files:[{path:"db/schema.sql",content:"SELECT 1;"}],message:"SILO build"},fetcher);
  assert.equal(result.commit,"commit");
  assert.equal(calls.length,6);
  assert.match(calls.at(-1).url,/git\/refs\/heads\/main$/);
  assert.equal(calls.at(-1).options.method,"PATCH");
  assert.ok(calls.every(call=>call.options.headers.authorization==="Bearer secret"));
});

test("refuses empty publishes", async () => {
  await assert.rejects(() => publishProject({owner:"a",repo:"b",branch:"main",token:"x",files:[]}), /Apply at least one task/);
});

test("creates a feature branch and pull request when requested",async()=>{const calls=[];const responses=[{object:{sha:"base"}},{},{tree:{sha:"base-tree"}},{sha:"blob"},{sha:"tree"},{sha:"commit"},{},{number:42,html_url:"https://github.test/pr/42"}];const fetcher=async(url,options={})=>{calls.push({url,options});return {ok:true,json:async()=>responses.shift()};};const result=await publishProject({owner:"acme",repo:"app",branch:"silo/auth",baseBranch:"main",token:"secret",files:[{path:"auth/a.ts",content:"x"}],message:"Auth",pullRequest:{title:"Auth change"}},fetcher);assert.equal(result.pullRequest.number,42);assert.ok(calls.some(call=>call.url.endsWith("/git/refs")&&call.options.method==="POST"));assert.ok(calls.at(-1).url.endsWith("/pulls"));});
