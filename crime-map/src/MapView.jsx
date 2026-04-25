import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const COUNTIES_SOURCE_ID = "counties-source";
const COUNTIES_FILL_ID = "counties-fill";
const COUNTIES_LINE_ID = "counties-line";

const HIGHLIGHT_SOURCE_ID = "highlight-region-source";
const HIGHLIGHT_FILL_ID = "highlight-region-fill";
const HIGHLIGHT_LINE_ID = "highlight-region-line";

function norm(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeCountyLabel(raw) {
  let s = norm(raw);

  s = s
    .replace(/\bcounty council\b/g, "")
    .replace(/\bcity council\b/g, "")
    .replace(/\bcontae\b/g, "")
    .replace(/\bconte\b/g, "")
    .replace(/\bcity\b/g, "")
    .replace(/\bcounty\b/g, "")
    .replace(/\bco\b\.?\s*/g, "")
    .trim();

  return s;
}

function getCountyNameFromFeature(feature) {
  const p = feature?.properties || {};

  return (
    p.NAME_TAG ||
    p.NAME_EN ||
    p.ENGLISH ||
    p.NAME ||
    p.name ||
    p.COUNTY ||
    p.County ||
    p.county ||
    p.English ||
    p.english ||
    p.NAME_GA ||
    p.CONTAE ||
    p.GAEILGE ||
    ""
  );
}

function isLikelyWgs84Coord(coord) {
  if (!Array.isArray(coord) || coord.length < 2) return false;
  const x = Number(coord[0]);
  const y = Number(coord[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return Math.abs(x) <= 180 && Math.abs(y) <= 90;
}

function firstCoordOfGeometry(geom) {
  if (!geom) return null;
  if (geom.type === "Polygon") return geom.coordinates?.[0]?.[0] ?? null;
  if (geom.type === "MultiPolygon") return geom.coordinates?.[0]?.[0]?.[0] ?? null;
  return null;
}

function attachRiskToFeatures(fc, countyRiskMap) {
  return {
    ...fc,
    features: (fc.features || []).map((f) => {
      const rawName = getCountyNameFromFeature(f);
      const normalizedFeatureName = normalizeCountyLabel(rawName);

      let matchedRisk = "Unknown";

      for (const [county, risk] of Object.entries(countyRiskMap || {})) {
        const normalizedCounty = normalizeCountyLabel(county);

        if (normalizedFeatureName === normalizedCounty) {
          matchedRisk = risk;
          break;
        }
      }

      return {
        ...f,
        properties: {
          ...f.properties,
          riskLabel: matchedRisk,
        },
      };
    }),
  };
}

function updateHighlightedRegion(map, countiesFC, countiesToHighlight = []) {
  if (!map || !countiesFC) return;

  const wanted = countiesToHighlight.map(normalizeCountyLabel).filter(Boolean);

  const features = (countiesFC.features || []).filter((f) => {
    const rawName = getCountyNameFromFeature(f);
    const candidate = normalizeCountyLabel(rawName);
    return wanted.some((w) => candidate === w);
  });

  const src = map.getSource(HIGHLIGHT_SOURCE_ID);
  if (!src) return;

  src.setData({
    type: "FeatureCollection",
    features,
  });

  if (features.length > 0) {
    const sample = firstCoordOfGeometry(features[0]?.geometry);
    const wgsOk = isLikelyWgs84Coord(sample);

    if (!wgsOk) {
      console.warn("[highlight] GeoJSON is not WGS84 lon/lat.");
      return;
    }

    try {
      const bounds = new mapboxgl.LngLatBounds();

      const extend = (c) => {
        if (isLikelyWgs84Coord(c)) bounds.extend(c);
      };

      for (const f of features) {
        const geom = f.geometry;
        if (!geom) continue;

        if (geom.type === "Polygon") {
          geom.coordinates?.flat(1)?.forEach(extend);
        } else if (geom.type === "MultiPolygon") {
          geom.coordinates?.flat(2)?.forEach(extend);
        }
      }

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: 40, duration: 700 });
      }
    } catch (e) {
      console.warn("[highlight] fitBounds failed:", e);
    }
  }
}
// map second option
export default function MapView({
  riskColor = "#666",
  lng = -6.2603,
  lat = 53.3498,
  zoom = 8,
  selectedCounties = [],
  countyRiskMap = {},
  countiesGeoJsonUrl = "/ireland_counties.geojson",
  showMarker = false,
  onCountyClick,
  isMobile,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const countiesRef = useRef(null);
  const countyRiskMapRef = useRef({});

  useEffect(() => {
    countyRiskMapRef.current = countyRiskMap;

    const map = mapRef.current;
    if (!map || !countiesRef.current) return;

    const src = map.getSource(COUNTIES_SOURCE_ID);
    if (!src) return;

    const enriched = attachRiskToFeatures(countiesRef.current, countyRiskMap);
    src.setData(enriched);
  }, [countyRiskMap]);

  useEffect(() => {
    if (mapRef.current) return;

    if (!mapboxgl.accessToken) {
      console.error("Missing VITE_MAPBOX_TOKEN in your .env file");
      return;
    }

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [lng, lat],
      zoom,
    });

    map.addControl(new mapboxgl.NavigationControl(), "top-right");

    map.on("load", async () => {
      if (showMarker) {
        markerRef.current = new mapboxgl.Marker({ color: riskColor })
          .setLngLat([lng, lat])
          .addTo(map);
      }

      try {
        const url = `${countiesGeoJsonUrl}?v=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to load: ${countiesGeoJsonUrl} (${res.status})`);

        const fc = await res.json();

        const excluded = new Set([
          "antrim",
          "armagh",
          "down",
          "fermanagh",
          "tyrone",
          "londonderry",
          "derry", 
          "doire",
          "contae doire",
          "conte doire",
        ]);

        const filteredFC = {
          ...fc,
          features: (fc.features || []).filter((f) => {
            const name = normalizeCountyLabel(getCountyNameFromFeature(f));
            return !excluded.has(name);
          }),
        };



        countiesRef.current = filteredFC;

        const enriched = attachRiskToFeatures(filteredFC, countyRiskMapRef.current);

        map.addSource(COUNTIES_SOURCE_ID, {
          type: "geojson",
          data: enriched,
        });

        map.addLayer({
          id: COUNTIES_FILL_ID,
          type: "fill",
          source: COUNTIES_SOURCE_ID,
          paint: {
            "fill-color": [
              "match",
              ["get", "riskLabel"],
              "High", "#d32f2f",
              "Medium", "#ffb300",
              "Low", "#388e3c",
              "Unknown", "#666666",
              "#666666",
            ],
            "fill-opacity": 0.28,
          },
        });

        map.addLayer({
          id: COUNTIES_LINE_ID,
          type: "line",
          source: COUNTIES_SOURCE_ID,
          paint: {
            "line-color": "#ffffff",
            "line-width": 1.2,
            "line-opacity": 0.45,
          },
        });

        map.addSource(HIGHLIGHT_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });

        map.addLayer({
          id: HIGHLIGHT_FILL_ID,
          type: "fill",
          source: HIGHLIGHT_SOURCE_ID,
          paint: {
            "fill-color": "#ffffff",
            "fill-opacity": 0.06,
          },
        });

        map.addLayer({
          id: HIGHLIGHT_LINE_ID,
          type: "line",
          source: HIGHLIGHT_SOURCE_ID,
          paint: {
            "line-color": "#f2f2f2",
            "line-width": 2,
            "line-opacity": 0.95,
          },
        });

        map.on("click", COUNTIES_FILL_ID, (e) => {
          const feature = e.features?.[0];
          if (!feature) return;

          const rawCountyName = getCountyNameFromFeature(feature);
          const countyName = String(rawCountyName || "").trim();
          const normalized = normalizeCountyLabel(countyName);

          if (!normalized) return;

          const titleCounty =
            normalized.charAt(0).toUpperCase() + normalized.slice(1);

          const clickedRisk = feature.properties?.riskLabel;

          if (onCountyClick) {
            onCountyClick(titleCounty, clickedRisk);
          }
        });

        map.on("mouseenter", COUNTIES_FILL_ID, () => {
          map.getCanvas().style.cursor = "pointer";
        });

        map.on("mouseleave", COUNTIES_FILL_ID, () => {
          map.getCanvas().style.cursor = "";
        });


        updateHighlightedRegion(map, countiesRef.current, selectedCounties);

        setTimeout(() => {
          map.resize();
        }, 300);


      } catch (e) {
        console.error(e);
      }

    });

    mapRef.current = map;

    return () => {
      markerRef.current?.remove();
      mapRef.current?.remove();
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const coords = [lng, lat];

    markerRef.current?.remove();
    markerRef.current = null;

    if (showMarker) {
      markerRef.current = new mapboxgl.Marker({ color: riskColor })
        .setLngLat(coords)
        .addTo(map);

      map.flyTo({ center: coords, zoom, essential: true });
    }
  }, [showMarker, riskColor, lng, lat, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !countiesRef.current) return;

    updateHighlightedRegion(map, countiesRef.current, selectedCounties);
  }, [selectedCounties]);

  // useEffect(() => {
  //   const map = mapRef.current;
  //   if (!map) return;

  //   if (map.getLayer(HIGHLIGHT_FILL_ID)) {
  //     map.setPaintProperty(HIGHLIGHT_FILL_ID, "fill-color", "#ffffff");
  //   }
  // }, [riskColor]);




  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const resizeMap = () => {
      map.resize();
    };

    const timer1 = setTimeout(() => {
      resizeMap();
    }, 200);

    const timer2 = setTimeout(() => {
      resizeMap();
    }, 700);

    window.addEventListener("resize", resizeMap);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener("resize", resizeMap);
    };
  }, [isMobile]);




  return (
    <div
      style={{
        width: "100%",
        height: isMobile ? "320px" : "100%",
        minHeight: isMobile ? "320px" : "100%",
      }}
    >
      <div
        data-testid="map-view"
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}