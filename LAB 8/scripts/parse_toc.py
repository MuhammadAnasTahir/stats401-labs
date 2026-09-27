import pdfplumber
import re
import json

PDF_PATH = "ug_bulletin_2025-2026 (1).pdf"

def level_of(x0):
    if x0 <= 76:
        return 0
    elif x0 <= 89:
        return 1
    else:
        return 2

def get_lines_with_x0(page):
    words = page.extract_words(x_tolerance=1)
    lines = {}
    for w in words:
        key = round(w['top'])
        lines.setdefault(key, []).append(w)
    out = []
    for top in sorted(lines.keys()):
        ws = sorted(lines[top], key=lambda w: w['x0'])
        x0 = ws[0]['x0']
        raw = ' '.join(w['text'] for w in ws)
        out.append((x0, raw))
    return out

def clean_toc_line(raw):
    # remove dot-leaders (runs of periods, possibly glued to trailing page num)
    # pattern: title, then dots, then optional page number at very end
    m = re.match(r'^(.*?)\.{2,}\s*(\d{1,4})\s*$', raw)
    if m:
        title = m.group(1).strip()
        title = re.sub(r'\.+$', '', title).strip()
        page_num = int(m.group(2))
        return title, page_num
    # sometimes dots are inconsistent length (<2) - try looser
    m2 = re.match(r'^(.*?)\s*\.{1,}\s*(\d{1,4})$', raw)
    if m2:
        title = re.sub(r'\.+$', '', m2.group(1)).strip()
        return title, int(m2.group(2))
    # last resort: no dot leader at all, just "Title <spaces> NNN" at line end
    m3 = re.match(r'^(.*\S)\s+(\d{1,4})$', raw)
    if m3 and len(m3.group(1)) > 8:
        return m3.group(1).strip(), int(m3.group(2))
    return raw.strip(), None

toc_entries = []  # (level, title, page_num)

with pdfplumber.open(PDF_PATH) as pdf:
    pending_title = None
    pending_level = None
    for i in range(2, 9):  # TOC pages (index 2..8 = printed pages 2..8)
        page = pdf.pages[i]
        for x0, raw in get_lines_with_x0(page):
            raw = raw.strip()
            if not raw:
                continue
            if raw == "Table of Contents":
                continue
            if re.fullmatch(r'\d{1,4}', raw):
                # standalone footer page number line
                continue
            title, page_num = clean_toc_line(raw)
            if page_num is None:
                # continuation line (wrapped title, no page number yet)
                if pending_title is None:
                    pending_title = title
                    pending_level = level_of(x0)
                else:
                    pending_title += " " + title
                continue
            if pending_title is not None:
                title = pending_title + " " + title
                level = pending_level
                pending_title = None
                pending_level = None
            else:
                level = level_of(x0)
            toc_entries.append((level, title.strip(), page_num))

print(f"Total TOC entries parsed: {len(toc_entries)}")
for lvl, title, pg in toc_entries[:40]:
    print(f"L{lvl} p{pg:>4} {'  '*lvl}{title}")

with open("toc_entries.json", "w", encoding="utf-8") as f:
    json.dump(toc_entries, f, indent=2)
