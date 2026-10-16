"""
Train YOLOv8n on the JHU-Crowd head-detection dataset.

CPU-optimised settings:
  - imgsz=416  (vs 640) -> 2.4x faster per batch
  - batch=8              -> lower memory, fewer iterations
  - epochs=10            -> ~3-4 hrs on CPU; last.pt usable after epoch 1

Run:
    .venv/Scripts/python api/train_yolo.py

Output weights (in order of preference):
    runs/detect/crowd_head/weights/best.pt   <- best validation mAP
    runs/detect/crowd_head/weights/last.pt   <- most recent epoch
"""

from pathlib import Path
from ultralytics import YOLO

BASE = Path(__file__).parent.parent
DATA = BASE / "data.yaml"
OUT  = BASE / "runs" / "detect" / "crowd_head"

def main() -> None:
    print("=" * 62)
    print("  CrowdSense -- YOLOv8n head-detection training")
    print("=" * 62)
    print(f"  Dataset : {DATA}")
    print(f"  Output  : {OUT}")
    print()

    model = YOLO("yolov8n.pt")

    results = model.train(
        data        = str(DATA),
        epochs      = 10,         # usable after epoch 1; best.pt updates each epoch
        imgsz       = 416,        # 2.4x faster than 640 on CPU, still good for heads
        batch       = 8,
        workers     = 0,          # 0 = main thread, avoids Windows multiprocessing issues
        project     = str(BASE / "runs" / "detect"),
        name        = "crowd_head",
        exist_ok    = True,
        patience    = 5,          # early-stop after 5 epochs without improvement
        save        = True,
        save_period = 1,          # save weights every epoch -> last.pt always current
        val         = True,
        device      = "cpu",
        verbose     = True,
        # Tell YOLO the dataset has up to 8091 objects per image
        max_det     = 8091,
        # Light augmentation
        hsv_h       = 0.015,
        hsv_s       = 0.7,
        hsv_v       = 0.4,
        fliplr      = 0.5,
        mosaic      = 0.5,
    )

    best  = OUT / "weights" / "best.pt"
    last  = OUT / "weights" / "last.pt"

    print()
    print("=" * 62)
    if best.exists():
        print(f"  best.pt : {best}  ({best.stat().st_size/1e6:.1f} MB)")
    if last.exists():
        print(f"  last.pt : {last}  ({last.stat().st_size/1e6:.1f} MB)")
    try:
        d = results.results_dict
        print(f"  mAP50    : {d.get('metrics/mAP50(B)', 'n/a')}")
        print(f"  mAP50-95 : {d.get('metrics/mAP50-95(B)', 'n/a')}")
    except Exception:
        pass
    print("=" * 62)


if __name__ == "__main__":
    main()
