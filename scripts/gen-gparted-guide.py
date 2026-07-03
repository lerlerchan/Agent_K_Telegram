#!/usr/bin/env python3
"""Generate GParted partition guide PDF — print-friendly."""

import os
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

OUTPUT = os.path.join(
    os.environ.get('WORKSPACE_DIR', '/tmp'),
    'GParted_Guide_k45vd.pdf'
)

DARK   = colors.HexColor("#2c3e50")
BLUE   = colors.HexColor("#2980b9")
GREEN  = colors.HexColor("#27ae60")
ORANGE = colors.HexColor("#e67e22")
RED    = colors.HexColor("#e74c3c")
LGREY  = colors.HexColor("#ecf0f1")
WHITE  = colors.white

doc = SimpleDocTemplate(
    OUTPUT, pagesize=A4,
    leftMargin=2*cm, rightMargin=2*cm,
    topMargin=1.5*cm, bottomMargin=1.5*cm,
)
W = A4[0] - 4*cm
styles = getSampleStyleSheet()

def s(base="Normal", **kw):
    st = styles[base].clone(base + str(id(kw)))
    for k, v in kw.items(): setattr(st, k, v)
    return st

def heading(text, color=DARK, size=13):
    return Paragraph(f"<b>{text}</b>", s(fontSize=size, textColor=color, spaceAfter=4))

def body(text, indent=0):
    return Paragraph(text, s(fontSize=9, leftIndent=indent*cm, spaceAfter=3, leading=13))

def code(text):
    return Paragraph(
        f'<font name="Courier" size="8">{text}</font>',
        s(fontSize=8, backColor=colors.HexColor("#f5f5f5"),
          leftIndent=0.3*cm, rightIndent=0.3*cm,
          borderPadding=4, spaceAfter=2, leading=12)
    )

def step_box(num, title, color=BLUE):
    data = [[
        Paragraph(f"<b>{num}</b>", s(fontSize=14, textColor=WHITE, alignment=TA_CENTER)),
        Paragraph(f"<b>{title}</b>", s(fontSize=11, textColor=WHITE)),
    ]]
    t = Table(data, colWidths=[1*cm, W-1*cm])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), color),
        ("VALIGN",        (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING",    (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
    ]))
    return t

def warn_box(text, color=ORANGE):
    data = [[Paragraph(f"⚠️  {text}", s(fontSize=8.5, textColor=DARK))]]
    t = Table(data, colWidths=[W])
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0,0), (-1,-1), colors.HexColor("#fef9e7")),
        ("BOX",           (0,0), (-1,-1), 1, color),
        ("TOPPADDING",    (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
        ("LEFTPADDING",   (0,0), (-1,-1), 8),
    ]))
    return t

story = []

# ── Title ─────────────────────────────────────────────────────────────────────
story.append(Paragraph(
    "k45vd — Remove Windows C: &amp; Expand Ubuntu Storage",
    s("Heading1", fontSize=15, textColor=DARK, alignment=TA_CENTER, spaceAfter=2)
))
story.append(Paragraph(
    "Print this guide and follow step by step. Ubuntu stays safe — only Windows C: is removed.",
    s(fontSize=8.5, textColor=colors.grey, alignment=TA_CENTER, spaceAfter=4)
))
story.append(HRFlowable(width="100%", thickness=1.5, color=BLUE, spaceAfter=10))

# ── Disk layout ───────────────────────────────────────────────────────────────
story.append(heading("Current Disk Layout (476.9GB total)", DARK, 10))
layout = [
    ["Partition", "Size", "Type", "Action"],
    ["sda1", "100 MB", "EFI Boot", "KEEP — Ubuntu needs this"],
    ["sda2", "16 MB",  "Windows MSR", "DELETE"],
    ["sda3", "290 GB", "Windows C: (main)", "DELETE → 290GB freed"],
    ["sda4", "155 GB", "Windows D: (your files)", "KEEP — your backup lives here"],
    ["sda5", "530 MB", "Windows Recovery", "DELETE"],
    ["sda6", "31 GB",  "Ubuntu / (current)", "KEEP + new /home partition created"],
]
col_w = [W*0.12, W*0.10, W*0.35, W*0.43]
tbl = Table(layout, colWidths=col_w)
tbl.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1,0), DARK),
    ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
    ("FONTSIZE",      (0,0), (-1,-1), 8),
    ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, LGREY]),
    ("TEXTCOLOR",     (3,2), (3,2), RED),
    ("TEXTCOLOR",     (3,3), (3,3), RED),
    ("TEXTCOLOR",     (3,4), (3,4), RED),
    ("TEXTCOLOR",     (3,5), (3,5), RED),
    ("BOX",           (0,0), (-1,-1), 0.5, colors.lightgrey),
    ("LINEBELOW",     (0,0), (-1,-1), 0.3, colors.lightgrey),
    ("TOPPADDING",    (0,0), (-1,-1), 4),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ("LEFTPADDING",   (0,0), (-1,-1), 5),
]))
story.append(tbl)
story.append(Spacer(1, 10))

# ── PHASE 1 ───────────────────────────────────────────────────────────────────
story.append(step_box("A", "DO FIRST — While Still in Ubuntu (Before Rebooting)", RED))
story.append(Spacer(1, 6))

story.append(warn_box("Do ALL of Phase A before touching the USB or rebooting. This saves your .env and credentials to D: drive."))
story.append(Spacer(1, 5))

story.append(body("<b>A1. Save .env and GitHub PAT to Windows D: drive</b>"))
story.append(body("Open a terminal and run these commands one by one:"))
for cmd in [
    "sudo mkdir -p /mnt/d",
    "sudo mount /dev/sda4 /mnt/d",
    "mkdir -p /mnt/d/AgentK-backup",
    "cp ~/github/Agent_K_Telegram/.env /mnt/d/AgentK-backup/",
    "cp ~/.claude/credentials/github-pat /mnt/d/AgentK-backup/",
    "sudo umount /mnt/d",
    'echo "Done! Files saved to D: drive"',
]:
    story.append(code(cmd))
story.append(Spacer(1, 4))

story.append(body("<b>A2. Confirm backup saved</b>"))
for cmd in [
    "sudo mount /dev/sda4 /mnt/d",
    "ls /mnt/d/AgentK-backup/",
    "# Should show: .env   github-pat",
    "sudo umount /mnt/d",
]:
    story.append(code(cmd))
story.append(Spacer(1, 4))

story.append(body("<b>A3. Note your Ubuntu login password</b> — you will need it after reboot."))
story.append(body("Write it here: _________________________________", 1))
story.append(Spacer(1, 8))

# ── PHASE 2 ───────────────────────────────────────────────────────────────────
story.append(step_box("B", "Download GParted Live ISO (on Windows)", ORANGE))
story.append(Spacer(1, 6))

story.append(body("<b>B1.</b> Boot into Windows (or use another PC)"))
story.append(body("<b>B2.</b> Open browser → go to:  <b>gparted.org</b>"))
story.append(body("<b>B3.</b> Click <b>Download</b> → download the <b>.iso</b> file (~500MB)"))
story.append(body('       Filename looks like:  <font name="Courier">gparted-live-1.x.x-x-amd64.iso</font>'))
story.append(Spacer(1, 8))

# ── PHASE 3 ───────────────────────────────────────────────────────────────────
story.append(step_box("C", "Flash GParted to USB using Rufus", ORANGE))
story.append(Spacer(1, 6))

story.append(body("<b>C1.</b> Plug in your USB drive"))
story.append(body("<b>C2.</b> Open <b>Rufus</b> (same one you used for Ubuntu)"))
story.append(body("<b>C3.</b> Settings in Rufus:"))

rufus = [
    ["Setting", "Value"],
    ["Device", "Your USB drive"],
    ["Boot selection", "Click SELECT → choose the GParted .iso file"],
    ["Partition scheme", "GPT"],
    ["File system", "FAT32 (default)"],
]
rt = Table(rufus, colWidths=[W*0.3, W*0.7])
rt.setStyle(TableStyle([
    ("BACKGROUND",    (0,0), (-1,0), colors.HexColor("#7f8c8d")),
    ("TEXTCOLOR",     (0,0), (-1,0), WHITE),
    ("FONTSIZE",      (0,0), (-1,-1), 8),
    ("FONTNAME",      (0,0), (-1,0), "Helvetica-Bold"),
    ("ROWBACKGROUNDS",(0,1), (-1,-1), [WHITE, LGREY]),
    ("BOX",           (0,0), (-1,-1), 0.5, colors.lightgrey),
    ("LINEBELOW",     (0,0), (-1,-1), 0.3, colors.lightgrey),
    ("TOPPADDING",    (0,0), (-1,-1), 4),
    ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ("LEFTPADDING",   (0,0), (-1,-1), 5),
]))
story.append(rt)
story.append(Spacer(1, 4))
story.append(body("<b>C4.</b> Click <b>START</b> → click OK if it asks about ISO mode → wait for it to finish"))
story.append(Spacer(1, 8))

# ── PHASE 4 ───────────────────────────────────────────────────────────────────
story.append(step_box("D", "Boot & Run GParted", GREEN))
story.append(Spacer(1, 6))

story.append(body("<b>D1.</b> Plug USB into k45vd → Restart"))
story.append(body("<b>D2.</b> Press <b>F12</b> repeatedly as it boots → select USB from boot menu"))
story.append(body('       (Try F2 or Del if F12 doesn\'t work)'))
story.append(body("<b>D3.</b> GParted menu appears → press <b>Enter</b> to accept defaults"))
story.append(body("<b>D4.</b> GParted desktop loads → GParted app opens automatically"))
story.append(Spacer(1, 4))

story.append(body("<b>D5. Delete Windows partitions (in this order):</b>"))
steps_d5 = [
    ["①", "Right-click sda5 (530MB NTFS)", "→ Delete"],
    ["②", "Right-click sda3 (290GB NTFS — Windows C:)", "→ Delete"],
    ["③", "Right-click sda2 (16MB — no label)", "→ Delete"],
    ["④", "Right-click the 291GB unallocated space", "→ New → ext4 → Label: home → Add"],
    ["⑤", "Click the green ✔ Apply button at the top", "→ wait ~5 min"],
]
st = Table(steps_d5, colWidths=[W*0.05, W*0.65, W*0.30])
st.setStyle(TableStyle([
    ("FONTSIZE",      (0,0), (-1,-1), 8),
    ("ROWBACKGROUNDS",(0,0), (-1,-1), [WHITE, LGREY]),
    ("TOPPADDING",    (0,0), (-1,-1), 3),
    ("BOTTOMPADDING", (0,0), (-1,-1), 3),
    ("LEFTPADDING",   (0,0), (-1,-1), 5),
    ("BOX",           (0,0), (-1,-1), 0.5, colors.lightgrey),
    ("LINEBELOW",     (0,0), (-1,-1), 0.3, colors.lightgrey),
    ("FONTNAME",      (0,3), (0,3), "Helvetica-Bold"),
    ("TEXTCOLOR",     (2,0), (2,4), RED),
    ("TEXTCOLOR",     (2,3), (2,3), GREEN),
    ("TEXTCOLOR",     (2,4), (2,4), GREEN),
]))
story.append(st)
story.append(Spacer(1, 4))
story.append(warn_box("DO NOT touch sda1 (EFI), sda4 (D: drive), or sda6 (Ubuntu). Only delete sda2, sda3, sda5."))
story.append(Spacer(1, 4))
story.append(body("<b>D6.</b> When done → GParted menu → <b>Exit</b> → Remove USB → press Enter to reboot"))
story.append(Spacer(1, 8))

# ── PHASE 5 ───────────────────────────────────────────────────────────────────
story.append(step_box("E", "After Reboot — Restart Agent K", BLUE))
story.append(Spacer(1, 6))

story.append(body("<b>E1.</b> Ubuntu boots normally → log in"))
story.append(body("<b>E2.</b> Mount new /home partition (one-time setup):"))
for cmd in [
    "# Find the new partition UUID",
    "sudo blkid | grep ext4",
    "# Copy the UUID of the new ~291GB partition, then:",
    'echo "UUID=paste-uuid-here  /home  ext4  defaults  0  2" | sudo tee -a /etc/fstab',
    "sudo mount -a",
]:
    story.append(code(cmd))
story.append(Spacer(1, 4))

story.append(body("<b>E3. Restore .env from D: drive:</b>"))
for cmd in [
    "sudo mount /dev/sda4 /mnt/d",
    "cp /mnt/d/AgentK-backup/.env ~/github/Agent_K_Telegram/.env",
    "cp /mnt/d/AgentK-backup/github-pat ~/.claude/credentials/github-pat",
    "sudo umount /mnt/d",
]:
    story.append(code(cmd))
story.append(Spacer(1, 4))

story.append(body("<b>E4. Restart Agent K bot:</b>"))
for cmd in [
    "cd ~/github/Agent_K_Telegram",
    "nohup node src/index.js > logs/activity/bot.log 2>&1 &",
    'echo "Bot is running!"',
]:
    story.append(code(cmd))
story.append(Spacer(1, 4))

story.append(body("<b>E5. Restart Claude Code remote control:</b>"))
for cmd in [
    "tmux new -s claude",
    "claude  # then start Remote Control from Telegram",
]:
    story.append(code(cmd))

story.append(Spacer(1, 8))
story.append(HRFlowable(width="100%", thickness=0.5, color=colors.lightgrey, spaceAfter=4))
story.append(Paragraph(
    "Ubuntu stays safe throughout. All steps only affect sda2, sda3, sda5. "
    "Your setup, config, and files are preserved on sda6 + sda4.",
    s(fontSize=7.5, textColor=colors.grey, alignment=TA_CENTER)
))

doc.build(story)
print(f"[SEND_FILE: {OUTPUT}]")
print(f"PDF created: {OUTPUT}")
