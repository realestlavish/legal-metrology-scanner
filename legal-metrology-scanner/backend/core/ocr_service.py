"""PaddleOCR text and bounding-box extraction."""

from __future__ import annotations

import logging
import os
import threading
from typing import Any, Optional, Union

logger = logging.getLogger(__name__)

ImageInput = Union[str, bytes, bytearray, "np.ndarray"]


class OCRService:
    """Lazy singleton wrapper around PaddleOCR."""

    def __init__(self, lang: str = "en", use_angle_cls: bool = True) -> None:
        self.lang = lang
        self.use_angle_cls = use_angle_cls
        self._ocr_engine: Any = None
        self._lock = threading.Lock()

    def warmup(self) -> None:
        _ = self.ocr_engine

    @property
    def ocr_engine(self) -> Any:
        if self._ocr_engine is None:
            with self._lock:
                if self._ocr_engine is None:
                    self._ocr_engine = self._create_engine()
        return self._ocr_engine

    def _create_engine(self) -> Any:
        from paddleocr import PaddleOCR

        kwargs: dict[str, Any] = {
            "use_angle_cls": self.use_angle_cls,
            "lang": self.lang,
        }
        try:
            return PaddleOCR(**kwargs, show_log=False)
        except TypeError:
            logger.info("PaddleOCR does not accept show_log; initializing without it.")
            return PaddleOCR(**kwargs)

    def process_image(self, image: ImageInput) -> list[dict[str, Any]]:
        array, image_height = self._to_bgr_array(image)
        raw = self._run_ocr(array)
        return self._normalize_results(raw, image_height)

    def get_raw_text(self, image: ImageInput) -> str:
        parsed = self.process_image(image)
        return "\n".join(item["text"] for item in parsed if item.get("text"))

    def _run_ocr(self, array: np.ndarray) -> Any:
        engine = self.ocr_engine
        try:
            return engine.ocr(array, cls=self.use_angle_cls)
        except TypeError:
            return engine.ocr(array)

    def _to_bgr_array(self, image: ImageInput) -> tuple[np.ndarray, int]:
        import cv2
        import numpy as np

        if isinstance(image, np.ndarray):
            if image.size == 0:
                raise ValueError("Empty image array")
            height = int(image.shape[0])
            return image, height

        if isinstance(image, (bytes, bytearray)):
            buffer = np.frombuffer(image, dtype=np.uint8)
            decoded = cv2.imdecode(buffer, cv2.IMREAD_COLOR)
            if decoded is None:
                raise ValueError("Could not decode image bytes. Use JPEG, PNG, or WEBP.")
            return decoded, int(decoded.shape[0])

        if isinstance(image, str):
            if not os.path.exists(image):
                raise FileNotFoundError(f"Image file not found at path: '{image}'")
            decoded = cv2.imread(image)
            if decoded is None:
                raise ValueError(f"Could not read image at path: '{image}'")
            return decoded, int(decoded.shape[0])

        raise TypeError(f"Unsupported image input type: {type(image)}")

    def _normalize_results(self, raw: Any, image_height: int) -> list[dict[str, Any]]:
        parsed: list[dict[str, Any]] = []
        if not raw:
            return parsed

        # PaddleOCR 3.x predict-style dicts
        if isinstance(raw, list) and raw and isinstance(raw[0], dict):
            page = raw[0]
            texts = page.get("rec_texts") or page.get("text") or []
            scores = page.get("rec_scores") or page.get("score") or []
            boxes = page.get("rec_polys") or page.get("dt_polys") or page.get("boxes") or []
            for idx, text in enumerate(texts):
                score = float(scores[idx]) if idx < len(scores) else 0.0
                box = boxes[idx] if idx < len(boxes) else []
                parsed.append(self._item(box, str(text), score, image_height))
            return parsed

        pages = raw if isinstance(raw, list) else [raw]
        for page in pages:
            if not page:
                continue
            for line in page:
                box, text, confidence = self._unpack_line(line)
                if text:
                    parsed.append(self._item(box, text, confidence, image_height))
        return parsed

    def _unpack_line(self, line: Any) -> tuple[list[Any], str, float]:
        # Classic 2.x: [box, (text, score)]
        if isinstance(line, (list, tuple)) and len(line) >= 2:
            box = line[0]
            payload = line[1]
            if isinstance(payload, (list, tuple)) and len(payload) >= 2:
                return box, str(payload[0]).strip(), float(payload[1])
            if isinstance(payload, dict):
                return (
                    payload.get("box", box),
                    str(payload.get("text", "")).strip(),
                    float(payload.get("score") or payload.get("confidence") or 0.0),
                )
            return box, str(payload).strip(), 0.0
        if isinstance(line, dict):
            return (
                line.get("box") or line.get("bbox") or [],
                str(line.get("text") or "").strip(),
                float(line.get("confidence") or line.get("score") or 0.0),
            )
        return [], "", 0.0

    def _item(self, box: Any, text: str, confidence: float, image_height: int) -> dict[str, Any]:
        points = self._as_points(box)
        height_px = 0.0
        if points:
            ys = [p[1] for p in points]
            height_px = max(ys) - min(ys)
        rel_height = (height_px / image_height) if image_height else 0.0
        return {
            "box": points,
            "text": text,
            "confidence": float(confidence),
            "height_px": round(float(height_px), 2),
            "relative_height": round(float(rel_height), 4),
        }

    def _as_points(self, box: Any) -> list[list[float]]:
        import numpy as np

        if box is None:
            return []
        try:
            array = np.array(box, dtype=float).reshape(-1, 2)
            return array.tolist()
        except (TypeError, ValueError):
            return []


_service: Optional[OCRService] = None
_service_lock = threading.Lock()


def get_ocr_service(lang: str = "en") -> OCRService:
    global _service
    if _service is None or _service.lang != lang:
        with _service_lock:
            if _service is None or _service.lang != lang:
                _service = OCRService(lang=lang, use_angle_cls=True)
    return _service


def extract_raw_text_from_image(image_path: str, lang: str = "en") -> str:
    return get_ocr_service(lang=lang).get_raw_text(image_path)
