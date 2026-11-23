"""Image decoding and preprocessing utilities shared across vision objectives."""

from __future__ import annotations

import base64
import io
from typing import Tuple

import cv2
import numpy as np
from PIL import Image


def decode_base64_image(image_b64: str) -> Image.Image:
    """Decode raw base64 or data-URI string into an RGB PIL Image."""
    if "," in image_b64 and image_b64.strip().startswith("data:"):
        _, encoded = image_b64.split(",", 1)
    else:
        encoded = image_b64
    raw_bytes = base64.b64decode(encoded)
    img = Image.open(io.BytesIO(raw_bytes))
    return img.convert("RGB")


def pil_to_cv2_bgr(image: Image.Image) -> np.ndarray:
    """Convert RGB PIL Image to OpenCV BGR numpy array."""
    rgb = np.array(image)
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


def normalize_illumination_bgr(
    bgr: np.ndarray, target_size: Tuple[int, int] = (384, 384)
) -> np.ndarray:
    """Resize and apply CLAHE luminance normalization to mitigate lighting/weather variance."""
    resized = cv2.resize(bgr, target_size, interpolation=cv2.INTER_AREA)
    lab = cv2.cvtColor(resized, cv2.COLOR_BGR2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l_chan)
    merged = cv2.merge((l_eq, a_chan, b_chan))
    return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
