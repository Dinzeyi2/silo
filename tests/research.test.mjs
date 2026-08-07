import test from "node:test";
import assert from "node:assert/strict";
import { createResearcher } from "../src/research.mjs";

test("dependency research normalizes and caches live registry results",async()=>{let calls=0;const researcher=createResearcher({fetcher:async()=>{calls++;return {ok:true,json:async()=>({objects:[{package:{name:"safe-lib",version:"2.0.0",description:"Library",date:"today"},score:{detail:{quality:.9,popularity:.8}}}]})};}});const first=await researcher.search("npm","safe library"),second=await researcher.search("npm","safe library");assert.equal(first.packages[0].name,"safe-lib");assert.equal(second.cached,true);assert.equal(calls,1);});
