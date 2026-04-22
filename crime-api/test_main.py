from fastapi.testclient import TestClient
import os
import pytest
from main import app
import uuid
from main import load_cleaned_data
from main import extract_county_from_text, extract_crime_type_from_text
from main import load_counties_geojson
from main import get_count_by_period_for_county
from main import LAST_12_MONTHS


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


SKIP_DB_TESTS = os.getenv("CI") == "true"


def test_health(client):
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"


def test_predict_valid(client):
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
    assert "prevYearCount" in data
    assert "probabilities" in data
    assert "severityBand" in data
    assert "percentile" in data


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_login_invalid_user(client):
    res = client.post("/auth/login", json={
        "email": "fake@test.com",
        "password": "wrongpass"
    })
    assert res.status_code == 401


def test_filters_invalid(client):
    res = client.post("/filters/apply", json={
        "crimeType": "",
        "timePeriod": LAST_12_MONTHS,
        "locationQuery": "Dublin"
    })
    assert res.status_code == 400


def test_load_data():
    df = load_cleaned_data()
    assert not df.empty
    assert "county" in df.columns


def test_crime_count():
    result = get_count_by_period_for_county("Dublin", "Theft", LAST_12_MONTHS)
    assert result is not None
    assert isinstance(result, int)


def test_extract_county():
    assert extract_county_from_text("crime in Dublin") == "Dublin"


def test_extract_crime():
    assert extract_crime_type_from_text("fraud cases rising") == "Fraud"


def test_predict_all(client):
    res = client.get("/predict/all?crime_type=Theft")
    assert res.status_code == 200

    data = res.json()
    assert data["ok"] is True
    assert "items" in data
    assert isinstance(data["items"], list)

    if data["items"]:
        first = data["items"][0]
        assert "county" in first
        assert "riskLabel" in first
        assert "latestCrimeCount" in first


def test_admin_requires_auth(client):
    res = client.post("/admin/upload-csv")
    assert res.status_code == 401


def test_admin_wrong_file_type(client):
    from io import BytesIO

    res = client.post(
        "/admin/upload-csv",
        files={"file": ("test.txt", BytesIO(b"data"), "text/plain")}
    )

    assert res.status_code in [401, 400]


def test_load_geojson():
    data = load_counties_geojson()
    assert "features" in data


def test_resolve_county_invalid(client):
    res = client.post("/location/resolve-county", json={
        "lat": 0,
        "lng": 0
    })
    assert res.status_code == 404


def test_chat_empty_message(client):
    res = client.post("/chat/ask", json={
        "message": ""
    })
    assert res.status_code == 400


def test_chat_invalid_county(client):
    res = client.post("/chat/ask", json={
        "message": "crime on mars"
    })
    assert res.status_code == 200


def test_forgot_password_invalid(client):
    res = client.post("/auth/forgot-password", json={
        "email": ""
    })
    assert res.status_code == 400


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_db_endpoint(client):
    res = client.get("/test-db")
    assert "ok" in res.json()


def test_predict_empty_values(client):
    res = client.post("/predict", json={
        "county": "",
        "crime_type": "",
        "timePeriod": LAST_12_MONTHS
    })
    assert res.status_code == 400


def test_predict_missing_fields(client):
    res = client.post("/predict", json={
        "county": "",
        "crime_type": ""
    })
    assert res.status_code == 422


def test_predict_all_invalid(client):
    res = client.get("/predict/all?crime_type=INVALID")
    assert res.status_code == 404


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_register_duplicate(client):
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


def test_auth_me_no_token(client):
    res = client.get("/auth/me")
    assert res.status_code == 401


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_reset_password_invalid(client):
    res = client.post("/auth/reset-password", json={
        "token": "invalid",
        "new_password": "123456"
    })
    assert res.status_code == 400


import uuid

@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_login_and_me(client):
    email = f"test_{uuid.uuid4().hex}@example.com"
    password = "test123"

    register_res = client.post("/auth/register", json={
        "email": email,
        "password": password
    })
    assert register_res.status_code == 200

    res = client.post("/auth/login", json={
        "email": email,
        "password": password
    })

    assert res.status_code == 200, res.text
    token = res.json()["access_token"]

    me_res = client.get("/auth/me", headers={
        "Authorization": f"Bearer {token}"
    })

    assert me_res.status_code == 200
    

def test_chat_valid(client):
    res = client.post("/chat/ask", json={
        "message": "crime in Dublin theft",
        "timePeriod": LAST_12_MONTHS
    })

    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "reply" in data
    assert isinstance(data["reply"], str)
    assert len(data["reply"]) > 0


def test_resolve_county_valid(client):
    res = client.post("/location/resolve-county", json={
        "lat": 53.35,
        "lng": -6.26
    })

    assert res.status_code in [200, 404]


@pytest.mark.skipif(SKIP_DB_TESTS, reason="Skipping DB-dependent test in CI")
def test_forgot_password_valid(client):
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
def test_reset_password_flow(client):
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


def test_news_endpoint(client):
    res = client.get("/news/crime")
    assert res.status_code == 200


def test_stats_types(client):
    res = client.get("/stats/crime-types")
    assert res.status_code == 200


def test_predict_all_different_period(client):
    res = client.get("/predict/all?crime_type=Theft&timePeriod=Last 3 months")
    assert res.status_code == 200

    data = res.json()
    assert data["ok"] is True
    assert data["timePeriod"] == "Last 3 months"
    assert "items" in data


def test_root_endpoint(client):
    res = client.get("/")
    assert res.status_code == 200


def test_stats_trend(client):
    res = client.get("/stats/trend?crime_type=Theft")
    assert res.status_code == 200


def test_stats_seasonal(client):
    res = client.get("/stats/seasonal")
    assert res.status_code == 200


def test_predictions_latest(client):
    res = client.get("/predictions/latest")
    assert res.status_code in [200, 404]