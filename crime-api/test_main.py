from fastapi.testclient import TestClient
import os
import pytest
from main import app
from main import get_risk_from_count
from main import load_cleaned_data
from main import get_crime_count_by_period
from main import extract_county_from_text, extract_crime_type_from_text
from main import load_counties_geojson
from main import LAST_12_MONTHS



client = TestClient(app)


SKIP_DB_TESTS = os.getenv("CI") == "true"


def test_health():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_predict_valid():
    res = client.post("/predict", json={
        "county": "Dublin",
        "crime_type": "Theft",
        "timePeriod": LAST_12_MONTHS
    })

    assert res.status_code == 200
    data = res.json()

    assert data["ok"] is True
    assert "riskLabel" in data
    assert "latestCrimeCount" in data


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_login_invalid_user():
    res = client.post("/auth/login", json={
        "email": "fake@test.com",
        "password": "wrongpass"
    })
    assert res.status_code == 401



def test_filters_invalid():
    res = client.post("/filters/apply", json={
        "crimeType": "All",
        "timePeriod": LAST_12_MONTHS,
        "locationQuery": "Dublin"
    })

    assert res.status_code == 400


def test_risk_levels():
    assert get_risk_from_count("Theft", 2000) == "High"
    assert get_risk_from_count("Theft", 300) == "Medium"
    assert get_risk_from_count("Theft", 10) == "Low"


def test_load_data():
    df = load_cleaned_data()
    assert not df.empty
    assert "county" in df.columns


def test_crime_count():
    result = get_crime_count_by_period("Dublin", "Theft", LAST_12_MONTHS)
    assert result is not None


def test_extract_county():
    assert extract_county_from_text("crime in Dublin") == "Dublin"

def test_extract_crime():
    assert extract_crime_type_from_text("fraud cases rising") == "Fraud"


def test_predict_all():
    res = client.get("/predict/all?crime_type=Theft")
    assert res.status_code == 200
    assert "items" in res.json()

def test_admin_requires_auth():
    res = client.post("/admin/upload-csv")
    assert res.status_code == 401

def test_admin_wrong_file_type():
    from io import BytesIO

    res = client.post(
        "/admin/upload-csv",
        files={"file": ("test.txt", BytesIO(b"data"), "text/plain")}
    )

    assert res.status_code in [401, 400]


def test_load_geojson():
    data = load_counties_geojson()
    assert "features" in data


def test_resolve_county_invalid():
    res = client.post("/location/resolve-county", json={
        "lat": 0,
        "lng": 0
    })
    assert res.status_code == 404


def test_chat_empty_message():
    res = client.post("/chat/ask", json={
        "message": ""
    })
    assert res.status_code == 400


def test_chat_invalid_county():
    res = client.post("/chat/ask", json={
        "message": "crime on mars"
    })
    assert res.status_code == 200



def test_forgot_password_invalid():
    res = client.post("/auth/forgot-password", json={
        "email": ""
    })
    assert res.status_code == 400


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_db_endpoint():
    res = client.get("/test-db")
    assert "ok" in res.json()


# optional

def test_predict_empty_values():
    res = client.post("/predict", json={
        "county": "",
        "crime_type": "",
        "timePeriod": LAST_12_MONTHS
    })
    assert res.status_code == 400


def test_predict_missing_fields():
    res = client.post("/predict", json={
        "county": "",
        "crime_type": ""
    })
    assert res.status_code == 422


def test_predict_all_invalid():
    res = client.get("/predict/all?crime_type=INVALID")
    assert res.status_code == 404


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_register_duplicate():
    email = "dup@test.com"

    client.post("/auth/register", json={
        "email": email,
        "password": "test123"
    })

    res = client.post("/auth/register", json={
        "email": email,
        "password": "test123"
    })

    assert res.status_code in [200, 409]



def test_auth_me_no_token():
    res = client.get("/auth/me")
    assert res.status_code == 401


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_reset_password_invalid():
    res = client.post("/auth/reset-password", json={
        "token": "invalid",
        "new_password": "123456"
    })
    assert res.status_code == 400

@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_login_and_me():
    email = "fulltest@example.com"
    password = "test123"

    client.post("/auth/register", json={
        "email": email,
        "password": password
    })

    res = client.post("/auth/login", json={
        "email": email,
        "password": password
    })

    assert res.status_code == 200
    token = res.json()["access_token"]

    res = client.get("/auth/me", headers={
        "Authorization": f"Bearer {token}"
    })

    assert res.status_code == 200




def test_chat_valid():
    res = client.post("/chat/ask", json={
        "message": "crime in Dublin theft",
        "timePeriod": LAST_12_MONTHS
    })

    assert res.status_code == 200
    assert "reply" in res.json()


def test_resolve_county_valid():
    res = client.post("/location/resolve-county", json={
        "lat": 53.35,
        "lng": -6.26
    })

    assert res.status_code in [200, 404]


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_forgot_password_valid():
    email = "reset@test.com"

    client.post("/auth/register", json={
        "email": email,
        "password": "123456"
    })

    res = client.post("/auth/forgot-password", json={
        "email": email
    })

    assert res.status_code == 200


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_reset_password_flow():
    email = "reset2@test.com"

    client.post("/auth/register", json={
        "email": email,
        "password": "123456"
    })

    client.post("/auth/forgot-password", json={"email": email})

    res = client.post("/auth/reset-password", json={
        "token": "fake",
        "new_password": "123456"
    })

    assert res.status_code == 400


def test_news_endpoint():
    res = client.get("/news/crime")
    assert res.status_code == 200



def test_stats_types():
    res = client.get("/stats/crime-types")
    assert res.status_code == 200



def test_predict_all_different_period():
    res = client.get("/predict/all?crime_type=Theft&timePeriod=Last month")
    assert res.status_code == 200


def test_root_endpoint():
    res = client.get("/")
    assert res.status_code == 200


def test_stats_trend():
    res = client.get("/stats/trend?crime_type=Theft")
    assert res.status_code == 200


def test_stats_seasonal():
    res = client.get("/stats/seasonal")
    assert res.status_code == 200



def test_predictions_latest():
    res = client.get("/predictions/latest")
    assert res.status_code in [200, 404]


# # root?
# def test_root():
#     res = client.get("/")
#     assert res.status_code == 200


