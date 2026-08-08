import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createRepositoryWorkspace } from "./worktree.mjs";
import { createCommandPolicy } from "./command-policy.mjs";
import { assertBoundary } from "./domains.mjs";

const tests={node:{executable:"npm",args:["test"]},python:{executable:"python",args:["-m","pytest"]},rust:{executable:"cargo",args:["test"]},go:{executable:"go",args:["test","./..."]}};

export function createCodingEngine({agent,planner,commandPolicy=createCommandPolicy(),maxRepairRounds=4}={}){
  return {async build({mission,analysis,files=[],repositoryUrl,baseRef,runTests=true,runtime="node",memoryByDomain={},approvedCommands=[],previousArchitecture,instruction}){
    if(!planner)throw Object.assign(new Error("Architecture planner is required"),{code:"PLANNER_NOT_CONFIGURED"});
    const architecture=await planner.plan({mission,analysis,previousArchitecture,instruction});
    const items=architecture.buildOrder.map(domain=>({domain,prompt:architecture.domains[domain].brief}));
    const repository=await createRepositoryWorkspace({files,repositoryUrl,baseRef}),steps=[],interfaces=architecture.contracts,events=[{kind:"architecture.planned",version:architecture.version,contracts:interfaces.length}];
    try{
      const executeDomain=async(item,extra="")=>{
        const tree=await repository.createDomainTree(item.domain),pending=[];
        const toolExecutor=async call=>{
          if(call.tool==="git_diff")return repository.diff(tree);
          if(call.tool==="write_file"){assertBoundary(item.domain,[{path:call.path}]);const target=join(tree.path,call.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,String(call.content||""));pending.push({path:call.path,content:String(call.content||"")});return {written:true,path:call.path};}
          if(call.tool==="run_command"){const executable=String(call.executable||""),args=Array.isArray(call.args)?call.args.map(String):[],approved=approvedCommands.some(approval=>approval.domain===item.domain&&approval.executable===executable&&JSON.stringify(approval.args||[])===JSON.stringify(args));const result=await commandPolicy.execute({executable,args,cwd:tree.path,approved});events.push({kind:"command.executed",domain:item.domain,executable,args,approved,exitCode:result.exitCode,reason:result.reason});return result;}
          return {error:"unsupported tool"};
        };
        const current=await repository.files(tree.path),generated=await agent.generate({domain:item.domain,prompt:`${item.prompt}${extra}`,analysis,files:current,memory:memoryByDomain[item.domain]||"",interfaces,toolExecutor});
        const changes=[...pending,...generated.changes].filter((change,index,array)=>array.findLastIndex(other=>other.path===change.path)===index);assertBoundary(item.domain,changes);await repository.writeChanges(tree,changes);const diff=await repository.diff(tree);await repository.merge(tree);
        const step={domain:item.domain,prompt:item.prompt,changes,contracts:generated.contracts||[],summary:generated.summary,model:generated.model,diff:diff.stdout};steps.push(step);events.push({kind:"domain.merged",domain:item.domain,files:changes.map(change=>change.path)});return step;
      };
      for(const item of items)await executeDomain(item);
      let testResult=null,repairRounds=0;
      if(runTests){const test=tests[runtime];if(!test)throw Object.assign(new Error(`Unsupported runtime ${runtime}`),{code:"RUNTIME_UNSUPPORTED"});testResult=await commandPolicy.execute({...test,cwd:repository.root,approved:false});while(!testResult.passed&&repairRounds<maxRepairRounds){repairRounds++;for(const item of items)await executeDomain(item,`\n\nIntegrated test attempt ${repairRounds} failed. Diagnose and repair only your domain.\n${testResult.stderr||testResult.stdout}`);testResult=await commandPolicy.execute({...test,cwd:repository.root,approved:false});}}
      return {mission,architecture,status:!runTests||testResult?.passed?"ready":"needs_review",steps,testResult,repairRounds,files:await repository.files(),events,engine:"git-worktree-v2"};
    }finally{await repository.cleanup();}
  }};
}
