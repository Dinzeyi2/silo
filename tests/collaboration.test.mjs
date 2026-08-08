import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/app.mjs";

const request=(method,body,token)=>({method,headers:{"content-type":"application/json",authorization:`Bearer ${token}`},body:JSON.stringify(body||{})});

test("cross-domain contract mismatch opens a War Room for human voting",async()=>{
  const app=createApp({root:fileURLToPath(new URL("../",import.meta.url)),databasePath:":memory:"});const server=createServer(app.handler);await new Promise(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${server.address().port}`;
  const created=await(await fetch(`${base}/api/projects`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mission:"Build a collaborative commerce application",ownerRole:"database"})})).json();const id=created.project.id,dbToken=created.credentials.token;
  const auth=await(await fetch(`${base}/api/projects/${id}/members`,request("POST",{name:"Auth lead",role:"auth"},dbToken))).json();
  await fetch(`${base}/api/projects/${id}/tasks`,request("POST",{prompt:"Provide profiles",changes:[{path:"db/profile.sql",content:"SELECT 1"}],contracts:[{name:"user-profile",version:"1",direction:"provides"}]},dbToken));
  const conflicting=await(await fetch(`${base}/api/projects/${id}/tasks`,request("POST",{prompt:"Consume profiles",changes:[{path:"auth/profile.ts",content:"export {}"}],contracts:[{name:"user-profile",version:"2",direction:"consumes"}]},auth.member.token))).json();
  assert.equal(conflicting.task.warRooms.length,1);
  const roomId=conflicting.task.warRooms[0];
  const vote=await fetch(`${base}/api/projects/${id}/war-rooms/${roomId}/vote`,request("POST",{proposal:0},dbToken));assert.equal(vote.status,200);
  const rooms=await(await fetch(`${base}/api/projects/${id}/war-rooms`,{headers:{authorization:`Bearer ${dbToken}`}})).json();assert.equal(rooms.warRooms[0].contract_name,"user-profile");assert.equal(Object.keys(rooms.warRooms[0].votes).length,1);
  await new Promise(r=>server.close(r));app.close();
});

test("role owner can hot-swap only its stack and receives a migration task",async()=>{
  const fakeAgent={configured:true,generate:async()=>({source:"ai",changes:[{path:"db/migration.md",content:"migration"}],contracts:[]})};
  const app=createApp({root:fileURLToPath(new URL("../",import.meta.url)),databasePath:":memory:",agent:fakeAgent});const server=createServer(app.handler);await new Promise(r=>server.listen(0,"127.0.0.1",r));const base=`http://127.0.0.1:${server.address().port}`;
  const created=await(await fetch(`${base}/api/projects`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mission:"Build an international marketplace application",ownerRole:"database"})})).json();
  const swap=await fetch(`${base}/api/projects/${created.project.id}/stacks/database/swap`,request("POST",{technology:"MongoDB 8"},created.credentials.token));assert.equal(swap.status,201);const result=await swap.json();assert.equal(result.stack.technology,"MongoDB 8");assert.match(result.migrationTask.changes[0].path,/^db\//);
  const denied=await fetch(`${base}/api/projects/${created.project.id}/stacks/auth/swap`,request("POST",{technology:"Keycloak"},created.credentials.token));assert.equal(denied.status,403);
  await new Promise(r=>server.close(r));app.close();
});
