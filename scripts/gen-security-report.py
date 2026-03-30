#!/usr/bin/env python3
"""Generate Agent K Security Review PDF — one page with bar chart."""

import os, sys
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line
from reportlab.graphics import renderPDF
from reportlab.graphics.charts.barcharts import HorizontalBarChart
from reportlab.graphics.charts.legends import Legend

OUTPUT = os.path.join(
    os.environ.get('WORKSPACE_DIR', '/tmp'),
    'AgentK_Security_Review.pdf'
)

# ── Data ──────────────────────────────────────────────────────────────────────
FINDINGS = [
    ("Authentication",       9, "PASS", "Whitelist enforced; both user & chat-level gates"),
    ("Path Traversal",       10, "PASS", "resolvePath() anchors all ops to workspace"),
    ("Command Injection",    10, "PASS", "spawn() with shell:false; args as array"),
    ("SQL Injection",        10, "PASS", "Prepared statements throughout"),
    ("Env Var Isolation",    10, "PASS", "Child process receives allowlist only"),
    ("Session Security",     9,  "PASS", "15-min TTL + concurrent request protection"),
    ("File Delivery",        9,  "PASS", "Path validation + existence check before send"),
    ("Error Handling",       9,  "PASS", "Generic messages, no secret leakage"),
    ("Input Sanitisation",   7,  "WARN", "Prompt injection mitigated by Claude hierarchy"),
    ("Secrets Management",   7,  "WARN", ".env plaintext; keep file permissions tight"),
    ("Audit Logging",        8,  "PASS", "Comprehensive SQLite + daily log rotation"),
    ("Dependencies",         8,  "PASS", "Minimal, reputable packages"),
]

OVERALL = 8.8  # /10

PASS_COLOR  = colors.HexColor("#2ecc71")
WARN_COLOR  = colors.HexColor("#f39c12")
FAIL_COLOR  = colors.HexColor("#e74c3c")
BLUE        = colors.HexColor("#2980b9")
DARK        = colors.HexColor("#2c3e50")
LIGHT_GREY  = colors.HexColor("#ecf0f1")

def status_color(s):
    return PASS_COLOR if s == "PASS" else (WARN_COLOR if s == "WARN" else FAIL_COLOR)

# ── Document ──────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUTPUT,
    pagesize=A4,
    leftMargin=1.5*cm, rightMargin=1.5*cm,
    topMargin=1.2*cm, bottomMargin=1.2*cm,
)

styles = getSampleStyleSheet()
W = A4[0] - 3*cm  # usable width

def style(name="Normal", **kw):
    s = styles[name].clone(name + str(id(kw)))
    for k, v in kw.items():
        setattr(s, k, v)
    return s

story = []

# ── Header ────────────────────────────────────────────────────────────────────
story.append(Paragraph(
    "StaffBot Pro — Security Review",
    style("Heading1", fontSize=16, textColor=DARK, spaceAfter=2, alignment=TA_CENTER)
))
story.append(Paragraph(
    "Nuvesta Academy · Reviewed 30 March 2026 · Scope: src/, scripts/, skills/",
    style(fontSize=7.5, textColor=colors.grey, alignment=TA_CENTER, spaceAfter=4)
))
story.append(HRFlowable(width="100%", thickness=1, color=BLUE, spaceAfter=6))

# ── Overall score box ─────────────────────────────────────────────────────────
score_data = [[
    Paragraph(f"<b>Overall Security Score</b>", style(fontSize=10, alignment=TA_CENTER)),
    Paragraph(f"<b>{OVERALL}/10</b>", style(fontSize=22, textColor=PASS_COLOR, alignment=TA_CENTER)),
    Paragraph("<b>SAFE TO DEPLOY</b>", style(fontSize=10, textColor=PASS_COLOR, alignment=TA_CENTER)),
    Paragraph("12 areas reviewed · 10 PASS · 2 WARN · 0 FAIL",
              style(fontSize=8, textColor=colors.grey, alignment=TA_CENTER)),
]]
score_table = Table(score_data, colWidths=[W*0.28, W*0.18, W*0.28, W*0.26])
score_table.setStyle(TableStyle([
    ("BACKGROUND", (0,0), (-1,-1), LIGHT_GREY),
    ("BOX",        (0,0), (-1,-1), 1, BLUE),
    ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
    ("TOPPADDING", (0,0), (-1,-1), 8),
    ("BOTTOMPADDING", (0,0), (-1,-1), 8),
    ("LEFTPADDING", (0,0), (-1,-1), 6),
]))
story.append(score_table)
story.append(Spacer(1, 8))

# ── Bar chart ─────────────────────────────────────────────────────────────────
drawing = Drawing(W, 170)
chart = HorizontalBarChart()
chart.x = 130
chart.y = 5
chart.width  = W - 145
chart.height = 158

scores = [row[1] for row in FINDINGS]
chart.data = [scores]

chart.bars[0].fillColor = BLUE
chart.bars[0].strokeColor = None

chart.valueAxis.valueMin = 0
chart.valueAxis.valueMax = 10
chart.valueAxis.valueStep = 2
chart.valueAxis.labels.fontSize = 7

chart.categoryAxis.categoryNames = [row[0] for row in FINDINGS]
chart.categoryAxis.labels.fontSize = 7.5
chart.categoryAxis.labels.dx = -2
chart.categoryAxis.labels.textAnchor = "end"
chart.categoryAxis.tickLeft = 0

# Colour each bar individually
for i, row in enumerate(FINDINGS):
    chart.bars[(0, i)].fillColor = status_color(row[2])

drawing.add(chart)

# Legend
legend = Legend()
legend.x = 0
legend.y = 60
legend.columnMaximum = 3
legend.colorNamePairs = [
    (PASS_COLOR, "PASS"),
    (WARN_COLOR, "WARN"),
]
legend.fontName = "Helvetica"
legend.fontSize = 7
drawing.add(legend)

story.append(drawing)
story.append(Spacer(1, 4))

# ── Findings table ────────────────────────────────────────────────────────────
header = [
    Paragraph("<b>Security Area</b>",  style(fontSize=8, textColor=colors.white)),
    Paragraph("<b>Score</b>",          style(fontSize=8, textColor=colors.white, alignment=TA_CENTER)),
    Paragraph("<b>Status</b>",         style(fontSize=8, textColor=colors.white, alignment=TA_CENTER)),
    Paragraph("<b>Finding</b>",        style(fontSize=8, textColor=colors.white)),
]
rows = [header]
for area, score, status, finding in FINDINGS:
    rows.append([
        Paragraph(area,    style(fontSize=7.5)),
        Paragraph(str(score)+"/10", style(fontSize=7.5, alignment=TA_CENTER)),
        Paragraph(f"<b>{status}</b>", style(fontSize=7.5, textColor=status_color(status), alignment=TA_CENTER)),
        Paragraph(finding, style(fontSize=7)),
    ])

col_w = [W*0.20, W*0.10, W*0.10, W*0.60]
tbl = Table(rows, colWidths=col_w, repeatRows=1)
tbl.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1,0), DARK),
    ("TEXTCOLOR",     (0,0), (-1,0), colors.white),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [colors.white, LIGHT_GREY]),
    ("BOX",           (0,0), (-1,-1), 0.5, colors.lightgrey),
    ("LINEBELOW",     (0,0), (-1,-1), 0.3, colors.lightgrey),
    ("TOPPADDING",    (0,0), (-1,-1), 3),
    ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ("LEFTPADDING",   (0,0), (-1,-1), 5),
    ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
]))
story.append(tbl)
story.append(Spacer(1, 6))

# ── Recommendations ───────────────────────────────────────────────────────────
story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=4))
story.append(Paragraph("<b>Recommendations</b>",
    style(fontSize=9, textColor=DARK, spaceAfter=3)))

recs = [
    "① Set ALLOWED_TELEGRAM_IDS in .env — ensure no empty whitelist in production.",
    "② Restrict .env file permissions: chmod 600 .env",
    "③ Run npm audit periodically and pin dependency versions.",
    "④ Rotate Telegram Bot Token if .env file is ever shared or exposed.",
]
for r in recs:
    story.append(Paragraph(r, style(fontSize=7.5, leftIndent=8, spaceAfter=2)))

story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceBefore=4, spaceAfter=3))
story.append(Paragraph(
    "Reviewed by Claude Code (Sonnet 4.6) on behalf of Nuvesta Academy. "
    "This report covers static code analysis of the StaffBot Pro repository.",
    style(fontSize=6.5, textColor=colors.grey, alignment=TA_CENTER)
))

# ── Build ─────────────────────────────────────────────────────────────────────
doc.build(story)
print(f"[SEND_FILE: {OUTPUT}]")
print(f"PDF created: {OUTPUT}")
