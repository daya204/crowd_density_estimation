"""
Convert the PyTorch directory-format checkpoint to a .pt file,
inspect its structure, then run YOLO inference.
"""
import sys, pickle, struct
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

import torch

CKPT_DIR = Path("checkpoint")
OUT_PT   = Path("checkpoint.pt")

# ── Step 1: understand the directory format ──────────────────────────
print("=== Checkpoint directory format ===")
fmt = (CKPT_DIR / ".format_version").read_text().strip()
ver = (CKPT_DIR / "version").read_text().strip()
bo  = (CKPT_DIR / "byteorder").read_text().strip()
print(f"  format_version : {fmt}")
print(f"  version        : {ver}")
print(f"  byteorder      : {bo}")
print(f"  data shards    : {len(list((CKPT_DIR/'data').iterdir()))}")
print()

# ── Step 2: try torch.load with the directory as a string path ───────
print("=== Attempting torch.load via zipfile approach ===")
# PyTorch directory checkpoints are actually zip-compatible —
# we can use torch.serialization directly.
try:
    # Some versions need the path as a Path object, not string
    ckpt = torch.load(CKPT_DIR, map_location="cpu", weights_only=False)
    print("SUCCESS via Path object")
except PermissionError:
    # Windows doesn't allow opening a directory as a file.
    # We need to pack it into a zip first.
    import zipfile, io, os, shutil, tempfile
    print("PermissionError — packing directory into zip for torch.load …")

    # Create a temp zip file that mirrors the directory structure
    tmp_zip = Path(tempfile.mktemp(suffix=".zip"))
    with zipfile.ZipFile(tmp_zip, "w", compression=zipfile.ZIP_STORED) as zf:
        for fpath in CKPT_DIR.rglob("*"):
            if fpath.is_file():
                arcname = fpath.relative_to(CKPT_DIR.parent)
                zf.write(fpath, arcname)

    print(f"  Packed to {tmp_zip}  ({tmp_zip.stat().st_size:,} bytes)")

    try:
        ckpt = torch.load(tmp_zip, map_location="cpu", weights_only=False)
        print("SUCCESS via zip")
    except Exception as e2:
        print(f"zip load failed: {e2}")
        ckpt = None
    finally:
        tmp_zip.unlink(missing_ok=True)

except Exception as e:
    print(f"Failed: {e}")
    ckpt = None

if ckpt is None:
    print("\nCould not load checkpoint — trying ultralytics YOLO directly")
    from ultralytics import YOLO
    model = YOLO("checkpoint", task="detect")
    print("YOLO predict test:")
    imgs = sorted(Path("test/images").glob("*.jpg"))[:3]
    for img in imgs:
        r = model.predict(str(img), conf=0.25, verbose=False)
        n = len(r[0].boxes) if r[0].boxes is not None else 0
        print(f"  {img.name[:55]}  heads={n}")
    sys.exit(0)

# ── Step 3: inspect what we loaded ───────────────────────────────────
print(f"\n=== Checkpoint contents ===")
print(f"Type: {type(ckpt).__name__}")
if isinstance(ckpt, dict):
    print(f"Keys: {list(ckpt.keys())}")
    for k, v in ckpt.items():
        if isinstance(v, dict):
            print(f"  {k}: dict({len(v)}) first keys={list(v.keys())[:5]}")
        elif hasattr(v, "shape"):
            print(f"  {k}: tensor{tuple(v.shape)}")
        elif isinstance(v, (int, float, str)):
            print(f"  {k}: {type(v).__name__}={repr(v)[:80]}")
        elif hasattr(v, "state_dict"):
            sd = v.state_dict()
            print(f"  {k}: nn.Module({type(v).__name__}), {len(sd)} weights")
        else:
            print(f"  {k}: {type(v).__name__}")

    # Save as standard .pt so YOLO can load it
    if not OUT_PT.exists():
        torch.save(ckpt, OUT_PT)
        print(f"\nSaved as {OUT_PT}  ({OUT_PT.stat().st_size:,} bytes)")

elif isinstance(ckpt, torch.nn.Module):
    print(f"Full model: {type(ckpt).__name__}")
    torch.save({"model": ckpt}, OUT_PT)
    print(f"Saved as {OUT_PT}")

# ── Step 4: test YOLO load on the .pt ────────────────────────────────
if OUT_PT.exists():
    print(f"\n=== Testing YOLO with {OUT_PT} ===")
    from ultralytics import YOLO
    try:
        model = YOLO(str(OUT_PT), task="detect")
        imgs = sorted(Path("test/images").glob("*.jpg"))[:5]
        for img in imgs:
            r = model.predict(str(img), conf=0.25, verbose=False)
            n = len(r[0].boxes) if r[0].boxes is not None else 0
            print(f"  {img.name[:55]}  heads={n}")
    except Exception as e:
        print(f"YOLO .pt load failed: {e}")
