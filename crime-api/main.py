from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from passlib.context import CryptContext
from fastapi import UploadFile, File, Depends, Header
from datetime import datetime, timedelta, UTC
from services.news_service import fetch_crime_news, is_cache_fresh
from stats_service import crime_type_totals, crime_trend, seasonal_pattern
import pandas as pd
import ollama
from database import get_connection
from jose import jwt, JWTError
import os
import joblib
import json
from shapely.geometry import shape, Point
import secrets
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
load_dotenv()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

LAST_12_MONTHS = "Last 12 months"
USER_NOT_FOUND = "User not found"
DRUG_OFFENCES = "Drug Offences"
DAMAGE_TO_PROPERTY = "Damage to Property"


CLEANED_CSV_PATH = os.path.join(BASE_DIR, "data", "cleaned_crime_data.csv")
COUNTIES_GEOJSON_PATH = os.path.join(BASE_DIR, "data", "ireland_counties.geojson")

MODEL_PATH = os.path.join(BASE_DIR, "crime_risk_model.pkl")
COUNTY_ENCODER_PATH = os.path.join(BASE_DIR, "county_encoder.pkl")
CRIME_ENCODER_PATH = os.path.join(BASE_DIR, "crime_encoder.pkl")
PREDICTIONS_PATH = os.path.join(BASE_DIR, "data", "predictions", "latest.json")

model = None
county_encoder = None
crime_encoder = None


def load_prediction_artifacts():
    global model, county_encoder, crime_encoder

    model = joblib.load(MODEL_PATH)
    county_encoder = joblib.load(COUNTY_ENCODER_PATH)
    crime_encoder = joblib.load(CRIME_ENCODER_PATH)


# tests
def load_cleaned_data():
    df = pd.read_csv(CLEANED_CSV_PATH)

    df["Quarter"] = df["Quarter"].astype(str).str.strip()
    df["county"] = df["county"].astype(str).str.strip()
    df["crime_type"] = df["crime_type"].astype(str).str.strip()
    df["crime_count"] = pd.to_numeric(df["crime_count"], errors="coerce").fillna(0)

    return df



def predict_risk_with_model(county: str, crime_type: str, year: int):
    if model is None or county_encoder is None or crime_encoder is None:
        raise HTTPException(status_code=500, detail="Prediction model is not loaded")

    try:
        county_enc = int(county_encoder.transform([county])[0])
    except Exception:
        raise HTTPException(status_code=400, detail=f"Unknown county: {county}")

    try:
        crime_enc = int(crime_encoder.transform([crime_type])[0])
    except Exception:
        raise HTTPException(status_code=400, detail=f"Unknown crime type: {crime_type}")

    prev_year_count = get_previous_year_count(county, crime_type, year)

    X = pd.DataFrame([{
        "county_enc": county_enc,
        "crime_enc": crime_enc,
        "prev_year_count": prev_year_count,
        "year": year,
    }])

    pred_class = int(model.predict(X)[0])

    probabilities = None
    ml_score = None

    if hasattr(model, "predict_proba"):
        probs = model.predict_proba(X)[0]
        probabilities = {
            "Low": round(float(probs[0]), 4),
            "Medium": round(float(probs[1]), 4),
            "High": round(float(probs[2]), 4),
        }
        ml_score = float(probs[1] + 2 * probs[2])
    else:
        ml_score = float(pred_class)

    label_map = {0: "Low", 1: "Medium", 2: "High"}
    raw_risk_label = label_map.get(pred_class, "Low")

    return {
        "riskLabel": raw_risk_label,
        "prev_year_count": prev_year_count,
        "probabilities": probabilities,
        "mlScore": round(ml_score, 6),
    }



def get_risk_from_count(crime_type: str, count: int):
    crime = (crime_type or "").strip().lower()

    thresholds = {
        "theft": {"medium": 250, "high": 1000},
        "assault": {"medium": 120, "high": 300},
        "fraud": {"medium": 80, "high": 200},
        "burglary": {"medium": 70, "high": 180},
        DRUG_OFFENCES.lower(): {"medium": 90, "high": 220},
        DAMAGE_TO_PROPERTY.lower(): {"medium": 120, "high": 350},
    }

    rule = thresholds.get(crime, {"medium": 100, "high": 250})

    if count >= rule["high"]:
        return "High"
    elif count >= rule["medium"]:
        return "Medium"
    else:
        return "Low"





# reset passwords
def send_reset_email(to_email: str, token: str):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASS")
    reset_base_url = os.getenv("RESET_BASE_URL", "http://localhost:5173/reset-password")

    if not smtp_host or not smtp_user or not smtp_pass:
        raise Exception("SMTP settings are missing")

    reset_link = f"{reset_base_url}?token={token}"

    subject = "CrimeMap Password Reset"
    body = f"""
Hi,

A password reset was requested for your CrimeMap account.

Use this link to reset your password:
{reset_link}

If you did not request this, ignore this email.

This link expires in 30 minutes!
""".strip()

    msg = MIMEMultipart()
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    server = smtplib.SMTP(smtp_host, smtp_port)
    server.starttls()
    server.login(smtp_user, smtp_pass)
    server.sendmail(smtp_user, to_email, msg.as_string())
    server.quit()

SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise ValueError("SECRET_KEY not set")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60


app = FastAPI(title="Crime API (Prototype)")


def init_db():
    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            name TEXT,
            favorite_crime_type TEXT,
            preferred_county TEXT,
            reset_token TEXT,
            reset_token_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        conn.commit()

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()

FRONTEND_URL = os.getenv("FRONTEND_URL")
STAGING_FRONTEND_URL = os.getenv("STAGING_FRONTEND_URL")

allowed_origins = [
    "http://localhost:5173",
    "http://localhost:5174",
]

if FRONTEND_URL:
    allowed_origins.append(FRONTEND_URL)

if STAGING_FRONTEND_URL:
    allowed_origins.append(STAGING_FRONTEND_URL)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    load_prediction_artifacts()



@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


ADMINS = {"darinayg@gmail.com"}


def get_current_user(authorization: str | None = Header(default=None)):

    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.split(" ", 1)[1]

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        email = payload.get("sub")

        if not email:
            raise HTTPException(status_code=401, detail="Invalid token")

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT email FROM users WHERE email = %s", (email,))
        existing = cur.fetchone()

        if not existing:
            raise HTTPException(status_code=401, detail=USER_NOT_FOUND)

        return {"email": existing["email"]}

    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


def classify_score_into_three_bands(score: float, all_scores: list[float]):
    if not all_scores:
        return "Medium"

    s = pd.Series(all_scores, dtype=float)

    q1 = s.quantile(1 / 3)
    q2 = s.quantile(2 / 3)

    if score <= q1:
        return "Low"
    elif score <= q2:
        return "Medium"
    else:
        return "High"





def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)




# endpoint for admin panel
@app.post("/admin/upload-csv")  #will be csv for now, but !!!! check before last subbmition, maybe better uproach to upload doc files adn so on
def upload_csv(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
):
    if user["email"] not in ADMINS:
        raise HTTPException(403, "Admin`s only")

    if not file.filename.endswith(".csv"):
        raise HTTPException(400, "CSV files only!!!")

    timestamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    path = os.path.join(BASE_DIR, "data", "raw", f"crime_{timestamp}.csv")

    contents = file.file.read()

    with open(path, "wb") as f:
        f.write(contents)

    # validation
    try:
        df = pd.read_csv(path)

        required_columns = ["Quarter", "county", "crime_type", "crime_count"]

        for col in required_columns:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing column: {col}")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid CSV: {str(e)}")



    return {
        "status": "uploaded_only",
        "file": path,
        "rows": len(df),
        "message": "CSV uploaded successfully. Active dataset was not changed."
    }


# trend endpoint

@app.get("/stats/crime-types")
def stats_crime_types():
    return crime_type_totals()


@app.get("/stats/trend")
def stats_trend(crime_type: str = None):
    return crime_trend(crime_type)


@app.get("/stats/seasonal")
def stats_seasonal():
    return seasonal_pattern()


# endpoint predisction

@app.get("/predictions/latest")
def latest_predictions():
    try:
        with open(PREDICTIONS_PATH, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        raise HTTPException(404, "No predictions found")


@app.get("/")
def root():
    return {"status": "ok", "message": "Crime API running. Visit /docs"}


@app.get("/health")
def health():
    return {"status": "ok", "service": "crime-api"}

# prediction endpoint
@app.get("/api/crime-points")
def crime_points():
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": { "risk": "high" },
                "geometry": {
                    "type": "Point",
                    "coordinates": [-6.26, 53.35]
                }
            }
        ]
    }
# geojson up there. Do not delete it

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None
    favorite_crime_type: str | None = None
    preferred_county: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str



class UpdateProfileRequest(BaseModel):
    name: str | None = None
    favorite_crime_type: str | None = None
    preferred_county: str | None = None


class FilterRequest(BaseModel):
    crimeType: str
    timePeriod: str
    locationQuery: str | None = None
    useMyLocation: bool = False


class ChatRequest(BaseModel):
    message: str
    crimeType: str | None = None
    timePeriod: str | None = None
    locationQuery: str | None = None


class ReverseCountyRequest(BaseModel):
    lat: float
    lng: float


# forgot password

class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str







# chat helper here 

COUNTIES = [
    "Dublin", "Cork", "Galway", "Limerick", "Waterford", "Wexford",
    "Clare", "Mayo", "Donegal", "Kerry", "Meath", "Kildare",
    "Kilkenny", "Tipperary", "Laois", "Offaly", "Westmeath",
    "Longford", "Leitrim", "Sligo", "Roscommon", "Cavan",
    "Monaghan", "Carlow", "Wicklow", "Louth"
]

CRIME_TYPES = [
    "Theft",
    "Assault",
    "Fraud",
    "Burglary",
    DRUG_OFFENCES,
    DAMAGE_TO_PROPERTY
]

DEFAULT_CHAT_CRIMES = [
    "Theft",
    "Assault",
    "Burglary",
    DAMAGE_TO_PROPERTY
]


def normalize_text(s: str) -> str:
    return (s or "").strip().lower()


def extract_county_from_text(text: str) -> str | None:
    q = normalize_text(text)

    for county in COUNTIES:
        if county.lower() in q:
            return county

    return None


def extract_crime_type_from_text(text: str) -> str | None:
    q = normalize_text(text)

    aliases = {
        "theft": "Theft",
        "stealing": "Theft",
        "stolen": "Theft",
        "assault": "Assault",
        "fraud": "Fraud",
        "scam": "Fraud",
        "burglary": "Burglary",
        "drugs": DRUG_OFFENCES,
        "drug": DRUG_OFFENCES,
        DRUG_OFFENCES.lower(): DRUG_OFFENCES,
        "damage": DAMAGE_TO_PROPERTY,
        "damage to property": DAMAGE_TO_PROPERTY,
        DAMAGE_TO_PROPERTY.lower(): DAMAGE_TO_PROPERTY,
        "criminal damage": DAMAGE_TO_PROPERTY,
        "property damage": DAMAGE_TO_PROPERTY,
    }

    for key, value in aliases.items():
        if key in q:
            return value

    return None


def resolve_county_from_chat(req: ChatRequest) -> str | None:
    county_from_message = extract_county_from_text(req.message)
    if county_from_message:
        return county_from_message

    fallback = (req.locationQuery or "").strip()

    if fallback == "CURRENT_LOCATION":
        return None

    if fallback:
        for county in COUNTIES:
            if county.lower() == fallback.lower():
                return county

    return None


def resolve_crime_type_from_chat(req: ChatRequest) -> str | None:
    crime_from_message = extract_crime_type_from_text(req.message)
    if crime_from_message:
        return crime_from_message

    fallback = (req.crimeType or "").strip()
    if fallback in CRIME_TYPES:
        return fallback

    return None


def get_prediction_for_chat(county: str, crime_type: str, time_period: str):
    latest_count = get_count_by_period_for_county(county, crime_type, time_period)

    if latest_count is None:
        return None

    target_year = datetime.now().year
    single_result = predict_risk_with_model(county, crime_type, target_year)

    df = load_cleaned_data()
    matching = df[df["crime_type"].str.lower() == crime_type.lower()].copy()
    counties = sorted(matching["county"].dropna().unique())

    all_scores = []
    for c in counties:
        try:
            result = predict_risk_with_model(c, crime_type, target_year)
            all_scores.append(result["mlScore"])
        except Exception:
            continue

    final_label = classify_score_into_three_bands(single_result["mlScore"], all_scores)

    return {
        "county": county,
        "crime_type": crime_type,
        "latestCrimeCount": latest_count,
        "riskLabel": final_label,
    }


def build_chat_summary(question: str, county: str, predictions: list[dict], time_period: str) -> str:
    lines = [
        f"User question: {question}",
        f"County: {county}",
        f"Time period: {time_period}",
        "Prediction data:",
    ]

    for p in predictions:
        lines.append(
            f"- {p['crime_type']}: {p['riskLabel']} risk (recent historical count: {p['latestCrimeCount']})"
        )

    return "\n".join(lines)



def get_previous_year_count(county: str, crime_type: str, year: int):
    df = load_cleaned_data()

    previous_year = year - 1

    filtered = df[
        (df["county"].str.lower() == county.lower()) &
        (df["crime_type"].str.lower() == crime_type.lower()) &
        (df["year"] == previous_year)
    ].copy()

    if filtered.empty:
        return 0

    return int(filtered["crime_count"].mean())

def load_counties_geojson():
    with open(COUNTIES_GEOJSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def get_county_name_from_feature(feature):
    props = feature.get("properties", {})
    return (
        props.get("NAME_TAG")
        or props.get("NAME_EN")
        or props.get("ENGLISH")
        or props.get("NAME")
        or props.get("name")
        or props.get("COUNTY")
        or ""
    )






#  news

@app.get("/news/crime")
def get_crime_news(force_refresh: bool = False):
    items = fetch_crime_news(force_refresh=force_refresh, limit=10)
    return {
        "ok": True,
        "count": len(items),
        "cached": is_cache_fresh() and not force_refresh,
        "items": items,
    }


@app.post("/auth/register")
def register(req: RegisterRequest):

    email = req.email.strip().lower()

    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("SELECT id FROM users WHERE email = %s", (email,))
        existing = cur.fetchone()

        if existing:
            raise HTTPException(status_code=409, detail="User already exists")

        cur.execute(
            """
            INSERT INTO users (email, password_hash, name, favorite_crime_type, preferred_county)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, email
            """,
            (
                email,
                pwd_context.hash(req.password),
                (req.name or "").strip(),
                (req.favorite_crime_type or "").strip(),
                (req.preferred_county or "").strip(),
            ),
        )

        created = cur.fetchone()
        conn.commit()

        return {
            "status": "registered",
            "user_id": created["id"],
            "email": created["email"],
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Register failed: {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()




@app.post("/auth/login")
def login(req: LoginRequest):
    email = req.email.strip().lower()

    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, email, name, password_hash, favorite_crime_type, preferred_county
            FROM users
            WHERE email = %s
            """,
            (email,),
        )
        user = cur.fetchone()

        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        if not pwd_context.verify(req.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        access_token = create_access_token({"sub": email})

        return {
            "id": user["id"],
            "access_token": access_token,
            "token_type": "bearer",
            "email": user["email"],
            "name": user.get("name", ""),
            "favorite_crime_type": user.get("favorite_crime_type", ""),
            "preferred_county": user.get("preferred_county", ""),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()




@app.get("/auth/me")
def get_my_profile(user=Depends(get_current_user)):
    email = user["email"]

    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, email, name, favorite_crime_type, preferred_county, created_at
            FROM users
            WHERE email = %s
            """,
            (email,),
        )

        found_user = cur.fetchone()

        if not found_user:
            raise HTTPException(status_code=404, detail=USER_NOT_FOUND)

        return {
            "id": found_user["id"],
            "email": found_user["email"],
            "name": found_user["name"],
            "favorite_crime_type": found_user["favorite_crime_type"],
            "preferred_county": found_user["preferred_county"],
            "created_at": str(found_user["created_at"]) if found_user["created_at"] else None,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Load profile failed: {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()








@app.put("/auth/profile")
def update_profile(req: UpdateProfileRequest, user=Depends(get_current_user)):
    email = user["email"]

    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            UPDATE users
            SET name = %s,
                favorite_crime_type = %s,
                preferred_county = %s
            WHERE email = %s
            RETURNING email, name, favorite_crime_type, preferred_county
            """,
            (
                (req.name or "").strip(),
                (req.favorite_crime_type or "").strip(),
                (req.preferred_county or "").strip(),
                email,
            ),
        )

        updated = cur.fetchone()

        if not updated:
            raise HTTPException(status_code=404, detail=USER_NOT_FOUND)

        conn.commit()

        return {
            "status": "updated",
            "email": updated["email"],
            "name": updated["name"],
            "favorite_crime_type": updated["favorite_crime_type"],
            "preferred_county": updated["preferred_county"],
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Profile update failed: {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()





@app.post("/auth/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    email = (req.email or "").strip().lower()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            "SELECT id, email FROM users WHERE email = %s",
            (email,)
        )
        user = cur.fetchone()

        # mesasage same here
        success_message = "If an account with that email exists, a password reset email has been sent."

        if not user:
            return {
                "ok": True,
                "message": success_message
            }

        token = secrets.token_urlsafe(32)
        expires_at = datetime.now(UTC) + timedelta(minutes=30)

        cur.execute(
            """
            UPDATE users
            SET reset_token = %s,
                reset_token_expires = %s
            WHERE email = %s
            """,
            (token, expires_at, email),
        )

        conn.commit()

        send_reset_email(email, token)

        return {
            "ok": True,
            "message": success_message
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Forgot password failed: {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()


@app.post("/auth/reset-password")
def reset_password(req: ResetPasswordRequest):
    token = (req.token or "").strip()
    new_password = req.new_password or ""

    if not token:
        raise HTTPException(status_code=400, detail="Reset token is required")

    if not new_password:
        raise HTTPException(status_code=400, detail="New password is required")

    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")

    conn = None
    cur = None

    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute(
            """
            SELECT id, email, reset_token_expires
            FROM users
            WHERE reset_token = %s
            """,
            (token,),
        )
        user = cur.fetchone()

        if not user:
            raise HTTPException(status_code=400, detail="Invalid reset token")

        expires_at = user["reset_token_expires"]

        if not expires_at or expires_at < datetime.now(UTC):
            raise HTTPException(status_code=400, detail="Reset token has expired")

        new_hash = pwd_context.hash(new_password)

        cur.execute(
            """
            UPDATE users
            SET password_hash = %s,
                reset_token = NULL,
                reset_token_expires = NULL
            WHERE id = %s
            """,
            (new_hash, user["id"]),
        )

        conn.commit()

        return {
            "ok": True,
            "message": "Password has been reset successfully."
        }

    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        raise HTTPException(status_code=500, detail=f"Reset password failed: {str(e)}")
    finally:
        if cur:
            cur.close()
        if conn:
            conn.close()




@app.post("/filters/apply")
def apply_filters(req: FilterRequest):
    county = (req.locationQuery or "").strip()

    if req.useMyLocation:
        raise HTTPException(status_code=400, detail="Use the resolved county flow for current location")

    if not county:
        raise HTTPException(status_code=400, detail="County is required")

    if not req.crimeType:
        raise HTTPException(status_code=400, detail="Pick a crime type")

    count = get_count_by_period_for_county(county, req.crimeType, req.timePeriod)

    if count is None:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for county '{county}' and crime type '{req.crimeType}'"
        )

    target_year = datetime.now().year
    model_result = predict_risk_with_model(county, req.crimeType, target_year)

    df = load_cleaned_data()
    matching = df[df["crime_type"].str.lower() == req.crimeType.lower()].copy()
    counties = sorted(matching["county"].dropna().unique())

    all_scores = []
    for c in counties:
        try:
            result = predict_risk_with_model(c, req.crimeType, target_year)
            all_scores.append(result["mlScore"])
        except Exception:
            continue

    final_label = classify_score_into_three_bands(
        model_result["mlScore"],
        all_scores
    )

    return {
        "applied": True,
        "filters": req.model_dump(),
        "result": {
            "riskLevel": final_label,
            "latestCrimeCount": count,
            "prevYearCount": model_result["prev_year_count"],
            "probabilities": model_result["probabilities"],
            "summary": f"ML risk prediction for {req.crimeType} in {county}",
        },
    }



# chat
def format_single_prediction_answer(prediction: dict, time_period: str) -> str:
    county = prediction["county"]
    crime_type = prediction["crime_type"]
    risk = prediction["riskLabel"]
    count = prediction["latestCrimeCount"]

    return (
        f"{crime_type} risk in {county} is {risk.lower()} "
        f"based on {count} recorded incidents in the {time_period.lower()} period."
    )


def format_multi_prediction_answer(county: str, predictions: list[dict], time_period: str) -> str:
    ordered = sorted(
        predictions,
        key=lambda p: {"High": 3, "Medium": 2, "Low": 1}.get(p["riskLabel"], 0),
        reverse=True,
    )

    top = ordered[:3]

    parts = [
        f'{p["crime_type"]} is {p["riskLabel"].lower()} ({p["latestCrimeCount"]})'
        for p in top
    ]

    joined = "; ".join(parts)

    return (
        f"Crime risk in {county} varies by type in the {time_period.lower()} period. "
        f"Highest relevant results: {joined}."
    )







@app.post("/chat/ask")
def chat_ask(req: ChatRequest):
    user_message = (req.message or "").strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="Message is required")

    county = resolve_county_from_chat(req)
    time_period = (req.timePeriod or LAST_12_MONTHS).strip()
    requested_crime = resolve_crime_type_from_chat(req)

    if not county:
        return {
            "ok": True,
            "reply": "Please ask about a valid county, for example Dublin, Cork, or Galway.",
            "contextUsed": {
                "crimeType": req.crimeType,
                "timePeriod": req.timePeriod,
                "locationQuery": req.locationQuery,
                "resolvedCounty": None,
                "resolvedCrimeType": requested_crime,
            },
        }

    predictions = []

    if requested_crime:
        result = get_prediction_for_chat(county, requested_crime, time_period)
        if result:
            predictions.append(result)
    else:
        for crime in DEFAULT_CHAT_CRIMES:
            result = get_prediction_for_chat(county, crime, time_period)
            if result:
                predictions.append(result)

    if not predictions:
        if requested_crime:
            factual_reply = (
                f"No prediction data was found for {requested_crime} in {county} "
                f"in the {time_period.lower()} period."
            )
        else:
            factual_reply = (
                f"No prediction data was found for {county} "
                f"in the {time_period.lower()} period."
            )

        return {
            "ok": True,
            "reply": factual_reply,
            "contextUsed": {
                "crimeType": req.crimeType,
                "timePeriod": req.timePeriod,
                "locationQuery": req.locationQuery,
                "resolvedCounty": county,
                "resolvedCrimeType": requested_crime,
            },
        }

    if len(predictions) == 1:
        factual_reply = format_single_prediction_answer(predictions[0], time_period)
    else:
        factual_reply = format_multi_prediction_answer(county, predictions, time_period)

    rewrite_prompt = f"""
You are rewriting a crime risk summary for a student software project.

Rules:
- Rewrite the text naturally in 1 or 2 short sentences only.
- Keep exactly the same facts.
- Do not add advice.
- Do not add warnings.
- Do not add new numbers.
- Do not change the county, crime type, risk level, or counts.
- Do not use phrases like "based on our analysis", "I recommend", "be cautious", or "take precautions".
- If the text is already clear, keep it very close to the original.

Text to rewrite:
{factual_reply}
"""

    try:
        response = ollama.chat(
            model="llama3.1:8b",
            messages=[
                {"role": "user", "content": rewrite_prompt}
            ]
        )

        rewritten = response["message"]["content"].strip()

        if not rewritten:
            rewritten = factual_reply

        return {
            "ok": True,
            "reply": rewritten,
            "contextUsed": {
                "crimeType": req.crimeType,
                "timePeriod": req.timePeriod,
                "locationQuery": req.locationQuery,
                "resolvedCounty": county,
                "resolvedCrimeType": requested_crime,
                "predictions": predictions,
                "factualReply": factual_reply,
            },
        }

    except Exception:
        return {
            "ok": True,
            "reply": factual_reply,
            "contextUsed": {
                "crimeType": req.crimeType,
                "timePeriod": req.timePeriod,
                "locationQuery": req.locationQuery,
                "resolvedCounty": county,
                "resolvedCrimeType": requested_crime,
                "predictions": predictions,
                "factualReply": factual_reply,
                "fallback": "Used deterministic factual reply because Ollama rewrite failed.",
            },
        }



@app.post("/location/resolve-county")
def resolve_county(req: ReverseCountyRequest):
    geojson = load_counties_geojson()
    point = Point(req.lng, req.lat)

    excluded = {"Antrim", "Armagh", "Down", "Fermanagh", "Tyrone", "Londonderry"}

    for feature in geojson.get("features", []):
        county_name = get_county_name_from_feature(feature)

        if county_name in excluded:
            continue

        geom = shape(feature["geometry"])

        if geom.contains(point) or geom.intersects(point):
            return {
                "ok": True,
                "county": county_name,
            }

    raise HTTPException(status_code=404, detail="Could not resolve county from current location")





class PredictRequest(BaseModel):
    county: str
    crime_type: str
    timePeriod: str
    prev_year_count: int | None = None
    year: int | None = None


@app.post("/predict")
def predict(req: PredictRequest):
    county = (req.county or "").strip()
    crime_type = (req.crime_type or "").strip()

    if not county:
        raise HTTPException(status_code=400, detail="County is required")

    if not crime_type:
        raise HTTPException(status_code=400, detail="Crime type is required")

    target_year = req.year or datetime.now().year
    latest_count = get_count_by_period_for_county(county, crime_type, req.timePeriod)

    if latest_count is None:
        raise HTTPException(
            status_code=404,
            detail=f"No data found for county '{county}' and crime type '{crime_type}'"
        )

    single_result = predict_risk_with_model(county, crime_type, target_year)

    df = load_cleaned_data()
    matching = df[df["crime_type"].str.lower() == crime_type.lower()].copy()
    counties = sorted(matching["county"].dropna().unique())

    all_scores = []
    for c in counties:
        try:
            result = predict_risk_with_model(c, crime_type, target_year)
            all_scores.append(result["mlScore"])
        except Exception:
            continue

    final_label = classify_score_into_three_bands(single_result["mlScore"], all_scores)
    percentile, severity_band = get_percentile_for_crime_type(crime_type, latest_count)
    
    return {
        "ok": True,
        "county": county,
        "crime_type": crime_type,
        "timePeriod": req.timePeriod,
        "latestCrimeCount": latest_count,
        "riskLabel": final_label,
        "prevYearCount": single_result["prev_year_count"],
        "probabilities": single_result["probabilities"],
        "mlScore": single_result["mlScore"],
        "percentile": percentile,
        "severityBand": severity_band,
        "note": "Risk label is based on the model score ranked across counties for the selected crime type."
    }


@app.get("/predict/all")
def predict_all(crime_type: str = "Theft", timePeriod: str = LAST_12_MONTHS):
    crime = (crime_type or "").strip()
    target_year = datetime.now().year

    df = load_cleaned_data()
    matching = df[df["crime_type"].str.lower() == crime.lower()].copy()

    if matching.empty:
        raise HTTPException(status_code=404, detail=f"No data found for crime type: {crime}")

    counties = sorted(matching["county"].dropna().unique())

    temp_items = []

    for county in counties:
        count = get_count_by_period_for_county(county, crime, timePeriod)
        if count is None:
            continue

        model_result = predict_risk_with_model(county, crime, target_year)

        temp_items.append({
            "county": county,
            "latestCrimeCount": count,
            "prevYearCount": model_result["prev_year_count"],
            "probabilities": model_result["probabilities"],
            "mlScore": model_result["mlScore"],
        })

    all_scores = [item["mlScore"] for item in temp_items]

    items = []
    for item in temp_items:
        final_label = classify_score_into_three_bands(item["mlScore"], all_scores)

        items.append({
            "county": item["county"],
            "riskLabel": final_label,
            "latestCrimeCount": item["latestCrimeCount"],
            "prevYearCount": item["prevYearCount"],
            "probabilities": item["probabilities"],
            "mlScore": item["mlScore"],
        })

    return {
        "ok": True,
        "crimeType": crime,
        "timePeriod": timePeriod,
        "items": items,
    }


def get_percentile_for_crime_type(crime_type: str, count: int):
    df = load_cleaned_data()

    filtered = df[
        df["crime_type"].str.lower() == crime_type.lower()
    ].copy()

    if filtered.empty:
        return None, "Unknown"

    values = filtered["crime_count"].dropna().astype(float)

    if len(values) == 0:
        return None, "Unknown"

    percentile = round(float((values <= count).mean() * 100), 1)

    if percentile >= 95:
        severity_band = "Very High"
    elif percentile >= 66:
        severity_band = "High"
    elif percentile >= 33:
        severity_band = "Medium"
    else:
        severity_band = "Low"

    return percentile, severity_band






def get_count_by_period_for_county(county: str, crime_type: str, time_period: str):
    df = load_cleaned_data()

    filtered = df[
        (df["county"].str.lower() == county.lower()) &
        (df["crime_type"].str.lower() == crime_type.lower())
    ].copy()

    if filtered.empty:
        return None

    filtered = filtered.sort_values("Quarter")

    if time_period == "Last 12 months":
        recent = filtered.tail(4)
    elif time_period == "Last 6 months":
        recent = filtered.tail(2)
    elif time_period == "Last 3 months":
        recent = filtered.tail(1)
    else:
        recent = filtered.tail(1)

    return int(recent["crime_count"].sum())


@app.get("/test-db")
def test_db():
    try:
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1;")
        result = cur.fetchone()
        cur.close()
        conn.close()
        return {"ok": True, "result": result}
    except Exception as e:
        return {"ok": False, "error": str(e)}