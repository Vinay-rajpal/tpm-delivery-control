"use strict";
/* Delivery tracking: was each client report reviewed and sent?
Each report moves Generated -> Reviewed -> Sent, recorded in reports/<date>/delivery.json.
Rules: it cannot be marked Sent before Reviewed; if the report text changes after it was reviewed, it goes back to Generated
(a stale "Reviewed" must never survive a regenerated report). The record is advisory: nobody can prove an email arrived.

  node delivery.js status 2026-11-09 [--out reports] [--strict]
  node delivery.js mark   2026-11-09 Kavach Reviewed|Sent [--out reports]                                           */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseArgs } = require("node:util");

const file = (folder) => path.join(folder, "delivery.json");
const hash = (text) => crypto.createHash("sha256").update(text).digest("hex");
const load = (folder, date) => (fs.existsSync(file(folder)) ? JSON.parse(fs.readFileSync(file(folder), "utf8")) : { date, projects: {} });
const save = (folder, d) => fs.writeFileSync(file(folder), JSON.stringify(d, null, 2) + "\n");

function sync(folder, date, reports) { // reports = { project: markdown text }
  const d = load(folder, date), resets = [];
  for (const [project, text] of Object.entries(reports)) {
    const h = hash(text), prior = d.projects[project];
    if (prior && prior.reportHash !== h && prior.stage !== "Generated") resets.push(`${project}: the report changed after it was ${prior.stage}. Review it again.`);
    if (!prior || prior.reportHash !== h) d.projects[project] = { stage: "Generated", updatedAt: null, reportHash: h };
  }
  save(folder, d);
  return { delivery: d, resets };
}

function mark(folder, date, project, stage, now = new Date()) {
  const d = load(folder, date), cur = d.projects[project];
  if (!cur) throw new Error(`No report for '${project}' on ${date}. Run the report tool first.`);
  if (stage !== "Reviewed" && stage !== "Sent") throw new Error("Stage must be Reviewed or Sent");
  if (stage === "Reviewed" && cur.stage !== "Generated") throw new Error(`${project} is already ${cur.stage}`);
  if (stage === "Sent" && cur.stage !== "Reviewed") throw new Error(cur.stage === "Sent" ? `${project} is already Sent` : `Review ${project} before marking it Sent`);
  d.projects[project] = { ...cur, stage, updatedAt: now.toISOString() };
  save(folder, d);
  return d;
}

// The client report is due by 17:00 India time (UTC+5:30) on the report date.
const istNow = (now = new Date()) => new Date(now.getTime() + 19800000).toISOString().slice(0, 16); // "2026-11-09T17:30"
const isLate = (date, now = new Date()) => istNow(now) >= `${date}T17:00`;
const pending = (d, now = new Date()) =>
  Object.entries(d.projects).filter(([, v]) => v.stage !== "Sent").map(([project, v]) => ({ project, stage: v.stage, late: isLate(d.date, now) }));

function cli(argv) {
  try {
    const { values, positionals: [command, date, project, stage] } = parseArgs({ args: argv, allowPositionals: true,
      options: { out: { type: "string", default: "reports" }, strict: { type: "boolean", default: false } } });
    const folder = path.join(values.out, date || "");
    if (!["status", "mark"].includes(command) || !date || (command === "mark" && !(project && stage)))
      throw new Error("Usage: node delivery.js status DATE | node delivery.js mark DATE PROJECT Reviewed|Sent");
    if (!fs.existsSync(folder)) throw new Error(`No reports for ${date} in ${values.out}. Run the report tool first.`);
    const d = command === "mark" ? mark(folder, date, project, stage) : load(folder, date);
    for (const [p, v] of Object.entries(d.projects)) console.log(`${p}: ${v.stage}`);
    const late = pending(d).filter((x) => x.late);
    late.forEach((x) => console.log(`${x.project}: DELIVERY OVERDUE (still ${x.stage}, was due 17:00 IST on ${date})`));
    if (command === "status") console.log("Advisory only: this records what you tell it, not whether an email arrived.");
    return values.strict && late.length ? 1 : 0;
  } catch (e) { console.log("STOPPED: " + e.message); return 1; }
}

module.exports = { sync, mark, load, pending, isLate, istNow, hash, cli };
if (require.main === module) process.exitCode = cli(process.argv.slice(2));
