import pandas as pd
import numpy as np
import json

df = pd.read_csv("bulletin_passages_clean.csv")
print("Loaded", len(df), "passages")

# ---------- Task 4: Basic corpus stats ----------
print("\n=== Passage length ===")
print(df["word_count"].describe())

print("\n=== Passages by section (top 15) ===")
print(df["section"].value_counts().head(15))

section_stats = (
    df.groupby(["chapter", "section"])
    .agg(n_passages=("passage_id", "count"), avg_words=("word_count", "mean"))
    .reset_index()
    .sort_values("n_passages", ascending=False)
)
section_stats.to_csv("lab8_section_stats.csv", index=False)
print("\nSaved lab8_section_stats.csv with", len(section_stats), "rows")

# ---------- Task 5: TF-IDF (corpus-level terms) ----------
from sklearn.feature_extraction.text import TfidfVectorizer

tfidf = TfidfVectorizer(
    max_df=0.6, min_df=3, ngram_range=(1, 2), stop_words="english"
)
tfidf_matrix = tfidf.fit_transform(df["text"])
terms = np.array(tfidf.get_feature_names_out())
mean_scores = np.asarray(tfidf_matrix.mean(axis=0)).ravel()
top_idx = mean_scores.argsort()[::-1][:30]
print("\n=== Top corpus-wide TF-IDF terms ===")
for i in top_idx[:30]:
    print(f"{terms[i]:30s} {mean_scores[i]:.4f}")

with open("lab8_top_tfidf_terms.json", "w", encoding="utf-8") as f:
    json.dump([{"term": terms[i], "score": float(mean_scores[i])} for i in top_idx], f, indent=2)

# ---------- Task 6: Semantic embeddings ----------
from sentence_transformers import SentenceTransformer

print("\nLoading sentence-transformers model...")
model = SentenceTransformer("all-MiniLM-L6-v2")
embeddings = model.encode(df["text"].tolist(), normalize_embeddings=True, show_progress_bar=True)
print("Embeddings shape:", embeddings.shape)
np.save("lab8_embeddings.npy", embeddings)

# ---------- Task 8: UMAP projection ----------
import umap

reducer = umap.UMAP(
    n_components=2, n_neighbors=15, min_dist=0.15, metric="cosine", random_state=401
)
coords = reducer.fit_transform(embeddings)
df["x"] = coords[:, 0]
df["y"] = coords[:, 1]
print("\nUMAP projection complete")

# ---------- Task 9: Clustering ----------
from sklearn.cluster import KMeans

N_CLUSTERS = 12
kmeans = KMeans(n_clusters=N_CLUSTERS, random_state=401, n_init="auto")
df["cluster"] = kmeans.fit_predict(embeddings)
print("\nCluster sizes:")
print(df["cluster"].value_counts().sort_index())

# Per-cluster TF-IDF terms to aid labeling
cluster_terms = {}
for c in sorted(df["cluster"].unique()):
    mask = (df["cluster"] == c).values
    sub_matrix = tfidf_matrix[mask]
    sub_mean = np.asarray(sub_matrix.mean(axis=0)).ravel()
    top = sub_mean.argsort()[::-1][:12]
    cluster_terms[int(c)] = [terms[i] for i in top]

with open("lab8_cluster_terms.json", "w", encoding="utf-8") as f:
    json.dump(cluster_terms, f, indent=2)

print("\n=== Cluster top terms ===")
for c, tlist in cluster_terms.items():
    print(f"Cluster {c}: {', '.join(tlist)}")

# Save representative passages per cluster (closest to centroid) for manual labeling
print("\n=== Representative passages per cluster ===")
reps = {}
for c in sorted(df["cluster"].unique()):
    mask = (df["cluster"] == c).values
    idxs = np.where(mask)[0]
    centroid = kmeans.cluster_centers_[c]
    dists = np.linalg.norm(embeddings[idxs] - centroid, axis=1)
    order = idxs[np.argsort(dists)][:5]
    reps[int(c)] = df.iloc[order][["chapter", "section", "subsection", "text"]].to_dict("records")
    print(f"\n--- Cluster {c} (n={mask.sum()}) ---")
    for r in reps[int(c)][:3]:
        print(f"  [{r['section']}] {r['text'][:140]}")

with open("lab8_cluster_representatives.json", "w", encoding="utf-8") as f:
    json.dump(reps, f, indent=2)

df.to_csv("lab8_embedding_map_prelabel.csv", index=False)
print("\nSaved lab8_embedding_map_prelabel.csv (cluster labels not yet assigned)")
