import { assertBoundary, getDomain } from "./domains.mjs";

function extractJson(text) {
  const cleaned = String(text).replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned);
  return parsed;
}

export function createAgent(config = {}) {
  const fetcher = config.fetcher || fetch;
  const researcher = config.researcher;
  const names=["database","auth","frontend","infrastructure","intelligence","billing"];
  const maxToolRounds=Math.min(30,Math.max(1,Number(config.maxToolRounds??process.env.SILO_MAX_TOOL_ROUNDS??12)));
  const envName=name=>name.toUpperCase();
  const provider=name=>config.providers?.[name]||{endpoint:config.endpoint??process.env[`SILO_AI_${envName(name)}_BASE_URL`]??process.env.SILO_AI_BASE_URL,apiKey:config.apiKey??process.env[`SILO_AI_${envName(name)}_API_KEY`]??process.env.SILO_AI_API_KEY,model:config.model??process.env[`SILO_AI_${envName(name)}_MODEL`]??process.env.SILO_AI_MODEL};
  const redact=value=>String(value??"").replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AKIA[A-Z0-9]{16})\b/g,"[REDACTED_CREDENTIAL]").replace(/((?:password|secret|api[_-]?key|token|private[_-]?key)\s*[:=]\s*)[^\s,;"']+/gi,"$1[REDACTED]");

  return {
    configured: names.every(name=>{const item=provider(name);return Boolean(item.endpoint&&item.apiKey&&item.model);}),
    zeroKnowledgeReady: names.every(name=>Boolean(config.providers?.[name]||process.env[`SILO_AI_${envName(name)}_API_KEY`])),
    async generate({ domain: domainName, prompt, analysis, files = [], memory = "", interfaces = [], toolExecutor = null }) {
      const domain = getDomain(domainName);
      const {endpoint,apiKey,model}=provider(domainName);
      if (!endpoint || !apiKey || !model) {
        throw Object.assign(new Error("SILO_AI_BASE_URL, SILO_AI_API_KEY, and SILO_AI_MODEL are required; SILO never substitutes templates for a coding model"), { status: 503, code: "AI_NOT_CONFIGURED" });
      }
      const scopedFiles=files.filter(file=>domain.roots.some(root=>file.path.startsWith(root))).map(file=>({...file,content:redact(file.content)}));
      let research=[];if(researcher){const ecosystem=/python/i.test(analysis.language)?"pypi":/rust/i.test(analysis.language)?"crates":"npm";research=(await researcher.search(ecosystem,redact(prompt).split(/\s+/).slice(0,6).join(" "))).packages;}
      const messages=[
        { role:"system",content:`You are SILO's ${domain.label}. ${domain.system} You may read and modify ONLY these roots: ${domain.roots.join(", ")}. Never emit traversal paths. Work autonomously. You may return {"toolCalls":[{"tool":"read_file","path":"..."},{"tool":"search","query":"..."},{"tool":"list_files"},{"tool":"git_diff"},{"tool":"run_command","executable":"npm","args":["test"]}]} to inspect or execute. Commands run without a shell under an approval policy. Continue using tools until confident, then return {"changes":[{"path":"...","content":"complete file"}],"contracts":[{"name":"...","version":"...","direction":"provides|consumes"}],"summary":"..."}. Generate complete production-quality files, not snippets.`},
        { role:"user",content:JSON.stringify({missionAnalysis:analysis,task:redact(prompt),durableProjectMemory:redact(memory).slice(-12_000),sharedArchitectureContracts:interfaces.map(({name,producer,consumers,version,protocol,schema,invariants,security})=>({name,producer,consumers,version,protocol,schema,invariants,security})),liveDependencyResearch:research,repositoryManifest:scopedFiles.map(file=>({path:file.path,version:file.version})),initialFiles:scopedFiles.slice(0,20)})},
      ];
      for(let round=0;round<maxToolRounds;round++){
        const response=await fetcher(`${endpoint.replace(/\/$/,"")}/chat/completions`,{method:"POST",headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},body:JSON.stringify({model,temperature:0.1,response_format:{type:"json_object"},messages}),signal:AbortSignal.timeout(120_000)});
        const payload=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(payload.error?.message||`AI provider returned ${response.status}`),{status:502,code:"AI_PROVIDER_ERROR"});
        const raw=payload.choices?.[0]?.message?.content,result=extractJson(raw);
        if(Array.isArray(result.changes)&&result.changes.length){assertBoundary(domainName,result.changes);return {changes:result.changes,contracts:result.contracts||[],summary:result.summary,source:"ai",model,toolRounds:round};}
        if(!Array.isArray(result.toolCalls)||!result.toolCalls.length)throw Object.assign(new Error("Agent returned neither changes nor repository tool calls"),{status:502,code:"AI_RESPONSE_INVALID"});
        const toolResults=await Promise.all(result.toolCalls.slice(0,12).map(async call=>{if(call.tool==="read_file"){assertBoundary(domainName,[{path:call.path}]);const file=scopedFiles.find(item=>item.path===call.path);return {tool:"read_file",path:call.path,content:file?.content??null};}if(call.tool==="search"){const query=String(call.query||"").toLowerCase();return {tool:"search",query:call.query,matches:scopedFiles.flatMap(file=>file.content.split("\n").map((line,index)=>({path:file.path,line:index+1,preview:line})).filter(item=>item.preview.toLowerCase().includes(query))).slice(0,100)};}if(call.tool==="list_files")return {tool:"list_files",files:scopedFiles.map(file=>file.path)};if(["git_diff","run_command"].includes(call.tool)&&toolExecutor)return {tool:call.tool,...await toolExecutor(call)};return {tool:call.tool,error:"Unknown or unavailable tool"};}));
        messages.push({role:"assistant",content:raw},{role:"user",content:JSON.stringify({toolResults,instruction:"Continue inspecting or return final changes."})});
      }
      throw Object.assign(new Error("Agent exceeded the repository inspection round limit"),{status:502,code:"AI_TOOL_LIMIT"});
    },
  };
}
