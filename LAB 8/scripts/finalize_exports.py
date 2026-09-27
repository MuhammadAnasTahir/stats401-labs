import pandas as pd

CLUSTER_LABELS = {
    0: "Arts, Media & Digital Design",
    1: "Tuition, Financial Aid & Costs",
    2: "Anthropology, Global Health & Course Updates",
    3: "China & Chinese Language/Culture Studies",
    4: "Public Policy, Politics & Environment",
    5: "Academic Standing, Grading & Registration",
    6: "Math, Science & Physical Education Courses",
    7: "Degree & Major Requirement Structures",
    8: "History, Literature & Global Cultures",
    9: "Student Life, Research & Signature Work",
    10: "Quantitative Social Science (Econometrics)",
    11: "DKU Policies, Credit Transfer & Degree Standards",
}

df = pd.read_csv("lab8_embedding_map_prelabel.csv")
df["cluster_name"] = df["cluster"].map(CLUSTER_LABELS)

cols = ["passage_id", "chapter", "section", "subsection", "page", "text",
        "word_count", "cluster", "cluster_name", "x", "y"]
df = df[cols]
df.to_csv("lab8_embedding_map.csv", index=False)
print("Saved lab8_embedding_map.csv:", df.shape)

# Topic x Section matrix -- rows = formal chapter (Part), columns = semantic topic
matrix_df = (
    df.groupby(["chapter", "cluster_name"])
    .size()
    .reset_index(name="count")
)
matrix_df.to_csv("lab8_topic_section_matrix.csv", index=False)
print("Saved lab8_topic_section_matrix.csv:", matrix_df.shape)

print("\nCluster label counts:")
print(df["cluster_name"].value_counts())
