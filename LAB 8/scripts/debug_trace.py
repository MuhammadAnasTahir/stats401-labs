import pdfplumber
import re
import json
import sys
sys.path.insert(0, 'scripts')
from extract_passages import get_body_lines, extract_page_number, merge_wrapped_headers, normalize, FULL_HEADER_RE

PDF_PATH = "ug_bulletin_2025-2026 (1).pdf"
GAP_THRESHOLD = 20

with open("toc_entries.json", encoding="utf-8") as f:
    toc_entries = json.load(f)

passages = []
current_chapter = None
current_section = None
current_subsection = None
active_course_label = None
toc_idx = 0

buffer = []
buffer_start_page = None
prev_top = None
just_started_boundary = False

def flush_buffer():
    global buffer, buffer_start_page
    if buffer:
        text = ' '.join(buffer).strip()
        if text and len(text.split()) >= 4:
            passages.append({"chapter": current_chapter, "page": buffer_start_page, "text": text[:40]})
    buffer = []
    buffer_start_page = None

def apply_heading(entry):
    global current_chapter, current_section, current_subsection, active_course_label
    global prev_top, just_started_boundary
    flush_buffer()
    level, title, _pg = entry
    if level == 0:
        print(f"  >>> CHAPTER CHANGE to: {title!r} at buffer_start_page(prev)={buffer_start_page}")
        current_chapter = title
        current_section = None
        current_subsection = None
    elif level == 1:
        current_section = title
        current_subsection = None
    else:
        current_subsection = title
    active_course_label = None
    prev_top = None
    just_started_boundary = True

with pdfplumber.open(PDF_PATH) as pdf:
    for pidx in range(9, 95):
        page = pdf.pages[pidx]
        lines = get_body_lines(page)
        pg = extract_page_number(lines)
        if pg is None:
            pg = buffer_start_page

        while toc_idx < len(toc_entries) and toc_entries[toc_idx][2] < pg:
            apply_heading(toc_entries[toc_idx])
            toc_idx += 1

        boundary_at_line = {}
        norm_lines = [normalize(t) for _, t in lines]
        while toc_idx < len(toc_entries) and toc_entries[toc_idx][2] == pg:
            entry = toc_entries[toc_idx]
            target = normalize(entry[1])
            found_idx = None
            if len(target) >= 6:
                for li, nl in enumerate(norm_lines):
                    if nl == target or (len(nl) >= 6 and (nl in target or target in nl)):
                        found_idx = li
                        break
            if found_idx is not None:
                boundary_at_line[found_idx] = entry
                toc_idx += 1
            else:
                apply_heading(entry)
                toc_idx += 1

        merged_lines = merge_wrapped_headers(lines)
        if boundary_at_line:
            old_entries = list(boundary_at_line.values())
            boundary_at_line = {}
            m_norm = [normalize(t) for _, t in merged_lines]
            for entry in old_entries:
                target = normalize(entry[1])
                found_idx = None
                for li, nl in enumerate(m_norm):
                    if nl == target or (len(nl) >= 6 and (nl in target or target in nl)):
                        found_idx = li
                        break
                if found_idx is not None:
                    boundary_at_line[found_idx] = entry
                else:
                    print(f"  !!! LOST MATCH after merge for entry {entry} on page {pg}")

        for j, (top, text) in enumerate(merged_lines):
            if j in boundary_at_line:
                apply_heading(boundary_at_line[j])
                continue
            header_m = FULL_HEADER_RE.match(text)
            if header_m:
                flush_buffer()
                code_cluster = header_m.group(1).strip()
                title = header_m.group(2).strip()
                active_course_label = f"{code_cluster}: {title}"
                buffer = [text]
                buffer_start_page = pg
                prev_top = top
                just_started_boundary = True
                continue
            if not buffer:
                buffer_start_page = pg
            if just_started_boundary:
                buffer.append(text)
                just_started_boundary = False
                prev_top = top
                continue
            if prev_top is not None:
                gap = top - prev_top
                if gap >= GAP_THRESHOLD and buffer:
                    flush_buffer()
                    buffer_start_page = pg
            buffer.append(text)
            prev_top = top

flush_buffer()
import collections
c = collections.Counter(p['chapter'] for p in passages)
for k, v in c.items():
    print(k, v)
