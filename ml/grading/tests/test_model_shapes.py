"""Shape/contract tests for the model. Skipped automatically if torch isn't installed,
so the torch-free schema tests still run in any environment."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    import torch  # noqa
    HAVE_TORCH = True
except Exception:
    HAVE_TORCH = False


def _skip():
    print("SKIP test_model_shapes (torch not installed)")


def test_head_shapes_without_backbone():
    """Heads alone (no DINOv2 download) produce the right shapes."""
    if not HAVE_TORCH:
        return _skip()
    import torch
    from reloop_grading.config import HeadConfig
    from reloop_grading.heads import GradeHead, ConfidenceHead, DefectHead, SeverityHead
    from reloop_grading.schema import NUM_GRADES, NUM_DEFECTS

    d, B = 768, 4
    x = torch.randn(B, d)
    hc = HeadConfig()
    assert GradeHead(d, hc)(x).shape == (B, NUM_GRADES)
    assert ConfidenceHead(d, hc)(x).shape == (B,)
    pres, sev = DefectHead(d, hc)(x)
    assert pres.shape == (B, NUM_DEFECTS) and sev.shape == (B, NUM_DEFECTS)
    assert float(sev.min()) >= 0.0 and float(sev.max()) <= 1.0
    dmg = SeverityHead(d, hc)(x)
    assert dmg.shape == (B,) and float(dmg.min()) >= 0.0 and float(dmg.max()) <= 1.0


def test_loss_runs_with_masks():
    if not HAVE_TORCH:
        return _skip()
    import torch
    from reloop_grading.config import LossWeights
    from reloop_grading.losses import compute_losses
    from reloop_grading.schema import NUM_GRADES, NUM_DEFECTS

    B = 4
    outputs = {
        "grade_logits": torch.randn(B, NUM_GRADES, requires_grad=True),
        "confidence_logit": torch.randn(B, requires_grad=True),
        "defect_presence_logits": torch.randn(B, NUM_DEFECTS, requires_grad=True),
        "defect_severity": torch.rand(B, NUM_DEFECTS),
        "damage_score": torch.rand(B, requires_grad=True),
    }
    batch = {
        "grade_idx": torch.randint(0, NUM_GRADES, (B,)),
        "has_grade": torch.tensor([1.0, 1.0, 0.0, 1.0]),   # one source w/o grade (SOP-like)
        "damage": torch.rand(B),
        "has_damage": torch.tensor([1.0, 1.0, 0.0, 1.0]),
        "defect_presence": (torch.rand(B, NUM_DEFECTS) > 0.7).float(),
        "defect_severity": torch.rand(B, NUM_DEFECTS),
        "has_defect": torch.tensor([1.0, 0.0, 0.0, 1.0]),
    }
    total, parts = compute_losses(outputs, batch, LossWeights())
    assert torch.isfinite(total)
    total.backward()  # gradients flow
    assert set(parts) == {"grade", "confidence", "defect", "severity", "damage"}


if __name__ == "__main__":
    test_head_shapes_without_backbone()
    test_loss_runs_with_masks()
    print("MODEL SHAPE TESTS PASSED ✅" if HAVE_TORCH else "torch absent — shape tests skipped")
