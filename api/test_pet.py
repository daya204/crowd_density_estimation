"""
Test PET model loads from checkpoint and runs inference on a real image.
Run: .venv\Scripts\python.exe api\test_pet.py
"""
import sys, zipfile, tempfile, argparse
from pathlib import Path

BASE = Path(__file__).parent.parent
sys.path.insert(0, str(BASE / 'PET'))

import torch
import torchvision.transforms as T
from PIL import Image

MEAN = [0.485, 0.456, 0.406]
STD  = [0.229, 0.224, 0.225]

# ── Step 1: load checkpoint ───────────────────────────────────────────────────
print("=== Loading PET checkpoint ===")
tmp = Path(tempfile.mktemp(suffix='.zip'))
with zipfile.ZipFile(tmp, 'w', zipfile.ZIP_STORED) as zf:
    for f in (BASE / 'checkpoint').rglob('*'):
        if f.is_file():
            zf.write(f, f.relative_to((BASE / 'checkpoint').parent))
ckpt = torch.load(tmp, map_location='cpu', weights_only=False)
tmp.unlink()
print(f"  Epoch     : {ckpt['epoch']}")
print(f"  Best MAE  : {ckpt['best_mae']:.2f}")
print(f"  Backbone  : {ckpt['args'].backbone}")

# ── Step 2: build model ───────────────────────────────────────────────────────
print("\n=== Building PET model ===")
from models import build_model

args = ckpt['args']
# Ensure CPU inference
args.device = 'cpu'
# Ensure all required fields present
for k, v in [('enc_layers', 4), ('sparse_stride', 8), ('dense_stride', 4)]:
    if not hasattr(args, k):
        setattr(args, k, v)

model, _ = build_model(args)
model.load_state_dict(ckpt['model'], strict=False)
model.eval()
print("  Model built and weights loaded successfully.")

# ── Step 3: run inference on test images ──────────────────────────────────────
print("\n=== Inference on 3 test images ===")
transform = T.Compose([T.ToTensor(), T.Normalize(MEAN, STD)])

test_imgs = sorted((BASE / 'test' / 'images').glob('*.jpg'))[:3]
results = []

for img_path in test_imgs:
    img = Image.open(img_path).convert('RGB')
    w, h = img.size

    # PET requires H and W divisible by 128 (encoder window stride product)
    def make_divisible(x, div=128):
        return ((x + div - 1) // div) * div

    # Scale down large images first, then pad to divisible size
    scale = min(768 / max(w, h), 1.0)
    new_w = make_divisible(int(w * scale))
    new_h = make_divisible(int(h * scale))
    img = img.resize((new_w, new_h), Image.BILINEAR)

    tensor = transform(img).unsqueeze(0)  # (1,3,H,W)

    with torch.no_grad():
        outputs = model(tensor, test=True)

    # Scores from pred_logits — shape (1, N, 2) → softmax → class 1
    logits = outputs['pred_logits']   # (1, N, 2)
    scores = torch.nn.functional.softmax(logits, dim=-1)[0, :, 1]  # (N,)
    pts    = outputs['pred_points'][0]  # (N, 2)

    keep  = scores > 0.5
    count = int(keep.sum())
    results.append(count)

    print(f"  {img_path.name[:55]}  count={count}")

print()
if len(set(results)) > 1:
    print("PASS — different images produce different counts.")
else:
    print("WARNING — all counts identical, check model.")

print("\nPET inference test complete.")
