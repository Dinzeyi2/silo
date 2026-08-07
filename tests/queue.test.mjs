import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../src/store.mjs";

test("persistent queue leases and completes agent work exactly through its owner",()=>{
  const store=createStore(":memory:");const project=store.createProject({name:"Test",mission:"Build a test application",analysis:{},ownerRole:"auth"});
  const queued=store.enqueue(project.id,project.userId,"agent",{domain:"auth",prompt:"Create session"});assert.equal(queued.status,"queued");
  const leased=store.lease("worker-a",["agent"]);assert.equal(leased.id,queued.id);assert.equal(leased.attempts,1);assert.equal(store.lease("worker-b",["agent"]),null);
  assert.throws(()=>store.completeJob(queued.id,"worker-b",{}),/lease not found/);
  const complete=store.completeJob(queued.id,"worker-a",{changes:[{path:"auth/session.ts",content:"export {}"}],contracts:[]});assert.equal(complete.status,"completed");assert.equal(store.job(queued.id,project.id).result.resource.status,"proposed");store.close();
});

test("failed jobs retry with bounded attempts",()=>{const store=createStore(":memory:");const project=store.createProject({name:"Test",mission:"Build a test application",analysis:{}});const queued=store.enqueue(project.id,project.userId,"sandbox",{}, {maxAttempts:1});store.lease("worker",["sandbox"]);assert.equal(store.failJob(queued.id,"worker","boom").status,"failed");store.close();});
