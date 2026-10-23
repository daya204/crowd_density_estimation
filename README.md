# CrowdSense — Smart Crowd Monitoring Dashboard

Crowd monitoring dashboard integrating the **PET (Point Query Transformer)** model with a Next.js frontend.

---

## Architecture

```
┌─────────────────────────────────┐      ┌──────────────────────────────────┐
│  Next.js  (localhost:3000)      │      │  FastAPI  (localhost:8000)        │
│                                 │      │                                  │
│  app/page.tsx                   │      │  api/server.py                   │
│    └─ Analysis component        │─────▶│    POST /predict                 │
│         usePrediction() hook    │      │    GET  /health                  │
│                                 │      │                                  │
│  app/api/predict/route.ts       │      │  Auto-detects:                   │
│    └─ proxy to FastAPI          │      │    LIVE  → checkpoint found       │
└─────────────────────────────────┘      │    DEMO  → no checkpoint         │
                                         └──────────────────────────────────┘
```

---

## Quick start

### 1 — Install Node dependencies

```powershell
pnpm install       # or: npm install
```

### 2 — Create & activate the Python virtual environment

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements-backend.txt
```

> **PyTorch for live inference** (optional — skip for demo mode):
> Visit https://pytorch.org/get-started/locally/ and install the build
> that matches your CUDA version, then place your trained checkpoint at
> `outputs\SHB\pet_model\best_checkpoint.pth`.

### 3 — Run both servers (two terminals)

**Terminal 1 — FastAPI backend:**
```powershell
.\start-backend.ps1
# or manually:
.venv\Scripts\uvicorn api.server:app --reload --port 8000
```

**Terminal 2 — Next.js frontend:**
```powershell
.\start-frontend.ps1
# or manually:
pnpm dev
```

Open **http://localhost:3000** in your browser.

---

## Integrating the trained PET checkpoint

The notebook `crowd_control.ipynb` trains the PET model on ShanghaiTech Part B
and saves `best_checkpoint.pth`. To use it for live inference:

1. Train (or download) the checkpoint — see the notebook for instructions.
2. Place it at `outputs/SHB/pet_model/best_checkpoint.pth`.
3. Clone the PET repository alongside this project:
   ```powershell
   git clone https://github.com/cxliu0/PET.git
   ```
4. Restart the backend. The server auto-detects the checkpoint on startup
   and switches from **DEMO** to **LIVE** mode.

---

## API reference

### `GET /api/predict` → `GET http://localhost:8000/health`

```json
{ "status": "ok", "mode": "demo" }
```

`mode` is `"live"` when a checkpoint is loaded, `"demo"` otherwise.

### `POST /api/predict`

**Request** — `multipart/form-data`:

| Field      | Type    | Required | Description                      |
|------------|---------|----------|----------------------------------|
| `file`     | File    | ✓        | JPEG / PNG / WebP image          |
| `capacity` | integer |          | Zone capacity (default 500)      |
| `zone`     | string  |          | Zone name (echoed in response)   |

**Response**:

```json
{
  "count": 142,
  "occupancy_pct": 28.4,
  "processing_time_ms": 843.2,
  "points": [{ "x": 0.34, "y": 0.71 }, "…"],
  "mode": "demo",
  "model": "PET (demo — no checkpoint)",
  "filename": "crowd.jpg",
  "zone": "Main Entrance",
  "capacity": 500,
  "image_size": [1280, 720]
}
```

---

## Project structure

```
build-crowd-sense-dashboard/
├── api/
│   ├── __init__.py
│   └── server.py            ← FastAPI inference server
├── app/
│   ├── api/predict/
│   │   └── route.ts         ← Next.js proxy route
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx             ← Dashboard UI (Analysis uses live API)
├── components/ui/
├── lib/
│   ├── usePrediction.ts     ← React hook for /api/predict
│   └── utils.ts
├── crowd_control.ipynb      ← PET model training notebook
├── requirements-backend.txt ← Python dependencies
├── start-backend.ps1        ← Start FastAPI server
├── start-frontend.ps1       ← Start Next.js server
└── README.md
```

---

## How the PET model is used

`crowd_control.ipynb` trains the PET (Point Query Transformer) crowd counter:

1. **Setup** — clones `github.com/cxliu0/PET`, installs torch/scipy.
2. **Data** — ShanghaiTech Part B dataset (density maps).
3. **Patches** — applies PyTorch 2.x compatibility fixes.
4. **Training** — resumes from a checkpoint, stops automatically when
   MAE ≤ 6.3 and MSE ≤ 10.6 (ICCV 2023 paper accuracy).
5. **Export** — saves `best_checkpoint.pth` for inference.

`api/server.py` loads that checkpoint and runs the PET forward pass on
every uploaded image, returning predicted head locations as (x, y) points
that the dashboard overlays on the image preview.
