#!/usr/bin/env python3
"""Generate the ReLoop Return-Pipeline technical deck (Amazon-native styling).

Run:  python3 deck/build_deck.py
Out:  deck/ReLoop-Return-Pipeline.pptx
"""
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# --- Amazon-native design tokens ------------------------------------------------
INK      = RGBColor(0x13, 0x1A, 0x22)  # deep squid ink (backgrounds)
NAVY     = RGBColor(0x23, 0x2F, 0x3E)  # Amazon navy (surfaces)
PANEL    = RGBColor(0x2C, 0x3A, 0x4B)  # raised panel
PANEL2   = RGBColor(0x37, 0x47, 0x57)  # lighter panel / table header
ORANGE   = RGBColor(0xFF, 0x99, 0x00)  # Amazon orange (accent)
ORANGE_D = RGBColor(0xEC, 0x72, 0x11)  # darker orange
WHITE    = RGBColor(0xFF, 0xFF, 0xFF)
FOG      = RGBColor(0xD5, 0xDB, 0xDB)  # body text
MUTED    = RGBColor(0x9B, 0xA7, 0xB0)  # captions
GREEN    = RGBColor(0x2E, 0xC4, 0x8D)  # savings / positive
RED      = RGBColor(0xF2, 0x6D, 0x6D)  # cost / negative
CODEBG   = RGBColor(0x0C, 0x12, 0x18)  # terminal panel
CODEFG   = RGBColor(0xCF, 0xE8, 0xD6)  # terminal text
CYAN     = RGBColor(0x5D, 0xC8, 0xE8)

FONT   = "Arial"
MONO   = "Consolas"

EMU_W, EMU_H = Inches(13.333), Inches(7.5)

prs = Presentation()
prs.slide_width  = EMU_W
prs.slide_height = EMU_H
BLANK = prs.slide_layouts[6]


# --- helpers --------------------------------------------------------------------
def slide(bg=INK):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = bg
    return s

def _set_fill(shape, color):
    shape.fill.solid(); shape.fill.fore_color.rgb = color
    shape.line.fill.background()

def rect(s, x, y, w, h, color, line=None, line_w=1.0, radius=False):
    shp_type = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    shp = s.shapes.add_shape(shp_type, x, y, w, h)
    _set_fill(shp, color)
    if line is not None:
        shp.line.color.rgb = line; shp.line.width = Pt(line_w)
    if radius:
        try:
            shp.adjustments[0] = 0.06
        except Exception:
            pass
    shp.shadow.inherit = False
    return shp

def txt(s, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
        space_after=4, line_spacing=1.05, wrap=True):
    """runs: list of paragraphs; each paragraph is list of (text, size, color, bold, font, italic)."""
    tb = s.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Pt(0)
    tf.margin_top = tf.margin_bottom = Pt(0)
    for i, para in enumerate(runs):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.space_after = Pt(space_after)
        p.space_before = Pt(0)
        p.line_spacing = line_spacing
        for (t, size, color, bold, font, italic) in para:
            r = p.add_run(); r.text = t
            r.font.size = Pt(size); r.font.color.rgb = color
            r.font.bold = bold; r.font.name = font; r.font.italic = italic
    return tb

def R(t, size=14, color=FOG, bold=False, font=FONT, italic=False):
    return (t, size, color, bold, font, italic)

def kicker(s, text):
    txt(s, Inches(0.7), Inches(0.42), Inches(11), Inches(0.4),
        [[R(text.upper(), 12.5, ORANGE, True, FONT)]])

def title(s, text, y=0.72, size=30, w=12.0):
    txt(s, Inches(0.7), Inches(y), Inches(w), Inches(1.0),
        [[R(text, size, WHITE, True, FONT)]], line_spacing=1.0)

def accent_bar(s, x=0.7, y=0.34, w=0.55):
    rect(s, Inches(x), Inches(y), Inches(w), Inches(0.06), ORANGE)

def footer(s, n, tag):
    txt(s, Inches(0.7), Inches(7.08), Inches(8), Inches(0.3),
        [[R("ReLoop", 9, ORANGE, True), R("  ·  the intelligence layer for Amazon's returns pipeline", 9, MUTED, False)]])
    txt(s, Inches(11.5), Inches(7.08), Inches(1.2), Inches(0.3),
        [[R(tag + "   " + str(n).zfill(2), 9, MUTED, False)]], align=PP_ALIGN.RIGHT)

def code_panel(s, x, y, w, h, lines, title_txt=None, fs=10.5):
    rect(s, x, y, w, h, CODEBG, line=PANEL2, line_w=1.0, radius=True)
    # traffic dots + title
    dy = y + Inches(0.12)
    for i, c in enumerate((RED, ORANGE, GREEN)):
        d = s.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(0.18 + i*0.22), dy, Inches(0.11), Inches(0.11))
        _set_fill(d, c); d.shadow.inherit = False
    if title_txt:
        txt(s, x + Inches(1.0), dy - Inches(0.02), w - Inches(1.2), Inches(0.24),
            [[R(title_txt, 9.5, MUTED, False, MONO)]])
    body_y = y + Inches(0.42)
    tb = s.shapes.add_textbox(x + Inches(0.22), body_y, w - Inches(0.44), h - Inches(0.55))
    tf = tb.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Pt(0)
    for i, (t, col) in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(1); p.space_before = Pt(0); p.line_spacing = 1.02
        r = p.add_run(); r.text = t
        r.font.size = Pt(fs); r.font.name = MONO; r.font.color.rgb = col; r.font.bold = False
    return tb

def screenshot_ph(s, x, y, w, h, cmd, caption):
    box = rect(s, x, y, w, h, NAVY, line=ORANGE, line_w=1.5, radius=True)
    # dashed look via a label
    txt(s, x, y + Inches(0.28), w, Inches(0.4),
        [[R("📸  PASTE SCREENSHOT HERE", 13, ORANGE, True, FONT)]], align=PP_ALIGN.CENTER)
    txt(s, x + Inches(0.3), y + Inches(0.78), w - Inches(0.6), Inches(0.5),
        [[R("Run:  ", 11, MUTED, True, FONT), R(cmd, 11, CODEFG, False, MONO)]], align=PP_ALIGN.CENTER)
    txt(s, x + Inches(0.3), y + h - Inches(0.62), w - Inches(0.6), Inches(0.5),
        [[R(caption, 10.5, FOG, False, FONT, True)]], align=PP_ALIGN.CENTER)

def chip(s, x, y, text, w=None, color=PANEL2, tcolor=FOG):
    w = w or Inches(1.7)
    c = rect(s, x, y, w, Inches(0.42), color, radius=True)
    tf = c.text_frame; tf.word_wrap = False
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = text; r.font.size = Pt(11); r.font.color.rgb = tcolor
    r.font.bold = True; r.font.name = FONT
    return c

def bullets(s, x, y, w, h, items, fs=14.5, gap=7, lead=ORANGE):
    paras = []
    for it in items:
        if isinstance(it, tuple):
            head, rest = it
            paras.append([R("▸  ", fs, lead, True), R(head, fs, WHITE, True), R(rest, fs, FOG, False)])
        else:
            paras.append([R("▸  ", fs, lead, True), R(it, fs, FOG, False)])
    txt(s, x, y, w, h, paras, space_after=gap, line_spacing=1.08)

def simple_table(s, x, y, w, rows, col_w, header=True, fs=11.5, row_h=0.42, header_color=ORANGE_D):
    """rows: list of list[str]. col_w: list of Inches fractions summing to w."""
    cy = y
    for ri, row in enumerate(rows):
        cx = x
        rh = Inches(row_h)
        bg = header_color if (header and ri == 0) else (PANEL if ri % 2 else NAVY)
        for ci, cell in enumerate(row):
            cwi = col_w[ci]
            cellbox = rect(s, cx, cy, cwi, rh, bg)
            tf = cellbox.text_frame; tf.word_wrap = True
            tf.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf.margin_left = Pt(6); tf.margin_right = Pt(5)
            tf.margin_top = Pt(1); tf.margin_bottom = Pt(1)
            p = tf.paragraphs[0]; p.alignment = PP_ALIGN.LEFT
            r = p.add_run(); r.text = cell
            r.font.name = FONT
            r.font.size = Pt(fs if not (header and ri==0) else fs)
            r.font.bold = (header and ri == 0)
            r.font.color.rgb = WHITE if (header and ri == 0) else FOG
            cx += cwi
        cy += rh
    return cy


# ================================================================================
# SLIDE 1 — Title
# ================================================================================
s = slide(INK)
rect(s, 0, 0, EMU_W, Inches(0.14), ORANGE)
rect(s, 0, Inches(7.36), EMU_W, Inches(0.14), ORANGE)
txt(s, Inches(0.9), Inches(1.55), Inches(11.5), Inches(0.5),
    [[R("AMAZON HACKATHON  ·  RETURN PIPELINE", 14, ORANGE, True)]])
txt(s, Inches(0.9), Inches(2.15), Inches(11.6), Inches(1.6),
    [[R("ReLoop", 62, WHITE, True)]], line_spacing=1.0)
txt(s, Inches(0.9), Inches(3.35), Inches(11.6), Inches(1.2),
    [[R("The intelligence layer for Amazon's returns pipeline.", 26, FOG, False)],
     [R("Grade at the doorstep — decide the item's best next life ", 26, FOG, False),
      R("before it moves.", 26, ORANGE, True)]], line_spacing=1.12, space_after=2)
txt(s, Inches(0.9), Inches(5.5), Inches(11), Inches(0.6),
    [[R("“The landfill is a design flaw.”", 18, MUTED, False, FONT, True)]])
txt(s, Inches(0.9), Inches(6.35), Inches(11.5), Inches(0.5),
    [[R("Deterministic glass-box routing engine  ·  our own DINOv2 grader  ·  Product Health Card  ·  live at ", 12, MUTED, False),
      R("reloop-woad.vercel.app", 12, CYAN, True)]])

# ================================================================================
# SLIDE 2 — The problem: Amazon's returns machine today
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "The problem")
title(s, "Amazon already resells returns — but decides at the worst moment")
txt(s, Inches(0.7), Inches(1.7), Inches(12), Inches(0.7),
    [[R("Renewed · Resale · Grade-and-Resell all grade ", 15, FOG, False),
      R("AFTER", 15, ORANGE, True),
      R(" the linehaul. Every leg is spent, weeks of value decay — ", 15, FOG, False),
      R("then", 15, ORANGE, True),
      R(" anyone decides what the item is worth.", 15, FOG, False)]], line_spacing=1.1)

rows = [
    ["Leg (today's journey)", "Cost / dwell accrued", "ReLoop's effect"],
    ["1  Click Return → label issued", "—", "Grades HERE, routes before anything moves"],
    ["2  Pickup → delivery station", "Last-mile (spent either way)", "Driver checkpoint rides along free; local items STOP here"],
    ["3  Station → sortation center", "First avoidable leg", "DELETED for local routes"],
    ["4  Sortation → RLC linehaul", "The big 580 km freight leg", "DELETED for local routes"],
    ["5  RLC queue → inspection", "Days-to-weeks of dwell = decay", "Replaced by a 10-min hub bench in-city"],
    ["6  Manual grade → disposition", "Decision made LAST, costs sunk", "Made FIRST (stage 0–3), re-checked at checkpoints"],
    ["7  Execute (often a 2nd linehaul)", "Another leg", "Restock → nearest FC; pallets batch at the hub"],
]
cw = [Inches(3.9), Inches(3.5), Inches(4.5)]
simple_table(s, Inches(0.7), Inches(2.5), Inches(11.9), rows, cw, fs=10.5, row_h=0.475)
txt(s, Inches(0.7), Inches(6.55), Inches(12), Inches(0.5),
    [[R("Net today: ", 13, ORANGE, True), R("5–7 touches · 2–6 weeks · only ", 13, FOG),
      R("10–20% ever restocked", 13, WHITE, True),
      R(". Every leg from #3 on is avoidable — if the decision exists before leg #3.", 13, FOG)]])
footer(s, 2, "PROBLEM")

# ================================================================================
# SLIDE 3 — The insight
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "The insight")
title(s, "Information-timing arbitrage")
txt(s, Inches(0.7), Inches(1.75), Inches(11.9), Inches(1.0),
    [[R("Information only has value if it changes a decision before money is spent.", 20, WHITE, True, FONT, True)]],
    line_spacing=1.1)
txt(s, Inches(0.7), Inches(2.75), Inches(11.9), Inches(1.1),
    [[R("Use ", 15, FOG), R("noisier information (doorstep photos)", 15, ORANGE, True),
      R(" at the moment of maximum leverage, instead of ", 15, FOG),
      R("perfect information (physical inspection)", 15, CYAN, True),
      R(" after every cost is already sunk. Inspection still happens — it just moves to the cheapest node that precedes irreversibility.", 15, FOG)]],
    line_spacing=1.15)

# two panels
p1 = rect(s, Inches(0.7), Inches(4.1), Inches(5.75), Inches(2.5), PANEL, radius=True)
txt(s, Inches(1.0), Inches(4.32), Inches(5.2), Inches(0.4), [[R("WHY RETURN, NOT TRADE-IN", 12.5, ORANGE, True)]])
bullets(s, Inches(1.0), Inches(4.85), Inches(5.25), Inches(1.7), [
    ("Trade-In: ", "destination is fixed (Amazon's facility) whatever the grade — doorstep AI changes nothing physical. Pure cost."),
    ("Return: ", "the destination IS the decision. Doorstep AI changes where the item physically goes."),
], fs=12.5, gap=6)

p2 = rect(s, Inches(6.85), Inches(4.1), Inches(5.75), Inches(2.5), PANEL, radius=True)
txt(s, Inches(7.15), Inches(4.32), Inches(5.2), Inches(0.4), [[R("BOUNDED DOWNSIDE BY DESIGN", 12.5, ORANGE, True)]])
bullets(s, Inches(7.15), Inches(4.85), Inches(5.25), Inches(1.7), [
    "Every wrong local decision degrades to “send it up the chain” — what happens to 100% of items today.",
    ("The bar: ", "P(correct)·savings > P(wrong)·correction. Correction = a shelf move at a hub, not a lost item."),
], fs=12.5, gap=6)
footer(s, 3, "INSIGHT")

# ================================================================================
# SLIDE 4 — Thesis
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "The thesis")
title(s, "Grade at the source. Decide before the item moves.")
txt(s, Inches(0.7), Inches(1.85), Inches(11.9), Inches(0.9),
    [[R("Amazon's current workflow is the engine's ", 17, FOG),
      R("fallback", 17, ORANGE, True),
      R(", not its competitor. We are the missing front end of programs Amazon already runs.", 17, FOG)]],
    line_spacing=1.15)
# three big stat cards
cards = [
    ("Decide FIRST", "The route is chosen at stage 0–3 — at the doorstep — then re-checked at two physical checkpoints while redirect is still cheap."),
    ("Delete the legs", "Locally-routed items stop at the in-city delivery station. Zero new transport legs added; sortation + 580 km linehaul deleted."),
    ("Glass-box engine", "One deterministic expected-value optimizer. Logic decides, the LLM only narrates. Every destroy has a replayable reason."),
]
x = Inches(0.7)
for i, (h, b) in enumerate(cards):
    cx = Inches(0.7 + i * 4.05)
    rect(s, cx, Inches(3.0), Inches(3.8), Inches(3.2), PANEL, radius=True)
    rect(s, cx, Inches(3.0), Inches(3.8), Inches(0.12), ORANGE, radius=False)
    txt(s, cx + Inches(0.3), Inches(3.35), Inches(3.2), Inches(0.6), [[R(h, 19, WHITE, True)]])
    txt(s, cx + Inches(0.3), Inches(4.15), Inches(3.25), Inches(2.0), [[R(b, 13.5, FOG)]], line_spacing=1.18)
footer(s, 4, "THESIS")

# ================================================================================
# SLIDE 5 — Architecture / four pillars
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "Architecture")
title(s, "Four pillars · ML for perception, rules for the decision")
# pillars row
pillars = [
    ("AI Grading", "“the eyes”", "Our own DINOv2 grader → a grade DISTRIBUTION + defect tags. VLM narrates defects; OCR anchors identity."),
    ("Smart Routing", "“the brain”", "Deterministic, explainable EV engine over {value, cost, demand, carbon}. Glass-box on purpose."),
    ("Health Card", "“the trust”", "Verifiable condition, history & authenticity that travels with the item to its next owner. CARFAX for a product."),
    ("Prevention", "“the upstream”", "Predict returns before they happen — the cheapest return is the one that never occurs."),
]
for i, (h, sub, b) in enumerate(pillars):
    cx = Inches(0.7 + i * 3.02)
    rect(s, cx, Inches(1.75), Inches(2.82), Inches(2.55), PANEL, radius=True)
    txt(s, cx + Inches(0.22), Inches(1.95), Inches(2.5), Inches(0.4), [[R(h, 16, ORANGE, True)]])
    txt(s, cx + Inches(0.22), Inches(2.35), Inches(2.5), Inches(0.32), [[R(sub, 11.5, MUTED, False, FONT, True)]])
    txt(s, cx + Inches(0.22), Inches(2.78), Inches(2.45), Inches(1.5), [[R(b, 11.5, FOG)]], line_spacing=1.14)

# stack diagram
txt(s, Inches(0.7), Inches(4.55), Inches(12), Inches(0.35), [[R("THE STACK — pnpm monorepo, strict TypeScript, no  any", 12.5, ORANGE, True)]])
stack = [
    ("apps/web", "Next.js App Router + Tailwind — Return flow, Hub Bench, Shop, seller dashboard", CYAN),
    ("apps/api", "Node + Express — grading, /api/route + /api/return/checkpoint, pricing, matching cron", GREEN),
    ("packages/shared", "Single source of truth for data contracts: routing-ev.ts, liquidation-lot.ts, return.ts", ORANGE),
    ("ml/", "DINOv2 grader (perception) · XGBoost + Thompson-bandit pricing (spec 014) · return-risk", MUTED),
]
yy = Inches(4.92)
for name, desc, col in stack:
    rect(s, Inches(0.7), yy, Inches(11.9), Inches(0.46), PANEL2, radius=True)
    txt(s, Inches(0.9), yy + Inches(0.06), Inches(2.4), Inches(0.36), [[R(name, 12.5, col, True, MONO)]])
    txt(s, Inches(3.4), yy + Inches(0.08), Inches(9.0), Inches(0.36), [[R(desc, 12, FOG)]])
    yy += Inches(0.53)
footer(s, 5, "ARCH")

# ================================================================================
# SLIDE 6 — The EV formula
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "The decision engine")
title(s, "One expected-value optimization, per returned item")
# formula panel
rect(s, Inches(0.7), Inches(1.72), Inches(11.9), Inches(1.95), CODEBG, line=ORANGE, line_w=1.25, radius=True)
txt(s, Inches(1.1), Inches(1.98), Inches(11.2), Inches(0.5),
    [[R("EV(r) = Σ", 20, WHITE, True, MONO), R("g", 12, ORANGE, True, MONO),
      R(" P(g│evidence)·recovery(r,g)·decay(t", 20, WHITE, True, MONO), R("r", 12, ORANGE, True, MONO),
      R(")", 20, WHITE, True, MONO)]], line_spacing=1.0, wrap=False)
txt(s, Inches(1.1), Inches(2.62), Inches(11.2), Inches(0.5),
    [[R("        − logistics(r) − handling(r)", 20, FOG, False, MONO)]], line_spacing=1.0, wrap=False)
txt(s, Inches(1.1), Inches(3.08), Inches(11.2), Inches(0.5),
    [[R("        − ", 20, FOG, False, MONO),
      R("E[correction_cost(r)]", 20, ORANGE, True, MONO),
      R(" − λ·CO₂(r)", 20, FOG, False, MONO)]], line_spacing=1.0, wrap=False)

txt(s, Inches(0.7), Inches(3.82), Inches(11.9), Inches(0.4),
    [[R("Choose r ∈ {restock, local_resale, refurbish, liquidate, donate, recycle, warehouse, return_to_seller, returnless_refund}", 11.5, MUTED, False, MONO)]])

txt(s, Inches(0.7), Inches(4.3), Inches(12), Inches(0.35), [[R("THREE TERMS ARE THE UPGRADE OVER A NAÏVE ROUTER", 12.5, ORANGE, True)]])
three = [
    ("P(g│evidence) — posterior, not a point grade", "Routes differ in error-sensitivity. Restock is brutal on a wrong A; donation barely cares. Recovery is an expectation over the grade distribution."),
    ("decay(t_r) — time is a P&L line", "Each route has an expected time-to-cash; category-specific weekly decay makes the engine SEE that weeks of returns-center dwell burn money."),
    ("E[correction_cost(r)] — being wrong has a price", "= (posterior mass below the grade the route needs) × that route's redirect cost. This is what makes the confidence gates θ_r derived, not hand-picked."),
]
yy = Inches(4.66)
for h, b in three:
    rect(s, Inches(0.7), yy, Inches(11.9), Inches(0.7), PANEL, radius=True)
    txt(s, Inches(0.95), yy + Inches(0.08), Inches(11.4), Inches(0.3), [[R(h, 13, WHITE, True)]])
    txt(s, Inches(0.95), yy + Inches(0.37), Inches(11.4), Inches(0.3), [[R(b, 11.5, FOG)]])
    yy += Inches(0.78)
footer(s, 6, "ENGINE")

# ================================================================================
# SLIDE 7 — Hard-constraint ladder
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "Layer 1 of 2 — never optimized away")
title(s, "The hard-constraint ladder (safety · legal · policy)")
txt(s, Inches(0.7), Inches(1.7), Inches(11.9), Inches(0.55),
    [[R("An ordered, first-match ladder evaluated ", 14, FOG),
      R("before", 14, ORANGE, True),
      R(" any EV math. It can force a path and is audited for 100% conformance every build.", 14, FOG)]])
ladder = [
    ["3P seller not opted in", "→ return_to_seller"],
    ["counterfeit / not-as-described", "→ return_to_seller (policy)"],
    ["hazmat / restricted", "→ recycle (certified disposal only)"],
    ["wrong item", "→ warehouse (inventory reconciliation)"],
    ["authenticity mismatch", "→ warehouse (manual verification)"],
    ["high-value + unverified", "→ warehouse (fraud/verification gate)"],
    ["reason ↔ grade mismatch", "→ warehouse (fraud review)"],
    ["salvage / ungradeable", "→ recycle"],
    ["arrived damaged", "→ recycle"],
]
yy = Inches(2.45)
for i, (cond, act) in enumerate(ladder):
    rect(s, Inches(0.7), yy, Inches(7.7), Inches(0.42), PANEL if i%2 else PANEL2, radius=True)
    txt(s, Inches(0.9), yy + Inches(0.06), Inches(0.4), Inches(0.3), [[R(str(i+1), 12, ORANGE, True, MONO)]])
    txt(s, Inches(1.35), yy + Inches(0.05), Inches(4.6), Inches(0.32), [[R(cond, 12, WHITE, True)]])
    txt(s, Inches(5.5), yy + Inches(0.05), Inches(2.8), Inches(0.32), [[R(act, 11.5, GREEN)]])
    yy += Inches(0.5)

# proof panel on right
screenshot_ph(s, Inches(8.7), Inches(2.45), Inches(3.9), Inches(2.4),
              "pnpm eval", "Routing hard-rule conformance — forced-path accuracy 100.0% (N=8)")
txt(s, Inches(8.7), Inches(5.05), Inches(3.9), Inches(1.6),
    [[R("Determinism is a business requirement", 13, ORANGE, True)],
     [R("Every destroy and every denied local route needs a replayable reason for seller disputes and ESG audits. The ladder is that record.", 12, FOG)]],
    line_spacing=1.15, space_after=6)
footer(s, 7, "ENGINE")

# ================================================================================
# SLIDE 8 — EV argmax + glass-box (scenario A screenshot)
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "Layer 2 of 2 — argmax EV")
title(s, "Every path priced, every term signed — glass-box")
txt(s, Inches(0.7), Inches(1.65), Inches(6.4), Inches(0.5),
    [[R("Sealed changed-mind electronics. The engine prices all 8 paths and picks the max. Restock wins — straight to the nearest FC, deleting the returns-center hop.", 12.5, FOG)]],
    line_spacing=1.14)

# pre-rendered EV table (real numbers) as fallback content
ev_lines = [
    ("decision: restock        (localMargin ₹1,952)", ORANGE),
    ("", FOG),
    ("restock         ₹1,956 ✓ CHOSEN", GREEN),
    ("  Restock at full recovery      +₹2,299", CODEFG),
    ("  Grade uncertainty discount      −₹21", RED),
    ("  Value decay (4d to cash)        −₹26", RED),
    ("  FC inbound 45km                 −₹90", RED),
    ("  Receive + shelve               −₹150", RED),
    ("  Expected correction cost        −₹55", RED),
    ("local_resale    ₹1,952", CODEFG),
    ("refurbish       ₹1,733  (not viable)", MUTED),
    ("liquidate         ₹893", CODEFG),
    ("donate            ₹182", CODEFG),
    ("warehouse        −₹465   ← today's flow", RED),
]
code_panel(s, Inches(0.7), Inches(2.55), Inches(6.4), Inches(4.05), ev_lines,
           title_txt="POST /api/route  →  evBreakdown", fs=10.5)

screenshot_ph(s, Inches(7.35), Inches(2.55), Inches(5.25), Inches(2.9),
              "curl /api/route  (Scenario A)", "The full evBreakdown JSON — every path's signed EV terms. This is the glass box.")
txt(s, Inches(7.35), Inches(5.65), Inches(5.25), Inches(1.2),
    [[R("Warehouse is −₹465", 13, ORANGE, True),
      R(" — the honest 580 km freight makes today's default the worst commercial option. Every better route is pure margin.", 13, FOG)]],
    line_spacing=1.15)
footer(s, 8, "ENGINE")

# ================================================================================
# SLIDE 9 — Confidence gates / graceful degradation
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "Decision under uncertainty")
title(s, "Confidence gates θ_r — graceful degradation to today's flow")
txt(s, Inches(0.7), Inches(1.65), Inches(11.9), Inches(0.5),
    [[R("θ_r is ", 13.5, FOG), R("derived from correction cost", 13.5, ORANGE, True),
      R(", not arbitrary — its ordering mirrors redirect-cost ordering exactly. Low confidence collapses the eligible set toward the cheapest-to-correct path.", 13.5, FOG)]],
    line_spacing=1.12)
gates = [
    ["restock", "0.85", "second return + trust (~₹700 on a ₹2.5k item)"],
    ["local_resale", "0.60", "hub shelf move (₹40)"],
    ["refurbish", "0.50", "wasted bench slot (₹80, pre-buyer)"],
    ["donate", "0.30", "being wrong is nearly free"],
    ["liquidate", "0.20", "pallet re-sort (₹15) — cheapest commercial gate"],
    ["recycle / warehouse", "ungated", "the absolute fallback — always available"],
]
cw = [Inches(2.5), Inches(1.3), Inches(3.5)]
hdr = [["Route", "θ_r", "Redirect cost (why)"]]
simple_table(s, Inches(0.7), Inches(2.4), Inches(7.3), hdr + gates, cw, fs=11.5, row_h=0.46)

screenshot_ph(s, Inches(8.3), Inches(2.4), Inches(4.3), Inches(2.7),
              "curl /api/route  (Scenario B)", "confidence 0.35 → local_resale & refurbish GATED OUT; collapses to the liquidate pallet.")
txt(s, Inches(8.3), Inches(5.3), Inches(4.3), Inches(1.6),
    [[R("The money line", 13.5, ORANGE, True)],
     [R("A wrong grade on a manifested pallet costs ~₹15 to re-sort — vs a 580 km round trip. Low confidence collapses toward the ", 12, FOG),
      R("cheapest correction, not the most expensive one.", 12, WHITE, True)]],
    line_spacing=1.14, space_after=6)
txt(s, Inches(0.7), Inches(5.75), Inches(7.3), Inches(0.9),
    [[R("gateReason", 11.5, ORANGE, True, MONO),
      R(" is returned per path, so the UI shows a path's full EV next to WHY it was gated — the glass box never hides the road not taken.", 12.5, FOG)]],
    line_spacing=1.14)
footer(s, 9, "ENGINE")

# ================================================================================
# SLIDE 10 — The state machine
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "The backbone")
title(s, "A return is a lifecycle, not one decision")
txt(s, Inches(0.7), Inches(1.6), Inches(11.9), Inches(0.5),
    [[R("The engine re-runs at every physical checkpoint — information improves and redirect cost rises as the item moves.", 13.5, FOG)]])
# flow of states
flow = ["INITIATED", "EVIDENCE_CAPTURED", "ROUTED (TTL)", "PICKUP_VERIFIED", "AT_LOCAL_HUB", "HUB_VERIFIED"]
x = Inches(0.7); yy = Inches(2.35)
wgap = Inches(1.98)
for i, st in enumerate(flow):
    cx = Inches(0.7 + i*1.98)
    c = rect(s, cx, yy, Inches(1.8), Inches(0.7), PANEL2 if i<3 else ORANGE_D, radius=True)
    tf = c.text_frame; tf.word_wrap = True; tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]; p.alignment = PP_ALIGN.CENTER
    r = p.add_run(); r.text = st; r.font.size = Pt(9.5); r.font.bold=True; r.font.color.rgb = WHITE; r.font.name=FONT
    if i < len(flow)-1:
        txt(s, cx + Inches(1.8), yy + Inches(0.16), Inches(0.2), Inches(0.4), [[R("›", 20, ORANGE, True)]])

# execution states
txt(s, Inches(0.7), Inches(3.35), Inches(12), Inches(0.3), [[R("EXECUTION (each still re-enters the engine on failure):", 12, MUTED, True)]])
exe = ["LISTED_LOCAL→SOLD", "REFURB_QUEUE", "RESTOCK_OUTBOUND", "PALLET_STAGING", "DONATION_BATCH", "RECYCLE_BATCH", "RL_OUTBOUND (fallback)"]
xx = Inches(0.7)
for e in exe:
    w = Inches(0.14 + 0.092*len(e))
    chip(s, xx, Inches(3.72), e, w=w, color=PANEL)
    xx += w + Inches(0.14)

# two properties
p1 = rect(s, Inches(0.7), Inches(4.55), Inches(5.85), Inches(2.0), PANEL, radius=True)
txt(s, Inches(0.95), Inches(4.75), Inches(5.4), Inches(0.35), [[R("EVERY TRANSITION RE-INVOKES THE ENGINE", 12.5, ORANGE, True)]])
txt(s, Inches(0.95), Inches(5.2), Inches(5.45), Inches(1.3),
    [[R("“Demand changed while routing was planned” stops being an edge case — it's just a re-evaluation at the next checkpoint. Static fallback chains are replaced by “re-run the engine from the current state.”", 12.5, FOG)]], line_spacing=1.16)
p2 = rect(s, Inches(6.75), Inches(4.55), Inches(5.85), Inches(2.0), PANEL, radius=True)
txt(s, Inches(7.0), Inches(4.75), Inches(5.4), Inches(0.35), [[R("EVERY STATE HAS A COST-TO-REDIRECT", 12.5, ORANGE, True)]])
txt(s, Inches(7.0), Inches(5.2), Inches(5.45), Inches(1.3),
    [[R("At ROUTED it's zero. At AT_LOCAL_HUB it's a shelf move. At SOLD it's a buyer notification. The engine reasons about ", 12.5, FOG),
      R("commitment", 12.5, WHITE, True), R(", not just value — and a decision TTL forces re-evaluation on expiry.", 12.5, FOG)]], line_spacing=1.16)
footer(s, 10, "LIFECYCLE")

# ================================================================================
# SLIDE 11 — Checkpoints + live re-route
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "Money shot — checkpoints")
title(s, "Two human checkpoints keep the AI honest — live re-route")
txt(s, Inches(0.7), Inches(1.65), Inches(6.2), Inches(1.0),
    [[R("Driver scan (30s at the door) + hub bench (10 min in-city). When the human disagrees with the AI, the ", 12.5, FOG),
      R("same engine re-runs instantly", 12.5, ORANGE, True),
      R(" — the wrong grade is caught before any buyer is exposed. Correction cost: one shelf move.", 12.5, FOG)]],
    line_spacing=1.14)

reroute = [
    ("BEFORE  — doorstep, sealed grade A", MUTED),
    ("  POST /api/route", CODEFG),
    ("  → decision: restock   ttlHours: 24", GREEN),
    ("", FOG),
    ("AFTER  — hub bench: observedGrade B,", MUTED),
    ("         seal broken → engine re-runs", MUTED),
    ("  POST /api/return/checkpoint", CODEFG),
    ("  → decision: local_resale", ORANGE),
    ("  → 'Hub bench overrode grade A → B;", CODEFG),
    ("     engine re-ran and routed to", CODEFG),
    ("     local_resale.'", CODEFG),
    ("  → transition: at_local_hub →", CYAN),
    ("     hub_verified", CYAN),
]
code_panel(s, Inches(0.7), Inches(3.0), Inches(6.2), Inches(3.6), reroute,
           title_txt="live re-route (Scenario D)", fs=11)

screenshot_ph(s, Inches(7.15), Inches(1.7), Inches(5.45), Inches(2.75),
              "Hub Bench → toggle seal",
              "The decision flips restock → local_resale on screen as you break the seal.")
rect(s, Inches(7.15), Inches(4.7), Inches(5.45), Inches(1.9), PANEL, radius=True)
txt(s, Inches(7.4), Inches(4.9), Inches(5.0), Inches(0.35), [[R("THE FLYWHEEL — the data moat", 12.5, ORANGE, True)]])
txt(s, Inches(7.4), Inches(5.35), Inches(5.0), Inches(1.2),
    [[R("Every bench verdict is a free labelled training pair (photos → verified grade). Our DINOv2 grader improves as a ", 12.5, FOG),
      R("byproduct of operations", 12.5, WHITE, True),
      R(" — graded pallets and audited destruction are second-order wins nobody gets without grading at source.", 12.5, FOG)]],
    line_spacing=1.15)
footer(s, 11, "LIFECYCLE")

# ================================================================================
# SLIDE 12 — the 8 destinations
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "Stage 6 — destinations")
title(s, "Where the money is — eight routes, one engine")
rows = [
    ["Route", "Trigger", "vs Amazon today", "Saved / earned"],
    ["Restock", "Sealed / verified-A + benign reason + SKU live", "Rides to RLC, dwells weeks, maybe restocks", "Straight to nearest FC; deletes hop + dwell"],
    ["Local resale", "Grade A/B, mid-value, demand clears", "Liquidated for cents or resold weeks later", "60–80% of clearing; zero linehaul; cash in days"],
    ["Refurbish", "Defect with positive uplift", "G&R grades at FC, no repair at source", "₹300 cable → B→A worth +₹1,500; re-enters resale"],
    ["Liquidate", "Functional, low unit EV, or high uncertainty", "Residual after items sit at the RLC", "Manifested pallets → top of the band; FC hop gone"],
    ["Donate", "All commercial EVs < donation credit", "Same, after full RL cost sunk", "Half handling, zero freight, CSR credit"],
    ["Recycle", "Forced (hazmat) or materials > handling", "Same, after two truck rides", "Local certified drop; commodity + carbon credit"],
    ["Destroy", "Legally required only", "A real % die by default", "Engine KPI is SHRINKING this — logged reason"],
    ["Standard RL", "Low conf / fraud / opt-out (fallback)", "Identical to today", "Zero, by design — the graceful-degradation guarantee"],
]
cw = [Inches(1.55), Inches(3.35), Inches(3.4), Inches(3.6)]
simple_table(s, Inches(0.7), Inches(1.7), Inches(11.9), rows, cw, fs=10.0, row_h=0.545)
footer(s, 12, "ROUTES")

# ================================================================================
# SLIDE 13 — Honest economics (spec 021)
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "Spec 021 — honest economics")
title(s, "We priced the engine against real Amazon returns economics")
txt(s, Inches(0.7), Inches(1.65), Inches(11.9), Inches(0.45),
    [[R("Every constant is grounded in how Amazon's own machine actually prices things — no fictions.", 13.5, FOG)]])
research = [
    ("FBA Liquidations nets sellers 5–10% of ASP", "paid 30–90 days out; Amazon sells to liquidators at 20–30¢ on the retail dollar."),
    ("~$27 to process a $100 return", "restock + shipping + inspection labor — for cheap items this exceeds every recovery path."),
    ("Returns fraud runs 9–15%", "so any refund-without-return lever must hard-gate on trust + fraud, never on value alone."),
    ("Manifested pallets clear materially higher", "than mystery lots — the exact premium a Health-Card manifest earns."),
]
yy = Inches(2.35)
for h, b in research:
    rect(s, Inches(0.7), yy, Inches(5.85), Inches(1.0), PANEL, radius=True)
    txt(s, Inches(0.95), yy + Inches(0.12), Inches(5.4), Inches(0.4), [[R(h, 12.5, ORANGE, True)]])
    txt(s, Inches(0.95), yy + Inches(0.5), Inches(5.4), Inches(0.45), [[R(b, 11, FOG)]], line_spacing=1.1)
    yy += Inches(1.08)

txt(s, Inches(6.8), Inches(2.3), Inches(5.8), Inches(0.35), [[R("WHAT CHANGED IN THE ENGINE", 12.5, ORANGE, True)]])
bullets(s, Inches(6.8), Inches(2.75), Inches(5.8), Inches(4.0), [
    ("Warehouse repriced: ", "the flat 60%-recovery fiction is gone. Now a mixture — 15%×85% restock-after-inspection + 85%×20% FC liquidation, then 21-day dwell decay."),
    ("liquidate is first-class: ", "a Health-Card-manifested hub pallet with its own lot engine (next slide)."),
    ("E[correction_cost] built: ", "the EV term that was documented but never implemented — now real and visible."),
    ("Defect-level refurb: ", "a DEFECT_REPAIR_TABLE (tag → repair ₹ + grade delta) replaces grade-level fractions."),
    ("returnless_refund: ", "when every movement path loses money and trust/fraud/value gates pass — refund, keep the item."),
], fs=12, gap=8)
footer(s, 13, "ECONOMICS")

# ================================================================================
# SLIDE 14 — Liquidation lot engine
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "Liquidation lot engine")
title(s, "Manifested pallets: a real secondary-market auction")
txt(s, Inches(0.7), Inches(1.6), Inches(6.1), Inches(1.15),
    [[R("Deterministic, glass-box like routing. A pallet = a grade histogram + a manifest. Per-buyer bid curves (refurbisher, wholesaler, NGO, fashion) auction it; the Health-Card manifest premium is what grading-at-source earns. A closed-form ship-vs-wait breakeven decides pickup timing.", 12.5, FOG)]],
    line_spacing=1.16)
lot = [
    ("Pallet: 30 electronics · avg ₹2,400 · 90% manifest", MUTED),
    ("Winning buyer:  refurbisher", ORANGE),
    ("  gross            ₹31,877", CODEFG),
    ("  Amazon take 10%   ₹3,188", RED),
    ("  seller proceeds  ₹28,689", GREEN),
    ("  14× grade B @ 34%  +₹11,424", CODEFG),
    ("  Manifest premium   +₹9,893", GREEN),
    ("2nd-best (auto re-match): wholesaler ₹23,803", CODEFG),
    ("", FOG),
    ("Manifested (90%):  ₹28,689", GREEN),
    ("Mystery lot (0%):  ₹19,786", RED),
    ("Premium earned:    ₹8,904  (+45%)", ORANGE),
    ("", FOG),
    ("ship-vs-wait  n* = ceil(sqrt(F·λ/(δ·v)))", CYAN),
    ("  40/40 → shipNow=true (pallet full)", CODEFG),
]
code_panel(s, Inches(0.7), Inches(2.85), Inches(6.1), Inches(3.8), lot,
           title_txt="tsx src/scripts/lot-trace.ts", fs=10)

screenshot_ph(s, Inches(7.05), Inches(1.6), Inches(5.55), Inches(2.5),
              "tsx src/scripts/lot-trace.ts",
              "The pallet buyer auction + the +45% manifest premium + ship-vs-wait verdict.")
rect(s, Inches(7.05), Inches(4.35), Inches(5.55), Inches(2.3), PANEL, radius=True)
txt(s, Inches(7.3), Inches(4.55), Inches(5.1), Inches(0.35), [[R("WHY THIS IS A MOAT", 12.5, ORANGE, True)]])
bullets(s, Inches(7.3), Inches(5.0), Inches(5.1), Inches(1.6), [
    "A returns center can't reprice a queue. We turn a mystery lot into a graded, transparent pallet a buyer can inspect.",
    ("+45% recovery ", "on the same physical units, purely from the manifest the doorstep grade already produced."),
], fs=11.5, gap=6)
footer(s, 14, "ECONOMICS")

# ================================================================================
# SLIDE 15 — Returnless refund
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "The best route is no route")
title(s, "Returnless refund — hard-gated, deterministic")
txt(s, Inches(0.7), Inches(1.65), Inches(11.9), Inches(0.85),
    [[R("Amazon's real lever, decided by math instead of ad hoc. When ", 13.5, FOG),
      R("every movement path has negative EV", 13.5, ORANGE, True),
      R(" and all gates pass, refund and let the customer keep the item — zero legs, zero handling, zero carbon.", 13.5, FOG)]],
    line_spacing=1.14)
gates2 = [
    ("Value gate", "never for items ≥ ₹800 — high value must be physically recovered."),
    ("Fraud gate", "any wardrobing / photo-reuse / auth-mismatch signal hard-blocks it."),
    ("Trust gate", "customerTrust × confidence must clear 0.5 (the pickup-refund lever)."),
    ("All-paths-negative", "excluded from the argmax; fires ONLY when even the best real route loses money."),
]
yy = Inches(2.6)
for i, (h, b) in enumerate(gates2):
    yrow = Inches(2.6 + i * 0.86)
    rect(s, Inches(0.7), yrow, Inches(6.7), Inches(0.78), PANEL, radius=True)
    txt(s, Inches(0.95), yrow + Inches(0.1), Inches(6.2), Inches(0.32), [[R(h, 12.5, ORANGE, True)]])
    txt(s, Inches(0.95), yrow + Inches(0.44), Inches(6.25), Inches(0.32), [[R(b, 11, FOG)]], line_spacing=1.05)

screenshot_ph(s, Inches(7.65), Inches(2.6), Inches(4.95), Inches(2.55),
              "pnpm test:edge",
              "all-paths-negative + trust → returnless_refund")
rect(s, Inches(7.65), Inches(5.4), Inches(4.95), Inches(1.6), PANEL, radius=True)
txt(s, Inches(7.9), Inches(5.58), Inches(4.5), Inches(0.35), [[R("THREE NEGATIVE CONTROLS PASS", 12, ORANGE, True)]])
bullets(s, Inches(7.9), Inches(6.0), Inches(4.5), Inches(1.0), [
    "no trust signal → ineligible, stays a real route",
    "high value → must be physically recovered",
    "fraud signal → blocked",
], fs=11, gap=4)
txt(s, Inches(0.7), Inches(6.2), Inches(6.7), Inches(0.7),
    [[R("Opt-in via ", 11.5, FOG), R("customerTrust", 11.5, CYAN, True, MONO),
      R(" — existing demo flows are byte-unaffected unless a caller supplies it.", 11.5, FOG)]],
    line_spacing=1.1)
footer(s, 15, "ECONOMICS")

# ================================================================================
# SLIDE 16 — Listing Agent + Demand Graph
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "Stage 7 — the autonomous executor")
title(s, "“Listed locally” is a state that still has to be won")
bullets(s, Inches(0.7), Inches(1.75), Inches(6.0), Inches(4.5), [
    ("The Listing Agent ", "(spec 008) is born the moment the hub bench confirms local_resale: it mints a Health Card from the return's own checkpoints and spawns on a real marketplace listing."),
    ("Floor = route-elsewhere EV. ", "The agent's hard price floor is seeded from max(warehouse, liquidate) EV — it escalates exactly when local resale stops beating “send it up the chain.” Spec-016 economics drive spec-014 escalation with zero new logic."),
    ("Event-driven repricing (spec 014). ", "Significant events (comp undercut, view-velocity drop, dwell) hit an XGBoost reward model + Thompson bandit + deterministic guardrails. A returns center cannot reprice a queue — this is the unique capability."),
    ("Escalation re-enters the Bridge. ", "listed_local → donation_batch | recycle_batch through the same state machine. Items never rot on a shelf."),
], fs=12, gap=9)

rect(s, Inches(7.0), Inches(1.75), Inches(5.6), Inches(4.8), PANEL, radius=True)
txt(s, Inches(7.25), Inches(1.95), Inches(5.1), Inches(0.35), [[R("THE DEMAND GRAPH — additive on Amazon's rec system", 12, ORANGE, True)]])
txt(s, Inches(7.25), Inches(2.45), Inches(5.15), Inches(1.1),
    [[R("Amazon already knows who searched, wishlisted, or bought similar near the hub. We score that intent instead of inventing a marketplace:", 12, FOG)]], line_spacing=1.14)
rect(s, Inches(7.25), Inches(3.55), Inches(5.1), Inches(0.85), CODEBG, radius=True)
txt(s, Inches(7.45), Inches(3.68), Inches(4.8), Inches(0.65),
    [[R("matchScore = intentWeight", 11, CODEFG, False, MONO)],
     [R("  (searched .65 / wishlist .8 / bought .9)", 10, MUTED, False, MONO)],
     [R("  × distanceDecay × priceFit", 11, CODEFG, False, MONO)]], line_spacing=1.05, space_after=1)
txt(s, Inches(7.25), Inches(4.6), Inches(5.1), Inches(1.8),
    [[R("Buyer surfaces: ", 12, ORANGE, True),
      R("the exact product page shows “Open-box near you · doorstep graded · hub verified · X% off · delivered today,” with the recommendation layer speaking (“this is on your wish list”). The purchase runs a real cross-account transaction that closes the lifecycle: listed_local → sold → delivered_to_buyer, EcoCredits in both ledgers, agent retires.", 12, FOG)]],
    line_spacing=1.16)
footer(s, 16, "EXECUTOR")

# ================================================================================
# SLIDE 17 — Notifications & cascading
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "Notifications & cascading")
title(s, "Stateful, restart-safe buyer matching — a cron cascade")
txt(s, Inches(0.7), Inches(1.65), Inches(11.9), Inches(0.55),
    [[R("No fragile ", 13.5, FOG), R("setTimeout", 13.5, CYAN, True, MONO),
      R(" chains. Timeouts are detected from stored timestamps, so match state survives a server restart. One node-cron pass every 30 minutes.", 13.5, FOG)]],
    line_spacing=1.12)
casc = [
    ("handleTimeouts", "a notified buyer who didn't respond within the 2-hour window → mark timeout, cascade to the next candidate. Runs off notified_at, never a live timer."),
    ("retrySearches", "sessions with no candidates left → re-run findCandidates in case new buyers registered; throttled to once / 2h via updated_at."),
    ("handleExpiry", "pickup window closed without a match → status = warehouse_fallback, item's local_routing_accepted = false. The item never waits forever."),
]
yy = Inches(2.4)
for h, b in casc:
    rect(s, Inches(0.7), yy, Inches(7.4), Inches(1.15), PANEL, radius=True)
    txt(s, Inches(0.95), yy + Inches(0.14), Inches(6.9), Inches(0.35), [[R(h + "()", 13, ORANGE, True, MONO)]])
    txt(s, Inches(0.95), yy + Inches(0.52), Inches(6.9), Inches(0.55), [[R(b, 11.5, FOG)]], line_spacing=1.12)
    yy += Inches(1.25)

log_lines = [
    ('{"level":"info","msg":"matching', CODEFG),
    (' cascade scheduled",', CODEFG),
    (' "cron":"*/30 * * * *"}', CYAN),
    ('{"level":"warn","msg":"match', CODEFG),
    (' session expired — falling back', CODEFG),
    (' to warehouse","returnId":...}', ORANGE),
    ('{"level":"info","msg":"matching', CODEFG),
    (' cascade complete",', CODEFG),
    (' "timeoutsAdvanced":1,', CYAN),
    (' "searchesRetried":2,', CYAN),
    (' "candidatesFound":1,', CYAN),
    (' "sessionsExpired":0}', CYAN),
]
code_panel(s, Inches(8.3), Inches(2.4), Inches(4.3), Inches(3.75), log_lines,
           title_txt="structured cron logs", fs=10)
txt(s, Inches(0.7), Inches(6.45), Inches(11.9), Inches(0.5),
    [[R("Every cron pass emits a summary line + a request id per API call — greppable now, ingestible into CloudWatch/Datadog later with no code change.", 11.5, MUTED, False)]])
footer(s, 17, "SCALE")

# ================================================================================
# SLIDE 18 — Edge cases -> owning mechanism
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "Robustness")
title(s, "Every edge case maps to an owning mechanism")
rows = [
    ["Edge case", "Owning mechanism"],
    ["Package opened / packaging missing", "Normal case — completeness vector + seal check move the posterior; hub repack is the default workflow"],
    ["Accessories / cables missing", "VLM manifest check → refurb (uplift positive) or grade-down"],
    ["Low AI confidence", "θ_r gates shrink the eligible set toward liquidate/warehouse — no special-case path"],
    ["AI grade wrong", "Caught at driver scan / hub bench before buyer exposure; bounded correction; verdict becomes a training label"],
    ["Customer hides damage", "Driver checkpoint + refund timed to trust×confidence + photo-reuse / capture attestation"],
    ["Local buyer rejects", "Item still in-city; re-enters at hub; one local trip"],
    ["No nearby buyer", "Demand curve priced it → engine chose another route; unsold listing → dwell expiry → re-run"],
    ["Demand shifts mid-route", "Decision TTL; re-evaluated at each checkpoint while redirect is cheap"],
    ["Unsellable after inspection", "Hub cascade: pallet → donate → recycle, same building"],
    ["Special-handling category", "Hard ladder, evaluated first, never EV-optimized"],
]
cw = [Inches(4.0), Inches(7.9)]
simple_table(s, Inches(0.7), Inches(1.65), Inches(11.9), rows, cw, fs=10.5, row_h=0.46)
footer(s, 18, "ROBUST")

# ================================================================================
# SLIDE 19 — Scalability & production posture
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "Scalability & production posture")
title(s, "Honest scope — what's real, what's mocked, what's next")
col1 = [
    ("Deterministic + pure ", "core engine (routing-ev, liquidation-lot) — no randomness, replayable, unit-tested. Scales as pure compute."),
    ("Structured JSON logging ", "one line/event with a reqId per request (X-Request-Id echoed) — CloudWatch/Datadog-ready."),
    ("Hardening ", "helmet security headers, per-IP rate limiting (300/min), bcrypt auth, input validation on every route."),
    ("Restart-safe jobs ", "cron cascade + demand rollup detect state from timestamps, not in-memory timers."),
    ("Drift watchdog ", "PSI monitor → auto-fallback when input distribution shifts (proven in eval)."),
]
col2 = [
    ("Per-item greedy + batch-at-hub ", "is the honest scope. Fleet-level assignment (pickup batching, pallet consolidation, hub capacity) is a real production concern — documented, deliberately not built."),
    ("Mocked for reproducibility: ", "SKU-prefix economic profile, per-category demand & decay params, secondary-market bid curves — same posture as the existing pricing mock."),
    ("Real: ", "grading/pricing model calls, the full EV + lot engines, the state machine, checkpoint re-evaluation, MongoDB persistence, the reprice bandit."),
]
rect(s, Inches(0.7), Inches(1.7), Inches(5.85), Inches(4.9), PANEL, radius=True)
txt(s, Inches(0.95), Inches(1.9), Inches(5.4), Inches(0.35), [[R("PRODUCTION-SHAPED TODAY", 12.5, GREEN, True)]])
bullets(s, Inches(0.95), Inches(2.4), Inches(5.4), Inches(4.0), col1, fs=11.5, gap=8, lead=GREEN)

rect(s, Inches(6.75), Inches(1.7), Inches(5.85), Inches(4.9), PANEL, radius=True)
txt(s, Inches(7.0), Inches(1.9), Inches(5.4), Inches(0.35), [[R("SCOPED / NEXT (stated plainly)", 12.5, ORANGE, True)]])
bullets(s, Inches(7.0), Inches(2.4), Inches(5.4), Inches(4.0), col2, fs=11.5, gap=9, lead=ORANGE)
footer(s, 19, "SCALE")

# ================================================================================
# SLIDE 20 — Validation / proof
# ================================================================================
s = slide(NAVY)
accent_bar(s); kicker(s, "Validation")
title(s, "Reproducible proof — no network, no key, one command each")
# metric tiles
tiles = [
    ("51 / 51", "edge-case matrix passes", "pnpm test:edge"),
    ("100%", "routing hard-rule conformance", "pnpm eval"),
    ("100%", "argmax-EV optimality", "pnpm eval"),
    ("5.3%", "pricing MAPE (₹186 MAE)", "pnpm eval"),
    ("0.771", "return-risk AUC vs 0.715 prior", "pnpm eval"),
    ("0.099→0.024", "calibration ECE (temp-scaled)", "pnpm eval"),
]
for i, (big, lab, cmd) in enumerate(tiles):
    cx = Inches(0.7 + (i%3)*4.05)
    cy = Inches(1.75 + (i//3)*1.55)
    rect(s, cx, cy, Inches(3.8), Inches(1.38), PANEL, radius=True)
    rect(s, cx, cy, Inches(0.1), Inches(1.38), ORANGE)
    txt(s, cx+Inches(0.3), cy+Inches(0.15), Inches(3.4), Inches(0.5), [[R(big, 24, ORANGE, True)]])
    txt(s, cx+Inches(0.3), cy+Inches(0.72), Inches(3.4), Inches(0.35), [[R(lab, 11.5, WHITE, True)]])
    txt(s, cx+Inches(0.3), cy+Inches(1.02), Inches(3.4), Inches(0.3), [[R(cmd, 10, MUTED, False, MONO)]])

screenshot_ph(s, Inches(0.7), Inches(4.95), Inches(11.9), Inches(1.65),
              "pnpm eval   &&   pnpm test:edge",
              "The full deterministic eval report + the 51/51 edge-case matrix — the baseline every later ML phase must beat.")
footer(s, 20, "PROOF")

# ================================================================================
# SLIDE 21 — Deployment
# ================================================================================
s = slide()
accent_bar(s); kicker(s, "Deployment")
title(s, "Live, auto-deployed, wired end-to-end")
dep = [
    ("Web — Vercel", "reloop-woad.vercel.app", "Next.js (apps/web). NEXT_PUBLIC_API_BASE_URL baked in at build."),
    ("API — Render", "reloop-api-po73.onrender.com", "Express (apps/api) via tsx. NVIDIA_API_KEY + WEB_ORIGIN (CORS)."),
    ("Data — MongoDB", "cloud state sync", "Per-user + shared state, returns, match sessions, pricing indexes."),
]
yy = Inches(1.9)
for h, url, b in dep:
    rect(s, Inches(0.7), yy, Inches(11.9), Inches(1.1), PANEL, radius=True)
    txt(s, Inches(0.95), yy+Inches(0.15), Inches(4.0), Inches(0.35), [[R(h, 14, ORANGE, True)]])
    txt(s, Inches(0.95), yy+Inches(0.55), Inches(4.5), Inches(0.35), [[R(url, 12, CYAN, True, MONO)]])
    txt(s, Inches(5.5), yy+Inches(0.32), Inches(6.9), Inches(0.55), [[R(b, 12, FOG)]], line_spacing=1.12)
    yy += Inches(1.28)
txt(s, Inches(0.7), Inches(6.0), Inches(11.9), Inches(0.7),
    [[R("Both auto-deploy from ", 12.5, FOG), R("main", 12.5, CYAN, True, MONO),
      R(". Pre-push gate: ", 12.5, FOG), R("pnpm -r typecheck", 12.5, WHITE, True, MONO),
      R(" (strict, no any) + ", 12.5, FOG), R("web build", 12.5, WHITE, True, MONO),
      R(". @reloop/shared ships as TS source — API runs raw via tsx.", 12.5, FOG)]], line_spacing=1.14)
footer(s, 21, "DEPLOY")

# ================================================================================
# SLIDE 22 — Close
# ================================================================================
s = slide(INK)
rect(s, 0, 0, EMU_W, Inches(0.14), ORANGE)
rect(s, 0, Inches(7.36), EMU_W, Inches(0.14), ORANGE)
txt(s, Inches(0.9), Inches(2.0), Inches(11.6), Inches(2.2),
    [[R("Amazon built the resale rails.", 34, WHITE, True)],
     [R("ReLoop gives them eyes at the doorstep", 34, FOG, False)],
     [R("and a brain that decides before the truck rolls.", 34, ORANGE, True)]],
    line_spacing=1.15, space_after=4)
txt(s, Inches(0.9), Inches(4.75), Inches(11.6), Inches(0.6),
    [[R("The return pipeline, rewired — the Amazon way.", 18, FOG, False, FONT, True)]])
txt(s, Inches(0.9), Inches(6.0), Inches(11.6), Inches(0.5),
    [[R("reloop-woad.vercel.app", 15, CYAN, True), R("      ·      ", 15, MUTED, False),
      R("“The landfill is a design flaw.”", 15, MUTED, False, FONT, True)]])

prs.save("deck/ReLoop-Return-Pipeline.pptx")
print("saved deck/ReLoop-Return-Pipeline.pptx with", len(prs.slides._sldIdLst), "slides")
