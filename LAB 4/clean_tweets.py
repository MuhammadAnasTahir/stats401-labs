import re

import pandas as pd
from transformers import pipeline

RAW_PATH = "../data/lab4_raw_tweets.csv"
CLEAN_PATH = "../data/lab4_clean_tweets.csv"

df = pd.read_csv(RAW_PATH)
print(f"Raw rows: {len(df)}")
print("Missing values per column:\n", df.isna().sum())
print("Duplicate tweet_id:", df["tweet_id"].duplicated().sum())
print("Duplicate text:", df["text"].duplicated().sum())

# Keep only the columns needed downstream (most others are >90% missing:
# tweet_coord, user_timezone, tweet_location, negativereason*, *_gold)
df = df[["tweet_id", "tweet_created", "text", "retweet_count", "airline", "airline_sentiment"]].copy()

# Fix types
df["tweet_created"] = pd.to_datetime(df["tweet_created"], errors="coerce", utc=True)
df["retweet_count"] = pd.to_numeric(df["retweet_count"], errors="coerce")

# Drop rows that are unusable, and duplicate tweets
df = df.dropna(subset=["tweet_created", "text", "retweet_count"])
df = df.drop_duplicates(subset="tweet_id")
df = df.drop_duplicates(subset="text")


def clean_text(text):
    text = re.sub(r"http\S+", "", text)
    text = text.replace("&amp;", "&")
    return re.sub(r"\s+", " ", text).strip()


df["clean_text"] = df["text"].apply(clean_text)
df = df[df["clean_text"].str.len() > 0]
print(f"Rows after cleaning: {len(df)}")

# Sample down to a manageable size for sentiment scoring (assignment needs >= 1,000)
df = df.sample(n=1200, random_state=42)

# Sentiment scoring with a Twitter-trained RoBERTa model
classifier = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
    top_k=None,
)

results = classifier(df["clean_text"].tolist(), batch_size=32, truncation=True)

sentiment, sentiment_score, neg, neu, pos = [], [], [], [], []
for scores in results:
    probs = {s["label"]: s["score"] for s in scores}
    best_label = max(probs, key=probs.get)
    sentiment.append(best_label)
    sentiment_score.append(probs[best_label])
    neg.append(probs["negative"])
    neu.append(probs["neutral"])
    pos.append(probs["positive"])

df["sentiment"] = sentiment
df["sentiment_score"] = sentiment_score
df["negative_prob"] = neg
df["neutral_prob"] = neu
df["positive_prob"] = pos

agreement = (df["sentiment"] == df["airline_sentiment"]).mean()
print(f"Agreement with original human-labeled sentiment: {agreement:.1%}")

final = df.rename(columns={
    "tweet_created": "date",
    "text": "tweet_text",
    "airline_sentiment": "human_sentiment",
})[[
    "tweet_id", "date", "tweet_text", "clean_text", "retweet_count", "airline",
    "human_sentiment", "sentiment", "sentiment_score",
    "negative_prob", "neutral_prob", "positive_prob",
]]

final.to_csv(CLEAN_PATH, index=False)
print(f"Saved {len(final)} rows to {CLEAN_PATH}")
