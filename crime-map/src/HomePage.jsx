// src/HomePage.jsx
import { useEffect, useState } from "react";
import MapView from "./MapView";
import CrimeChart from "./CrimeChart";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

const LAST_12_MONTHS = "Last 12 months";
const DRUG_OFFENCES = "Drug Offences";
const DAMAGE_TO_PROPERTY = "Damage to Property";

const crimeTypes = [
  "Theft",
  "Assault",
  "Fraud",
  "Burglary",
  DRUG_OFFENCES,
  DAMAGE_TO_PROPERTY
];
const timePeriods = ["Last 3 months", "Last 6 months", LAST_12_MONTHS];

export default function HomePage({ user, onLogout }) {
  const [crimeType, setCrimeType] = useState("Theft");
  const [timePeriod, setTimePeriod] = useState(LAST_12_MONTHS);
  const [locationQuery, setLocationQuery] = useState("");
  const [useMyLocation, setUseMyLocation] = useState(false);

  const [riskLevel, setRiskLevel] = useState(null);
  const [apiMsg, setApiMsg] = useState("");

  const [newsItems, setNewsItems] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");

  const [seenNewsLinks, setSeenNewsLinks] = useState(() => {
  const saved = localStorage.getItem("seenCrimeNewsLinks");
  return saved ? JSON.parse(saved) : [];
  });

  //chat +
  const [lastChatContext, setLastChatContext] = useState(null);


  // click on county
  const [selectedCountyDetails, setSelectedCountyDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");

  const [mapPos, setMapPos] = useState({ lng: -6.2603, lat: 53.3498, zoom: 11.2 });

  //location
  const [userCoords, setUserCoords] = useState(null);
  const [geoError, setGeoError] = useState("");

  // inside component
  const [selectedCounties, setSelectedCounties] = useState([]);
  const [resolvedCounty, setResolvedCounty] = useState("");

  //heat map all counties
  const [countyRiskMap, setCountyRiskMap] = useState({});

  // Chatbot
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState([
    {
      from: "bot",
      text:
        "Ask about county crime risk, for example: 'Is Dublin safe?', 'Is theft high in Cork?', or 'What risks are there in Galway?'",
     },
  ]);

  const favKey = `favLocation:${user?.email || "guest"}`;

  const [favorite, setFavorite] = useState(() => {
    const saved = localStorage.getItem(favKey);
    return saved ? JSON.parse(saved) : null;
  });

  const [favoriteCrimeType, setFavoriteCrimeType] = useState("");


  // mobile
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [countyRiskLoading, setCountyRiskLoading] = useState(false);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);



  const saveFavorite = async () => {
    const fav = {
      locationQuery,
      useMyLocation,
      crimeType,
      timePeriod,
    };

    setFavorite(fav);
    localStorage.setItem(favKey, JSON.stringify(fav));

    try {
      const r = await fetch(`${API_BASE}/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          name: user.name || "",
          favorite_crime_type: crimeType,
          preferred_county: locationQuery,
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data.detail || "Failed to save profile");
      }

      setFavoriteCrimeType(data.favorite_crime_type || "");
      setApiMsg("Saved favourite filters.");
    } catch (e) {
      console.error("Save profile error:", e);
      setApiMsg(`Saved locally, but backend profile update failed: ${String(e?.message || e)}`);
    }
  };

//location
  const requestCurrentLocation = () => {
    setGeoError("");

    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by this browser.");
      setUseMyLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lng: position.coords.longitude,
          lat: position.coords.latitude,
          zoom: 11.5,
        };

        setUserCoords(coords);
        setGeoError("");
      },
      (error) => {
        console.warn("Geolocation error:", error);
        setGeoError("Enable location in your browser or phone settings.");
        setUseMyLocation(false);
        setUserCoords(null);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    );
  };





  const loadFavorite = () => {
    if (!favorite) {
      setApiMsg("No favourite saved yet.");
      return;
    }

    const savedUseMyLocation = !!favorite.useMyLocation;

    setUseMyLocation(savedUseMyLocation);
    setCrimeType(favorite.crimeType || "Theft");
    setTimePeriod(favorite.timePeriod || LAST_12_MONTHS);

    if (savedUseMyLocation) {
      setLocationQuery("");
      setResolvedCounty("");
      setSelectedCounties([]);
      requestCurrentLocation();
    } else {
      setLocationQuery(favorite.locationQuery || "");
      setUserCoords(null);
    }

    setApiMsg("Favourite loaded. Click Apply to update map + prediction.");
  };




  const clearFavorite = async () => {
    setFavorite(null);
    localStorage.removeItem(favKey);

    setFavoriteCrimeType("");

    setLocationQuery("");
    setCrimeType("Theft");

    try {
      const r = await fetch(`${API_BASE}/auth/profile`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          name: user.name || "",
          favorite_crime_type: "",
          preferred_county: "",
        }),
      });

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data.detail || "Failed to clear profile");
      }

      setApiMsg("Favourite settings cleared.");
    } catch (e) {
      console.error("Clear profile error:", e);
      setApiMsg(`Cleared locally, but backend profile clear failed: ${String(e?.message || e)}`);
    }
  };




  //year big data csv
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");



  const riskColor =
    riskLevel === "High"
      ? "#d32f2f"
      : riskLevel === "Medium"
      ? "#ffb300"
      : riskLevel === "Low"
      ? "#388e3c"
      : "#666";

  const normalizeCounty = (raw) => {
    const t = (raw || "").trim();
    if (!t) return "";
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  };



  //big data csv
  const loadCrimeTrendChart = async (selectedCrimeType) => {
    setChartLoading(true);
    setChartError("");

    try {
      const query = encodeURIComponent(selectedCrimeType || "Theft");
      const r = await fetch(`${API_BASE}/stats/trend?crime_type=${query}`);
      const data = await r.json();

      if (!r.ok) throw new Error(data.detail || "Failed to load trend chart data");

      setChartData(data || []);
    } catch (e) {
      setChartError(String(e?.message || e));
    } finally {
      setChartLoading(false);
    }
  };


  const loadAllCountyRisks = async (selectedCrimeType, selectedTimePeriod) => {
    setCountyRiskLoading(true);

    try {
      const crime = encodeURIComponent(selectedCrimeType || "Theft");
      const period = encodeURIComponent(selectedTimePeriod || LAST_12_MONTHS);

      const r = await fetch(
        `${API_BASE}/predict/all?crime_type=${crime}&timePeriod=${period}`
      );

      const data = await r.json();

      if (!r.ok) {
        throw new Error(data.detail || "Failed to load county risks");
      }

      const mapped = {};

      for (const item of data.items || []) {
        mapped[item.county] = item.riskLabel;
      }

      setCountyRiskMap(mapped);
      return mapped;
    } catch (e) {
      console.error("County risk load error:", e);
      return {};
    } finally {
      setCountyRiskLoading(false);
    }
  };



  const loadCountyDetails = async (countyName) => {
    if (!countyName) return;

    setDetailsLoading(true);
    setDetailsError("");

    try {
      const predictResponse = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          county: countyName,
          crime_type: crimeType,
          timePeriod,
          prev_year_count: 0,
          year: 2023,
        }),
      });

      const predictData = await predictResponse.json();

      if (!predictResponse.ok) {
        throw new Error(predictData.detail || "Failed to load county details");
      }

      setSelectedCountyDetails({
        county: countyName,
        riskLabel: predictData.riskLabel,
        latestCrimeCount: predictData.latestCrimeCount,
        crimeType,
        timePeriod,
      });

      setRiskLevel((current) => current || predictData.riskLabel || null);
    } catch (e) {
      setSelectedCountyDetails(null);
      setDetailsError(String(e?.message || e));
    } finally {
      setDetailsLoading(false);
    }
  };



  const sendQuickQuestion = async (question) => {
    setChatInput(question);

    setMessages((prev) => [...prev, { from: "user", text: question }]);

    try {
      const r = await fetch(`${API_BASE}/chat/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          crimeType,
          timePeriod,
          locationQuery: useMyLocation ? resolvedCounty : locationQuery,
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Chat request failed");

      setMessages((prev) => [...prev, { from: "bot", text: data.reply || "No reply" }]);
      setLastChatContext(data.contextUsed || null);
      setChatInput("");
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { from: "bot", text: `Chat error: ${String(e?.message || e)}` },
      ]);
    }
  };



  //crime notifications
  const loadCrimeNews = async () => {
  setNewsLoading(true);
  setNewsError("");

  try {
      const r = await fetch(`${API_BASE}/news/crime`);
      const data = await r.json();

      if (!r.ok) throw new Error(data.detail || "Failed to load crime news");

      setNewsItems(data.items || []);
    } catch (e) {
      setNewsError(String(e?.message || e));
    } finally {
      setNewsLoading(false);
    }
  };


  useEffect(() => {
    const timer = setTimeout(() => {
      loadCrimeNews();
    }, 2000);

    return () => clearTimeout(timer);
  }, []);





  useEffect(() => {
    const loadProfile = async () => {
      if (!user?.token) return;

      try {
        const r = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            Authorization: `Bearer ${user.token}`,
          },
        });

        const data = await r.json();

        if (!r.ok) {
          throw new Error(data.detail || "Failed to load profile");
        }

        if (data.favorite_crime_type) {
          setCrimeType(data.favorite_crime_type);
          setFavoriteCrimeType(data.favorite_crime_type);
        }

        if (data.preferred_county) {
          setLocationQuery(data.preferred_county);
        }
      } catch (e) {
        console.error("Profile load error:", e);
      }
    };

    loadProfile();
  }, [user]);



  useEffect(() => {
    if (crimeType) {
      loadCrimeTrendChart(crimeType);
      loadAllCountyRisks(crimeType, timePeriod);
    } else {
      setChartData([]);
    }
  }, [crimeType, timePeriod]);



  const markNewsAsSeen = (link) => {
  if (!link) return;

  setSeenNewsLinks((prev) => {
      if (prev.includes(link)) return prev;
      const updated = [...prev, link];
      localStorage.setItem("seenCrimeNewsLinks", JSON.stringify(updated));
        return updated;
    });
  };

  const unreadNewsCount = newsItems.filter(
    (item) => item.link && !seenNewsLinks.includes(item.link)
  ).length;




  const handleApply = async () => {
    setApiMsg("");
    setRiskLevel(null);

    const raw = (locationQuery || "").trim();

    let county = "";

    if (useMyLocation) {
      if (!userCoords) {
        setApiMsg("Current location is not available yet.");
        return;
      }

      try {
        const countyResponse = await fetch(`${API_BASE}/location/resolve-county`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: userCoords.lat,
            lng: userCoords.lng,
          }),
        });

        const countyData = await countyResponse.json();

        if (!countyResponse.ok) {
          throw new Error(countyData.detail || "Could not resolve county from current location");
        }

        county = countyData.county;
        setResolvedCounty(county);
        setSelectedCounties([county]);
        setLocationQuery(county);
      } catch (e) {
        setApiMsg(String(e?.message || e));
        return;
      }
    } else {
      county = normalizeCounty(raw);

      if (!county) {
        setApiMsg("Enter a county name (e.g. Dublin, Cork) for prediction.");
        return;
      }

      setResolvedCounty(county);
      setSelectedCounties([county]);
      setLocationQuery(county);
    }

    const payload = {
      county,
      crime_type: crimeType,
      timePeriod,
      prev_year_count: 0,
      year: 2023,
    };

    try {
      const latestRiskMap = await loadAllCountyRisks(crimeType, timePeriod);
      const r = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Predict request failed");

      const mapRisk = latestRiskMap[county];

      setRiskLevel(mapRisk || data.riskLabel || "Unknown");
      setApiMsg(`Predicted risk for ${county}.`);
      console.log("Predict result:", data);
    } catch (e) {
      setApiMsg(String(e?.message || e));
    }
  };




  const handleSendMessage = async () => {
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    setMessages((prev) => [...prev, { from: "user", text: trimmed }]);
    setChatInput("");

    try {
      const r = await fetch(`${API_BASE}/chat/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          crimeType,
          timePeriod,
          locationQuery: useMyLocation ? resolvedCounty : locationQuery
        }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Chat request failed");

      setMessages((prev) => [
        ...prev,
        { from: "bot", text: data.reply || "No reply" }
      ]);

      setLastChatContext(data.contextUsed || null);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        { from: "bot", text: `Chat error: ${String(e?.message || e)}` },
      ]);
    }
  };



  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", backgroundColor: "#222" }}>
      <header style={{ padding: "12px 20px", borderBottom: "1px solid #333", backgroundColor: "#1f1f1f", color: "white" }}>
        <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              justifyContent: "space-between",
              alignItems: isMobile ? "flex-start" : "center",
              gap: isMobile ? "8px" : 0,
            }}
          >
          <h2
            style={{
              margin: 0,
              fontSize: isMobile ? "1.1rem" : "1.5rem",
              lineHeight: 1.2,
            }}
          >
            Crime Risk Analysis and Prediction Map
          </h2>
          <div style={{ fontSize: "0.9rem" }}>
            <span style={{ marginRight: 10 }}>Logged in: {user?.email}</span>
            <button data-testid="logout-button" onClick={onLogout} style={{ cursor: "pointer" }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            flex: 1,
            height: "100%",
          }}
        >
          <main
            style={{
              flex: 1,
              height: isMobile ? "320px" : "calc(100vh - 57px)",
              minHeight: isMobile ? "320px" : "auto",
            }}
          >
          <MapView
            key={isMobile ? "mobile-map" : "desktop-map"}
            isMobile={isMobile}
            riskColor={riskColor}
            lng={mapPos.lng}
            lat={mapPos.lat}
            zoom={mapPos.zoom}
            selectedCounties={selectedCounties}
            countyRiskMap={countyRiskMap}
            onCountyClick={(countyName) => {
              setResolvedCounty(countyName);
              setLocationQuery(countyName);
              setSelectedCounties([countyName]);

              const mapRisk = countyRiskMap[countyName];
              setRiskLevel(mapRisk || "Unknown");
              setApiMsg(`Predicted risk for ${countyName}.`);

              loadCountyDetails(countyName);
            }}
          />
        </main>

          <aside
            style={{
              width: isMobile ? "100%" : "300px",
              padding: "16px",
              borderLeft: isMobile ? "none" : "1px solid #ddd",
              borderTop: isMobile ? "1px solid #ddd" : "none",
              backgroundColor: "#f5f5f5",
              boxSizing: "border-box",
              flexShrink: 0,
              color: "#333",
            }}
          >
          <h3 style={{ marginTop: 0 }}>Filters</h3>

          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="crime-type" style={{ display: "block", marginBottom: "4px" }}>
              Crime type
            </label>
            <select
              id="crime-type"
              name="crimeType"
              data-testid="crime-type"
              value={crimeType}
              onChange={(e) => setCrimeType(e.target.value)}
              style={{ width: "100%" }}
            >
              {crimeTypes.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>


          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="favorite-crime-type" style={{ display: "block", marginBottom: "4px" }}>
              Favourite crime type
            </label>
            <select
              id="favorite-crime-type"
              name="favoriteCrimeType"
              data-testid="favorite-crime-type"
              value={favoriteCrimeType}
              onChange={(e) => {
                setFavoriteCrimeType(e.target.value);
                if (e.target.value) {
                  setCrimeType(e.target.value);
                }
              }}
              style={{ width: "100%" }}
            >
              <option value="">None</option>
              {crimeTypes.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="time-period" style={{ display: "block", marginBottom: "4px" }}>
              Time period
            </label>
            <select
              id="time-period"
              name="timePeriod"
              data-testid="time-period"
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value)}
              style={{ width: "100%" }}
            >
              {timePeriods.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="county-input" style={{ display: "block", marginBottom: "4px" }}>
              Enter county (e.g. Cork)
            </label>
            <input
              id="county-input"
              name="locationQuery"
              data-testid="county-input"
              type="text"
              placeholder="Use county for prediction (e.g. Cork)"
              value={locationQuery}
              onChange={(e) => setLocationQuery(e.target.value)}
              style={{ width: "100%", padding: "6px" }}
              disabled={useMyLocation}
            />
          </div>

          <div style={{ marginBottom: "12px" }}>
            <label htmlFor="use-my-location" style={{ fontSize: "0.9rem" }}>
              <input
                id="use-my-location"
                name="useMyLocation"
                data-testid="use-my-location"
                type="checkbox"
                checked={useMyLocation}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setUseMyLocation(checked);
                  setGeoError("");

                  if (checked) {
                    setLocationQuery("");
                    setResolvedCounty("");
                    setSelectedCounties([]);
                    setApiMsg("");
                    requestCurrentLocation();
                  } else {
                    setResolvedCounty("");
                    setUserCoords(null);
                  }
                }}
                style={{ marginRight: "6px" }}
              />
              Use my current location
            </label>
          </div>



          {geoError && (
            <div style={{ marginBottom: "12px", color: "#b71c1c", fontSize: "0.85rem" }}>
              {geoError}
            </div>
          )}

          <div style={{ marginBottom: "12px", display: "flex", gap: 6 }}>
            <button data-testid="save-favorite" onClick={saveFavorite} style={{ flex: 1, cursor: "pointer" }}>
              Save favourite
            </button>
            <button
              data-testid="load-favorite"
              onClick={loadFavorite}
              style={{ flex: 1, cursor: "pointer" }}
              disabled={!favorite}
              title={!favorite ? "No favourites saved yet" : "Load favourite"}
            >
              Load favourite
            </button>
          </div>

          {favorite && (
            <div style={{ fontSize: "0.85rem", color: "#555", marginBottom: "12px" }}>
              <div>
                <b>Favourite:</b>{" "}
                <>
                  {favorite.useMyLocation ? "Current location" : favorite.locationQuery?.trim() || "Ireland"}
                  {" • "}
                  {favorite.crimeType || "Theft"}
                  {" • "}
                  {favorite.timePeriod || LAST_12_MONTHS}
                </>
              </div>
              <button data-testid="clear-favorite" onClick={clearFavorite} style={{ marginTop: 6, cursor: "pointer" }}>
                Clear favourite
              </button>
            </div>
          )}

          <button
            data-testid="apply-filters"
            onClick={handleApply}
            style={{ width: "100%", marginTop: "4px", cursor: "pointer" }}
          >
            Apply filters
          </button>


          {countyRiskLoading && (
            <div style={{ marginTop: "8px", color: "#666", fontSize: "0.9rem" }}>
              Loading map data...
            </div>
          )}






          <div style={{
            marginTop: "12px",
            padding: "10px",
            border: "1px solid #ddd",
            background: "#fff",
            borderRadius: "8px",
            fontSize: "0.9rem",
          }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Prediction result: </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span>Risk level:</span>
              <span style={{ fontWeight: 700, color: riskColor }}>{riskLevel ?? "—"}</span>
            </div>

            {apiMsg && (
              <div style={{ marginTop: 6, color: apiMsg.toLowerCase().includes("fail") ? "#b71c1c" : "#333" }}>
                {apiMsg}
              </div>
            )}
          </div>


          {/* here news notifications */}
        <div
          style={{
            marginTop: "12px",
            padding: "10px",
            border: "1px solid #ddd",
            background: "#fff",
            borderRadius: "8px",
            fontSize: "0.9rem",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              Latest crimes {unreadNewsCount > 0 ? `(${unreadNewsCount} new)` : ""}
            </span>
            <button
              onClick={loadCrimeNews}
              style={{ cursor: "pointer", fontSize: "0.8rem", padding: "4px 8px" }}
            >
              Refresh
            </button>
          </div>

          {newsLoading && <div style={{ color: "#666" }}>Loading alerts...</div>}

          {newsError && <div style={{ color: "#b71c1c" }}>{newsError}</div>}

          {!newsLoading && !newsError && newsItems.length === 0 && (
            <div style={{ color: "#666" }}>No crime alerts found.</div>
          )}

          {!newsLoading && !newsError && newsItems.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: "220px", overflowY: "auto" }}>
              {newsItems.slice(0, 6).map((item, idx) => (
                <a
                  key={`${item.link}-${idx}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => markNewsAsSeen(item.link)}
                  style={{
                    textDecoration: "none",
                    color: seenNewsLinks.includes(item.link) ? "#666" : "#222",
                    borderBottom: "1px solid #eee",
                    paddingBottom: "6px",
                  }}
                >
                    <div
                      style={{
                        fontWeight: seenNewsLinks.includes(item.link) ? 500 : 700,
                        fontSize: "0.85rem",
                        marginBottom: 2,
                      }}
                    >
                      {item.title}
                    </div>

                  <div style={{ fontSize: "0.75rem", color: "#666" }}>
                    {item.source || "News source"}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>



        
          <div
            style={{
              marginTop: "12px",
              padding: "10px",
              border: "1px solid #ddd",
              background: "#fff",
              borderRadius: "8px",
              fontSize: "0.9rem",
              overflow: "hidden",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>
              {crimeType} Trend Over Time
            </div>

            {chartLoading && <div style={{ color: "#666" }}>Loading chart...</div>}

            {chartError && <div style={{ color: "#b71c1c" }}>{chartError}</div>}

            {!chartLoading && !chartError && chartData.length > 0 && (
              <CrimeChart data={chartData} />
            )}
          </div>



          <div style={{ marginTop: "16px", paddingTop: "10px", borderTop: "1px solid #ccc", fontSize: "0.9rem" }}>
            <h4 style={{ margin: "0 0 8px 0", fontSize: "0.95rem" }}>Risk level legend</h4>

            <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              <span style={{ display: "inline-block", width: 14, height: 14, backgroundColor: "#d32f2f", marginRight: 6 }} />
              <span>High risk</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
              <span style={{ display: "inline-block", width: 14, height: 14, backgroundColor: "#ffb300", marginRight: 6 }} />
              <span>Medium risk</span>
            </div>

            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ display: "inline-block", width: 14, height: 14, backgroundColor: "#388e3c", marginRight: 6 }} />
              <span>Low risk</span>
            </div>
          </div>
        </aside>
      </div>

      <div
          style={{
            position: "fixed",
            bottom: isMobile ? "10px" : "20px",
            right: isMobile ? "10px" : "20px",
            zIndex: 1000,
          }}
        >
        {chatOpen ? (
          <div
            style={{
              width: isMobile ? "92vw" : "360px",
              height: isMobile ? "60vh" : "500px",
              backgroundColor: "#ffffff",
              borderRadius: "10px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                backgroundColor: "#1f1f1f",
                color: "#fff",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: "0.9rem",
              }}
            >
              <span>AI Crime Assistant</span>
              <button
                data-testid="close-chat"
                onClick={() => setChatOpen(false)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "#fff",
                  cursor: "pointer",
                  fontSize: "1.1rem",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                padding: "6px 10px",
                borderBottom: "1px solid #ddd",
                backgroundColor: "#fafafa",
                fontSize: "0.78rem",
                color: "#444",
                lineHeight: 1.35,
              }}
            >
              <div>
                <b>County:</b>{" "}
                {useMyLocation
                  ? resolvedCounty || "Current location"
                  : locationQuery || "No county selected"}
              </div>
              <div>
                <b>Crime:</b> {crimeType}
              </div>
              <div>
                <b>Period:</b> {timePeriod}
              </div>
            </div>

            <div
              style={{
                padding: "8px",
                borderBottom: "1px solid #ddd",
                backgroundColor: "#ffffff",
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
              }}
            >
              <button
                type="button"
                data-testid="quick-question-safe"
                onClick={() =>
                  sendQuickQuestion(`Is ${locationQuery || "Dublin"} safe?`)
                }
                style={{
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                Is it safe?
              </button>

              <button
                type="button"
                data-testid="quick-question-risks"
                onClick={() =>
                  sendQuickQuestion(
                    `What risks are there in ${locationQuery || "Dublin"}?`
                  )
                }
                style={{
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                What risks?
              </button>

              <button
                type="button"
                data-testid="quick-question-crime-risk"
                onClick={() =>
                  sendQuickQuestion(
                    `Is ${crimeType.toLowerCase()} high in ${locationQuery || "Dublin"}?`
                  )
                }
                style={{
                  fontSize: "0.75rem",
                  cursor: "pointer",
                  padding: "4px 8px",
                }}
              >
                Crime risk
              </button>
            </div>

            {lastChatContext?.predictions?.length > 0 && (
              <div
                style={{
                  padding: "6px 8px",
                  borderBottom: "1px solid #ddd",
                  backgroundColor: "#f3f3f3",
                  fontSize: "0.78rem",
                  color: "#333",
                }}
              >
                {lastChatContext.predictions.map((p, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: "5px 7px",
                      background: "#fff",
                      border: "1px solid #e3e3e3",
                      borderRadius: "6px",
                      marginBottom:
                        idx < lastChatContext.predictions.length - 1 ? 5 : 0,
                      lineHeight: 1.35,
                    }}
                  >
                    <b>{p.crime_type}</b> • {p.riskLabel} • {p.latestCrimeCount}
                  </div>
                ))}
              </div>
            )}

            <div
              style={{
                flex: 1,
                padding: "10px",
                overflowY: "auto",
                backgroundColor: "#f5f5f5",
                fontSize: "0.88rem",
                minHeight: 0,
              }}
            >
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  style={{
                    marginBottom: "6px",
                    textAlign: m.from === "user" ? "right" : "left",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      padding: "8px 10px",
                      borderRadius: "8px",
                      backgroundColor: m.from === "user" ? "#1976d2" : "#ffffff",
                      color: m.from === "user" ? "#fff" : "#333",
                      maxWidth: "90%",
                      lineHeight: 1.45,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                padding: "6px",
                borderTop: "1px solid #ddd",
                backgroundColor: "#fff",
                display: "flex",
                gap: "4px",
              }}
            >
              <input
                id="chat-input"
                name="chatInput"
                data-testid="chat-input"
                type="text"
                placeholder="Ask about areas or risk..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                style={{ flex: 1, padding: "6px", fontSize: "0.9rem" }}
              />
              <button
                data-testid="chat-send"
                onClick={handleSendMessage}
                style={{ padding: "6px 10px", fontSize: "0.9rem", cursor: "pointer" }}
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <button
            data-testid="open-chat"
            onClick={() => setChatOpen(true)}
            style={{
              width: isMobile ? "50px" : "60px",
              height: isMobile ? "50px" : "60px",
              borderRadius: "50%",
              border: "none",
              backgroundColor: "#1976d2",
              color: "#fff",
              cursor: "pointer",
              boxShadow: "0 4px 10px rgba(0,0,0,0.3)",
              fontSize: isMobile ? "0.75rem" : "0.8rem",
            }}
          >
            Chat
          </button>
        )}
    </div>
</div>
  );
}
