import pandas as pd
import re

CODE_RE = re.compile(r'\b[A-Z]{2,12}\s?\d{2,4}[A-Z]?\b')
MIN_WORDS = 8

df = pd.read_csv("bulletin_passages_raw.csv")
n_raw = len(df)

df = df.dropna(subset=["text"])
df = df.drop_duplicates(subset=["text"])
n_after_dedup = len(df)

df["text_clean"] = (
    df["text"]
    .str.replace("", " - ", regex=False)
    .str.replace(r"\s+", " ", regex=True)
    .str.strip()
    # strip stray leading footnote-marker numbers glued to the start of a
    # sentence during PDF extraction (e.g. "94 Fall This course was named...")
    .str.replace(r"^\d{1,4}\s+(?=[A-Z])", "", regex=True)
)

df["word_count"] = df["text_clean"].str.split().str.len()

def ends_ok(t):
    t = t.rstrip()
    return t.endswith((".", "!", "?", ")", ":", ";"))

df["ends_ok"] = df["text_clean"].apply(ends_ok)
df["code_hits"] = df["text_clean"].apply(lambda t: len(CODE_RE.findall(t)))

is_table_boilerplate = df["text_clean"].str.replace(r"[^A-Za-z]", "", regex=True).str.lower().str.contains(
    "coursecodecoursenamecredit"
)
is_broken_fragment = (~df["ends_ok"]) & (df["code_hits"] >= 1)
is_too_short = df["word_count"] < MIN_WORDS

drop_mask = is_table_boilerplate | is_broken_fragment | is_too_short
n_dropped_junk = int(drop_mask.sum())

df_clean = df[~drop_mask].copy()
df_clean = df_clean.drop(columns=["ends_ok", "code_hits", "text"]).rename(columns={"text_clean": "text"})
df_clean = df_clean.reset_index(drop=True)
df_clean["passage_id"] = [f"p{i+1:05d}" for i in range(len(df_clean))]
df_clean = df_clean[["passage_id", "chapter", "section", "subsection", "page", "text", "word_count"]]

df_clean.to_csv("bulletin_passages_clean.csv", index=False)

print(f"Raw passages:              {n_raw}")
print(f"After dedup/dropna:         {n_after_dedup}")
print(f"Dropped as junk/fragments:  {n_dropped_junk}")
print(f"Final cleaned passages:     {len(df_clean)}")
print()
print("Word count stats (cleaned):")
print(df_clean["word_count"].describe())
print()
print("Number of formal sections (chapter x section combos):",
      df_clean.groupby(["chapter", "section"]).ngroups)
print("Number of chapters:", df_clean["chapter"].nunique())
print()
print("Passages by chapter:")
print(df_clean["chapter"].value_counts())
