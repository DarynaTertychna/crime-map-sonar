import pandas as pd
import numpy as np
import joblib
import xgboost as xgb

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import classification_report, confusion_matrix

CSV_PATH = "data/cleaned_crime_data.csv"


def main():
    df = pd.read_csv(CSV_PATH)

    df["county"] = df["county"].astype(str).str.strip()
    df["crime_type"] = df["crime_type"].astype(str).str.strip()
    df["year"] = pd.to_numeric(df["year"], errors="coerce")
    df["crime_count"] = pd.to_numeric(df["crime_count"], errors="coerce")

    df = df.dropna(subset=["year", "county", "crime_type", "crime_count"]).copy()
    df["year"] = df["year"].astype(int)
    df["crime_count"] = df["crime_count"].astype(int)

    print("Raw shape:", df.shape)
    print("Columns:", df.columns.tolist())
    print(df.head(5))

    df = df[df["crime_count"] >= 0].copy()

    df = df.sort_values(["county", "crime_type", "year"]).reset_index(drop=True)

    df["prev_year_count"] = df.groupby(["county", "crime_type"])["crime_count"].shift(1)

    df = df.dropna(subset=["prev_year_count"]).copy()
    df["prev_year_count"] = df["prev_year_count"].astype(int)

    try:
        df["risk_label"] = pd.qcut(
            df["crime_count"],
            q=3,
            labels=["Low", "Medium", "High"],
            duplicates="drop",
        )
    except ValueError:
        counts = df["crime_count"].to_numpy()
        t1 = np.quantile(counts, 1 / 3)
        t2 = np.quantile(counts, 2 / 3)
        df["risk_label"] = np.where(
            counts <= t1, "Low", np.where(counts <= t2, "Medium", "High")
        )

    df = df.dropna(subset=["risk_label"]).copy()

    risk_map = {"Low": 0, "Medium": 1, "High": 2}
    df["risk"] = df["risk_label"].map(risk_map).astype(int)

    print("\nAfter features shape:", df.shape)
    print(df[["year", "county", "crime_type", "crime_count", "prev_year_count", "risk_label"]].head(10))

    le_county = LabelEncoder()
    le_crime = LabelEncoder()

    df["county_enc"] = le_county.fit_transform(df["county"])
    df["crime_enc"] = le_crime.fit_transform(df["crime_type"])

    X = df[["county_enc", "crime_enc", "prev_year_count", "year"]]
    y = df["risk"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.08,
        subsample=0.9,
        colsample_bytree=0.9,
        objective="multi:softprob",
        num_class=3,
        eval_metric="mlogloss",
        random_state=42,
    )

    model.fit(X_train, y_train)

    pred = model.predict(X_test)

    print("\nConfusion matrix:\n", confusion_matrix(y_test, pred))
    print("\nClassification report:\n", classification_report(y_test, pred, target_names=["Low", "Medium", "High"]))

    joblib.dump(model, "crime_risk_model.pkl")
    joblib.dump(le_county, "county_encoder.pkl")
    joblib.dump(le_crime, "crime_encoder.pkl")

    print("\nSaved:")
    print(" - crime_risk_model.pkl")
    print(" - county_encoder.pkl")
    print(" - crime_encoder.pkl")


if __name__ == "__main__":
    main()