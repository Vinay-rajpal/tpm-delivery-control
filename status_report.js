"use strict";
/* Weekly status and readiness tool for a TPM.

Reads the tracker (Excel) and gates.csv and writes, into reports/<date>/:
  <Project>_client_report.md    what the client may see (only "Share with client = Y" items)
  <Project>_internal_brief.md   everything: escalations with reasons, next actions, readiness, changes
  client_preview.html           the client reports as they will read, for the review step
  dashboard.html                one internal page for all projects (open it by double-click)
  delivery.json                 Generated -> Reviewed -> Sent per report (see delivery.js)
It compares with snapshots/latest.json (the last run) and saves a new snapshot. The first run is a baseline.
It checks the data first and stops if the tracker or the gates are wrong.

Dates are kept as ISO text ("2026-11-09") everywhere, so there are no time-zone surprises.
Usage: node status_report.js data/tracker.xlsx --gates data/gates.csv [--date 2026-11-09] [--check] [--no-snapshot] */

const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { parseArgs } = require("node:util");
const { buildDashboard, previewHtml } = require("./dashboard");
const delivery = require("./delivery");

const LEVEL = { Occurred: 3, High: 3, Medium: 2, Low: 1 };
const IMPACT = { High: 3, Medium: 2, Low: 1 };
const RAG = { Green: 0, Amber: 1, Red: 2 };
const GATE_ORDER = { Pass: 0, Pending: 1, Blocked: 2, Fail: 3 };
const OPEN = new Set(["Open", "In progress"]);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------- dates ----------
function toIso(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10); // Excel dates arrive as UTC midnight
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim();
  return null;
}
const utc = (iso) => new Date(iso + "T00:00:00Z");
const addDays = (iso, n) => new Date(utc(iso).getTime() + n * 86400000).toISOString().slice(0, 10);
const daysBetween = (from, to) => Math.round((utc(to) - utc(from)) / 86400000);
function fmt(iso) {
  if (!iso) return "Not provided in tracker";
  const d = utc(iso);
  return `${DAYS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

// ---------- reading the files ----------
function cellValue(v) {
  if (v === undefined || v === null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") { // formula cells arrive as {formula, result}
    if ("result" in v) return cellValue(v.result);
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if ("text" in v) return v.text;
    return null;
  }
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
}

function readSheet(wb, name, problems = []) {
  const ws = wb.getWorksheet(name);
  if (!ws) throw new Error(`The tracker has no sheet called '${name}'`);
  const head = ws.getRow(1).values.map(cellValue); // 1-based; index 0 is empty
  const rows = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values;
    const row = {};
    for (let i = 1; i < head.length; i++) if (head[i] !== null) row[head[i]] = cellValue(vals[i]);
    if (Object.values(row).every((v) => v === null)) { // the table ends at the first blank row; the colour key and notes below are not data
      for (let n = r + 1; n <= ws.rowCount; n++) { // ...but a blank row in the middle of the table would hide real items, so look for them
        const first = cellValue(ws.getRow(n).values[1]);
        if (typeof first === "string" && /^[A-Z]{1,3}\d+$/.test(first.trim()))
        { problems.push(`${name}: row ${r} is blank, but row ${n} ('${first}') looks like an item below it. Delete the blank row.`); break; }
      }
      break;
    }
    rows.push(row);
  }
  return rows;
}

const score = (prob, impact) => (LEVEL[prob] || 0) * (IMPACT[impact] || 0);

async function load(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const problems = [];
  const summary = readSheet(wb, "Summary", problems).map((s) => ({
    project: s["Project"], client: s["Client"], status: s["Status"], milestone: toIso(s["Milestone date"]),
    clientSummary: s["Client summary"],
  }));
  const risks = readSheet(wb, "Risks and issues", problems).map((r) => ({
    id: r["ID"], project: r["Project"], type: r["Type"], description: r["Description"], probability: r["Probability"],
    impact: r["Impact"], owner: r["Owner"], action: r["Action"], due: toIso(r["Due date"]), status: r["Status"],
    share: r["Share with client"], score: score(r["Probability"], r["Impact"]), // recalculated, never trusted from the file
  }));
  return { summary, risks, problems };
}

function parseCsv(text) { // small CSV reader that understands "quoted, values"
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some((x) => x !== "")) rows.push(row); row = []; }
    else cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
}

function loadGates(file) {
  const [head, ...rows] = parseCsv(fs.readFileSync(file, "utf8"));
  return rows.map((r) => {
    const g = {}; head.forEach((h, i) => (g[h.trim()] = (r[i] || "").trim()));
    g.due = toIso(g.due_date);
    return g;
  });
}

// ---------- checks and rules ----------
function check(summary, risks, gates = []) {
  const errors = [], warnings = [];
  const known = new Set(summary.map((s) => s.project));
  for (const r of risks) {
    if (!(r.probability in LEVEL)) errors.push(`${r.id}: probability '${r.probability}' is not valid`);
    if (!(r.impact in IMPACT)) errors.push(`${r.id}: impact '${r.impact}' is not valid`);
    if (r.project !== "Both" && !known.has(r.project)) errors.push(`${r.id}: project '${r.project}' is not on the Summary tab (check the spelling)`);
    if (!r.owner) errors.push(`${r.id}: no owner`);
    if (!r.due) errors.push(`${r.id}: no due date`);
    if (r.share !== "Y" && r.share !== "N") errors.push(`${r.id}: 'Share with client' must be Y or N`);
  }
  const ids = risks.map((r) => r.id);
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) errors.push(`${id}: duplicate ID`);
  for (const g of gates) if (!known.has(g.project)) errors.push(`gates.csv: gate ${g.gate_id} has project '${g.project}', which is not on the Summary tab`);
  for (const s of summary) {
    if (!(s.status in RAG)) errors.push(`${s.project}: status must be Red, Amber or Green`);
    if (!s.milestone) errors.push(`${s.project}: milestone date is missing or invalid`);
    if (!s.clientSummary) warnings.push(`${s.project}: no client summary text`);
    const mine = itemsFor(risks, s.project);
    if (s.status === "Red" && !mine.some((r) => r.score >= 6)) warnings.push(`${s.project}: status is Red but no open item scores 6 or more`);
  }
  return { errors, warnings };
}

const itemsFor = (risks, project) => risks.filter((r) => (r.project === project || r.project === "Both") && OPEN.has(r.status));
const isOverdue = (r, today) => r.due < today;
// "Go-live conditions met" counts only the gates that can actually stop a release (required AND blocking), the same set the verdict uses.
const blockingGates = (gates) => gates.filter((x) => x.required === "Yes" && x.blocking === "Yes");
const gateOverdue = (x, today) => x.status !== "Pass" && !!x.due && x.due < today;
const cell = (t) => String(t ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " "); // keeps a | or a line break from breaking a Markdown table

function escalationReason(r, today) { // why an item must be escalated; empty text means it does not need to be
  const parts = [];
  if (isOverdue(r, today)) parts.push(`overdue by ${daysBetween(r.due, today)} day(s)`);
  if (r.score >= 9) parts.push(`score ${r.score} (${r.probability} x ${r.impact})`);
  return parts.join("; ");
}

function readiness(gates, project) { // GO / NO-GO / REVIEW, with the reasons. Nothing is assumed to have passed.
  const g = gates.filter((x) => x.project === project);
  if (!g.length) return { verdict: "REVIEW", gates: g, reasons: ["No gates defined for this project"] };
  const bad = [];
  for (const x of g) {
    if (!(x.status in GATE_ORDER)) bad.push(`${x.gate_id}: status '${x.status}' is not valid`);
    if (x.required !== "Yes" && x.required !== "No") bad.push(`${x.gate_id}: required must be Yes or No`);
    if (x.blocking !== "Yes" && x.blocking !== "No") bad.push(`${x.gate_id}: blocking must be Yes or No`);
  }
  if (bad.length) return { verdict: "REVIEW", gates: g, reasons: bad };
  const blocking = g.filter((x) => x.required === "Yes" && x.blocking === "Yes");
  if (!blocking.length) return { verdict: "REVIEW", gates: g, reasons: ["No required blocking gates defined"] };
  const stop = blocking.filter((x) => x.status !== "Pass");
  if (stop.length) return { verdict: "NO-GO", gates: g, reasons: stop.map((x) => `${x.gate_id} ${x.gate} [${x.status}]`) };
  return { verdict: "GO", gates: g, reasons: [] };
}

// ---------- week over week ----------
function makeSnapshot(today, summary, risks, gates) {
  const projects = {};
  for (const s of summary) {
    const items = itemsFor(risks, s.project);
    projects[s.project] = {
      status: s.status, milestone: s.milestone, open: items.map((r) => r.id).sort(),
      overdue: items.filter((r) => isOverdue(r, today)).map((r) => r.id).sort(),
    };
  }
  const rs = {}; for (const r of risks) rs[r.id] = { status: r.status, score: r.score, project: r.project, share: r.share };
  const gs = {}; for (const g of gates) gs[`${g.project}:${g.gate_id}`] = g.status;
  return { date: today, projects, risks: rs, gates: gs };
}

function compare(old, cur) { // null = baseline (no earlier run); otherwise a list of change entries
  if (!old) return null;
  const out = [];
  const add = (cat, text, projects, clientOk) => out.push({ cat, text, projects, clientOk });
  for (const [p, n] of Object.entries(cur.projects)) {
    const o = old.projects[p];
    if (!o) { add("New this week", `${p}: new project`, [p], true); continue; }
    if (o.status !== n.status) add(RAG[n.status] < RAG[o.status] ? "Improved" : "Deteriorated", `${p}: status ${o.status} -> ${n.status}`, [p], true);
    if (o.milestone !== n.milestone) add("Changed", `${p}: next milestone ${o.milestone} -> ${n.milestone}`, [p], true);
  }
  for (const [id, n] of Object.entries(cur.risks)) {
    const o = old.risks[id];
    const projects = n.project === "Both" ? Object.keys(cur.projects) : [n.project];
    const ok = n.share === "Y";
    if (!o) add("New this week", `${id} is new`, projects, ok);
    else if (o.status !== n.status) add(n.status === "Closed" ? "Resolved this week" : "Changed", `${id} status ${o.status} -> ${n.status}`, projects, ok);
    else if (o.score !== n.score) add(n.score < o.score ? "Improved" : "Deteriorated", `${id} score ${o.score} -> ${n.score}`, projects, ok);
  }
  for (const [id, o] of Object.entries(old.risks)) {
    if (!(id in cur.risks)) add("Changed", `${id} was removed from the tracker`, o.project === "Both" ? Object.keys(cur.projects) : [o.project], false);
  }
  for (const [key, st] of Object.entries(cur.gates)) {
    const o = old.gates[key];
    if (o && o !== st && o in GATE_ORDER && st in GATE_ORDER) {
      const [p, gid] = key.split(":");
      add(GATE_ORDER[st] < GATE_ORDER[o] ? "Improved" : "Deteriorated", `Gate ${gid} ${o} -> ${st}`, [p], false);
    }
  }
  return out;
}

function loadSnapshot(dir) {
  const p = path.join(dir, "latest.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null;
}

// ---------- reports ----------
function projectView(s, risks, gates, today, changes) {
  const items = itemsFor(risks, s.project).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : b.score - a.score));
  const ready = readiness(gates, s.project);
  return {
    s, items, verdict: ready.verdict, gates: ready.gates, reasons: ready.reasons,
    changes: changes === null ? null : changes.filter((c) => c.projects.includes(s.project)),
    escalate: items.map((r) => [r, escalationReason(r, today)]).filter(([, why]) => why),
    overdue: items.filter((r) => isOverdue(r, today)),
    gatesOverdue: ready.gates.filter((x) => gateOverdue(x, today)),
  };
}

// The three things to do first this week, across all projects. Overdue beats score; then higher score; then earlier due date.
function priorities(views, today, n = 3) {
  const seen = new Map();
  for (const v of views) for (const r of v.items) {
    if (!seen.has(r.id)) seen.set(r.id, { r, projects: [] });
    seen.get(r.id).projects.push(v.s.project);
  }
  return [...seen.values()]
    .map(({ r, projects }) => ({ r, projects, overdue: isOverdue(r, today), why: escalationReason(r, today) || `score ${r.score}, due ${fmt(r.due)}` }))
    .sort((a, b) => (b.overdue - a.overdue) || (b.r.score - a.r.score) || (a.r.due < b.r.due ? -1 : a.r.due > b.r.due ? 1 : 0) || (a.r.id < b.r.id ? -1 : 1))
    .slice(0, n);
}

function changeLines(changes, clientOnly = false) {
  if (changes === null) return ["First run: this is the baseline, so there is nothing to compare yet."];
  const rows = changes.filter((c) => c.clientOk || !clientOnly);
  if (!rows.length) return ["No change since the last report."];
  return rows.map((c) => `- ${c.cat}: ${c.text}`);
}

function clientReport(v, today) {
  const s = v.s;
  const shown = v.items.filter((r) => r.share === "Y").sort((a, b) => b.score - a.score || (a.due < b.due ? -1 : 1));
  const req = blockingGates(v.gates), met = req.filter((x) => x.status === "Pass").length;
  const out = [`# Weekly status: ${s.project} (${s.client})`, `Report date: ${fmt(today)}`, "", `**Status: ${s.status.toUpperCase()}**`, "",
    s.clientSummary || "Not provided in tracker", "", `**Next milestone:** ${fmt(s.milestone)}`, ""];
  if (req.length) out.push(`**Go-live conditions met:** ${met} of ${req.length}`, "");
  out.push("## Open items", "", "| ID | Item | Due | Status |", "|---|---|---|---|");
  if (shown.length) shown.forEach((r) => out.push(`| ${r.id} | ${cell(r.description)} | ${fmt(r.due)} | ${r.status} |`));
  else out.push("| - | No open items | - | - |");
  out.push("", "## Changes since the last report", "", ...changeLines(v.changes, true), "", "Next report: Friday by 17:00.");
  return out.join("\n") + "\n";
}

function internalBrief(v, today) {
  const s = v.s;
  const out = [`# INTERNAL brief: ${s.project}  (do not send)`, `Report date: ${fmt(today)}  |  Status: ${s.status}`, "", `**Go/no-go readiness: ${v.verdict}**`, ""];
  out.push(...(v.verdict !== "GO" ? v.reasons.map((x) => `- Blocking: ${x}`) : ["All required blocking gates have passed."]));
  out.push("", "Gates:", ...v.gates.map((x) => `- [${x.status}] ${x.gate_id} ${x.gate} (owner ${x.owner || "not provided"}, due ${fmt(x.due)})${gateOverdue(x, today) ? " OVERDUE" : ""}`));
  out.push("", `## Escalate to the Group CTO (${v.escalate.length})`, "", ...v.escalate.map(([r, why]) => `- ${r.id} (${why}): ${r.description}`));
  out.push("", "## Next actions, by due date", "", "| Due | ID | Owner | Action | Flag |", "|---|---|---|---|---|");
  for (const r of v.items) {
    const flag = isOverdue(r, today) ? "OVERDUE" : r.due === today ? "DUE TODAY" : r.due <= addDays(today, 7) ? "due this week" : "";
    out.push(`| ${fmt(r.due)} | ${r.id} | ${cell(r.owner)} | ${cell(r.action) || "Not provided in tracker"} | ${flag} |`);
  }
  const hidden = v.items.filter((r) => r.share === "N").map((r) => r.id);
  out.push("", `Items kept out of the client report: ${hidden.join(", ") || "none"}`, "", "## Changes since the last run", "", ...changeLines(v.changes));
  return out.join("\n") + "\n";
}

// ---------- main ----------
// The default report date is today in India (UTC+5:30), not the server's date: the GitHub runner uses UTC, and a 16:00 IST run must not be dated by a clock that can be a day behind.
const indiaToday = (now = new Date()) => delivery.istNow(now).slice(0, 10);

async function main(argv) {
  try { return await run(argv); }
  catch (e) { console.log("STOPPED: " + String(e.message).split(". ")[0].split("\n")[0]); return 1; } // a clear message, not a stack trace
}

async function run(argv) {
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { gates: { type: "string", default: "data/gates.csv" }, date: { type: "string" }, out: { type: "string", default: "reports" },
      snapshots: { type: "string", default: "snapshots" }, "no-snapshot": { type: "boolean", default: false }, check: { type: "boolean", default: false } },
  });
  if (!positionals[0]) { console.log("Usage: node status_report.js <tracker.xlsx> [--gates gates.csv] [--date YYYY-MM-DD] [--no-snapshot]"); return 1; }
  const today = values.date || indiaToday();
  if (!toIso(today)) { console.log("STOPPED: --date must look like 2026-11-09"); return 1; }
  const { summary, risks, problems } = await load(positionals[0]);
  const gates = loadGates(values.gates);
  const { errors, warnings } = check(summary, risks, gates);
  errors.unshift(...problems);
  warnings.forEach((w) => console.log("WARNING:", w));
  if (errors.length) { console.log("STOPPED: fix the tracker first."); errors.forEach((e) => console.log("ERROR:", e)); return 1; }
  if (values.check) { // validate only: write nothing, change nothing
    console.log(`CHECK OK: ${summary.length} projects, ${risks.length} items, ${gates.length} gates. Nothing was written.`);
    return 0;
  }
  const old = loadSnapshot(values.snapshots);
  const snap = makeSnapshot(today, summary, risks, gates);
  const changes = compare(old, snap);
  const folder = path.join(values.out, today);
  fs.mkdirSync(folder, { recursive: true });
  const views = summary.map((s) => projectView(s, risks, gates, today, changes));
  const texts = {};
  for (const v of views) {
    const p = v.s.project;
    texts[p] = clientReport(v, today);
    fs.writeFileSync(path.join(folder, `${p}_client_report.md`), texts[p]);
    fs.writeFileSync(path.join(folder, `${p}_internal_brief.md`), internalBrief(v, today));
    console.log(`${p}: status ${v.s.status}, readiness ${v.verdict}, escalations ${v.escalate.length}`);
  }
  const { delivery: dstate, resets } = delivery.sync(folder, today, texts);
  resets.forEach((w) => console.log("WARNING:", w));
  const top = priorities(views, today);
  console.log("Top priorities:"); top.forEach((x, i) => console.log(`  ${i + 1}. ${x.r.id} (${x.projects.join(" + ")}) ${x.why}: ${x.r.description}`));
  fs.writeFileSync(path.join(folder, "client_preview.html"), previewHtml(today, texts));
  fs.writeFileSync(path.join(folder, "dashboard.html"), buildDashboard({ today, views, old, fmt, addDays, delivery: dstate, now: new Date(), priorities: top }));
  if (!values["no-snapshot"]) {
    fs.mkdirSync(values.snapshots, { recursive: true });
    const text = JSON.stringify(snap, null, 2);
    fs.writeFileSync(path.join(values.snapshots, "latest.json"), text);
    fs.writeFileSync(path.join(values.snapshots, `${today}.json`), text);
  }
  console.log((old === null ? "Baseline run (no earlier snapshot). " : "") + `Open ${path.join(folder, "dashboard.html")}`);
  console.log(`Next: review ${path.join(folder, "client_preview.html")}, then: node delivery.js mark ${today} <Project> Reviewed`);
  return 0;
}

module.exports = { blockingGates, priorities, gateOverdue, cell, toIso, addDays, daysBetween, fmt, readSheet, score, check, itemsFor, isOverdue, escalationReason, readiness,
  makeSnapshot, compare, projectView, indiaToday, clientReport, internalBrief, loadGates, parseCsv, main };

if (require.main === module) main(process.argv.slice(2)).then((c) => process.exit(c));
