import test from "node:test";
import assert from "node:assert/strict";
import { createRepositoryWorkspace } from "../src/worktree.mjs";

test("specialists edit real isolated Git worktrees and merge through commits",async()=>{const repository=await createRepositoryWorkspace({files:[{path:"README.md",content:"baseline"}]});try{const tree=await repository.createDomainTree("auth");await repository.writeChanges(tree,[{path:"auth/session.ts",content:"export const secure = true;"}]);const diff=await repository.diff(tree);assert.match(diff.stdout,/auth\/session\.ts/);await repository.merge(tree);const files=await repository.files();assert.ok(files.some(file=>file.path==="auth/session.ts"));}finally{await repository.cleanup();}});

test("worktree refuses cross-domain changes before Git sees them",async()=>{const repository=await createRepositoryWorkspace();try{const tree=await repository.createDomainTree("auth");await assert.rejects(()=>repository.writeChanges(tree,[{path:"db/private.sql",content:"private"}]),error=>error.code==="BOUNDARY_VIOLATION");}finally{await repository.cleanup();}});
