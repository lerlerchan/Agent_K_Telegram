#!/usr/bin/env python3
"""
AiTraining2U Employment Contract PDF Generator
Supports: full-time | contract | internship
Usage: uv run --with reportlab python3 build_contract.py {emp_id}
"""

import sqlite3, os, sys, json
from datetime import datetime, date
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle,
                                 Paragraph, Spacer, HRFlowable,
                                 PageBreak, KeepTogether)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER, TA_JUSTIFY
from reportlab.platypus.flowables import HRFlowable

DB_PATH = os.path.expanduser("~/hr.db")
OUT_DIR = os.path.expanduser("~/Documents/AiTraining2U/HR/Contracts")

# ── Load employee from DB ─────────────────────────────────────────────────────
emp_id = sys.argv[1] if len(sys.argv) > 1 else None
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()
if emp_id:
    c.execute("SELECT * FROM employees WHERE emp_id=?", (emp_id,))
else:
    c.execute("SELECT * FROM employees ORDER BY id DESC LIMIT 1")
emp = c.fetchone()
if not emp:
    print("Employee not found"); sys.exit(1)
conn.close()

# ── Config ────────────────────────────────────────────────────────────────────
EMPLOYER = {
    "name":    os.environ.get("COMPANY_NAME", "AiTraining2U PLT"),
    "reg":     os.environ.get("COMPANY_REG", "202504002669"),
    "address": os.environ.get("COMPANY_ADDRESS", "D-10-5, Sky Condominium, Persiaran Puchong Jaya Selatan, 47100 Selangor") + ", Malaysia",
    "rep":     os.environ.get("COMPANY_CONTACT_NAME", "Atlas Chan"),
    "title":   os.environ.get("COMPANY_CONTACT_TITLE", "Director"),
}

DARK_BLUE  = HexColor("#1A3C5E")
MED_BLUE   = HexColor("#2E86AB")
LIGHT_BLUE = HexColor("#EBF4FA")
LIGHT_GRAY = HexColor("#F4F4F4")
TEXT       = HexColor("#2C2C2C")
SUBTEXT    = HexColor("#555555")
WHITE      = white

etype      = emp["employment_type"].lower()  # full-time / contract / internship
is_intern  = etype == "internship"
is_perm    = etype == "full-time"
is_fixed   = etype == "contract"

# ── Date helpers ──────────────────────────────────────────────────────────────
def fmtdate(d):
    try: return datetime.strptime(d, "%Y-%m-%d").strftime("%-d %B %Y")
    except: return d or "—"

def name_slug(name):
    import re
    n = re.sub(r'[^\w\s-]', '', name).strip()
    return re.sub(r'\s+', '-', n)

start_display = fmtdate(emp["start_date"])
end_display   = fmtdate(emp["end_date"]) if emp["end_date"] else None
today_display = datetime.today().strftime("%-d %B %Y")
year          = emp["start_date"][:4]

# ── File path ─────────────────────────────────────────────────────────────────
year_dir    = os.path.join(OUT_DIR, year, "Unsigned")
os.makedirs(year_dir, exist_ok=True)
etype_label = etype.replace("-", "").replace(" ", "-").title()
slug        = name_slug(emp["full_name"])
filename    = f"{emp['emp_id']}_{slug}_{etype_label}-Contract_{emp['start_date']}.pdf"
OUT         = os.path.join(year_dir, filename)

# Remove old copies
for old in [os.path.join(OUT_DIR, year, "Unsigned", f"{emp['emp_id']}*.pdf")]:
    import glob
    for f in glob.glob(old):
        if f != OUT: os.remove(f)

# ── Allowances ────────────────────────────────────────────────────────────────
allowances = {}
if emp["allowances"]:
    try: allowances = json.loads(emp["allowances"])
    except: pass

# ── Leave entitlements (EA 1955) ──────────────────────────────────────────────
# Based on years of service — for new employee, use <2yrs as starting minimum
LEAVE = {
    "annual_lt2": 8, "annual_2to5": 12, "annual_gte5": 16,
    "sick_lt2": 14,  "sick_2to5": 18,   "sick_gte5": 22,
    "hospitalization": 60,
    "maternity": 98,
    "paternity": 7,
    "public_holidays": 11,
}

# ── Document ──────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    OUT, pagesize=A4,
    leftMargin=20*mm, rightMargin=20*mm,
    topMargin=18*mm, bottomMargin=18*mm,
)
W = A4[0] - 40*mm

def S(name, **kw):
    return ParagraphStyle(name, parent=getSampleStyleSheet()["Normal"], **kw)

# Styles
s_h1      = S("h1",   fontSize=18, textColor=DARK_BLUE, fontName="Helvetica-Bold",
               alignment=TA_CENTER, leading=22, spaceAfter=2)
s_h2      = S("h2",   fontSize=9,  textColor=SUBTEXT,   fontName="Helvetica",
               alignment=TA_CENTER, leading=13, spaceAfter=4)
s_sec     = S("sec",  fontSize=10, textColor=WHITE,     fontName="Helvetica-Bold",
               leading=14, spaceBefore=6)
s_clause  = S("cl",   fontSize=9.5,textColor=TEXT,      fontName="Helvetica-Bold",
               leading=14, spaceBefore=2)
s_body    = S("body", fontSize=9,  textColor=TEXT,      fontName="Helvetica",
               leading=14, alignment=TA_JUSTIFY, spaceAfter=4)
s_body_b  = S("bb",   fontSize=9,  textColor=TEXT,      fontName="Helvetica-Bold",
               leading=14, spaceAfter=4)
s_label   = S("lbl",  fontSize=8.5,textColor=SUBTEXT,   fontName="Helvetica",   leading=13)
s_value   = S("val",  fontSize=9,  textColor=TEXT,      fontName="Helvetica-Bold", leading=13)
s_sign    = S("sign", fontSize=9,  textColor=TEXT,      fontName="Helvetica",   leading=13)
s_sign_b  = S("signb",fontSize=9,  textColor=TEXT,      fontName="Helvetica-Bold", leading=13)
s_footer  = S("ftr",  fontSize=7.5,textColor=SUBTEXT,   fontName="Helvetica-Oblique",
               alignment=TA_CENTER, leading=10)
s_pg      = S("pg",   fontSize=7.5,textColor=SUBTEXT,   fontName="Helvetica",
               alignment=TA_RIGHT, leading=10)

def section_header(title):
    tbl = Table([[Paragraph(title, s_sec)]], colWidths=[W])
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,-1), DARK_BLUE),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 8),
    ]))
    return tbl

def kv_table(rows, total_width=None):
    """Two-column key:value table for parties / details"""
    if total_width is None:
        total_width = W
    label_w = min(45*mm, total_width * 0.42)
    data = [[Paragraph(r[0], s_label), Paragraph(r[1], s_value)] for r in rows]
    t = Table(data, colWidths=[label_w, total_width - label_w])
    t.setStyle(TableStyle([
        ("TOPPADDING",    (0,0),(-1,-1), 3),
        ("BOTTOMPADDING", (0,0),(-1,-1), 3),
        ("LEFTPADDING",   (0,0),(-1,-1), 0),
        ("RIGHTPADDING",  (0,0),(-1,-1), 0),
        ("VALIGN",        (0,0),(-1,-1), "TOP"),
        ("WORDWRAP",      (0,0),(-1,-1), "CJK"),
    ]))
    return t

def divider(): return HRFlowable(width="100%", thickness=0.5, color=HexColor("#CCCCCC"), spaceBefore=4, spaceAfter=4)

story = []

# ══════════════════════════════════════════════════════════════════════════════
# HEADER
# ══════════════════════════════════════════════════════════════════════════════
# Top bar
bar = Table([[""]], colWidths=[W])
bar.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),DARK_BLUE),
                          ("ROWHEIGHT",(0,0),(-1,-1),4)]))
story.append(bar)
story.append(Spacer(1, 4*mm))

story.append(Paragraph(EMPLOYER["name"], s_h1))
story.append(Paragraph(
    f"Reg. No: {EMPLOYER['reg']}  •  {EMPLOYER['address']}",
    s_h2))

accent = Table([[""]], colWidths=[W])
accent.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,-1),MED_BLUE),
                              ("ROWHEIGHT",(0,0),(-1,-1),2)]))
story.append(accent)
story.append(Spacer(1, 5*mm))

# Contract title
contract_title = {
    "full-time":    "EMPLOYMENT CONTRACT (PERMANENT)",
    "contract":     "EMPLOYMENT CONTRACT (FIXED-TERM)",
    "internship":   "INTERNSHIP AGREEMENT",
}.get(etype, "EMPLOYMENT CONTRACT")

title_tbl = Table([[Paragraph(contract_title,
    S("ct", fontSize=14, textColor=DARK_BLUE, fontName="Helvetica-Bold",
      alignment=TA_CENTER, leading=18))]], colWidths=[W])
title_tbl.setStyle(TableStyle([
    ("LINEBELOW",(0,0),(-1,-1),1,MED_BLUE),
    ("BOTTOMPADDING",(0,0),(-1,-1),4),
]))
story.append(title_tbl)
story.append(Spacer(1, 2*mm))

ref_date = Table([[
    Paragraph(f"Ref: {emp['emp_id']}",
        S("_", fontSize=8.5, textColor=SUBTEXT, fontName="Helvetica", leading=12)),
    Paragraph(f"Date: {today_display}",
        S("_", fontSize=8.5, textColor=SUBTEXT, fontName="Helvetica",
          alignment=TA_RIGHT, leading=12)),
]], colWidths=[W/2, W/2])
ref_date.setStyle(TableStyle([("LEFTPADDING",(0,0),(-1,-1),0),
                               ("RIGHTPADDING",(0,0),(-1,-1),0),
                               ("TOPPADDING",(0,0),(-1,-1),0),
                               ("BOTTOMPADDING",(0,0),(-1,-1),0)]))
story.append(ref_date)
story.append(Spacer(1, 5*mm))

# ══════════════════════════════════════════════════════════════════════════════
# 1. PARTIES
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("1.  PARTIES"))
story.append(Spacer(1, 3*mm))

story.append(Paragraph("This agreement is entered into between:", s_body))
story.append(Spacer(1, 2*mm))

# Inner content width = col width minus left+right padding (8mm each)
_party_col_w = W/2 - 3*mm
_party_inner_w = _party_col_w - 16*mm

parties = Table([
    [Paragraph("EMPLOYER", S("_",fontSize=9,textColor=DARK_BLUE,fontName="Helvetica-Bold",leading=13)),
     Paragraph("EMPLOYEE", S("_",fontSize=9,textColor=DARK_BLUE,fontName="Helvetica-Bold",leading=13))],
    [kv_table([
        ("Company:", EMPLOYER["name"]),
        ("Reg. No:", EMPLOYER["reg"]),
        ("Address:", EMPLOYER["address"]),
        ("Representative:", f"{EMPLOYER['rep']}, {EMPLOYER['title']}"),
     ], total_width=_party_inner_w),
     kv_table([
        ("Full Name:", emp["full_name"]),
        ("NRIC/Passport:", emp["nric"] or "—"),
        ("Nationality:", emp["nationality"] or "Malaysian"),
        ("Address:", emp["address"] or "—"),
        ("Tel:", emp["tel"] or "—"),
        ("Email:", emp["email"] or "—"),
     ], total_width=_party_inner_w)
    ],
], colWidths=[_party_col_w, _party_col_w], rowHeights=[None, None])
parties.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0), LIGHT_BLUE),
    ("FONTNAME",      (0,0),(-1,0), "Helvetica-Bold"),
    ("TOPPADDING",    (0,0),(-1,-1), 6),
    ("BOTTOMPADDING", (0,0),(-1,-1), 6),
    ("LEFTPADDING",   (0,0),(-1,-1), 8),
    ("RIGHTPADDING",  (0,0),(-1,-1), 8),
    ("LINEAFTER",     (0,0),(0,-1), 0.5, HexColor("#CCCCCC")),
    ("BOX",           (0,0),(-1,-1), 0.5, HexColor("#CCCCCC")),
    ("VALIGN",        (0,0),(-1,-1), "TOP"),
]))
story.append(parties)
story.append(Spacer(1, 4*mm))

# ══════════════════════════════════════════════════════════════════════════════
# 2. POSITION & COMMENCEMENT
# ══════════════════════════════════════════════════════════════════════════════
story.append(section_header("2.  POSITION & COMMENCEMENT"))
story.append(Spacer(1, 3*mm))

pos_rows = [
    ("Position:", emp["position"]),
    ("Department:", emp["department"] or "—"),
    ("Employment Type:", emp["employment_type"].title()),
    ("Commencement Date:", start_display),
]
story.append(kv_table(pos_rows))
story.append(Spacer(1, 3*mm))
story.append(Paragraph(
    "The Employee shall perform all duties and responsibilities associated with the above position and such "
    "other duties as may reasonably be assigned by the Employer from time to time.",
    s_body))

# ══════════════════════════════════════════════════════════════════════════════
# 3. CONTRACT DURATION (fixed-term & internship only)
# ══════════════════════════════════════════════════════════════════════════════
if not is_perm:
    story.append(Spacer(1, 2*mm))
    story.append(section_header("3.  CONTRACT DURATION"))
    story.append(Spacer(1, 3*mm))
    story.append(kv_table([
        ("Start Date:", start_display),
        ("End Date:", end_display or "—"),
    ]))
    story.append(Spacer(1, 2*mm))
    if is_intern:
        story.append(Paragraph(
            "This Internship Agreement is for the duration stated above. Upon expiry, this agreement shall "
            "automatically terminate unless extended in writing by both parties. This agreement does not "
            "constitute an offer of permanent employment.",
            s_body))
    else:
        story.append(Paragraph(
            "This contract is for a fixed term as specified above. Upon expiry, the contract shall "
            "automatically terminate unless renewed by mutual written agreement. The Employee has no "
            "automatic right to renewal or conversion to permanent employment.",
            s_body))
    sec_num = 4
else:
    sec_num = 3

# ══════════════════════════════════════════════════════════════════════════════
# 4/3. PROBATION (full-time & contract only)
# ══════════════════════════════════════════════════════════════════════════════
if not is_intern and (emp["probation_months"] or 0) > 0:
    story.append(Spacer(1, 2*mm))
    story.append(section_header(f"{sec_num}.  PROBATION PERIOD"))
    story.append(Spacer(1, 3*mm))
    prob = emp["probation_months"]
    story.append(Paragraph(
        f"The Employee shall serve a probation period of <b>{prob} month{'s' if prob>1 else ''}</b> "
        f"commencing on the start date. During probation, either party may terminate this agreement "
        f"by giving <b>one (1) month</b> written notice or payment in lieu thereof.",
        s_body))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "The Employer may, at its sole discretion, extend the probation period by a further period not "
        "exceeding the original probation duration, with written notification to the Employee prior to "
        "the expiry of the initial probation period. All statutory entitlements apply during probation.",
        s_body))
    sec_num += 1

# ══════════════════════════════════════════════════════════════════════════════
# WORKING HOURS
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 2*mm))
story.append(section_header(f"{sec_num}.  WORKING HOURS"))
story.append(Spacer(1, 3*mm))
story.append(kv_table([
    ("Working Days:", "Monday – Friday"),
    ("Working Hours:", "9:00 AM – 6:00 PM (1 hour lunch break)"),
    ("Weekly Hours:", "45 hours per week (as per Employment Act 1955)"),
    ("Rest Day:", "Saturday & Sunday"),
]))
story.append(Spacer(1, 2*mm))
if not is_intern:
    story.append(Paragraph(
        "Overtime work, if required, shall be compensated at a minimum rate of one and a half (1.5) times "
        "the Employee's hourly rate of pay, subject to a maximum of 104 overtime hours per month and shall "
        "not exceed 12 hours per day inclusive of normal working hours.",
        s_body))
sec_num += 1

# ══════════════════════════════════════════════════════════════════════════════
# REMUNERATION
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 2*mm))
story.append(section_header(f"{sec_num}.  REMUNERATION"))
story.append(Spacer(1, 3*mm))

if is_intern:
    monthly = emp["basic_salary"] or 0
    story.append(kv_table([
        ("Monthly Allowance:", f"RM {monthly:,.2f}"),
        ("Payment Date:", "On or before the 28th of each month"),
        ("Payment Method:", "Bank transfer"),
    ]))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "The above allowance is inclusive of all benefits. No overtime, statutory contributions (EPF/SOCSO/EIS), "
        "or additional claims shall be payable unless otherwise stipulated herein.",
        s_body))
else:
    basic = emp["basic_salary"] or 0
    allow_rows = []
    total_allow = 0.0
    for k, v in allowances.items():
        allow_rows.append((f"{k.title()} Allowance:", f"RM {float(v):,.2f}"))
        total_allow += float(v)
    gross = basic + total_allow

    sal_rows = [("Basic Salary:", f"RM {basic:,.2f}")]
    sal_rows += allow_rows
    if total_allow > 0:
        sal_rows.append(("Gross Monthly Salary:", f"RM {gross:,.2f}"))
    sal_rows += [
        ("Payment Date:", "On or before the 28th of each month"),
        ("Payment Method:", "Bank transfer"),
    ]
    story.append(kv_table(sal_rows))
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "The salary shall be subject to statutory deductions including EPF (Employee's share), SOCSO, EIS, "
        "and Monthly Tax Deduction (PCB/MTD) as required by law. The Employer shall remit the Employer's "
        "share of EPF, SOCSO, and EIS contributions in accordance with applicable legislation. "
        "The basic salary is not less than the national minimum wage as prescribed by the Minimum Wages Order "
        "currently in force.",
        s_body))
sec_num += 1

# ══════════════════════════════════════════════════════════════════════════════
# LEAVE ENTITLEMENTS
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 2*mm))
story.append(section_header(f"{sec_num}.  LEAVE ENTITLEMENTS"))
story.append(Spacer(1, 3*mm))
story.append(Paragraph(
    "The Employee shall be entitled to the following leave, in accordance with the Employment Act 1955:",
    s_body))
story.append(Spacer(1, 2*mm))

if is_intern:
    leave_data = [
        ["Leave Type", "Entitlement", "Notes"],
        ["Annual Leave", "As per duration", "Pro-rated based on contract length"],
        ["Sick Leave", "14 days/year", "Medical certificate required"],
        ["Public Holidays", "11 federal paid holidays", "As gazetted by federal government"],
    ]
else:
    leave_data = [
        ["Leave Type", "< 2 Years Service", "2–5 Years", "≥ 5 Years"],
        ["Annual Leave", "8 days", "12 days", "16 days"],
        ["Sick Leave", "14 days", "18 days", "22 days"],
        ["Hospitalisation Leave", "60 days", "60 days", "60 days"],
        ["Maternity Leave", "98 consecutive days (paid)", "", ""],
        ["Paternity Leave", "7 consecutive days (paid)", "", ""],
        ["Public Holidays", "11 federal paid holidays per year", "", ""],
    ]

hdr_cols = len(leave_data[0])
col_w    = [W * 0.40] + [(W * 0.60 / (hdr_cols - 1))] * (hdr_cols - 1)
ltbl     = Table(leave_data, colWidths=col_w)
ltbl.setStyle(TableStyle([
    ("BACKGROUND",    (0,0),(-1,0), DARK_BLUE),
    ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
    ("FONTNAME",      (0,0),(-1,0), "Helvetica-Bold"),
    ("FONTSIZE",      (0,0),(-1,-1), 8.5),
    ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, LIGHT_GRAY]),
    ("GRID",          (0,0),(-1,-1), 0.3, HexColor("#CCCCCC")),
    ("TOPPADDING",    (0,0),(-1,-1), 5),
    ("BOTTOMPADDING", (0,0),(-1,-1), 5),
    ("LEFTPADDING",   (0,0),(-1,-1), 6),
    ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ("SPAN",          (1,5),(3,5), ) if not is_intern else ("SPAN",(0,0),(0,0),),
    ("SPAN",          (1,6),(3,6), ) if not is_intern else ("SPAN",(0,0),(0,0),),
]))
story.append(ltbl)
story.append(Spacer(1, 2*mm))
story.append(Paragraph(
    "Leave entitlements shall accrue from the commencement date and are subject to the terms and conditions "
    "of the Employer's leave policy. All leave must be applied for and approved in advance.",
    s_body))
sec_num += 1

# ══════════════════════════════════════════════════════════════════════════════
# STATUTORY CONTRIBUTIONS (full-time & contract only)
# ══════════════════════════════════════════════════════════════════════════════
if not is_intern:
    story.append(Spacer(1, 2*mm))
    story.append(section_header(f"{sec_num}.  STATUTORY CONTRIBUTIONS"))
    story.append(Spacer(1, 3*mm))
    story.append(Paragraph(
        "The Employer and Employee shall make the following mandatory statutory contributions:",
        s_body))
    story.append(Spacer(1, 2*mm))
    stat_data = [
        ["Scheme", "Employee Contribution", "Employer Contribution"],
        ["EPF (Employees Provident Fund)", "9% of basic salary*", "12% of basic salary*"],
        ["SOCSO (Social Security)", "0.5% of wages", "1.75% of wages"],
        ["EIS (Employment Insurance)", "0.2% of wages", "0.2% of wages"],
        ["PCB / MTD (Income Tax)", "As per LHDN schedule", "Employer deducts & remits"],
    ]
    stbl = Table(stat_data, colWidths=[W*0.42, W*0.29, W*0.29])
    stbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0), DARK_BLUE),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTNAME",      (0,0),(-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0),(-1,-1), 8.5),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, LIGHT_GRAY]),
        ("GRID",          (0,0),(-1,-1), 0.3, HexColor("#CCCCCC")),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    story.append(stbl)
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "* EPF rates may vary for employees aged above 60 or below 18, and for non-Malaysian citizens. "
        "Contributions shall be remitted in accordance with the relevant statutory deadlines.",
        S("_", fontSize=8, textColor=SUBTEXT, fontName="Helvetica-Oblique", leading=12)))
    sec_num += 1

# ══════════════════════════════════════════════════════════════════════════════
# CONFIDENTIALITY & NON-SOLICITATION
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 2*mm))
story.append(section_header(f"{sec_num}.  CONFIDENTIALITY & NON-SOLICITATION"))
story.append(Spacer(1, 3*mm))

story.append(Paragraph(f"{sec_num}.1  Confidentiality", s_clause))
story.append(Paragraph(
    "The Employee shall not, during or after the term of employment, disclose or make available to any "
    "third party any confidential information, trade secrets, business plans, client data, financial "
    "information, proprietary methodologies, or any other information of a confidential nature belonging "
    "to the Employer, without prior written consent. This obligation survives termination indefinitely.",
    s_body))

story.append(Paragraph(f"{sec_num}.2  Non-Solicitation", s_clause))
story.append(Paragraph(
    "For a period of twelve (12) months following the termination of employment, the Employee shall not "
    "directly or indirectly solicit, induce, or attempt to solicit any client, customer, or employee of "
    "the Employer with whom the Employee had material contact during the course of employment.",
    s_body))

story.append(Paragraph(f"{sec_num}.3  Intellectual Property", s_clause))
story.append(Paragraph(
    "All work product, inventions, content, materials, and developments created by the Employee in the "
    "course of employment shall be the sole property of the Employer. The Employee hereby assigns all "
    "intellectual property rights in such works to the Employer.",
    s_body))
sec_num += 1

# ══════════════════════════════════════════════════════════════════════════════
# TERMINATION
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 2*mm))
story.append(section_header(f"{sec_num}.  TERMINATION"))
story.append(Spacer(1, 3*mm))

if not is_intern:
    story.append(Paragraph(f"{sec_num}.1  Notice Period", s_clause))
    story.append(Paragraph(
        "Either party may terminate this agreement by providing written notice as follows:",
        s_body))
    notice_data = [
        ["Length of Service", "Notice Period"],
        ["Less than 2 years", "4 weeks"],
        ["2 years to less than 5 years", "6 weeks"],
        ["5 years or more", "8 weeks"],
    ]
    ntbl = Table(notice_data, colWidths=[W*0.55, W*0.45])
    ntbl.setStyle(TableStyle([
        ("BACKGROUND",    (0,0),(-1,0), DARK_BLUE),
        ("TEXTCOLOR",     (0,0),(-1,0), WHITE),
        ("FONTNAME",      (0,0),(-1,0), "Helvetica-Bold"),
        ("FONTSIZE",      (0,0),(-1,-1), 8.5),
        ("ROWBACKGROUNDS",(0,1),(-1,-1), [WHITE, LIGHT_GRAY]),
        ("GRID",          (0,0),(-1,-1), 0.3, HexColor("#CCCCCC")),
        ("TOPPADDING",    (0,0),(-1,-1), 5),
        ("BOTTOMPADDING", (0,0),(-1,-1), 5),
        ("LEFTPADDING",   (0,0),(-1,-1), 6),
        ("VALIGN",        (0,0),(-1,-1), "MIDDLE"),
    ]))
    story.append(ntbl)
    story.append(Spacer(1, 2*mm))
    story.append(Paragraph(
        "Either party may, in lieu of notice, pay or forfeit salary equivalent to the notice period.",
        s_body))

    story.append(Paragraph(f"{sec_num}.2  Summary Dismissal", s_clause))
    story.append(Paragraph(
        "The Employer may terminate this agreement without notice in the event of serious misconduct, "
        "willful breach of contract, gross negligence, dishonesty, or any act bringing the Employer into "
        "disrepute. Any such dismissal shall follow a domestic inquiry in accordance with the Employment "
        "Act 1955.",
        s_body))

    story.append(Paragraph(f"{sec_num}.3  Protection of Pregnant Employees", s_clause))
    story.append(Paragraph(
        "A female Employee shall not be terminated by reason of pregnancy or childbirth, except in cases "
        "of serious misconduct or closure of business, in accordance with Section 37 of the Employment "
        "Act 1955.",
        s_body))
else:
    story.append(Paragraph(
        "Either party may terminate this agreement by giving <b>one (1) week</b> written notice. "
        "The Employer may terminate immediately in the event of serious misconduct, dishonesty, or "
        "willful breach of this agreement.",
        s_body))
sec_num += 1

# ══════════════════════════════════════════════════════════════════════════════
# GENERAL PROVISIONS
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 2*mm))
story.append(section_header(f"{sec_num}.  GENERAL PROVISIONS"))
story.append(Spacer(1, 3*mm))

story.append(Paragraph(f"{sec_num}.1  Governing Law", s_clause))
story.append(Paragraph(
    "This agreement shall be governed by and construed in accordance with the laws of Malaysia, "
    "including the Employment Act 1955 (as amended by the Employment (Amendment) Act 2022) and "
    "all other applicable Malaysian legislation.",
    s_body))

story.append(Paragraph(f"{sec_num}.2  Entire Agreement", s_clause))
story.append(Paragraph(
    "This agreement constitutes the entire agreement between the parties and supersedes all prior "
    "negotiations, representations, warranties, and understandings. Any amendment must be in writing "
    "and signed by both parties.",
    s_body))

story.append(Paragraph(f"{sec_num}.3  Compliance with Policies", s_clause))
story.append(Paragraph(
    "The Employee agrees to comply with all Employer policies, procedures, and codes of conduct as "
    "may be issued or amended from time to time. Such policies form part of this agreement.",
    s_body))

story.append(Paragraph(f"{sec_num}.4  Flexible Working Arrangement", s_clause))
story.append(Paragraph(
    "In accordance with Section 60P of the Employment Act 1955 (as amended by the Employment "
    "(Amendment) Act 2022), the Employee may apply in writing for a flexible working arrangement "
    "regarding the hours, days, or place of work. The Employer shall respond in writing within "
    "sixty (60) days of receiving such application, stating approval or reasons for refusal.",
    s_body))

story.append(Paragraph(f"{sec_num}.5  Anti-Sexual Harassment", s_clause))
story.append(Paragraph(
    "The Employer shall take reasonable steps to prevent sexual harassment in the workplace in "
    "accordance with Sections 81A–81F of the Employment Act 1955. Any complaint of sexual "
    "harassment shall be investigated and addressed in accordance with the Employer's Anti-Sexual "
    "Harassment Policy. An employee who is subjected to sexual harassment by the Employer may "
    "terminate this contract without notice pursuant to Section 14(1)(a) of the Employment Act 1955.",
    s_body))

story.append(Paragraph(f"{sec_num}.6  Minimum Wage", s_clause))
story.append(Paragraph(
    "The remuneration payable under this agreement shall at all times be not less than the "
    "prevailing national minimum wage as prescribed under the Minimum Wages Order issued pursuant "
    "to the National Wages Consultative Council Act 2011. In the event of any increase to the "
    "statutory minimum wage, the Employer shall adjust the Employee's remuneration accordingly.",
    s_body))

story.append(Paragraph(f"{sec_num}.7  Severability", s_clause))
story.append(Paragraph(
    "If any provision of this agreement is held to be invalid or unenforceable, the remaining "
    "provisions shall continue in full force and effect.",
    s_body))
sec_num += 1

# ══════════════════════════════════════════════════════════════════════════════
# SIGNATURE BLOCK
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 4*mm))
story.append(section_header(f"{sec_num}.  EXECUTION"))
story.append(Spacer(1, 4*mm))

story.append(Paragraph(
    "IN WITNESS WHEREOF, the parties have executed this agreement on the date first written above.",
    s_body))
story.append(Spacer(1, 6*mm))

def sig_block(title, name, label, date_label="Date:"):
    return [
        Paragraph(title, S("_", fontSize=8.5, textColor=DARK_BLUE,
                            fontName="Helvetica-Bold", leading=13)),
        Spacer(1, 10*mm),
        Table([["_" * 45]], colWidths=[70*mm]),
        Paragraph(f"<b>{name}</b>", S("_", fontSize=9, textColor=TEXT,
                                       fontName="Helvetica-Bold", leading=13)),
        Paragraph(label, S("_", fontSize=8.5, textColor=SUBTEXT,
                            fontName="Helvetica", leading=12)),
        Spacer(1, 4*mm),
        Paragraph(f"{date_label} ____________________",
                  S("_", fontSize=8.5, textColor=TEXT, fontName="Helvetica", leading=12)),
    ]

sig_tbl = Table([
    [sig_block("FOR AND ON BEHALF OF EMPLOYER",
               EMPLOYER["name"], EMPLOYER["rep"] + ", " + EMPLOYER["title"]),
     sig_block("EMPLOYEE",
               emp["full_name"], emp["nric"] or "NRIC: _______________")],
], colWidths=[W/2, W/2])
sig_tbl.setStyle(TableStyle([
    ("VALIGN",  (0,0),(-1,-1), "TOP"),
    ("TOPPADDING",    (0,0),(-1,-1), 0),
    ("BOTTOMPADDING", (0,0),(-1,-1), 0),
    ("LEFTPADDING",   (0,0),(-1,-1), 0),
    ("RIGHTPADDING",  (0,0),(-1,-1), 8),
]))
story.append(sig_tbl)
story.append(Spacer(1, 8*mm))

# Witness block
story.append(divider())
story.append(Paragraph("WITNESSED BY:", S("_", fontSize=8.5, textColor=DARK_BLUE,
                                           fontName="Helvetica-Bold", leading=13)))
story.append(Spacer(1, 8*mm))
wit_tbl = Table([
    [Paragraph("Name: ________________________________", s_sign),
     Paragraph("Name: ________________________________", s_sign)],
    [Paragraph("NRIC: ________________________________", s_sign),
     Paragraph("NRIC: ________________________________", s_sign)],
    [Paragraph("Signature: ___________________________", s_sign),
     Paragraph("Signature: ___________________________", s_sign)],
    [Paragraph("Date: _______________________________", s_sign),
     Paragraph("Date: _______________________________", s_sign)],
], colWidths=[W/2, W/2])
wit_tbl.setStyle(TableStyle([
    ("TOPPADDING",(0,0),(-1,-1), 4),
    ("BOTTOMPADDING",(0,0),(-1,-1), 2),
    ("LEFTPADDING",(0,0),(-1,-1), 0),
    ("RIGHTPADDING",(0,0),(-1,-1), 0),
]))
story.append(wit_tbl)

# ══════════════════════════════════════════════════════════════════════════════
# FOOTER
# ══════════════════════════════════════════════════════════════════════════════
story.append(Spacer(1, 6*mm))
story.append(HRFlowable(width="100%", thickness=0.5, color=HexColor("#CCCCCC")))
story.append(Spacer(1, 2*mm))
story.append(Paragraph(
    "This contract is governed by the Employment Act 1955 as amended by the Employment (Amendment) Act 2022 "
    "and all other applicable laws of Malaysia. Any provision less favourable than the statutory minimum "
    "shall be automatically replaced by the applicable statutory provision.",
    s_footer))

# ── Build ─────────────────────────────────────────────────────────────────────
# Update DB with pdf path
conn2 = sqlite3.connect(DB_PATH)
conn2.execute("UPDATE employees SET contract_pdf=? WHERE emp_id=?", (OUT, emp["emp_id"]))
conn2.commit(); conn2.close()

doc.build(story)
print(f"Contract: {OUT}")
