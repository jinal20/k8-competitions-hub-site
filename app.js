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

function compCard(c, kidId, extra = "") {
  const catEmoji = state.legend.categories?.[c.category]?.emoji || "";
  const links = [
    c.links?.official ? `<a href="${c.links.official}" target="_blank" rel="noopener">Official ↗</a>` : "",
    c.links?.prep ? `<a href="${c.links.prep}" target="_blank" rel="noopener">Prep ↗</a>` : "",
  ].join("");
  return `<div class="card">
    <h3>${c.name}</h3>
    <span class="chip" style="${catStyle(c.category)}">${catEmoji} ${c.category}</span>
    <span class="chip" style="${scopeStyle(c.scope)}">${c.scope}</span>
    <span class="chip" style="background:#eef">${c.entry_type}</span>
    ${extra}
    ${c.description ? `<p class="meta">${c.description}</p>` : ""}
    <div class="meta">${c.grade_label || ("Grades " + c.grades.join(", "))}${c.deadline ? " · 🗓 " + c.deadline : ""}${c.fee ? " · 💵 " + c.fee : ""}</div>
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
  app.innerHTML = `
    <div class="controls">
      <input type="search" id="q" placeholder="Search competitions…" />
      <select id="fcat">${cats.map(c => `<option>${c}</option>`).join("")}</select>
      <select id="fscope">${scopes.map(s => `<option>${s}</option>`).join("")}</select>
      <select id="ftype">${types.map(t => `<option>${t}</option>`).join("")}</select>
      <select id="fgrade">${GRADE_OPTIONS.map(g => `<option value="${g.value}">${g.label}</option>`).join("")}</select>
      <label><input type="checkbox" id="ffree" /> Free only</label>
      <span class="count" id="count"></span>
    </div>
    <div class="grid" id="grid"></div>`;
  const render = () => {
    const q = document.getElementById("q").value.toLowerCase();
    const cat = document.getElementById("fcat").value;
    const scope = document.getElementById("fscope").value;
    const type = document.getElementById("ftype").value;
    const grade = document.getElementById("fgrade").value;
    const free = document.getElementById("ffree").checked;
    const rows = state.competitions.filter(c =>
      (!q || (c.name + " " + (c.description||"") + " " + (c.notes||"")).toLowerCase().includes(q)) &&
      (cat === "All" || c.category === cat) &&
      (scope === "All" || c.scope === scope) &&
      (type === "All" || c.entry_type === type) &&
      (grade === "All" || gradeMatches(c, Number(grade))) &&
      (!free || /\$?0\b|free/i.test(c.fee || "")));
    document.getElementById("grid").innerHTML = rows.map(c => compCard(c, "")).join("") || `<p class="loading">No matches.</p>`;
    document.getElementById("count").textContent = `${rows.length} of ${state.competitions.length}`;
  };
  ["q","fcat","fscope","ftype","fgrade","ffree"].forEach(id =>
    document.getElementById(id).addEventListener("input", render));
  render();
}

// ---- placeholder views (filled in later tasks) ----
function kidView(kidId) {
  const kid = state.kids.find(k => k.id === kidId);
  if (!kid) { app.innerHTML = `<p class="error">Unknown kid.</p>`; return; }
  const byId = Object.fromEntries(state.competitions.map(c => [c.id, c]));
  const tiers = [1, 2, 3];
  const cal = (kid.calendar || []).map(e =>
    `<tr><td>${e.month}</td><td>${e.item}</td><td>${actionCell(e)}</td></tr>`).join("");
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
      `<tr><td>${r.month}</td><td>${r.kid}</td><td>${r.item}</td><td>${actionCell(r)}</td></tr>`).join("")
      || `<tr><td colspan="4" class="loading">No calendar entries.</td></tr>`;
  };
  document.getElementById("calkid").addEventListener("change", render);
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
      `<tr><td>${s.name}</td><td>${s.field||""}</td><td>${s.amount||""}</td><td>${s.merit_or_need||""}</td><td>${s.deadline||""}</td>
       <td>${s.link ? `<a href="${s.link}" target="_blank" rel="noopener">↗</a>` : ""}</td></tr>`).join("")
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
