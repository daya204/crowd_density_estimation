"""
Verify the server runs in LIVE mode with real head counts.
Run this AFTER epoch 1 completes (last.pt exists).

Usage:
    .venv/Scripts/python api/verify_live.py
"""
import sys, io, json, uuid, urllib.request, urllib.error
from pathlib import Path

BASE    = Path(__file__).parent.parent
BEST    = BASE / "runs" / "detect" / "crowd_head" / "weights" / "best.pt"
LAST    = BASE / "runs" / "detect" / "crowd_head" / "weights" / "last.pt"
SERVER  = "http://127.0.0.1:8000"

def check_weights():
    print("=== Weights check ===")
    print(f"  best.pt : {'EXISTS  ' if BEST.exists() else 'missing '} {BEST}")
    print(f"  last.pt : {'EXISTS  ' if LAST.exists() else 'missing '} {LAST}")
    if not BEST.exists() and not LAST.exists():
        print("\n  Training still in progress — run again when epoch 1 finishes.")
        sys.exit(0)

def check_server():
    print("\n=== Server health ===")
    try:
        with urllib.request.urlopen(f"{SERVER}/health") as r:
            h = json.loads(r.read())
        print(f"  status          : {h['status']}")
        print(f"  mode            : {h['mode']}")
        print(f"  model           : {h.get('model', 'n/a')}")
        print(f"  best_pt_ready   : {h.get('best_pt_ready')}")
        print(f"  last_pt_ready   : {h.get('last_pt_ready')}")
        if h['mode'] != 'live':
            print("\n  Server is in DEMO mode — restart it so it picks up the new weights:")
            print("    .venv/Scripts/uvicorn api.server:app --reload --port 8000")
            return False
        return True
    except Exception as e:
        print(f"  ERROR: server not reachable — {e}")
        print("  Start it:  .venv/Scripts/uvicorn api.server:app --reload --port 8000")
        return False

def post_image(img_path: Path, capacity: int = 300) -> dict:
    raw = img_path.read_bytes()
    boundary = uuid.uuid4().hex
    def part(name, value, fname=None, ctype="text/plain"):
        cd = f'form-data; name="{name}"'
        if fname: cd += f'; filename="{fname}"'
        hdr = f"--{boundary}\r\nContent-Disposition: {cd}\r\nContent-Type: {ctype}\r\n\r\n"
        return hdr.encode() + (value if isinstance(value, bytes) else value.encode()) + b"\r\n"
    body = (part("file", raw, fname=img_path.name, ctype="image/jpeg") +
            part("capacity", str(capacity)) +
            part("zone", "Test Zone") +
            f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        f"{SERVER}/predict", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def run_inference_test():
    print("\n=== Inference test on 5 real dataset images ===")
    test_imgs = sorted((BASE / "test" / "images").glob("*.jpg"))[:5]
    counts = []
    for img in test_imgs:
        try:
            r = post_image(img)
            count = r["count"]
            mode  = r["mode"]
            occ   = r["occupancy_pct"]
            counts.append(count)
            print(f"  [{mode}] {img.name[:50]:<50}  heads={count:4d}  occupancy={occ}%")
        except Exception as e:
            print(f"  ERROR on {img.name}: {e}")

    print()
    if len(set(counts)) == len(counts):
        print("  All counts are unique — real per-image inference confirmed.")
    elif len(set(counts)) > 1:
        print(f"  {len(set(counts))}/{len(counts)} unique counts — inference is working.")
    else:
        print("  WARNING: all counts identical — model may not be loaded correctly.")

    return counts

if __name__ == "__main__":
    check_weights()
    live = check_server()
    counts = run_inference_test()

    print("\n=== Summary ===")
    if live and len(set(counts)) > 1:
        print("  PASS — server is LIVE with real YOLO head-count inference.")
        print(f"  Head counts: {counts}")
    elif not live:
        print("  PARTIAL — weights exist but server needs restart to go LIVE.")
        print("  Run:  .venv/Scripts/uvicorn api.server:app --reload --port 8000")
    else:
        print("  WARN — inference running but counts look suspicious. Check logs.")
