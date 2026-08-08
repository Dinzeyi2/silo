import test from "node:test";
import assert from "node:assert/strict";
import { createCommandPolicy } from "../src/command-policy.mjs";

test("command policy allows tests but gates installs, Git mutation, and arbitrary binaries",()=>{const policy=createCommandPolicy();assert.equal(policy.classify("npm",["test"]).allowed,true);assert.equal(policy.classify("npm",["install"]).approvalRequired,true);assert.equal(policy.classify("git",["rebase","main"]).approvalRequired,true);assert.equal(policy.classify("bash",["-c","cat /etc/passwd"]).approvalRequired,true);assert.equal(policy.classify("npm",["test;rm","-rf"]).approvalRequired,false);});

test("approved commands do not inherit SILO provider secrets",async()=>{process.env.SILO_AI_API_KEY="must-not-leak";const result=await createCommandPolicy().execute({executable:"env",args:[],cwd:process.cwd(),approved:true});assert.equal(result.passed,true);assert.doesNotMatch(result.stdout,/SILO_AI_API_KEY|must-not-leak/);delete process.env.SILO_AI_API_KEY;});
