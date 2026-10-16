"""Download VGG-16 BN weights for PET backbone."""
import urllib.request, sys
from pathlib import Path

URL  = "https://download.pytorch.org/models/vgg16_bn-6c64b313.pth"
DEST = Path(__file__).parent.parent / "PET" / "pretrained" / "vgg16_bn-6c64b313.pth"
DEST.parent.mkdir(parents=True, exist_ok=True)

EXPECTED_MB = 528

def progress(count, block, total):
    mb = count * block / 1e6
    pct = min(count * block / total * 100, 100) if total > 0 else 0
    print(f"\r  {mb:.1f} MB  ({pct:.0f}%)  ", end="", flush=True)

print(f"Downloading VGG-16 BN weights to:\n  {DEST}\n")
urllib.request.urlretrieve(URL, DEST, reporthook=progress)
print()

size_mb = DEST.stat().st_size / 1e6
print(f"Downloaded: {size_mb:.1f} MB")
if size_mb < 400:
    print("ERROR: File too small — download may have been truncated.")
    sys.exit(1)
else:
    print("SUCCESS: VGG-16 BN weights ready.")
