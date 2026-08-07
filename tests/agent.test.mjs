import test from "node:test";
import assert from "node:assert/strict";
import { createAgent } from "../src/agent.mjs";

const analysis={projectType:"Web application",language:"TypeScript",libraries:["Node.js"],security:["OIDC"],codingStyle:"modules"};

test("AI agent receives a specialist prompt and returns validated files", async () => {
  let request;
  const fetcher=async (url,options)=>{request={url,options};return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({changes:[{path:"auth/session.ts",content:"export const session = true;"}],contracts:[],summary:"Session boundary"})}}]})};};
  const agent=createAgent({endpoint:"https://models.example/v1",apiKey:"secret",model:"code-model",fetcher});
  const result=await agent.generate({domain:"auth",prompt:"Add sessions",analysis});
  assert.equal(result.source,"ai");
  assert.equal(result.changes[0].path,"auth/session.ts");
  assert.match(JSON.parse(request.options.body).messages[0].content,/ONLY these roots: auth\/, security\//);
  assert.equal(request.options.headers.authorization,"Bearer secret");
});

test("AI output cannot escape its assigned domain", async () => {
  const fetcher=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({changes:[{path:"db/users.sql",content:"DROP TABLE users"}]})}}]})});
  const agent=createAgent({endpoint:"https://models.example/v1",apiKey:"secret",model:"code-model",fetcher});
  await assert.rejects(()=>agent.generate({domain:"auth",prompt:"Touch the database",analysis}),error=>error.code==="BOUNDARY_VIOLATION");
});

test("agent refuses to generate without a configured model provider",async()=>{const agent=createAgent({endpoint:"",apiKey:""});await assert.rejects(()=>agent.generate({domain:"auth",prompt:"Create auth",analysis}),error=>error.code==="AI_NOT_CONFIGURED");});
