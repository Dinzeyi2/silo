import { randomUUID } from "node:crypto";
import { createAgent } from "./src/agent.mjs";
import { createSandbox } from "./src/sandbox.mjs";
import { createResearcher } from "./src/research.mjs";
import { createOrchestrator } from "./src/orchestrator.mjs";

const api=(process.env.SILO_API_URL||"http://127.0.0.1:4173").replace(/\/$/,"");
const secret=process.env.SILO_WORKER_SECRET;
const workerId=process.env.SILO_WORKER_ID||randomUUID();
const workerTypes=(process.env.SILO_WORKER_TYPES||"agent,sandbox,build").split(",").map(value=>value.trim()).filter(Boolean);
const agent=createAgent({researcher:createResearcher()});
const sandbox=createSandbox();
const orchestrator=createOrchestrator({agent,sandbox});
if(!secret)throw new Error("SILO_WORKER_SECRET is required");

async function call(path,body){const response=await fetch(`${api}${path}`,{method:"POST",headers:{authorization:`Bearer ${secret}`,"content-type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(150_000)});const result=await response.json();if(!response.ok)throw new Error(result.error||`API returned ${response.status}`);return result;}
async function work(job){if(job.type==="agent")return agent.generate(job.payload);if(job.type==="sandbox")return sandbox.run(job.payload);if(job.type==="build")return orchestrator.build(job.payload);throw new Error(`Unsupported job type ${job.type}`);}
async function loop(){for(;;){let leased;try{leased=(await call("/api/internal/jobs/lease",{workerId,types:workerTypes,leaseMs:180_000})).job;if(!leased){await new Promise(resolve=>setTimeout(resolve,1000));continue;}const result=await work(leased);await call(`/api/internal/jobs/${leased.id}/complete`,{workerId,result});}catch(error){process.stderr.write(`${JSON.stringify({level:"error",service:"silo-worker",workerId,jobId:leased?.id,error:error.message,at:new Date().toISOString()})}\n`);if(leased)await call(`/api/internal/jobs/${leased.id}/fail`,{workerId,error:error.message}).catch(()=>{});await new Promise(resolve=>setTimeout(resolve,1000));}}}
process.stdout.write(`${JSON.stringify({level:"info",service:"silo-worker",workerId,message:"worker started",at:new Date().toISOString()})}\n`);
await loop();
