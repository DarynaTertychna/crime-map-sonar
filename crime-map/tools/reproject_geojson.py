import json
from pathlib import Path
from pyproj import Transformer

IN_PATH = Path("../public/ireland_counties.geojson")
OUT_PATH = Path("../public/ireland_counties_wgs84.geojson")

# file EPSG:2157 Irish Transverse Mercator
transformer = Transformer.from_crs(2157, 4326, always_xy=True)

def reproject_coords(obj):
    """
    Recursively walk GeoJSON coordinate arrays.
    Converts [x, y] in EPSG:2157 to [lng, lat] in EPSG:4326.
    """
    if isinstance(obj, (list, tuple)):
        if len(obj) >= 2 and isinstance(obj[0], (int, float)) and isinstance(obj[1], (int, float)):
            x, y = obj[0], obj[1]
            lng, lat = transformer.transform(x, y)
            # extra dims 
            if len(obj) > 2:
                return [lng, lat, *obj[2:]]
            return [lng, lat]
        return [reproject_coords(x) for x in obj]
    return obj

def main():
    data = json.loads(IN_PATH.read_text(encoding="utf-8"))

    # RFC7946 GeoJSON should not include "crs"
    if "crs" in data:
        data.pop("crs", None)

    for f in data.get("features", []):
        geom = f.get("geometry")
        if not geom:
            continue
        coords = geom.get("coordinates")
        geom["coordinates"] = reproject_coords(coords)

    OUT_PATH.write_text(json.dumps(data), encoding="utf-8")
    print(f"✅ Wrote: {OUT_PATH.resolve()}")

if __name__ == "__main__":
    main()