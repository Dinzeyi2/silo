import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { runProcess } from "./process.mjs";
import { getDomain, assertBoundary } from "./domains.mjs";
import { randomUUID } from "node:crypto";

const ignored=new Set([".git","node_modules","target","dist",".next","coverage"]);
async function walk(root,current=root,result=[]){for(const entry of await readdir(current,{withFileTypes:true})){if(ignored.has(entry.name))continue;const path=join(current,entry.name);if(entry.isDirectory())await walk(root,path,result);else result.push(relative(root,path));}return result;}
const git=(cwd,...args)=>runProcess("git",args,{cwd,timeoutMs:60_000});

export async function createRepositoryWorkspace({files=[],repositoryUrl,baseRef="HEAD"}={}){
  const container=await mkdtemp(join(tmpdir(),"silo-repo-")),main=join(container,"main"),trees=join(container,"worktrees");await mkdir(trees);
  if(repositoryUrl){const cloned=await runProcess("git",["clone","--filter=blob:none","--no-tags",repositoryUrl,main],{timeoutMs:120_000});if(!cloned.passed)throw Object.assign(new Error(`Git clone failed: ${cloned.stderr}`),{code:"GIT_CLONE_FAILED"});if(baseRef!=="HEAD"){const checkout=await git(main,"checkout",baseRef);if(!checkout.passed)throw new Error(checkout.stderr);}}
  else{await mkdir(main);await git(main,"init","-b","main");for(const file of files){const target=join(main,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,file.content);}await git(main,"config","user.email","agent@silo.local");await git(main,"config","user.name","SILO");await git(main,"add","-A");await git(main,"commit","--allow-empty","-m","SILO project baseline");}
  await git(main,"config","user.email","agent@silo.local");await git(main,"config","user.name","SILO");
  return {root:main,async createDomainTree(domainName){getDomain(domainName);const suffix=randomUUID().slice(0,8),path=join(trees,`${domainName}-${suffix}`),branch=`silo/${domainName}-${suffix}`;const added=await git(main,"worktree","add","-b",branch,path);if(!added.passed)throw new Error(added.stderr);return {domain:domainName,path,branch};},async files(path=main){const paths=await walk(path);return Promise.all(paths.map(async file=>({path:file,content:await readFile(join(path,file),"utf8").catch(()=>"[BINARY FILE]"),version:1})));},async writeChanges(tree,changes){assertBoundary(tree.domain,changes);for(const change of changes){const target=join(tree.path,change.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,change.content);}await git(tree.path,"add","-A");const commit=await git(tree.path,"commit","--allow-empty","-m",`SILO ${tree.domain} specialist changes`);if(!commit.passed)throw new Error(commit.stderr);return commit;},async diff(tree){return git(tree.path,"diff","main...HEAD","--");},async merge(tree){const merged=await git(main,"merge","--no-ff","--no-edit",tree.branch);if(!merged.passed){const conflicts=(await git(main,"diff","--name-only","--diff-filter=U")).stdout.trim().split("\n").filter(Boolean);await git(main,"merge","--abort");throw Object.assign(new Error(`Merge conflict in ${conflicts.join(", ")}`),{code:"MERGE_CONFLICT",conflicts,domain:tree.domain});}return merged;},async cleanup(){await rm(container,{recursive:true,force:true});}};
}
