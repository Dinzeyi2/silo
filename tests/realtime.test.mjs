import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRealtimeHub } from "../src/realtime.mjs";

test("realtime hub broadcasts isolated project events and removes disconnected clients",()=>{
  const hub=createRealtimeHub({heartbeatMs:60_000});
  const response=new EventEmitter();let output="";response.writeHead=(status,headers)=>{response.status=status;response.headers=headers;};response.write=chunk=>{output+=chunk;};response.end=()=>{};
  hub.connect("project-a",response);
  assert.equal(response.status,200);assert.equal(hub.size("project-a"),1);assert.match(output,/event: connected/);
  hub.publish("project-a",{id:7,kind:"task.applied",payload:{domain:"auth"}});
  assert.match(output,/event: task\.applied/);assert.match(output,/"domain":"auth"/);
  hub.publish("project-b",{kind:"secret",payload:{}});assert.doesNotMatch(output,/event: secret/);
  response.emit("close");assert.equal(hub.size("project-a"),0);hub.close();
});
