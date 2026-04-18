import pandas as pd

CSV_PATH = "data/cleaned_crime_data.csv"


def load_data():
    df = pd.read_csv(CSV_PATH)

    needed = ["Quarter", "year", "county", "crime_type", "crime_count"]
    missing = [c for c in needed if c not in df.columns]
    if missing:
        raise ValueError(
            f"Missing expected columns: {missing}. Actual columns: {df.columns.tolist()}"
        )

    df["Quarter"] = df["Quarter"].astype(str).str.strip()
    df["county"] = df["county"].astype(str).str.strip()
    df["crime_type"] = df["crime_type"].astype(str).str.strip()
    df["crime_count"] = pd.to_numeric(df["crime_count"], errors="coerce").fillna(0)

    return df


def crime_type_totals():
    df = load_data()

    grouped = (
        df.groupby("crime_type", as_index=False)["crime_count"]
        .sum()
        .sort_values("crime_count", ascending=False)
    )

    return [
        {
            "crime_type": row["crime_type"],
            "value": int(row["crime_count"]),
        }
        for _, row in grouped.iterrows()
    ]


def crime_trend(crime_type_filter: str = None):
    df = load_data()

    if crime_type_filter:
        wanted = crime_type_filter.strip().lower()
        df = df[df["crime_type"].str.lower() == wanted]

    grouped = (
        df.groupby("Quarter", as_index=False)["crime_count"]
        .sum()
        .sort_values("Quarter")
    )

    grouped = grouped.tail(12)

    return [
        {
            "quarter": row["Quarter"],
            "value": int(row["crime_count"]),
        }
        for _, row in grouped.iterrows()
    ]


def seasonal_pattern():
    df = load_data()

    df["season"] = df["Quarter"].str.extract(r"(Q[1-4])", expand=False)

    grouped = (
        df.dropna(subset=["season"])
        .groupby("season", as_index=False)["crime_count"]
        .sum()
        .sort_values("season")
    )

    return [
        {
            "season": row["season"],
            "value": int(row["crime_count"]),
        }
        for _, row in grouped.iterrows()
    ]