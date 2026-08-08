import test from "node:test";
import assert from "node:assert/strict";
import { createAgent } from "../src/agent.mjs";

const analysis={projectType:"Web application",language:"TypeScript",libraries:["Node.js"],security:["OIDC"],codingStyle:"modules"};

test("AI agent receives a specialist prompt and returns validated files", async () => {
  let request;
  const fetcher=async (url,options)=>{request={url,options};return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({changes:[{path:"auth/session.ts",content:"export const session = true;"}],contracts:[],summary:"Session boundary"})}}]})};};
  const agent=createAgent({endpoint:"https://models.example/v1",apiKey:"secret",model:"code-model",fetcher});
  const interfaces=[{name:"user-api",producer:"database",consumers:["auth"],version:"2",protocol:"JSON",schema:{id:"string"},invariants:["stable id"],security:["service identity"]}];
  const result=await agent.generate({domain:"auth",prompt:"Add sessions",analysis,interfaces});
  assert.equal(result.source,"ai");
  assert.equal(result.changes[0].path,"auth/session.ts");
  assert.match(JSON.parse(request.options.body).messages[0].content,/ONLY these roots: auth\/, security\//);
  assert.deepEqual(JSON.parse(JSON.parse(request.options.body).messages[1].content).sharedArchitectureContracts,interfaces);
  assert.equal(request.options.headers.authorization,"Bearer secret");
});

test("AI output cannot escape its assigned domain", async () => {
  const fetcher=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({changes:[{path:"db/users.sql",content:"DROP TABLE users"}]})}}]})});
  const agent=createAgent({endpoint:"https://models.example/v1",apiKey:"secret",model:"code-model",fetcher});
  await assert.rejects(()=>agent.generate({domain:"auth",prompt:"Touch the database",analysis}),error=>error.code==="BOUNDARY_VIOLATION");
});

test("agent refuses to generate without a configured model provider",async()=>{const agent=createAgent({endpoint:"",apiKey:""});await assert.rejects(()=>agent.generate({domain:"auth",prompt:"Create auth",analysis}),error=>error.code==="AI_NOT_CONFIGURED");});

test("agent autonomously inspects only its silo and redacts credentials",async()=>{let round=0,firstRequest,secondRequest;const fetcher=async(_url,options)=>{round++;if(round===1)firstRequest=JSON.parse(options.body);if(round===2)secondRequest=JSON.parse(options.body);const content=round===1?JSON.stringify({toolCalls:[{tool:"search",query:"session"},{tool:"read_file",path:"auth/session.ts"}]}):JSON.stringify({changes:[{path:"auth/session.ts",content:"export const secure = true"}],summary:"Hardened session"});return {ok:true,json:async()=>({choices:[{message:{content}}]})};};const agent=createAgent({endpoint:"https://models.example/v1",apiKey:"secret",model:"code-model",fetcher});const result=await agent.generate({domain:"auth",prompt:"Harden sessions token=top-secret-value",analysis,files:[{path:"auth/session.ts",content:"export const session = false; api_key=sk-supersecret123456"},{path:"db/users.sql",content:"proprietary database schema"}]});assert.equal(result.toolRounds,1);assert.equal(round,2);const initial=JSON.parse(firstRequest.messages[1].content);assert.deepEqual(initial.repositoryManifest.map(file=>file.path),["auth/session.ts"]);assert.doesNotMatch(JSON.stringify(initial),/proprietary database schema|top-secret-value|sk-supersecret/);const tools=JSON.parse(secondRequest.messages.at(-1).content).toolResults;assert.equal(tools[0].matches.length,1);assert.match(tools[1].content,/REDACTED/);});

test("each domain can use a physically separate model provider",async()=>{const urls=[];const response={ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({changes:[{path:"auth/a.ts",content:"x"}]})}}]})};const providers=Object.fromEntries(["database","auth","frontend","infrastructure","intelligence","billing"].map(name=>[name,{endpoint:`https://${name}.models.example/v1`,apiKey:`${name}-key`,model:`${name}-model`}])) ;const agent=createAgent({providers,fetcher:async url=>{urls.push(url);return response;}});assert.equal(agent.zeroKnowledgeReady,true);await agent.generate({domain:"auth",prompt:"Auth",analysis,files:[]});assert.deepEqual(urls,["https://auth.models.example/v1/chat/completions"]);});

test("a specialist cannot use inspection tools against another silo",async()=>{const fetcher=async()=>({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({toolCalls:[{tool:"read_file",path:"db/private.sql"}]})}}]})});const agent=createAgent({endpoint:"https://models.example/v1",apiKey:"secret",model:"code-model",fetcher});await assert.rejects(()=>agent.generate({domain:"auth",prompt:"Read users",analysis,files:[{path:"db/private.sql",content:"private"}]}),error=>error.code==="BOUNDARY_VIOLATION");});
