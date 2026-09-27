import pdfplumber
import re
import json
import csv

PDF_PATH = "ug_bulletin_2025-2026 (1).pdf"
GAP_THRESHOLD = 20  # pt; within-paragraph gaps are ~13-14, paragraph breaks are ~27-28

CODE_CLUSTER = r'(?:[A-Z]{2,12}\s?\d{2,4}[A-Z]?)(?:\s*/\s*[A-Z]{2,12}\s?\d{2,4}[A-Z]?)*'
FULL_HEADER_RE = re.compile(
    r'^(' + CODE_CLUSTER + r')\s+(.+?)\s*\(([^()]*[Cc]redit[^()]*)\)\s*$'
)
PARTIAL_START_RE = re.compile(r'^(' + CODE_CLUSTER + r')\s+(\S.*)$')


def normalize(s):
    return re.sub(r'[^a-z0-9]+', '', s.lower())


def get_body_lines(page):
    """Return list of (top, text) for a page, excluding running header/footer."""
    words = page.extract_words(x_tolerance=1)
    lines = {}
    for w in words:
        key = round(w['top'])
        lines.setdefault(key, []).append(w)
    out = []
    for top in sorted(lines.keys()):
        ws = sorted(lines[top], key=lambda w: w['x0'])
        text = ' '.join(w['text'] for w in ws).strip()
        if not text:
            continue
        if normalize(text) == normalize("Back to TOC"):
            continue
        out.append([top, text])
    return out


def extract_page_number(lines):
    """Pop and return the printed footer page number from the line list (if present)."""
    if not lines:
        return None
    last_top, last_text = lines[-1]
    m = re.fullmatch(r'(\d{1,4})', last_text.strip())
    if m:
        lines.pop()
        return int(m.group(1))
    # anomaly case: footer number glued to start of a footnote line, e.g. "118 This course..."
    m2 = re.match(r'^(\d{1,4})\s+(\S.*)$', last_text.strip())
    if m2:
        lines[-1][1] = m2.group(2)
        return int(m2.group(1))
    return None


def merge_wrapped_headers(lines):
    """Merge 2-physical-line course headers where the '(credits)' spills to the next line."""
    out = []
    i = 0
    n = len(lines)
    while i < n:
        top, text = lines[i]
        if PARTIAL_START_RE.match(text) and not FULL_HEADER_RE.match(text) and 'credit' not in text.lower():
            if i + 1 < n:
                nxt_top, nxt_text = lines[i + 1]
                if not PARTIAL_START_RE.match(nxt_text):
                    combined = text + ' ' + nxt_text
                    if FULL_HEADER_RE.match(combined):
                        out.append([top, combined])
                        i += 2
                        continue
        out.append([top, text])
        i += 1
    return out


def main():
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
        nonlocal buffer, buffer_start_page
        if buffer:
            text = ' '.join(buffer).strip()
            text = re.sub(r'\s+', ' ', text)
            if text and len(text.split()) >= 4:
                subsection = active_course_label if active_course_label else current_subsection
                passages.append({
                    "chapter": current_chapter,
                    "section": current_section,
                    "subsection": subsection,
                    "page": buffer_start_page,
                    "text": text,
                })
        buffer = []
        buffer_start_page = None

    def apply_heading(entry):
        nonlocal current_chapter, current_section, current_subsection, active_course_label
        nonlocal prev_top, just_started_boundary
        flush_buffer()
        level, title, _pg = entry
        if level == 0:
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
        for pidx in range(9, len(pdf.pages)):
            page = pdf.pages[pidx]
            lines = get_body_lines(page)
            pg = extract_page_number(lines)
            if pg is None:
                pg = buffer_start_page  # fallback, shouldn't normally happen

            # apply any headings whose page came before this one (safety net)
            while toc_idx < len(toc_entries) and toc_entries[toc_idx][2] < pg:
                apply_heading(toc_entries[toc_idx])
                toc_idx += 1

            # match headings expected on this page to actual lines
            boundary_at_line = {}
            norm_lines = [normalize(t) for _, t in lines]
            search_cursor = 0
            while toc_idx < len(toc_entries) and toc_entries[toc_idx][2] == pg:
                entry = toc_entries[toc_idx]
                target = normalize(entry[1])
                found_idx = None
                if len(target) >= 6:
                    # exact match first (avoids a short heading matching inside a
                    # longer sibling heading, e.g. "Academic Advising" inside
                    # "Part 7: Academic Advising and Support")
                    for li in range(search_cursor, len(norm_lines)):
                        if norm_lines[li] == target:
                            found_idx = li
                            break
                    if found_idx is None:
                        for li in range(search_cursor, len(norm_lines)):
                            nl = norm_lines[li]
                            if len(nl) >= 6 and (nl in target or target in nl):
                                found_idx = li
                                break
                if found_idx is not None:
                    boundary_at_line.setdefault(found_idx, []).append(entry)
                    search_cursor = found_idx + 1
                    toc_idx += 1
                else:
                    apply_heading(entry)
                    toc_idx += 1
            # re-merge wrapped headers (do before applying boundary_at_line indices;
            # boundary indices come from TOC headings which are rarely course headers,
            # so index drift risk is low, but recompute mapping safely by text match instead)
            merged_lines = merge_wrapped_headers(lines)
            # rebuild boundary_at_line against merged_lines by re-finding text (safe re-match)
            if boundary_at_line:
                old_entries = [e for elist in boundary_at_line.values() for e in elist]
                boundary_at_line = {}
                m_norm = [normalize(t) for _, t in merged_lines]
                m_cursor = 0
                for entry in old_entries:
                    target = normalize(entry[1])
                    found_idx = None
                    for li in range(m_cursor, len(m_norm)):
                        if m_norm[li] == target:
                            found_idx = li
                            break
                    if found_idx is None:
                        for li in range(m_cursor, len(m_norm)):
                            nl = m_norm[li]
                            if len(nl) >= 6 and (nl in target or target in nl):
                                found_idx = li
                                break
                    if found_idx is not None:
                        boundary_at_line.setdefault(found_idx, []).append(entry)
                        m_cursor = found_idx + 1

            for j, (top, text) in enumerate(merged_lines):
                if j in boundary_at_line:
                    for entry in sorted(boundary_at_line[j], key=lambda e: e[0]):
                        apply_heading(entry)
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

    print(f"Total raw passages extracted: {len(passages)}")

    with open("bulletin_passages_raw.csv", "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["passage_id", "chapter", "section", "subsection", "page", "text"])
        for i, p in enumerate(passages):
            writer.writerow([f"p{i+1:05d}", p["chapter"], p["section"], p["subsection"], p["page"], p["text"]])


if __name__ == "__main__":
    main()
