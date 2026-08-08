import assert from "node:assert/strict";
const base=process.env.SILO_TARGET||"http://127.0.0.1:4173";
const traversal=await fetch(`${base}/../../etc/passwd`);assert.notEqual(traversal.status,200);
const unauthorized=await fetch(`${base}/api/projects/not-real`);assert.equal(unauthorized.status,404);
const oversized=await fetch(`${base}/api/projects`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mission:"x".repeat(1_100_000)})});assert.equal(oversized.status,413);
const health=await fetch(`${base}/api/health`);for(const header of ["content-security-policy","x-content-type-options","x-frame-options"])assert.ok(health.headers.get(header));console.log("SILO external security checks passed");
