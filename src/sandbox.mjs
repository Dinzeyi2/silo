import { mkdtemp, rm, writeFile, mkdir, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";

const IMAGES = Object.freeze({ node: "node:22-alpine", python: "python:3.12-alpine", rust: "rust:1.82-alpine", go: "golang:1.23-alpine" });
const COMMANDS = Object.freeze({ node: "npm test -- --runInBand", python: "python -m unittest discover", rust: "cargo test", go: "go test ./..." });

export function createSandbox({ runner = spawn, timeoutMs = 120_000, docker = "docker" } = {}) {
  return {
    async run({ runtime, files, command }) {
      if (!IMAGES[runtime]) throw Object.assign(new Error(`Unsupported runtime: ${runtime}`), { status: 400 });
      if (command && command !== COMMANDS[runtime]) throw Object.assign(new Error("Custom commands are disabled; use the runtime test command"), { status: 403, code: "SANDBOX_COMMAND_DENIED" });
      const workspace = await mkdtemp(join(tmpdir(), "silo-run-"));
      try {
        await chmod(workspace,0o777);
        for (const file of files) { const target=join(workspace,file.path); if(!target.startsWith(workspace)||file.path.includes("..")) throw Object.assign(new Error("Unsafe workspace path"),{status:400}); await mkdir(dirname(target),{recursive:true,mode:0o777}); await chmod(dirname(target),0o777); await writeFile(target,file.content,{mode:0o644}); }
        const args=["run","--rm","--network","none","--memory","512m","--cpus","1","--pids-limit","128","--security-opt","no-new-privileges","--cap-drop","ALL","--user","65534:65534","-v",`${workspace}:/workspace:rw`,"-w","/workspace",IMAGES[runtime],"sh","-lc",COMMANDS[runtime]];
        const result=await new Promise((resolve,reject)=>{const child=runner(docker,args,{stdio:["ignore","pipe","pipe"]});let stdout="",stderr="",bytes=0;const collect=key=>chunk=>{bytes+=chunk.length;if(bytes<1_000_000){if(key==="out")stdout+=chunk;else stderr+=chunk;}};child.stdout.on("data",collect("out"));child.stderr.on("data",collect("err"));child.on("error",error=>reject(Object.assign(new Error(error.code==="ENOENT"?"Docker is not available on this SILO worker":error.message),{status:503,code:"SANDBOX_UNAVAILABLE"})));const timer=setTimeout(()=>{child.kill("SIGKILL");reject(Object.assign(new Error("Sandbox timed out"),{status:408,code:"SANDBOX_TIMEOUT"}));},timeoutMs);child.on("close",code=>{clearTimeout(timer);resolve({exitCode:code,stdout,stderr,passed:code===0,image:IMAGES[runtime],command:COMMANDS[runtime]});});});
        return result;
      } finally { await rm(workspace,{recursive:true,force:true}); }
    },
    runtimes: Object.keys(IMAGES),
  };
}
