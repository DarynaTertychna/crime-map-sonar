import sys
import json
import pandas as pd
from xgboost import XGBRegressor

INPUT_CSV = sys.argv[1]
OUTPUT_JSON = "data/predictions/latest.json"


df = pd.read_csv(INPUT_CSV)


df["crime_type"] = df["crime_type"].astype("category").cat.codes
df["area"] = df["area"].astype("category").cat.codes

X = df[["area", "crime_type", "month"]]
y = df["crime_count"]

model = XGBRegressor(
    n_estimators=100,
    max_depth=4,
    learning_rate=0.1,
)
model.fit(X, y)

df["risk_score"] = model.predict(X)

def risk_level(score):
    if score > 50:
        return "High"
    if score > 20:
        return "Medium"
    return "Low"

output = []
for _, row in df.iterrows():
    output.append({
        "area": int(row["area"]),
        "crime_type": int(row["crime_type"]),
        "risk_score": float(row["risk_score"]),
        "risk_level": risk_level(row["risk_score"]),
    })

with open(OUTPUT_JSON, "w") as f:
    json.dump(output, f)

print("Predictions written to", OUTPUT_JSON)
