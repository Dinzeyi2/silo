import { assertBoundary } from "./domains.mjs";

export function buildPlan(mission, analysis) {
  return [
    { domain:"database",prompt:`Design and implement the complete persistence layer for: ${mission}. Use ${analysis.language} compatible data access, migrations, indexes, constraints, seed data, and database tests.` },
    { domain:"auth",prompt:`Implement production authentication and authorization for: ${mission}. Include sessions, role policies, abuse controls, audit events, and security tests. Consume database contracts without editing database files.` },
    { domain:"intelligence",prompt:`Implement the domain intelligence and core decision logic for: ${mission}. Use the selected foundation ${analysis.libraries.join(", ")} and include evaluation tests.` },
    { domain:"billing",prompt:`Implement billing and commercial contracts needed by: ${mission}. If billing is unnecessary, create a documented disabled boundary with no external charges.` },
    { domain:"frontend",prompt:`Build the complete accessible user experience for: ${mission}. Integrate only through published contracts and include UI tests, loading, error, and empty states.` },
    { domain:"infrastructure",prompt:`Create the runnable project foundation, dependency manifests, integration tests, CI, observability, containers, and deployment configuration for: ${mission}. Wire the sealed domains together without moving their owned code.` },
  ];
}

export function createOrchestrator({agent,sandbox,maxRepairRounds=2}) {
  return {
    async build({mission,analysis,files=[],runTests=false,runtime="node",memory="",memoryByDomain={}}) {
      const steps=[],interfaces=[],workspace=new Map(files.map(file=>[file.path,file.content]));
      for(const item of buildPlan(mission,analysis)){
        const existing=Array.from(workspace,([path,content])=>({path,content}));
        const generated=await agent.generate({domain:item.domain,prompt:item.prompt,analysis,files:existing,memory:memoryByDomain[item.domain]||memory,interfaces:[...interfaces]});
        assertBoundary(item.domain,generated.changes);
        for(const change of generated.changes)workspace.set(change.path,change.content);
        steps.push({domain:item.domain,prompt:item.prompt,changes:generated.changes,contracts:generated.contracts||[],summary:generated.summary||null,model:generated.model||null});
        interfaces.push(...(generated.contracts||[]).map(contract=>({...contract,domain:item.domain})));
      }
      let testResult=null,repairRounds=0;
      if(runTests){
        testResult=await sandbox.run({runtime,files:Array.from(workspace,([path,content])=>({path,content}))});
        while(!testResult.passed&&repairRounds<maxRepairRounds){
          repairRounds++;
          for(const step of steps){
            const repair=await agent.generate({domain:step.domain,prompt:`Repair your domain after the integrated test failure. Preserve public contracts. Test command: ${testResult.command}. Output:\n${testResult.stderr||testResult.stdout}`,analysis,files:Array.from(workspace,([path,content])=>({path,content})),memory:memoryByDomain[step.domain]||memory,interfaces:[...interfaces]});
            assertBoundary(step.domain,repair.changes);for(const change of repair.changes)workspace.set(change.path,change.content);step.changes.push(...repair.changes);
          }
          testResult=await sandbox.run({runtime,files:Array.from(workspace,([path,content])=>({path,content}))});
        }
      }
      return {mission,steps,testResult,repairRounds,files:Array.from(workspace,([path,content])=>({path,content})),status:!runTests||testResult?.passed?"ready":"needs_review"};
    },
  };
}
