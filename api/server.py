"""
CrowdSense FastAPI inference server
====================================
Uses the PET (Point Query Transformer) model trained on ShanghaiTech
to count people in uploaded images.

Two modes (auto-detected on startup):
  LIVE  -- checkpoint/ directory found  -> real PET inference
  DEMO  -- no checkpoint                -> image-feature-based estimate

Also handles SQLite persistence for settings and analysis history.

Start:
    .venv/Scripts/uvicorn api.server:app --reload --port 8000
"""

import io
import hashlib
import logging
import sqlite3
import sys
import tempfile
import time
import zipfile
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from PIL import Image

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("crowdsense")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BASE_DIR     = Path(__file__).parent.parent
CHECKPOINT   = BASE_DIR / "checkpoint"          # PyTorch directory-format checkpoint
PET_REPO     = BASE_DIR / "PET"
DB_PATH      = BASE_DIR / "crowdsense.db"

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="CrowdSense Inference API",
    description="PET crowd-counting endpoint for the CrowdSense dashboard",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# SQLite
# ---------------------------------------------------------------------------
@contextmanager
def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_db() as db:
        db.executescript("""
            CREATE TABLE IF NOT EXISTS settings (
                id         INTEGER PRIMARY KEY CHECK (id = 1),
                capacity   INTEGER NOT NULL DEFAULT 200,
                warning    INTEGER NOT NULL DEFAULT 70,
                critical   INTEGER NOT NULL DEFAULT 90,
                updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
            );
            INSERT OR IGNORE INTO settings (id, capacity, warning, critical)
            VALUES (1, 200, 70, 90);

            CREATE TABLE IF NOT EXISTS history (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                filename       TEXT    NOT NULL,
                count          INTEGER NOT NULL,
                occupancy_pct  REAL    NOT NULL,
                status         TEXT    NOT NULL,
                mode           TEXT    NOT NULL,
                processing_ms  REAL    NOT NULL,
                capacity       INTEGER NOT NULL,
                analysed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
            );
        """)
    log.info("SQLite database ready: %s", DB_PATH)

# ---------------------------------------------------------------------------
# PET model state
# ---------------------------------------------------------------------------
_model     = None
_device    = None
_mode: str = "demo"


def _make_divisible(x: int, div: int = 128) -> int:
    """Round x up to the nearest multiple of div (PET window requirement)."""
    return ((x + div - 1) // div) * div


def _load_pet_model() -> None:
    """Load PET model from the checkpoint directory. Falls back to demo."""
    global _model, _device, _mode

    if not CHECKPOINT.exists():
        log.warning("Checkpoint not found at %s — DEMO mode.", CHECKPOINT)
        _mode = "demo"
        return

    try:
        import torch

        # Add PET repo to path
        if str(PET_REPO) not in sys.path:
            sys.path.insert(0, str(PET_REPO))

        # Windows can't torch.load a directory directly — pack into tmp zip first
        log.info("Packing checkpoint directory into zip for loading...")
        tmp = Path(tempfile.mktemp(suffix=".zip"))
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED) as zf:
            for f in CHECKPOINT.rglob("*"):
                if f.is_file():
                    zf.write(f, f.relative_to(CHECKPOINT.parent))

        ckpt = torch.load(tmp, map_location="cpu", weights_only=False)
        tmp.unlink(missing_ok=True)

        log.info("Checkpoint loaded: epoch=%d  best_mae=%.2f",
                 ckpt.get("epoch", "?"), ckpt.get("best_mae", 0))

        from models import build_model

        args = ckpt["args"]
        args.device = "cpu"                  # force CPU — works everywhere
        for k, v in [("enc_layers", 4), ("sparse_stride", 8), ("dense_stride", 4)]:
            if not hasattr(args, k):
                setattr(args, k, v)

        model, _ = build_model(args)
        model.load_state_dict(ckpt["model"], strict=False)
        model.eval()

        _device = "cpu"
        _model  = model
        _mode   = "live"
        log.info("PET model loaded — LIVE mode active.")

    except Exception as exc:
        log.warning("Could not load PET model (%s) — DEMO mode.", exc)
        _mode = "demo"


@app.on_event("startup")
async def startup_event() -> None:
    init_db()
    _load_pet_model()


# ---------------------------------------------------------------------------
# LIVE inference (PET)
# ---------------------------------------------------------------------------
MEAN = [0.485, 0.456, 0.406]
STD  = [0.229, 0.224, 0.225]


def _pet_predict(img: Image.Image, threshold: float = 0.5) -> dict:
    """Run PET inference and return count + normalised point list."""
    import torch
    import torchvision.transforms as T

    t0 = time.perf_counter()

    # Resize to dims divisible by 128 (PET window stride requirement)
    w, h = img.size
    scale = min(1024 / max(w, h), 1.0)
    new_w = _make_divisible(max(int(w * scale), 128))
    new_h = _make_divisible(max(int(h * scale), 128))
    img_resized = img.convert("RGB").resize((new_w, new_h), Image.BILINEAR)

    transform = T.Compose([T.ToTensor(), T.Normalize(MEAN, STD)])
    tensor = transform(img_resized).unsqueeze(0)  # (1,3,H,W)

    with torch.no_grad():
        outputs = _model(tensor, test=True)

    # pred_logits: (1, N, 2)  — softmax class-1 score
    scores = torch.nn.functional.softmax(outputs["pred_logits"], dim=-1)[0, :, 1]
    pts    = outputs["pred_points"][0]   # (N, 2) normalised [y, x] in [0,1]

    keep   = scores > threshold
    count  = int(keep.sum())
    sel_pts = pts[keep].tolist()

    # Convert [y, x] → {x, y} for the frontend overlay
    points = [{"x": round(float(p[1]), 4), "y": round(float(p[0]), 4)}
              for p in sel_pts]

    elapsed_ms = (time.perf_counter() - t0) * 1000
    log.info("PET predict: %d heads in %.0f ms  (resized to %dx%d)",
             count, elapsed_ms, new_w, new_h)

    return {
        "count":              count,
        "points":             points,
        "processing_time_ms": round(elapsed_ms, 1),
        "mode":               "live",
        "model":              "PET — Point Query Transformer (VGG-16 BN backbone)",
        "image_size":         [w, h],
    }


# ---------------------------------------------------------------------------
# DEMO inference (image-feature-based, unique per file)
# ---------------------------------------------------------------------------
def _demo_predict(img: Image.Image, capacity: int, raw_bytes: bytes) -> dict:
    """Deterministic estimate using image features + file-hash uniqueness."""
    t0 = time.perf_counter()

    seed = int(hashlib.sha256(raw_bytes).hexdigest()[:12], 16) % (2**32)
    rng  = np.random.default_rng(seed)

    work = img.convert("RGB").resize((256, 256), Image.LANCZOS)
    arr  = np.asarray(work, dtype=np.float32)
    gray = arr.mean(axis=2)

    brightness   = float(gray.mean()) / 255.0
    contrast     = float(gray.std()) / 128.0
    gx           = np.abs(np.diff(gray, axis=1)).mean()
    gy           = np.abs(np.diff(gray, axis=0)).mean()
    edge_density = float((gx + gy) / 2.0) / 20.0
    fft          = np.fft.fft2(gray - gray.mean())
    fft_mag      = np.abs(np.fft.fftshift(fft))
    y_idx, x_idx = np.ogrid[:256, :256]
    hi_freq      = (y_idx - 128)**2 + (x_idx - 128)**2 > 64**2
    texture      = float(fft_mag[hi_freq].mean()) / 1000.0

    feature_d = (
        (1.0 - brightness) * 0.30 +
        min(contrast, 1.0)  * 0.30 +
        min(edge_density, 1.0) * 0.25 +
        min(texture, 1.0)   * 0.15
    )
    feature_d = max(0.05, min(feature_d, 0.95))
    hash_c    = (seed % 10000) / 10000.0
    density   = max(0.04, min(feature_d * 0.85 + hash_c * 0.15
                              + rng.uniform(-0.05, 0.05), 0.97))
    count     = max(1, int(round(capacity * density)))

    prob_map  = (255.0 - gray) / 255.0 + 0.1
    prob_map /= prob_map.sum()
    flat_idx  = rng.choice(256 * 256, size=count, replace=True, p=prob_map.ravel())
    ys, xs    = np.unravel_index(flat_idx, (256, 256))
    px = np.clip(xs / 255.0 + rng.uniform(-0.003, 0.003, count), 0.02, 0.98)
    py = np.clip(ys / 255.0 + rng.uniform(-0.003, 0.003, count), 0.02, 0.98)
    points = [{"x": float(px[i]), "y": float(py[i])} for i in range(count)]

    elapsed_ms = (time.perf_counter() - t0) * 1000
    return {
        "count":              count,
        "points":             points,
        "processing_time_ms": round(elapsed_ms, 1),
        "mode":               "demo",
        "model":              "Demo — start backend with PET checkpoint for live inference",
        "image_size":         [img.size[0], img.size[1]],
    }


# ---------------------------------------------------------------------------
# Settings routes
# ---------------------------------------------------------------------------
class SettingsIn(BaseModel):
    capacity: int
    warning:  int
    critical: int


@app.get("/")
async def root() -> dict:
    return {
        "service":   "CrowdSense Inference API",
        "status":    "ok",
        "mode":      _mode,
        "model":     "PET — Point Query Transformer" if _mode == "live" else "demo",
        "endpoints": {"health": "/health", "predict": "POST /predict", "docs": "/docs"},
    }


@app.get("/health")
async def health() -> dict:
    return {
        "status":           "ok",
        "mode":             _mode,
        "model":            "PET" if _mode == "live" else None,
        "checkpoint_ready": CHECKPOINT.exists(),
    }


@app.get("/settings")
async def get_settings() -> dict:
    with get_db() as db:
        row = db.execute(
            "SELECT capacity, warning, critical, updated_at FROM settings WHERE id=1"
        ).fetchone()
    return dict(row)


@app.post("/settings")
async def save_settings(body: SettingsIn) -> dict:
    if not (0 < body.warning < body.critical <= 100 and body.capacity > 0):
        raise HTTPException(status_code=422, detail="Invalid settings values.")
    with get_db() as db:
        db.execute(
            "UPDATE settings SET capacity=?, warning=?, critical=?, "
            "updated_at=datetime('now') WHERE id=1",
            (body.capacity, body.warning, body.critical),
        )
    return {"ok": True, "capacity": body.capacity,
            "warning": body.warning, "critical": body.critical}


@app.get("/history")
async def get_history(limit: int = 100) -> dict:
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    return {"history": [dict(r) for r in rows], "total": len(rows)}


@app.post("/history")
async def add_history(
    filename:      str   = Form(...),
    count:         int   = Form(...),
    occupancy_pct: float = Form(...),
    status:        str   = Form(...),
    mode:          str   = Form(...),
    processing_ms: float = Form(...),
    capacity:      int   = Form(...),
) -> dict:
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO history (filename,count,occupancy_pct,status,mode,"
            "processing_ms,capacity) VALUES (?,?,?,?,?,?,?)",
            (filename, count, round(occupancy_pct, 1), status, mode,
             round(processing_ms, 1), capacity),
        )
    return {"ok": True, "id": cur.lastrowid}


@app.delete("/history")
async def clear_history() -> dict:
    with get_db() as db:
        db.execute("DELETE FROM history")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Predict route
# ---------------------------------------------------------------------------
@app.post("/predict")
async def predict(
    file:     UploadFile      = File(...),
    capacity: int             = Form(default=200),
    zone:     Optional[str]   = Form(default=None),
    threshold: float          = Form(default=0.5),
) -> JSONResponse:
    """
    POST an image to get a PET crowd head count.

    Form fields:
      file       JPEG / PNG / WebP image (max 50 MB)
      capacity   Zone capacity integer (default 200)
      zone       Zone name (echoed in response)
      threshold  PET confidence threshold 0-1 (default 0.5, live mode only)
    """
    ct = (file.content_type or "").lower().split(";")[0].strip()
    if not (ct.startswith("image/") or ct == "application/octet-stream"):
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported media type '{ct}'. Send JPEG, PNG, or WebP.",
        )

    raw = await file.read()
    log.info("Received: name=%r  type=%r  size=%d bytes", file.filename, ct, len(raw))

    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 50 MB).")

    try:
        img = Image.open(io.BytesIO(raw))
    except Exception:
        raise HTTPException(status_code=422, detail="Could not decode image.")

    try:
        if _mode == "live":
            result = _pet_predict(img, threshold=threshold)
        else:
            result = _demo_predict(img, capacity, raw)
    except Exception as exc:
        log.exception("Prediction failed: %s", exc)
        raise HTTPException(status_code=500, detail=f"Inference failed: {exc}")

    result["filename"]      = file.filename
    result["zone"]          = zone
    result["capacity"]      = capacity
    result["occupancy_pct"] = round(result["count"] / max(capacity, 1) * 100, 1)

    return JSONResponse(content=result)
