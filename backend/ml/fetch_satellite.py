"""Fetch real nadir Google satellite tiles for evaluation.

Uses the Google Static Maps API (satellite maptype = pure top-down, no labels),
matching the imagery the frontend actually captures. Key is read from
ROOF_ML_GOOGLE_MAPS_KEY / GOOGLE_MAPS_API_KEY env, or frontend/.env. Never committed.

    python -m ml.fetch_satellite            # writes ml/eval/sat/*.png
"""

from __future__ import annotations

import os
import urllib.parse
import urllib.request
from pathlib import Path

from ml import config

# Diverse suburban houses with clear, distinct roofs (lat, lng, label).
SAMPLES = [
    (33.196, -96.615, "tx_frisco"),
    (39.7180, -104.945, "co_denver"),
    (37.3861, -122.0839, "ca_mountainview"),
    (52.3760, 4.9010, "nl_amsterdam"),
    (51.5200, -0.1900, "uk_london"),
    (-33.8688, 151.1000, "au_sydney"),
    (48.1500, 11.5800, "de_munich"),
    (40.7420, -74.0300, "nj_hoboken"),
]

ZOOM = 20
SIZE = 640      # max free tier; scale=2 -> 1280x1280 effective
SCALE = 2


def _key() -> str:
    for var in ("ROOF_ML_GOOGLE_MAPS_KEY", "GOOGLE_MAPS_API_KEY"):
        if os.getenv(var):
            return os.getenv(var)  # type: ignore[return-value]
    env_path = config.BACKEND_DIR.parent / "frontend" / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("VITE_GOOGLE_MAPS_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("No Google Maps API key found (env or frontend/.env).")


def main() -> None:
    key = _key()
    out_dir = config.ML_DIR / "eval" / "sat"
    out_dir.mkdir(parents=True, exist_ok=True)

    for lat, lng, label in SAMPLES:
        params = urllib.parse.urlencode(
            {
                "center": f"{lat},{lng}",
                "zoom": ZOOM,
                "size": f"{SIZE}x{SIZE}",
                "scale": SCALE,
                "maptype": "satellite",
                "format": "png",
                "key": key,
            }
        )
        url = f"https://maps.googleapis.com/maps/api/staticmap?{params}"
        dst = out_dir / f"{label}.png"
        try:
            with urllib.request.urlopen(url, timeout=60) as resp:
                blob = resp.read()
            if blob[:8] != b"\x89PNG\r\n\x1a\n":
                print(f"[fetch] {label}: not a PNG (likely API error): {blob[:120]!r}")
                continue
            dst.write_bytes(blob)
            print(f"[fetch] {label} -> {dst} ({len(blob)//1024} KB)")
        except Exception as exc:
            print(f"[fetch] {label} FAILED: {exc}")


if __name__ == "__main__":
    main()
