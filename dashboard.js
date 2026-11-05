"use strict";
/* Builds the two HTML pages (no internet, no libraries, open by double-click):
   dashboard.html       internal view of all projects
   client_preview.html  the client reports as the client will read them (for the review step before sending)
The pages are readable without JavaScript; the small script only filters projects and shows detail boxes. */

const delivery = require("./delivery");

const LEVEL = { Occurred: 3, High: 3, Medium: 2, Low: 1 };
const IMPACT = { High: 3, Medium: 2, Low: 1 };
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const chip = (text, cls) => `<span class="chip ${esc(cls || text)}">${esc(text)}</span>`;

const CSS = `
:root{--bg:#f4f5f7;--card:#fff;--ink:#101828;--mut:#5b6678;--line:#e4e7ec;--soft:#f9fafb;
--red:#d92d20;--redbg:#fef3f2;--amb:#b54708;--ambbg:#fffaeb;--grn:#067647;--grnbg:#ecfdf3;--acc:#3538cd;--accbg:#eef0ff}
@media(prefers-color-scheme:dark){:root{--bg:#0c111d;--card:#161b26;--ink:#f5f5f6;--mut:#a4adbd;--line:#2a3140;--soft:#1c2230;
--red:#f97066;--redbg:#3a1614;--amb:#fdb022;--ambbg:#3a2a0b;--grn:#47cd89;--grnbg:#0f2a1c;--acc:#9ea5ff;--accbg:#1f2150}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,"Segoe UI",Inter,Arial,sans-serif}
.wrap{max-width:1240px;margin:0 auto;padding:22px 16px 48px}
header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:16px}
h1{font-size:24px;letter-spacing:-.02em;margin:0}.sub{color:var(--mut);margin-top:2px}
.pill{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:99px;background:var(--accbg);color:var(--acc);font-weight:600;font-size:12.5px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;border-left:4px solid var(--line)}
.kpi b{display:block;font-size:28px;letter-spacing:-.02em;line-height:1.1}.kpi span{color:var(--mut);font-size:12.5px}
.kpi.red{border-left-color:var(--red)}.kpi.amb{border-left-color:var(--amb)}.kpi.grn{border-left-color:var(--grn)}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.top{margin-bottom:14px}.top ol{margin:6px 0 0;padding-left:20px}.top li{margin:5px 0}
nav{display:flex;gap:8px;margin:0 0 14px;flex-wrap:wrap}
nav button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:6px 16px;border-radius:99px;font-weight:600}
nav button.on{background:var(--ink);color:var(--card);border-color:var(--ink)}
.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(460px,1fr));gap:14px;align-items:start}
h2{font-size:20px;margin:0;letter-spacing:-.01em}h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:18px 0 8px}
.mut{color:var(--mut)}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.chip{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid transparent}
.Red,.NO-GO,.Fail,.Blocked,.c-red{color:var(--red);background:var(--redbg)}.Amber,.REVIEW,.Pending,.c-amb{color:var(--amb);background:var(--ambbg)}
.Green,.GO,.Pass,.c-grn{color:var(--grn);background:var(--grnbg)}.c-acc,.Generated{color:var(--acc);background:var(--accbg)}.Reviewed{color:var(--amb);background:var(--ambbg)}.Sent{color:var(--grn);background:var(--grnbg)}
.vrow{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center}
.verdict{background:var(--soft);border:1px solid var(--line);border-radius:12px;padding:10px 14px;text-align:center;min-width:130px}
.verdict svg{width:84px;height:84px}.verdict .v{font-size:20px;font-weight:800;letter-spacing:.02em}
.ring-bg{stroke:var(--line)}.ring-fg{stroke:var(--grn);stroke-linecap:round}
.gates{display:flex;flex-wrap:wrap;gap:6px}
button.g,button.id{font:inherit;cursor:pointer}
button.g{border:1px solid transparent;padding:3px 10px;border-radius:8px;font-weight:700;font-size:12px}
button.g.opt{border-style:dashed;border-color:var(--mut)}
.mx{display:grid;grid-template-columns:62px repeat(3,1fr);gap:4px;font-size:11.5px}
.mx .h{color:var(--mut);text-align:center;align-self:end;padding-bottom:2px}.mx .l{color:var(--mut);align-self:center;text-align:right;padding-right:6px}
.cell{min-height:50px;border-radius:8px;padding:4px;display:flex;flex-wrap:wrap;gap:3px;align-content:center;justify-content:center}
.s1,.s2{background:var(--grnbg)}.s3,.s4{background:var(--ambbg)}.s6{background:#fcd9b6}.s9{background:#f9b4ad}
@media(prefers-color-scheme:dark){.s6{background:#5b3a14}.s9{background:#6b1f1a}}
.id{background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:6px;padding:0 6px;font-weight:700;font-size:11.5px}
.esc{border:1px solid var(--line);border-left:4px solid var(--red);border-radius:10px;padding:8px 12px;margin-bottom:8px;background:var(--soft)}
.esc p{margin:3px 0 0}.chg{display:flex;gap:6px;flex-wrap:wrap}.none{color:var(--mut);padding:4px 0}
a{color:var(--acc);font-weight:600}
#tip{position:fixed;z-index:9;max-width:340px;background:var(--ink);color:var(--card);padding:10px 12px;border-radius:10px;font-size:12.5px;box-shadow:0 8px 24px rgba(0,0,0,.25);display:none}
button:focus-visible,a:focus-visible{outline:3px solid var(--acc);outline-offset:2px}
@media(max-width:560px){.cols{grid-template-columns:1fr}.vrow{grid-template-columns:1fr}}
@media print{nav,#tip{display:none}.card{break-inside:avoid;box-shadow:none}.proj{display:block!important}}
.doc{max-width:760px;margin:0 auto 18px}.doc h1{font-size:22px}.doc h2{font-size:17px;margin-top:18px}
.doc table{border-collapse:collapse;width:100%;font-size:13px}.doc th,.doc td{border:1px solid var(--line);padding:6px 8px;text-align:left}.doc th{background:var(--soft)}
.banner{max-width:760px;margin:0 auto 14px;padding:10px 14px;border-radius:10px;background:var(--ambbg);color:var(--amb);font-weight:600}
`;

// One detail box for the whole page. It floats (position: fixed), so opening it never moves anything else.
const PAGE_JS = `
(function(){
var tip=document.getElementById('tip');
function hide(){tip.style.display='none'}
document.querySelectorAll('nav button').forEach(function(b){b.onclick=function(){
document.querySelectorAll('nav button').forEach(function(x){x.classList.remove('on')});b.classList.add('on');
document.querySelectorAll('.proj').forEach(function(p){p.style.display=(b.dataset.p==='all'||p.dataset.p===b.dataset.p)?'':'none'});hide()}});
document.querySelectorAll('[data-tip]').forEach(function(el){el.addEventListener('click',function(e){
e.stopPropagation();tip.textContent=el.dataset.tip;tip.style.display='block';
var r=el.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
tip.style.left=Math.max(8,Math.min(r.left,innerWidth-w-8))+'px';
tip.style.top=(r.bottom+8+h>innerHeight?Math.max(8,r.top-h-8):r.bottom+8)+'px'})});
document.addEventListener('click',hide);document.addEventListener('keydown',function(e){if(e.key==='Escape')hide()});
})();
`;

function ring(passed, total) {
  const c = 301.6, off = c * (1 - (total ? passed / total : 0));
  return `<svg viewBox="0 0 120 120" role="img" aria-label="${passed} of ${total} blocking gates passed"><circle class="ring-bg" cx="60" cy="60" r="48" fill="none" stroke-width="11"/>` +
    `<circle class="ring-fg" cx="60" cy="60" r="48" fill="none" stroke-width="11" stroke-dasharray="${c}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 60 60)"/>` +
    `<text x="60" y="62" text-anchor="middle" font-size="28" font-weight="800" fill="currentColor">${passed}/${total}</text></svg>`;
}

function matrix(items, fmt) {
  const cells = {};
  for (const r of items) (cells[`${LEVEL[r.probability]}-${IMPACT[r.impact]}`] ||= []).push(r);
  let h = '<div class="mx"><div></div><div class="h">Low impact</div><div class="h">Medium impact</div><div class="h">High impact</div>';
  for (const [lvl, name] of [[3, "High / Occurred"], [2, "Medium"], [1, "Low"]]) {
    h += `<div class="l">${name}</div>`;
    for (const imp of [1, 2, 3]) {
      const rs = cells[`${lvl}-${imp}`] || [];
      h += `<div class="cell s${lvl * imp}">${rs.map((r) => {
        const tip = `${r.id} (score ${r.score}) ${r.description} | Owner ${r.owner}, due ${fmt(r.due)} | Action: ${r.action || "Not provided in tracker"}`;
        return `<button type="button" class="id" data-tip="${esc(tip)}" title="${esc(tip)}">${esc(r.id)}</button>`;
      }).join("")}</div>`;
    }
  }
  return h + '</div><p class="mut" style="font-size:12px;margin:6px 0 0">Rows: probability. Columns: impact. Click an ID for details. Dark red = 9, orange = 6, amber = 3 to 4, green = 1 to 2.</p>';
}

function deliveryChip(project, d, today, now) {
  const st = d && d.projects[project];
  if (!st) return "";
  const late = st.stage !== "Sent" && delivery.isLate(today, now);
  return chip(late ? `Delivery overdue: ${st.stage}` : `Client report: ${st.stage}`, late ? "c-red" : st.stage);
}

function projectCard(v, fmt, ctx) {
  const s = v.s, g = v.gates, block = g.filter((x) => x.required === "Yes" && x.blocking === "Yes"), passed = block.filter((x) => x.status === "Pass").length;
  let h = `<section class="card proj" data-p="${esc(s.project)}"><div class="vrow"><div>` +
    `<div class="row"><h2>${esc(s.project)}</h2><span class="mut">${esc(s.client)}</span>${chip(s.status)}</div>` +
    `<p style="margin:6px 0">${esc(s.clientSummary || "Not provided in tracker")}</p>` +
    `<div class="row"><span class="chip c-acc">Next milestone: ${fmt(s.milestone)}</span>` +
    `<span class="chip c-${v.overdue.length ? "red" : "grn"}">${v.overdue.length} overdue</span>` +
    `<span class="chip c-${v.escalate.length ? "red" : "grn"}">${v.escalate.length} to escalate</span>` +
    (v.gatesOverdue.length ? `<span class="chip c-red">${v.gatesOverdue.length} gate(s) overdue</span>` : "") + `</div>` +
    `<div class="row" style="margin-top:8px">${deliveryChip(s.project, ctx.delivery, ctx.today, ctx.now)} <a href="client_preview.html#${esc(s.project)}">Preview client report</a></div></div>` +
    `<div class="verdict">${ring(passed, block.length)}<div class="v ${esc(v.verdict)}" style="background:none">${esc(v.verdict)}</div>` +
    `<div class="mut" style="font-size:12px">${v.verdict === "GO" ? "Release can go ahead" : "Not ready to release"}</div></div></div>`;
  h += '<h3>Go-live gates (click for details)</h3><div class="gates">';
  for (const x of g) {
    const tip = `${x.gate_id}: ${x.gate} | ${x.status}${x.blocking === "Yes" ? "" : " (optional, does not block)"} | Owner ${x.owner || "not provided"}, due ${fmt(x.due)}` +
      `${v.gatesOverdue.includes(x) ? " | OVERDUE" : ""} | Evidence: ${x.evidence || "none yet"}`;
    h += `<button type="button" class="g ${esc(x.status)}${x.blocking === "Yes" ? "" : " opt"}" data-tip="${esc(tip)}" title="${esc(tip)}">${esc(x.gate_id)} ${esc(x.status)}${v.gatesOverdue.includes(x) ? " !" : ""}</button>`;
  }
  h += `</div><h3>Risk matrix (open items)</h3>${matrix(v.items, fmt)}<h3>Escalate (${v.escalate.length})</h3>`;
  if (!v.escalate.length) h += '<div class="none">Nothing needs escalation today.</div>';
  for (const [r, why] of v.escalate) {
    h += `<div class="esc"><div class="row"><span class="id">${esc(r.id)}</span><span class="chip c-red">${esc(why)}</span>` +
      `<span class="mut">Owner ${esc(r.owner)} &middot; due ${fmt(r.due)}</span></div><p>${esc(r.description)}</p></div>`;
  }
  h += "<h3>Changes since the last run</h3>";
  if (v.changes === null) h += '<div class="none">First run: baseline, nothing to compare yet.</div>';
  else if (!v.changes.length) h += '<div class="none">No change.</div>';
  else {
    const cls = { Improved: "c-grn", "Resolved this week": "c-grn", Deteriorated: "c-red", "New this week": "c-amb" };
    h += '<div class="chg">' + v.changes.map((c) => `<span class="chip ${cls[c.cat] || "c-acc"}">${esc(c.cat)}: ${esc(c.text)}</span>`).join("") + "</div>";
  }
  return h + "</section>";
}

function buildDashboard({ today, views, old, fmt, addDays, delivery: dstate, now = new Date(), priorities = [] }) {
  const wd = new Date(today + "T00:00:00Z").getUTCDay();           // 0 = Sunday, 5 = Friday
  const nxt = addDays(today, (5 - wd + 7) % 7);
  const nOver = views.reduce((n, v) => n + v.overdue.length, 0);
  const nEsc = views.reduce((n, v) => n + v.escalate.length, 0);
  const nStop = views.reduce((n, v) => n + v.gates.filter((x) => x.required === "Yes" && x.blocking === "Yes" && x.status !== "Pass").length, 0);
  const nRed = views.filter((v) => v.s.status === "Red").length;
  const stages = dstate ? Object.values(dstate.projects) : [];
  const nSent = stages.filter((x) => x.stage === "Sent").length;
  const late = stages.length - nSent > 0 && delivery.isLate(today, now);
  const kpi = (n, t, c = "") => `<div class="kpi ${c}"><b>${n}</b><span>${esc(t)}</span></div>`;
  const base = old === null ? "Baseline run: no earlier snapshot to compare." : "Compared with the run of " + esc(old.date) + ".";
  const top = priorities.length
    ? `<section class="card top"><h3 style="margin-top:0">Top ${priorities.length} priorities this week</h3><ol>` +
      priorities.map((x) => `<li><b>${esc(x.r.id)}</b> (${esc(x.projects.join(" + "))}) <span class="chip ${x.overdue ? "c-red" : "c-amb"}">${esc(x.why)}</span> ${esc(x.r.description)} <span class="mut">Owner ${esc(x.r.owner)}, due ${fmt(x.r.due)}</span></li>`).join("") + "</ol></section>"
    : "";
  return `<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Delivery control</title><style>${CSS}</style></head><body><div class='wrap'>` +
    `<header><div><h1>Delivery control</h1><div class='sub'>Internal view, do not send &middot; Report date ${fmt(today)} &middot; ${base}</div></div>` +
    `<span class='pill'>&#9201; Next scheduled report: ${fmt(nxt)}, 16:00 IST</span></header>` +
    "<div class='kpis'>" + kpi(nRed, "projects Red", nRed ? "red" : "grn") + kpi(nOver, "overdue items", nOver ? "red" : "grn") +
    kpi(nEsc, "items to escalate", nEsc ? "red" : "grn") + kpi(nStop, "blocking gates not passed", nStop ? "amb" : "grn") +
    kpi(`${nSent} of ${stages.length}`, late ? "client reports sent (past 17:00 IST)" : "client reports sent", late ? "red" : nSent === stages.length && stages.length ? "grn" : "amb") + "</div>" + top +
    "<nav aria-label='Filter projects'><button class='on' data-p='all'>All projects</button>" + views.map((v) => `<button data-p='${esc(v.s.project)}'>${esc(v.s.project)}</button>`).join("") + "</nav>" +
    "<div class='cols'>" + views.map((v) => projectCard(v, fmt, { delivery: dstate, today, now })).join("") + "</div></div><div id='tip' role='status'></div><script>" + PAGE_JS + "</script></body></html>";
}

// ---- client preview: a small Markdown-to-HTML for exactly the subset our client report uses (all text is escaped first) ----
function inline(t) { return esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/\\\|/g, "|"); }
function mdToHtml(md) {
  const out = [], lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^# /.test(l)) out.push(`<h1>${inline(l.slice(2))}</h1>`);
    else if (/^## /.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]); i--;
      const split = (r) => r.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push("<table><tr>" + split(head).map((c) => `<th>${inline(c)}</th>`).join("") + "</tr>" + body.map((r) => "<tr>" + split(r).map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>").join("") + "</table>");
    } else if (/^- /.test(l)) {
      const items = []; while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2)); i--;
      out.push("<ul>" + items.map((x) => `<li>${inline(x)}</li>`).join("") + "</ul>");
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join("\n");
}

function previewHtml(today, reports) {
  return `<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Client report preview</title><style>${CSS}</style></head><body><div class='wrap'>` +
    `<div class='banner'>PREVIEW for review. Check it as the client will read it, then run: node delivery.js mark ${esc(today)} PROJECT Reviewed</div>` +
    Object.entries(reports).map(([p, md]) => `<section class='card doc' id='${esc(p)}'>${mdToHtml(md)}</section>`).join("") + "</div></body></html>";
}

module.exports = { buildDashboard, previewHtml, mdToHtml };
