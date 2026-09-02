import time
from datetime import date, timedelta

import pandas as pd
import requests

API_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"
END = date.today()
START = END - timedelta(days=60)

TARGET_RECORDS = 1200
PAGE_SIZE = 500

records = []
offset = 1  # USGS offset is 1-based

while len(records) < TARGET_RECORDS:
    params = {
        "format": "geojson",
        "starttime": START.isoformat(),
        "endtime": END.isoformat(),
        "minmagnitude": 2.5,
        "limit": PAGE_SIZE,
        "offset": offset,
        "orderby": "time",
    }

    try:
        response = requests.get(API_URL, params=params, timeout=15)
        response.raise_for_status()
    except requests.RequestException as error:
        print(f"Request failed at offset {offset}: {error}")
        break

    features = response.json()["features"]
    if not features:
        break

    for feature in features:
        props = feature["properties"]
        lon, lat, depth = feature["geometry"]["coordinates"]
        records.append({
            "id": feature["id"],
            "time": props["time"],
            "place": props["place"],
            "magnitude": props["mag"],
            "mag_type": props["magType"],
            "latitude": lat,
            "longitude": lon,
            "depth": depth,
            "tsunami": props["tsunami"],
            "type": props["type"],
            "status": props["status"],
        })

    print(f"Collected {len(records)} records so far...")
    offset += PAGE_SIZE
    time.sleep(1)

df = pd.DataFrame(records)
df["time"] = pd.to_datetime(df["time"], unit="ms").dt.strftime("%Y-%m-%d %H:%M")
df.to_csv("../data/earthquake_info.csv", index=False)

print(f"Saved {len(df)} records to ../data/earthquake_info.csv")
