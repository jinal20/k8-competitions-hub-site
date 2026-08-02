const state = { legend:{}, competitions:[], scholarships:[], kids:[] };
const app = document.getElementById("app");

async function loadJSON(name) {
  const res = await fetch(`data/${name}.json`);
  if (!res.ok) throw new Error(`Failed to load data/${name}.json (${res.status})`);
  return res.json();
}

function catStyle(cat) {
  const c = state.legend.categories?.[cat];
  return c ? `background:#${c.color}` : "background:#eee";
}
function scopeStyle(scope) {
  const c = state.legend.scopes?.[scope];
  return c ? `background:#${c.color}` : "background:#eee";
}

// ---- localStorage tracking ----
const STATUSES = ["Not started", "Registered", "Done"];
function statusKey(kidId, compId) { return `status:${kidId || "all"}:${compId}`; }
function getStatus(kidId, compId) {
  try { return localStorage.getItem(statusKey(kidId, compId)) || STATUSES[0]; }
  catch { return STATUSES[0]; }
}
function setStatus(kidId, compId, val) {
  try { localStorage.setItem(statusKey(kidId, compId), val); } catch {}
}
function statusControl(kidId, compId) {
  const cur = getStatus(kidId, compId);
  const opts = STATUSES.map(s => `<option ${s === cur ? "selected" : ""}>${s}</option>`).join("");
  return `<div class="status"><select data-kid="${kidId || ""}" data-comp="${compId}">${opts}</select></div>`;
}

// Urgency ONLY for exact-tier (real day+month+year in source). Approx never urgent.
function deadlineChip(c) {
  if (!c.deadline) return "";
  const now = new Date().getMonth() + 1; // 1-12; ordering-only, display uses raw text
  let cls = "dl-neutral";
  if (c.deadline_tier === "unknown") cls = "dl-tbd";
  else if (c.deadline_tier === "exact" && c.deadline_month != null) {
    const diff = (c.deadline_month - now + 12) % 12;
    cls = diff <= 1 ? "dl-soon" : diff <= 3 ? "dl-near" : "dl-neutral";
  }
  const mark = c.deadline_tier === "approx" ? "~" : "";
  return `<span class="chip ${cls}" title="${mark}${c.deadline_month ?? "TBD"}">🗓 ${c.deadline}</span>`;
}

// ---- filter persistence ----
function saveFilters(o){ try{ localStorage.setItem("filters:directory", JSON.stringify(o)); }catch{} }
function loadFilters(){ try{ return JSON.parse(localStorage.getItem("filters:directory")||"{}"); }catch{ return {}; } }

// ---- progress export/import ----
function exportProgress() {
  const data = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith("status:")) data[k] = localStorage.getItem(k);
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "k8-hub-progress.json"; a.click();
  URL.revokeObjectURL(a.href);
}
function importProgress(file, onDone) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (!obj || typeof obj !== "object") throw new Error("bad");
      let n = 0;
      for (const [k, v] of Object.entries(obj)) {
        if (k.startsWith("status:") && typeof v === "string") { localStorage.setItem(k, v); n++; }
      }
      onDone(null, n);
    } catch { onDone(new Error("Invalid progress file"), 0); }
  };
  r.readAsText(file);
}

function compCard(c, kidId, extra = "") {
  const catEmoji = state.legend.categories?.[c.category]?.emoji || "";
  const links = [
    c.links?.official ? `<a href="${c.links.official}" target="_blank" rel="noopener">Official ↗</a>` : "",
    c.links?.prep ? `<a href="${c.links.prep}" target="_blank" rel="noopener">Prep ↗</a>` : "",
  ].join("");
  return `<div class="card" style="border-left:4px solid #${state.legend.categories?.[c.category]?.color || '2f6df0'}">
    <h3>${c.name}</h3>
    <span class="chip" style="${catStyle(c.category)}">${catEmoji} ${c.category}</span>
    <span class="chip" style="${scopeStyle(c.scope)}">${c.scope}</span>
    <span class="chip" style="background:#eef">${c.entry_type}</span>
    ${extra}
    ${c.description ? `<p class="meta">${c.description}</p>` : ""}
    <div class="meta">${c.grade_label || ("Grades " + c.grades.join(", "))}${c.deadline ? " · " + deadlineChip(c) : ""}${c.fee ? " · 💵 " + c.fee : ""}</div>
    <div>${links}</div>
    ${statusControl(kidId, c.id)}
  </div>`;
}

// Grade filter: a competition matches a grade if that grade falls within the
// competition's grade span (min..max of its grades array). Handles ranges like
// [0,5,8] ("K–8") and single grades like [7] uniformly.
const GRADE_OPTIONS = [
  { value: "All", label: "Any grade" },
  { value: "0", label: "Kindergarten" },
  ...Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: `Grade ${i + 1}` })),
];
function gradeMatches(comp, grade) {
  const gs = comp.grades;
  if (!Array.isArray(gs) || !gs.length) return true;
  return grade >= Math.min(...gs) && grade <= Math.max(...gs);
}

function directoryView() {
  const cats = ["All", ...Object.keys(state.legend.categories || {})];
  const scopes = ["All", ...Object.keys(state.legend.scopes || {})];
  const types = ["All", ...Object.keys(state.legend.entry_types || {})];
  const presetGrades = [...new Set(state.kids.map(k => k.grade))];
  const presets = [
    ...presetGrades.map(g => {
      const kid = state.kids.find(k => k.grade === g);
      return `<button data-grade="${g}">${kid ? kid.label : "Grade " + g}</button>`;
    }),
    `<button data-grade="All">Everyone</button>`,
  ].join("");
  app.innerHTML = `
    <div class="controls">
      <input type="search" id="q" placeholder="Search competitions…" />
      <select id="fcat">${cats.map(c => `<option>${c}</option>`).join("")}</select>
      <select id="fscope">${scopes.map(s => `<option>${s}</option>`).join("")}</select>
      <select id="ftype">${types.map(t => `<option>${t}</option>`).join("")}</select>
      <span class="presets" id="presets">${presets}</span>
      <select id="fgrade">${GRADE_OPTIONS.map(g => `<option value="${g.value}">${g.label}</option>`).join("")}</select>
      <label><input type="checkbox" id="ffree" /> Free only</label>
      <select id="fsort">
        <option value="deadline">Deadline (soonest)</option>
        <option value="name">Name (A–Z)</option>
        <option value="grade">Grade</option>
      </select>
      <button id="exp">⬇ Export progress</button><label class="imp">⬆ Import<input type="file" id="impf" accept="application/json" hidden></label>
      <span class="count" id="count"></span>
    </div>
    <div class="pills" id="pills"></div>
    <div class="grid" id="grid"></div>`;
  const saved = loadFilters();
  if (saved.q != null) document.getElementById("q").value = saved.q;
  if (saved.cat != null) document.getElementById("fcat").value = saved.cat;
  if (saved.scope != null) document.getElementById("fscope").value = saved.scope;
  if (saved.type != null) document.getElementById("ftype").value = saved.type;
  if (saved.grade != null) document.getElementById("fgrade").value = saved.grade;
  if (saved.free != null) document.getElementById("ffree").checked = saved.free;
  if (saved.sort != null) document.getElementById("fsort").value = saved.sort;
  const filterLabel = (id, val) => {
    const el = document.getElementById(id);
    const opt = [...el.options].find(o => o.value === val);
    return opt ? opt.textContent : val;
  };
  const render = () => {
    const q = document.getElementById("q").value.toLowerCase();
    const cat = document.getElementById("fcat").value;
    const scope = document.getElementById("fscope").value;
    const type = document.getElementById("ftype").value;
    const grade = document.getElementById("fgrade").value;
    const free = document.getElementById("ffree").checked;
    const sort = document.getElementById("fsort").value;
    saveFilters({q,cat,scope,type,grade,free,sort});
    const rows = state.competitions.filter(c =>
      (!q || (c.name + " " + (c.description||"") + " " + (c.notes||"")).toLowerCase().includes(q)) &&
      (cat === "All" || c.category === cat) &&
      (scope === "All" || c.scope === scope) &&
      (type === "All" || c.entry_type === type) &&
      (grade === "All" || gradeMatches(c, Number(grade))) &&
      (!free || /\$?0\b|free/i.test(c.fee || "")));
    rows.sort((a, b) =>
      sort === "name" ? a.name.localeCompare(b.name)
      : sort === "grade" ? (Math.min(...(a.grades||[99])) - Math.min(...(b.grades||[99]))) || a.name.localeCompare(b.name)
      : (a.deadline_sort - b.deadline_sort) || a.name.localeCompare(b.name));
    document.getElementById("grid").innerHTML = rows.map(c => compCard(c, "")).join("") || `<p class="loading">No matches.</p>`;
    document.getElementById("count").textContent = `${rows.length} of ${state.competitions.length}`;

    document.querySelectorAll("#presets button").forEach(b =>
      b.classList.toggle("active", b.dataset.grade === grade));

    const pills = [];
    if (q) pills.push({ id: "q", label: `Search: "${q}"` });
    if (cat !== "All") pills.push({ id: "fcat", label: `Category: ${cat}` });
    if (scope !== "All") pills.push({ id: "fscope", label: `Scope: ${scope}` });
    if (type !== "All") pills.push({ id: "ftype", label: `Type: ${type}` });
    if (grade !== "All") pills.push({ id: "fgrade", label: `Grade: ${filterLabel("fgrade", grade)}` });
    if (free) pills.push({ id: "ffree", label: "Free only" });
    document.getElementById("pills").innerHTML = pills.map(p =>
      `<span class="pill" data-clear="${p.id}">${p.label} ✕</span>`).join("");
  };
  document.getElementById("presets").addEventListener("click", e => {
    const btn = e.target.closest("button[data-grade]");
    if (!btn) return;
    document.getElementById("fgrade").value = btn.dataset.grade;
    render();
  });
  document.getElementById("pills").addEventListener("click", e => {
    const pill = e.target.closest(".pill[data-clear]");
    if (!pill) return;
    const id = pill.dataset.clear;
    const el = document.getElementById(id);
    if (id === "q") el.value = "";
    else if (id === "ffree") el.checked = false;
    else el.value = "All";
    render();
  });
  ["q","fcat","fscope","ftype","fgrade","ffree","fsort"].forEach(id =>
    document.getElementById(id).addEventListener("input", render));
  document.getElementById("exp").addEventListener("click", exportProgress);
  document.getElementById("impf").addEventListener("change", e => {
    const file = e.target.files[0];
    if (file) importProgress(file, (err, n) => { if (err) alert(err.message); else { render(); alert(`Imported ${n} items`); } });
  });
  render();
}

// ---- placeholder views (filled in later tasks) ----
function kidView(kidId) {
  const kid = state.kids.find(k => k.id === kidId);
  if (!kid) { app.innerHTML = `<p class="error">Unknown kid.</p>`; return; }
  const byId = Object.fromEntries(state.competitions.map(c => [c.id, c]));
  const tiers = [1, 2, 3];
  const cal = (kid.calendar || []).map(e =>
    `<tr><td data-label="When">${e.month}</td><td data-label="Item">${e.item}</td><td data-label="Action">${actionCell(e)}</td></tr>`).join("");
  let html = `<h2>${kid.label} · Grade ${kid.grade}</h2>`;
  if (cal) html += `<h3>Upcoming</h3><table><thead><tr><th>When</th><th>Item</th><th>Action</th></tr></thead><tbody>${cal}</tbody></table>`;
  for (const t of tiers) {
    const picks = (kid.picks || []).filter(p => p.tier === t);
    if (!picks.length) continue;
    html += `<div class="tier">Tier ${t}${t === 1 ? ' <span class="star">★ priority</span>' : ""}</div><div class="grid">`;
    for (const p of picks) {
      const c = byId[p.competition];
      if (!c) continue;
      const extra = [
        p.star ? '<span class="chip star">★</span>' : "",
        p.prep ? `<p class="meta">📚 ${p.prep}</p>` : "",
        p.note ? `<p class="meta">📝 ${p.note}</p>` : "",
      ].join("");
      html += compCard(c, kidId, extra);
    }
    html += `</div>`;
  }
  app.innerHTML = html;
}
const MONTH_ORDER = ["Aug-Sep","Oct-Nov","Nov","Dec-Jan","Jan","Jan 29","Jan-Mar","Feb-Mar","Mar","Apr 2","Apr 18","May-Jun","Jun 12"];
function monthRank(m) { const i = MONTH_ORDER.indexOf(m); return i === -1 ? 99 : i; }

// Render a calendar entry's action as a registration link when one is present.
function actionCell(e) {
  if (!e.link) return e.action;
  return `<a href="${e.link}" target="_blank" rel="noopener">${e.action} ↗</a>`;
}

function calendarView() {
  app.innerHTML = `
    <div class="controls">
      <label>Show: <select id="calkid">
        <option value="all">Both kids</option>
        <option value="7th-grader">7th Grader</option>
        <option value="1st-grader">1st Grader</option>
      </select></label>
    </div>
    <table><thead><tr><th>When</th><th>Kid</th><th>Item</th><th>Action</th></tr></thead>
    <tbody id="calbody"></tbody></table>`;
  const render = () => {
    const pick = document.getElementById("calkid").value;
    const rows = [];
    for (const kid of state.kids) {
      if (pick !== "all" && kid.id !== pick) continue;
      for (const e of kid.calendar || []) rows.push({ ...e, kid: kid.label });
    }
    rows.sort((a, b) => monthRank(a.month) - monthRank(b.month));
    document.getElementById("calbody").innerHTML = rows.map(r =>
      `<tr><td data-label="When">${r.month}</td><td data-label="Kid">${r.kid}</td><td data-label="Item">${r.item}</td><td data-label="Action">${actionCell(r)}</td></tr>`).join("")
      || `<tr><td colspan="4" class="loading">No calendar entries.</td></tr>`;
  };
  document.getElementById("calkid").addEventListener("change", render);
  render();
}
function deadlinesView() {
  const kidOpts = [`<option value="all">Both kids</option>`,
    ...state.kids.map(k => `<option value="${k.grade}">${k.label}</option>`)].join("");
  app.innerHTML = `
    <div class="controls"><label>For: <select id="dlkid">${kidOpts}</select></label>
      <span class="count" id="dlcount"></span></div>
    <table><thead><tr><th>Deadline</th><th>Competition</th><th>Category</th><th>Grades</th><th>Action</th></tr></thead>
    <tbody id="dlbody"></tbody></table>`;
  const render = () => {
    const g = document.getElementById("dlkid").value;
    const grades = g === "all" ? state.kids.map(k => k.grade) : [Number(g)];
    const rows = state.competitions
      .filter(c => grades.some(gr => gradeMatches(c, gr)))
      .sort((a, b) => (a.deadline_sort - b.deadline_sort) || a.name.localeCompare(b.name));
    const known = rows.filter(r => r.deadline_tier !== "unknown");
    const tbd = rows.filter(r => r.deadline_tier === "unknown");
    const row = c => `<tr><td data-label="Deadline">${deadlineChip(c) || "—"}</td><td data-label="Competition">${c.name}</td><td data-label="Category">${c.category||""}</td>
      <td data-label="Grades">${c.grade_label || (c.grades||[]).join(", ")}</td>
      <td data-label="Action">${c.links?.official ? `<a href="${c.links.official}" target="_blank" rel="noopener">Register ↗</a>` : "—"}</td></tr>`;
    document.getElementById("dlbody").innerHTML =
      known.map(row).join("") +
      (tbd.length ? `<tr><td colspan="5" class="tier">Date TBD</td></tr>` + tbd.map(row).join("") : "")
      || `<tr><td colspan="5" class="loading">No competitions.</td></tr>`;
    document.getElementById("dlcount").textContent = `${rows.length} eligible`;
  };
  document.getElementById("dlkid").addEventListener("change", render);
  render();
}
function scholarshipsView() {
  if (!state.scholarships.length) {
    app.replaceChildren();
    const p = document.createElement("p");
    p.className = "loading";
    p.textContent = "No scholarships are published here yet.";
    app.appendChild(p);
    return;
  }
  app.innerHTML = `
    <div class="controls">
      <input type="search" id="sq" placeholder="Search scholarships…" />
      <select id="smn"><option>All</option><option>Merit</option><option>Need</option><option>Both</option></select>
      <span class="count" id="scount"></span>
    </div>
    <table><thead><tr><th>Name</th><th>Field</th><th>Amount</th><th>Merit/Need</th><th>Deadline</th><th>Link</th></tr></thead>
    <tbody id="sbody"></tbody></table>`;
  const render = () => {
    const q = document.getElementById("sq").value.toLowerCase();
    const mn = document.getElementById("smn").value;
    const rows = state.scholarships.filter(s =>
      (!q || (s.name + " " + (s.field||"") + " " + (s.eligibility||"")).toLowerCase().includes(q)) &&
      (mn === "All" || (s.merit_or_need || "").toLowerCase().includes(mn.toLowerCase())));
    document.getElementById("sbody").innerHTML = rows.map(s =>
      `<tr><td data-label="Name">${s.name}</td><td data-label="Field">${s.field||""}</td><td data-label="Amount">${s.amount||""}</td><td data-label="Merit/Need">${s.merit_or_need||""}</td><td data-label="Deadline">${s.deadline||""}</td>
       <td data-label="Link">${s.link ? `<a href="${s.link}" target="_blank" rel="noopener">↗</a>` : ""}</td></tr>`).join("")
      || `<tr><td colspan="6" class="loading">No matches.</td></tr>`;
    document.getElementById("scount").textContent = `${rows.length} of ${state.scholarships.length}`;
  };
  ["sq","smn"].forEach(id => document.getElementById(id).addEventListener("input", render));
  render();
}

function route(view) {
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  if (view === "directory") directoryView();
  else if (view.startsWith("kid:")) kidView(view.slice(4));
  else if (view === "calendar") calendarView();
  else if (view === "deadlines") deadlinesView();
  else if (view === "scholarships") scholarshipsView();
}

// delegated status-change listener (survives re-renders)
app.addEventListener("change", e => {
  const sel = e.target.closest("select[data-comp]");
  if (sel) setStatus(sel.dataset.kid, sel.dataset.comp, sel.value);
});

async function init() {
  try {
    const [legend, competitions, scholarships, kids] = await Promise.all(
      ["legend","competitions","scholarships","kids"].map(loadJSON));
    Object.assign(state, { legend, competitions, scholarships, kids });
    document.querySelectorAll("#nav button").forEach(b =>
      b.addEventListener("click", () => route(b.dataset.view)));
    route("directory");
  } catch (err) {
    app.innerHTML = `<p class="error">${err.message}<br>Did you run <code>npm run build</code>?</p>`;
  }
}
init();
