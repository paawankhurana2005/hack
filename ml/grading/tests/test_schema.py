"""Torch-free tests for the contract bridge. Run: python -m pytest tests/ (or plain python)."""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from reloop_grading.schema import (
    GRADES, DEFECTS, NUM_GRADES, NUM_DEFECTS,
    normalize_defect, grade_from_damage, ordinal_to_grade,
    severity_to_label, GradingOutput, DefectPrediction,
)


def test_grades_ordinal_and_count():
    assert GRADES == ("new", "like-new", "good", "fair", "poor")
    assert NUM_GRADES == 5
    assert ordinal_to_grade(0) == "new"
    assert ordinal_to_grade(99) == "poor"  # clamped


def test_defect_normalization_maps_dataset_terms():
    assert normalize_defect("screen scratch") == "scratch"
    assert normalize_defect("broken_large") == "crack"
    assert normalize_defect("color") == "discoloration"
    assert normalize_defect("bent_lead") == "deformation"
    assert normalize_defect("totally-unknown-thing") == "wear"  # safe fallback
    assert NUM_DEFECTS == len(DEFECTS)


def test_grade_from_damage_ladder():
    assert grade_from_damage(0.0) == "new"
    assert grade_from_damage(0.1) == "like-new"
    assert grade_from_damage(0.3) == "good"
    assert grade_from_damage(0.6) == "fair"
    assert grade_from_damage(0.9) == "poor"


def test_severity_buckets():
    assert severity_to_label(0.1) == "minor"
    assert severity_to_label(0.5) == "moderate"
    assert severity_to_label(0.9) == "severe"


def test_output_json_maps_to_grading_result():
    out = GradingOutput(
        grade="good", confidence=0.91, damage_score=0.14,
        defects=[DefectPrediction("scratch", 0.12)], similarity=0.95,
        model_version="test-v0",
    )
    j = out.to_json()
    assert j["grade"] == "Good" and j["grade_key"] == "good"
    assert j["similarity"] == 0.95 and j["defects"][0]["type"] == "scratch"

    partial = out.to_grading_result_partial("prod_1", ["u.jpg"])
    # fields must line up with TS GradingResult
    assert partial["grade"] == "good"                      # ConditionGrade key
    assert partial["structuredIssues"][0]["severity"] == "minor"
    assert partial["qualityScore"] == round(1 - 0.14, 4)
    assert partial["productId"] == "prod_1"


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn(); print(f"ok  {name}")
    print("ALL SCHEMA TESTS PASSED ✅")
