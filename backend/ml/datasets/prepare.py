"""Download roof instance-seg datasets from Roboflow Universe and merge them
into one YOLO-seg dataset with a unified ``{0: roof, 1: obstacle}`` label space.

No heavy Roboflow SDK: uses the REST export endpoint + stdlib zip. The API key
is read from ``ROBOFLOW_API_KEY`` (or the frontend ``.env``) and is never
written into any committed file.

    python -m ml.datasets.prepare            # download + merge default sources
    python -m ml.datasets.prepare --list     # just print the planned sources

Output: ``ml/data/roof_merged/data.yaml`` ready for ``ml.train``.
"""

from __future__ import annotations

import argparse
import io
import os
import shutil
import urllib.parse
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

import yaml

from ml import config

# Verified via the Roboflow API (image counts are per-version, augmented).
# type is always instance-segmentation. Classes are remapped by keyword, so new
# class names in a re-export still route correctly.
#
# SATELLITE / NADIR ONLY. Side-view or facade/street-level datasets are excluded
# on purpose: the app runs on top-down satellite imagery, so training on oblique
# house photos poisons the model. (roof-segmentation-smovm/roof-seg-2 was dropped
# for exactly this reason -- it is stock facade photography, not aerial.)
DEFAULT_SOURCES = [
    ("belgilabs", "roof-segmentation-pjlms", 1),      # 2876 imgs, per-plane roof faces (nadir aerial)
    ("vec-bvgxj", "roof-segmentation-zytzo", 4),       # 895 imgs, roof + skylight/solar (nadir tiles)
]
# NOTE: keep the training set COLOR nadir to match the app's Google satellite imagery.
# building-detection-1ny5t/aerial-image-detection (grayscale/dark) and
# satellite-rooftop-map (near-black, heavily augmented) were downloaded and
# inspected, then EXCLUDED: nadir but wrong colour domain, they hurt more than help.
# See candidate_sources.md.

UNIFIED_NAMES = ["roof", "obstacle"]
CATEGORY_TO_ID = {"roof": 0, "obstacle": 1}
SPLITS = ("train", "valid", "test")


@dataclass
class Source:
    workspace: str
    project: str
    version: int

    @property
    def slug(self) -> str:
        return f"{self.workspace}__{self.project}__v{self.version}"


def _api_key() -> str:
    key = os.getenv("ROBOFLOW_API_KEY")
    if key:
        return key
    # Fall back to the local frontend .env (gitignored) for developer convenience.
    env_path = config.BACKEND_DIR.parent / "frontend" / ".env"
    if env_path.exists():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            if line.strip().startswith("VITE_ROBOFLOW_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError(
        "ROBOFLOW_API_KEY not set and no key found in frontend/.env. "
        "Export ROBOFLOW_API_KEY before running dataset preparation."
    )


def _export_link(source: Source, key: str, max_wait_s: int = 480) -> str:
    """Fetch the signed export link, polling while Roboflow generates it.

    A format that has never been exported returns ``{"progress": <0..1>}`` while
    the zip is built server-side; we poll until ``export.link`` appears.
    """

    import json
    import time

    url = (
        f"https://api.roboflow.com/{source.workspace}/{source.project}/"
        f"{source.version}/yolov8?api_key={urllib.parse.quote(key)}"
    )
    deadline = time.monotonic() + max_wait_s
    last_progress = None
    while True:
        with urllib.request.urlopen(url, timeout=120) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        link = (payload.get("export") or {}).get("link")
        if link:
            return link
        if "progress" not in payload:
            raise RuntimeError(f"No export link for {source.slug}: {payload}")
        progress = payload.get("progress")
        if progress != last_progress:
            print(f"[prepare] {source.slug} export generating... progress={progress}")
            last_progress = progress
        if time.monotonic() >= deadline:
            raise RuntimeError(f"Export generation timed out for {source.slug}")
        time.sleep(6)


def download_source(source: Source, key: str, dest_root: Path) -> Path:
    dest = dest_root / source.slug
    if (dest / "data.yaml").exists():
        print(f"[prepare] cached {source.slug}")
        return dest

    print(f"[prepare] downloading {source.slug} ...")
    link = _export_link(source, key)
    with urllib.request.urlopen(link, timeout=600) as resp:
        blob = resp.read()
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        zf.extractall(dest)
    print(f"[prepare] extracted {source.slug} ({len(blob) // (1024*1024)} MB)")
    return dest


def _remap_table(names: List[str]) -> Dict[int, Optional[int]]:
    """Map each source class index -> unified id (or None to drop)."""

    table: Dict[int, Optional[int]] = {}
    for idx, name in enumerate(names):
        category = config.classify_label(name)
        table[idx] = CATEGORY_TO_ID.get(category)  # None for "other"
    return table


def _load_names(data_yaml: Path) -> List[str]:
    doc = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    names = doc.get("names")
    if isinstance(names, dict):
        names = [names[k] for k in sorted(names)]
    return list(names or [])


def _remap_label_file(src: Path, dst: Path, table: Dict[int, Optional[int]]) -> bool:
    out_lines: List[str] = []
    for line in src.read_text(encoding="utf-8").splitlines():
        parts = line.split()
        if len(parts) < 7:  # class + >=3 (x,y) pairs for a polygon
            continue
        old = int(float(parts[0]))
        new = table.get(old)
        if new is None:
            continue
        out_lines.append(" ".join([str(new)] + parts[1:]))
    if not out_lines:
        return False
    dst.write_text("\n".join(out_lines) + "\n", encoding="utf-8")
    return True


def merge(sources: List[Source], data_root: Path, out_dir: Path) -> Path:
    if out_dir.exists():
        shutil.rmtree(out_dir)
    for split in SPLITS:
        (out_dir / split / "images").mkdir(parents=True, exist_ok=True)
        (out_dir / split / "labels").mkdir(parents=True, exist_ok=True)

    counts = {split: 0 for split in SPLITS}
    # Short sequential filenames avoid Windows MAX_PATH (260 char) failures that
    # some Roboflow exports trigger with very long descriptive image names.
    for si, source in enumerate(sources):
        root = data_root / source.slug
        names = _load_names(root / "data.yaml")
        table = _remap_table(names)
        print(f"[prepare] {source.slug} names={names} -> remap={table}")

        for split in SPLITS:
            img_dir = root / split / "images"
            lbl_dir = root / split / "labels"
            if not img_dir.exists():
                continue
            for img_path in sorted(img_dir.iterdir()):
                if img_path.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                    continue
                lbl_path = lbl_dir / (img_path.stem + ".txt")
                if not lbl_path.exists():
                    continue
                stem = f"s{si}_{counts[split]:06d}"
                dst_lbl = out_dir / split / "labels" / (stem + ".txt")
                if not _remap_label_file(lbl_path, dst_lbl, table):
                    continue
                shutil.copy2(img_path, out_dir / split / "images" / (stem + img_path.suffix))
                counts[split] += 1

    # Roboflow exports sometimes omit a test split; fall back to valid for it.
    data_yaml = {
        "path": str(out_dir.resolve()),
        "train": "train/images",
        "val": "valid/images" if counts["valid"] else "train/images",
        "test": "test/images" if counts["test"] else "valid/images",
        "nc": len(UNIFIED_NAMES),
        "names": UNIFIED_NAMES,
    }
    out_yaml = out_dir / "data.yaml"
    out_yaml.write_text(yaml.safe_dump(data_yaml, sort_keys=False), encoding="utf-8")
    print(f"[prepare] merged counts={counts} -> {out_yaml}")
    return out_yaml


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare merged roof dataset")
    parser.add_argument("--list", action="store_true", help="Print planned sources and exit")
    parser.add_argument(
        "--download-only",
        action="store_true",
        help="Download raw sources but skip the merge (safe to run while a training job reads roof_merged).",
    )
    parser.add_argument("--out", default=str(config.DATA_DIR / "roof_merged"))
    args = parser.parse_args()

    sources = [Source(*s) for s in DEFAULT_SOURCES]
    if args.list:
        for s in sources:
            print(f"  {s.workspace}/{s.project} v{s.version}")
        return

    key = _api_key()
    raw_root = config.DATA_DIR / "raw"
    raw_root.mkdir(parents=True, exist_ok=True)
    for source in sources:
        download_source(source, key, raw_root)

    if args.download_only:
        print("[prepare] download-only: skipping merge")
        return

    merge(sources, raw_root, Path(args.out))


if __name__ == "__main__":
    main()
