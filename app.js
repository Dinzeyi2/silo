const mission = document.querySelector("#mission");
const count = document.querySelector("#count");
const modal = document.querySelector("#modal");
let session;

mission.addEventListener("input", () => {
  count.textContent = `${mission.value.length.toLocaleString()} / 2,000`;
});

document.querySelector("#architect").addEventListener("click", async () => {
  modal.hidden = false;
  document.body.style.overflow = "hidden";
  const trigger = document.querySelector("#architect");
  trigger.disabled = true;
  document.querySelector("#modal-copy").textContent = "SILO is evaluating languages, libraries, security controls, and domain boundaries…";
  try {
    const response = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "NOVA ONE", mission: mission.value, ownerName: "Alex Morgan", ownerRole: document.querySelector("#owner-role").value }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    sessionStorage.setItem("silo-session", JSON.stringify(data.credentials));
    session = { projectId:data.project.id, token:data.credentials.token, role:document.querySelector("#owner-role").value };
    document.querySelector("#session-state").textContent = `${session.role} specialist connected`;
    const analysis = data.analysis;
    document.querySelector("#recommended-stack").textContent = analysis.libraries.join(" + ");
    document.querySelector("#recommendation-reason").textContent = analysis.rationale;
    document.querySelector("#fit-score").innerHTML = `${analysis.fitScore}<small>/100 fit</small>`;
    document.querySelector("#analysis-copy").innerHTML = `SILO selected <b>${analysis.language}</b> and evaluated the foundation against delivery, safety, and deployment constraints.`;
    document.querySelector("#line-estimate").textContent = `${analysis.estimatedLines.low.toLocaleString()}–${analysis.estimatedLines.high.toLocaleString()}`;
    document.querySelector("#modal-fit").textContent = `${analysis.fitScore}%`;
    document.querySelector("#modal-copy").textContent = `${analysis.projectType}: ${analysis.codingStyle}. Each specialist is locked to its own file boundaries.`;
    connectRealtime(data.project.id, data.credentials.token);
    const queued=await projectRequest("/builds",{method:"POST",body:JSON.stringify({mission:mission.value,runTests:false})});
    session.lastBuildId=queued.build.id;
    document.querySelector("#modal-copy").textContent += ` Whole-project build ${queued.build.id.slice(0,8)} is running across all six specialists.`;
    const completed=await waitForBuild(queued.build.id);
    document.querySelector("#modal-copy").textContent += ` Final status: ${completed.status}.`;
  } catch (error) {
    document.querySelector("#modal-title").textContent = "Architecture could not be created";
    document.querySelector("#modal-copy").textContent = error.message;
  } finally { trigger.disabled = false; }
});

async function waitForBuild(buildId) {
  for (let attempt=0;attempt<180;attempt++) {
    const {build}=await projectRequest(`/builds/${buildId}`);
    if (["ready","needs_review","failed","cancelled"].includes(build.status)) return build;
    await new Promise(resolve=>setTimeout(resolve,2000));
  }
  throw new Error("The build is still running. You can safely return to it from project activity.");
}

let eventStream;
function connectRealtime(projectId, token) {
  eventStream?.close();
  eventStream = new EventSource(`/api/projects/${projectId}/stream?access_token=${encodeURIComponent(token)}`);
  for (const type of ["member.joined", "build.queued", "job.queued", "job.completed", "task.proposed", "task.applied", "war_room.opened", "war_room.voted", "war_room.resolved", "stack.swapped", "sandbox.started", "sandbox.finished", "project.published"]) {
    eventStream.addEventListener(type, event => {
      const update = JSON.parse(event.data);
      const item = document.createElement("div");
      item.className = "event";
      item.innerHTML = `<span class="avatar violet">S</span><p><b>SILO</b> ${type.replaceAll(".", " ")}<small>Live · ${new Date(update.createdAt).toLocaleTimeString()}</small></p>`;
      document.querySelector(".activity").insertBefore(item, document.querySelector(".activity .event"));
    });
  }
}

const output=document.querySelector("#operation-output");
async function projectRequest(path,options={}){if(!session)throw new Error("Create the project architecture first");const response=await fetch(`/api/projects/${session.projectId}${path}`,{...options,headers:{"content-type":"application/json",authorization:`Bearer ${session.token}`,...options.headers}});const data=await response.json();if(!response.ok)throw new Error(data.error);return data;}
function bindForm(id,action){document.querySelector(id).addEventListener("submit",async event=>{event.preventDefault();output.textContent="Working…";try{output.textContent=JSON.stringify(await action(),null,2);}catch(error){output.textContent=`Error: ${error.message}`;}});}
bindForm("#task-form",async()=>{if(!session.conversationId){const {conversation}=await projectRequest("/conversations",{method:"POST",body:JSON.stringify({domain:session.role,title:`${session.role} specialist workspace`})});session.conversationId=conversation.id;}return projectRequest(`/conversations/${session.conversationId}/message`,{method:"POST",body:JSON.stringify({content:document.querySelector("#task-prompt").value})});});
bindForm("#research-form",()=>projectRequest(`/files?ecosystem=${encodeURIComponent(document.querySelector("#ecosystem").value)}&research=${encodeURIComponent(document.querySelector("#research-query").value)}`));
bindForm("#run-form",()=>projectRequest("/runs",{method:"POST",body:JSON.stringify({runtime:document.querySelector("#runtime").value})}));
bindForm("#publish-form",()=>projectRequest("/publish",{method:"POST",body:JSON.stringify({owner:document.querySelector("#github-owner").value,repo:document.querySelector("#github-repo").value,githubToken:document.querySelector("#github-token").value,branch:"main"})}));

function closeModal() {
  modal.hidden = true;
  document.body.style.overflow = "";
}

modal.querySelector(".close").addEventListener("click", closeModal);
modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });

document.querySelectorAll(".view-toggle button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".view-toggle button").forEach(item => item.classList.remove("selected"));
    button.classList.add("selected");
    document.querySelector(".architecture").classList.toggle("list-view", button.textContent === "List");
  });
});

document.querySelector("#add-agent button").addEventListener("click", () => {
  const button = document.querySelector("#add-agent button");
  button.innerHTML = "<span>✓</span><b>Specialist requested</b><small>SILO is matching the right expert</small>";
});
