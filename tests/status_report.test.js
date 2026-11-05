"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ExcelJS = require("exceljs");
const sr = require("../status_report");

const ROOT = path.join(__dirname, "..");
const TODAY = "2026-11-09";
const R = (o = {}) => ({ id: "R1", project: "Kavach", probability: "Occurred", impact: "High", owner: "Dev", due: "2026-11-10", status: "Open",
  share: "Y", description: "x", action: "a", score: 9, ...o });
const G = (status, o = {}) => ({ project: "K", gate_id: "G", gate: "c", required: "Yes", status, blocking: "Yes", owner: "o", due: TODAY, ...o });

test("score", () => {
  assert.equal(sr.score("Occurred", "High"), 9);
  assert.equal(sr.score("Medium", "Medium"), 4);
  assert.equal(sr.score("Low", "Low"), 1);
});

test("overdue and escalation reasons", () => {
  const late = R({ due: "2026-11-08" });
  assert.ok(sr.isOverdue(late, TODAY));
  assert.ok(!sr.isOverdue(R(), TODAY));
  assert.match(sr.escalationReason(R(), TODAY), /score 9/);
  assert.match(sr.escalationReason(late, TODAY), /overdue by 1/);
  assert.equal(sr.escalationReason(R({ score: 4 }), TODAY), "");
});

test("data checks reject bad data and duplicate IDs", () => {
  const summary = [{ project: "Kavach", status: "Red", clientSummary: "ok", milestone: TODAY }];
  let { errors } = sr.check(summary, [R({ owner: null, due: null }), R({ id: "R2" })]);
  assert.ok(errors.some((e) => e.includes("no owner")) && errors.some((e) => e.includes("no due date")));
  ({ errors } = sr.check(summary, [R(), R()]));
  assert.ok(errors.some((e) => e.includes("duplicate ID")));
});

test("readiness: GO, NO-GO and REVIEW", () => {
  const v = (gates) => sr.readiness(gates, "K").verdict;
  assert.equal(v([G("Pass"), G("Pass")]), "GO");
  assert.equal(v([G("Pass"), G("Pending")]), "NO-GO");
  assert.equal(v([G("Pass"), G("Blocked")]), "NO-GO");
  assert.equal(v([G("Pass"), G("Fail")]), "NO-GO");
  assert.equal(v([G("Pass"), G("Pending", { required: "No", blocking: "No" })]), "GO"); // optional gate does not block
  assert.equal(v([G("Maybe")]), "REVIEW");                                              // invalid data
  assert.equal(v([]), "REVIEW");                                                         // nothing defined
});

test("client report hides internal items and shows 'Both' items", () => {
  const s = { project: "Kavach", client: "C", status: "Red", clientSummary: "hello", milestone: TODAY };
  const risks = [R({ id: "R1" }), R({ id: "R8", share: "N" }), R({ id: "R9", project: "Both" })];
  const text = sr.clientReport(sr.projectView(s, risks, [], TODAY, null), TODAY);
  assert.ok(text.includes("R1") && text.includes("R9") && !text.includes("R8"));
  assert.ok(text.includes("baseline"));
});

test("snapshot: baseline, then changes, then no change", () => {
  const sum = (status) => [{ project: "Kavach", status, milestone: TODAY }];
  const old = sr.makeSnapshot(TODAY, sum("Red"), [R({ id: "R1" }), R({ id: "R2" })], [G("Pending")]);
  assert.equal(sr.compare(null, old), null); // the first run is a baseline
  const cur = sr.makeSnapshot(TODAY, sum("Amber"), [R({ id: "R1", status: "Closed" }), R({ id: "R2" }), R({ id: "R3" })], [G("Pass")]);
  const text = sr.compare(old, cur).map((c) => `${c.cat}:${c.text}`).join(" | ");
  assert.ok(text.includes("Improved:Kavach: status Red -> Amber"));
  assert.ok(text.includes("Resolved this week:R1") && text.includes("New this week:R3"));
  assert.ok(text.includes("Improved:Gate G Pending -> Pass"));
  assert.deepEqual(sr.compare(cur, cur), []); // no change
});

test("the reader stops at the blank row before the notes", async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("T");
  ws.addRow(["ID", "Owner"]); ws.addRow(["R1", "Dev"]); ws.addRow([null, null]); ws.addRow(["Colour key", null]);
  assert.deepEqual(sr.readSheet(wb, "T"), [{ ID: "R1", Owner: "Dev" }]);
});

test("Excel dates become plain ISO dates (no time-zone shift)", () => {
  assert.equal(sr.toIso(new Date(Date.UTC(2026, 10, 9))), "2026-11-09");
  assert.equal(sr.toIso("2026-11-12"), "2026-11-12");
  assert.equal(sr.toIso("12/11/2026"), null);
  assert.equal(sr.fmt("2026-11-09"), "Mon 09 Nov 2026");
});

test("CSV reader keeps commas inside quotes", () => {
  assert.deepEqual(sr.parseCsv('a,b\n"x, y",z\n'), [["a", "b"], ["x, y", "z"]]);
});

test("end to end on the REAL tracker", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tpm-"));
  const args = [path.join(ROOT, "data/tracker.xlsx"), "--gates", path.join(ROOT, "data/gates.csv"), "--date", "2026-11-09",
    "--out", path.join(tmp, "r"), "--snapshots", path.join(tmp, "s")];
  assert.equal(await sr.main(args), 0);
  const dir = path.join(tmp, "r/2026-11-09");
  const files = fs.readdirSync(dir);
  for (const f of ["Kavach_client_report.md", "Ledger_client_report.md", "dashboard.html"]) assert.ok(files.includes(f));
  const kavach = fs.readFileSync(path.join(dir, "Kavach_client_report.md"), "utf8");
  assert.ok(!kavach.includes("R08") && !kavach.includes("R07")); // internal items stay out
  assert.ok(!kavach.includes("R09"));                           // a Ledger-only item stays out of Kavach
  const brief = fs.readFileSync(path.join(dir, "Kavach_internal_brief.md"), "utf8");
  assert.ok(brief.includes("40% over budget") && brief.includes("NO-GO")); // cost gate visible, nothing assumed passed
  assert.equal(JSON.parse(fs.readFileSync(path.join(tmp, "s/latest.json"), "utf8")).date, "2026-11-09");
  assert.equal(await sr.main(args), 0); // second run compares with the first
  assert.ok(fs.readFileSync(path.join(dir, "Kavach_client_report.md"), "utf8").includes("No change since the last report"));
});

test("a bad tracker stops the run", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.join(ROOT, "data/tracker.xlsx"));
  wb.getWorksheet("Risks and issues").getCell("I3").value = null; // clear R02's owner
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tpm-"));
  const bad = path.join(tmp, "bad.xlsx");
  await wb.xlsx.writeFile(bad);
  assert.equal(await sr.main([bad, "--gates", path.join(ROOT, "data/gates.csv"), "--out", path.join(tmp, "r"), "--snapshots", path.join(tmp, "s")]), 1);
});

test("the Friday schedule is 16:00 India time (10:30 UTC)", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/weekly-report.yml"), "utf8");
  assert.ok(wf.includes('"30 10 * * 5"'));
});

test("an unknown project name is an error, not a silently missing item", () => {
  const summary = [{ project: "Kavach", status: "Red", clientSummary: "ok", milestone: TODAY }];
  const { errors } = sr.check(summary, [R({ project: "Kavch" })]);
  assert.ok(errors.some((e) => e.includes("not on the Summary tab")));
  assert.ok(sr.check(summary, [R({ project: "Both" })]).errors.length === 0);
  assert.ok(sr.check(summary, [R()], [{ project: "Nope", gate_id: "X1" }]).errors.some((e) => e.includes("gates.csv")));
});

test("a blank row in the middle of a table is reported, not silently cut off", () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("T");
  ws.addRow(["ID", "Owner"]); ws.addRow(["R1", "Dev"]); ws.addRow([null, null]); ws.addRow(["R2", "Meera"]);
  const problems = [];
  sr.readSheet(wb, "T", problems);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /R2/);
});

test("conditions met counts required gates only; overdue gates are flagged", () => {
  const s = { project: "K", client: "C", status: "Red", clientSummary: "x", milestone: TODAY };
  const gates = [G("Pass", { gate_id: "A" }), G("Pending", { gate_id: "B" }), G("Pending", { gate_id: "C", required: "No", blocking: "No" })];
  const v = sr.projectView(s, [], gates, TODAY, null);
  assert.ok(sr.clientReport(v, TODAY).includes("1 of 2"));
  assert.ok(sr.gateOverdue(G("Pending", { due: "2026-11-01" }), TODAY));
  assert.ok(!sr.gateOverdue(G("Pass", { due: "2026-11-01" }), TODAY));
  assert.ok(!sr.gateOverdue(G("Pending", { due: "2026-11-20" }), TODAY));
});

test("a | in text does not break a Markdown table", () => {
  assert.equal(sr.cell("a|b"), "a\\|b");
  assert.equal(sr.cell("line1\nline2"), "line1 line2");
});

test("an item removed from the tracker shows up as a change", () => {
  const sum = [{ project: "Kavach", status: "Red", milestone: TODAY }];
  const old = sr.makeSnapshot(TODAY, sum, [R({ id: "R1" }), R({ id: "R2" })], []);
  const cur = sr.makeSnapshot(TODAY, sum, [R({ id: "R1" })], []);
  assert.ok(sr.compare(old, cur).some((c) => c.text.includes("R2 was removed")));
});

test("bad input gives a clear message and exit code 1, never a crash", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tpm-"));
  const gates = path.join(ROOT, "data/gates.csv");
  assert.equal(await sr.main([path.join(tmp, "missing.xlsx"), "--gates", gates]), 1);          // file not found
  assert.equal(await sr.main([path.join(ROOT, "data/tracker.xlsx"), "--bogus"]), 1);             // unknown flag
  assert.equal(await sr.main([path.join(ROOT, "data/tracker.xlsx"), "--gates", path.join(tmp, "none.csv")]), 1); // gates missing
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(ROOT, "data/tracker.xlsx"));
  wb.removeWorksheet("Summary"); const f = path.join(tmp, "nosheet.xlsx"); await wb.xlsx.writeFile(f);
  assert.equal(await sr.main([f, "--gates", gates, "--out", path.join(tmp, "o"), "--snapshots", path.join(tmp, "s")]), 1); // sheet missing
});

// ---------- delivery tracking, priorities, --check, India date, preview ----------
const delivery = require("../delivery");
const { buildDashboard, previewHtml, mdToHtml } = require("../dashboard");
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), "tpm-"));

test("delivery: Generated -> Reviewed -> Sent, and Sent cannot skip Reviewed", () => {
  const f = tmpdir();
  delivery.sync(f, TODAY, { Kavach: "report text" });
  assert.throws(() => delivery.mark(f, TODAY, "Kavach", "Sent"), /Review Kavach before marking it Sent/);
  assert.equal(delivery.mark(f, TODAY, "Kavach", "Reviewed").projects.Kavach.stage, "Reviewed");
  assert.throws(() => delivery.mark(f, TODAY, "Kavach", "Reviewed"), /already Reviewed/);
  assert.equal(delivery.mark(f, TODAY, "Kavach", "Sent").projects.Kavach.stage, "Sent");
  assert.throws(() => delivery.mark(f, TODAY, "Kavach", "Sent"), /already Sent/);
  assert.throws(() => delivery.mark(f, TODAY, "Nope", "Reviewed"), /No report for 'Nope'/);
});

test("delivery: a report that changes after review goes back to Generated with a warning", () => {
  const f = tmpdir();
  delivery.sync(f, TODAY, { Kavach: "v1" });
  delivery.mark(f, TODAY, "Kavach", "Reviewed");
  let r = delivery.sync(f, TODAY, { Kavach: "v1" });       // same text: review survives
  assert.equal(r.delivery.projects.Kavach.stage, "Reviewed"); assert.equal(r.resets.length, 0);
  r = delivery.sync(f, TODAY, { Kavach: "v2 edited" });     // different text: review is void
  assert.equal(r.delivery.projects.Kavach.stage, "Generated"); assert.match(r.resets[0], /changed after it was Reviewed/);
});

test("delivery: 'late' means 17:00 India time on the report date, not 17:00 UTC", () => {
  assert.equal(delivery.isLate(TODAY, new Date("2026-11-09T11:29:00Z")), false); // 16:59 IST
  assert.equal(delivery.isLate(TODAY, new Date("2026-11-09T11:30:00Z")), true);  // 17:00 IST
  assert.equal(delivery.isLate(TODAY, new Date("2026-11-08T23:00:00Z")), false); // already 04:30 on the 9th in India
  assert.equal(delivery.istNow(new Date("2026-11-08T20:00:00Z")), "2026-11-09T01:30");
});

test("the default report date is the date in India, even when UTC is still the day before", () => {
  assert.equal(sr.indiaToday(new Date("2026-11-08T20:00:00Z")), "2026-11-09");
});

test("delivery CLI: unknown date or project gives a message, and --strict fails when overdue", () => {
  const out = tmpdir(), f = path.join(out, "2020-01-03"); fs.mkdirSync(f);
  delivery.sync(f, "2020-01-03", { Kavach: "x" });
  assert.equal(delivery.cli(["status", "2099-01-01", "--out", out]), 1);             // no such folder
  assert.equal(delivery.cli(["mark", "2020-01-03", "Nope", "Reviewed", "--out", out]), 1);
  assert.equal(delivery.cli(["status", "2020-01-03", "--out", out]), 0);              // not strict: informs only
  assert.equal(delivery.cli(["status", "2020-01-03", "--out", out, "--strict"]), 1);  // long past 17:00 and still not Sent
});

test("top priorities: overdue first, then score, no duplicates for 'Both' items", () => {
  const s = (p) => ({ project: p, client: "C", status: "Red", clientSummary: "x", milestone: TODAY });
  const risks = [R({ id: "R1", score: 9 }), R({ id: "R2", score: 4, due: "2026-11-01" }), R({ id: "R3", score: 6 }), R({ id: "R4", score: 1 }), R({ id: "RB", project: "Both", score: 3 })];
  const views = [s("Kavach"), s("Ledger")].map((x) => sr.projectView(x, risks, [], TODAY, null));
  const top = sr.priorities(views, TODAY);
  assert.deepEqual(top.map((x) => x.r.id), ["R2", "R1", "R3"]);                       // the overdue score-4 item beats the score-9 one
  assert.equal(sr.priorities(views, TODAY, 10).filter((x) => x.r.id === "RB").length, 1);
});

test("conditions met ignores a required gate that is not blocking", () => {
  const s = { project: "K", client: "C", status: "Red", clientSummary: "x", milestone: TODAY };
  const v = sr.projectView(s, [], [G("Pass"), G("Pending", { gate_id: "B", blocking: "No" })], TODAY, null);
  assert.ok(sr.clientReport(v, TODAY).includes("1 of 1"));
});

test("--check validates and writes nothing; a bad tracker still fails it", async () => {
  const tmp = tmpdir();
  const base = [path.join(ROOT, "data/tracker.xlsx"), "--gates", path.join(ROOT, "data/gates.csv"), "--out", path.join(tmp, "r"), "--snapshots", path.join(tmp, "s"), "--check"];
  assert.equal(await sr.main(base), 0);
  assert.deepEqual(fs.readdirSync(tmp), []);                                        // no reports, no snapshots
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(path.join(ROOT, "data/tracker.xlsx"));
  wb.getWorksheet("Risks and issues").getCell("I3").value = null;
  const bad = path.join(tmp, "bad.xlsx"); await wb.xlsx.writeFile(bad);
  assert.equal(await sr.main([bad, ...base.slice(1)]), 1);
});

test("dashboard escapes tracker text, shows the delivery state, and uses the 'Reports sent' tile", () => {
  const evil = '<script>alert(1)</script>';
  const s = { project: "Kavach", client: "C", status: "Red", clientSummary: evil, milestone: TODAY };
  const v = sr.projectView(s, [R({ description: evil })], [G("Pending", { evidence: evil })], TODAY, null);
  const d = { date: TODAY, projects: { Kavach: { stage: "Reviewed" } } };
  const late = buildDashboard({ today: TODAY, views: [v], old: null, fmt: sr.fmt, addDays: sr.addDays, delivery: d, now: new Date("2026-11-09T12:00:00Z"), priorities: sr.priorities([v], TODAY) });
  assert.ok(!late.includes(evil) && !/<script>alert/.test(late));
  assert.ok(late.includes("Delivery overdue: Reviewed") && late.includes("0 of 1"));
  const early = buildDashboard({ today: TODAY, views: [v], old: null, fmt: sr.fmt, addDays: sr.addDays, delivery: d, now: new Date("2026-11-09T05:00:00Z") });
  assert.ok(early.includes("Client report: Reviewed") && !early.includes("Delivery overdue"));
});

test("client preview renders tables, escapes text and keeps an escaped | inside its cell", () => {
  const html = mdToHtml("# T <b>\n\n| A | B |\n|---|---|\n| x \\| y | <i> |\n");
  assert.ok(html.includes("<td>x | y</td>") && !html.includes("<i>") && html.includes("&lt;b&gt;"));
  assert.ok(previewHtml(TODAY, { Kavach: "# Hi\n" }).includes('id=\'Kavach\''));
});

test("the real run writes delivery.json and the preview, and a second run keeps Reviewed only if the text is unchanged", async () => {
  const tmp = tmpdir();
  const args = [path.join(ROOT, "data/tracker.xlsx"), "--gates", path.join(ROOT, "data/gates.csv"), "--date", TODAY,
    "--out", path.join(tmp, "r"), "--snapshots", path.join(tmp, "s"), "--no-snapshot"];
  assert.equal(await sr.main(args), 0);
  const dir = path.join(tmp, "r", TODAY);
  assert.ok(fs.existsSync(path.join(dir, "client_preview.html")));
  delivery.mark(dir, TODAY, "Kavach", "Reviewed");
  assert.equal(await sr.main(args), 0);                                              // same data, same text
  assert.equal(delivery.load(dir, TODAY).projects.Kavach.stage, "Reviewed");
});
