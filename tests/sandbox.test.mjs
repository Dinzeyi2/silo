import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createSandbox } from "../src/sandbox.mjs";

test("sandbox uses a networkless, resource-limited, unprivileged container",async()=>{
  let invocation;
  const runner=(command,args)=>{invocation={command,args};const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>{};queueMicrotask(()=>{child.stdout.emit("data",Buffer.from("tests passed"));child.emit("close",0);});return child;};
  const result=await createSandbox({runner}).run({runtime:"node",files:[{path:"package.json",content:'{"scripts":{"test":"echo ok"}}'}]});
  assert.equal(result.passed,true);assert.equal(invocation.command,"docker");
  for(const flag of ["--network","none","--memory","512m","--pids-limit","128","--cap-drop","ALL","--user","65534:65534"])assert.ok(invocation.args.includes(flag));
});

test("sandbox rejects arbitrary commands and unsupported runtimes",async()=>{
  const sandbox=createSandbox();
  await assert.rejects(()=>sandbox.run({runtime:"node",files:[],command:"curl example.com"}),error=>error.code==="SANDBOX_COMMAND_DENIED");
  await assert.rejects(()=>sandbox.run({runtime:"php",files:[]}),/Unsupported runtime/);
});
