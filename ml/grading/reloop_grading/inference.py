"""Inference: single-image structured grading + an embedding-comparison step that
diffs the RETURNED image against the ORIGINAL Amazon catalog image.

Both images run independently through the SAME trained DINOv2 encoder, so the
comparison lives in one feature space. The comparator is an INTERFACE — the default
is cosine/euclid/absdiff on the shared embedding; a future trained Siamese network
can replace it without changing this module's outputs or any downstream API.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol, Union

import torch
from PIL import Image

from .config import Config
from .model import GradingModel
from .schema import GradingOutput
from .data.dataset import build_transform

ImageLike = Union[str, Image.Image]

# if the grade claims near-pristine but the item looks very different from its
# original listing, we don't trust it — drop confidence and flag.
LOW_SIMILARITY = 0.60
PRISTINE_GRADES = ("new", "like-new")


@dataclass
class ComparisonResult:
    similarity: float       # cosine, 0..1-ish (higher = more alike)
    euclidean: float
    absdiff_mean: float

    def to_json(self) -> dict:
        return {
            "similarity": round(self.similarity, 4),
            "euclidean": round(self.euclidean, 4),
            "absdiff_mean": round(self.absdiff_mean, 4),
        }


class EmbeddingComparator(Protocol):
    """Swap-in point for a future Siamese network. Contract: two embeddings in,
    one ComparisonResult out."""
    def compare(self, emb_ref: torch.Tensor, emb_ret: torch.Tensor) -> ComparisonResult: ...


class CosineComparator:
    """Default, training-free comparator over the shared DINOv2 embedding."""
    def compare(self, emb_ref: torch.Tensor, emb_ret: torch.Tensor) -> ComparisonResult:
        a = emb_ref.flatten().float()
        b = emb_ret.flatten().float()
        cos = torch.nn.functional.cosine_similarity(a, b, dim=0).item()
        euc = torch.dist(a, b, p=2).item()
        absd = (a - b).abs().mean().item()
        return ComparisonResult(similarity=cos, euclidean=euc, absdiff_mean=absd)


class GradingInference:
    def __init__(self, model: GradingModel, device: str = "cpu",
                 comparator: Optional[EmbeddingComparator] = None):
        self.model = model.to(device).eval()
        self.device = device
        self.comparator: EmbeddingComparator = comparator or CosineComparator()
        self.transform = build_transform(model.cfg.backbone.image_size, train=False)

    def _to_tensor(self, image: ImageLike) -> torch.Tensor:
        img = Image.open(image).convert("RGB") if isinstance(image, str) else image.convert("RGB")
        return self.transform(img).unsqueeze(0).to(self.device)

    @torch.no_grad()
    def _embed(self, image: ImageLike) -> torch.Tensor:
        return self.model.embed(self._to_tensor(image))

    @torch.no_grad()
    def grade(self, image: ImageLike) -> GradingOutput:
        """Single-image grade (no reference)."""
        return self.model.predict(self._to_tensor(image))[0]

    @torch.no_grad()
    def grade_with_reference(self, returned: ImageLike, original: ImageLike) -> GradingOutput:
        """Grade the returned image, then reconcile against the original catalog image."""
        ret_t = self._to_tensor(returned)
        emb_ret = self.model.embed(ret_t)
        out = self.model.predict(ret_t)[0]
        emb_ref = self._embed(original)
        cmp = self.comparator.compare(emb_ref, emb_ret)
        out.similarity = cmp.similarity
        # reconciliation: pristine claim + low similarity => distrust
        if out.grade in PRISTINE_GRADES and cmp.similarity < LOW_SIMILARITY:
            out.confidence = round(out.confidence * 0.6, 4)
            out.needs_review = True
        return out

    def grade_json(self, image: ImageLike, original: Optional[ImageLike] = None) -> dict:
        out = self.grade_with_reference(image, original) if original is not None else self.grade(image)
        return out.to_json()

    @classmethod
    def from_checkpoint(cls, path: str, device: str = "cpu",
                        comparator: Optional[EmbeddingComparator] = None) -> "GradingInference":
        from .registry import load_checkpoint
        model, _ = load_checkpoint(path, device)
        return cls(model, device, comparator)
