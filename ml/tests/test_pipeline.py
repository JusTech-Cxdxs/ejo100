import datetime as dt
import json
from pathlib import Path

import numpy as np
import pytest

from ejo_ml import TASKS, synth
from ejo_ml.cli import main, payload
from ejo_ml.client import PortalError, _check_url
from ejo_ml.data import DatasetError, jobs_frame, parts_frame, read_jsonl, time_split
from ejo_ml.tasks import anomaly, demand, duration, lines, themes

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def jobs():
    return jobs_frame(synth.jobs(700, seed=3))


@pytest.fixture(scope="module")
def parts():
    return parts_frame(synth.parts(seed=9))


def test_every_task_trains_on_a_realistic_history_and_beats_its_baseline(jobs, parts):
    results = [duration.train(jobs, n_estimators=150), lines.train(jobs), anomaly.train(jobs), themes.train(jobs), demand.train(parts)]
    assert [r.task for r in results] == ["JOB_DURATION", "ESTIMATE_LINES", "PRICE_ANOMALY", "COMPLAINT_THEMES", "PARTS_DEMAND"]
    for r in results:
        assert r.artifact and r.artifact["format"] == "ejo-ml/1" and r.artifact["task"] == r.task
        assert r.gate.passed, (r.task, r.gate.reasons)
        json.dumps(r.artifact)  # serialisable, no numpy types


def test_duration_ranges_are_ordered_and_cover_most_jobs(jobs):
    r = duration.train(jobs, n_estimators=150)
    assert 0.6 <= r.metrics["range_coverage"] <= 0.95
    assert r.metrics["mae_hours"] < r.baseline["mae_hours"]


def test_too_little_history_trains_nothing_and_says_why():
    few = jobs_frame(synth.jobs(40, seed=1))
    for train in (duration.train, lines.train, themes.train):
        r = train(few)
        assert r.artifact is None and not r.gate.passed and "Needs at least" in r.gate.reasons[0]
    p = demand.train(parts_frame([{"part_id": "x", "weekly": [0, 1, 0], "as_of": "2026-10-05"}]))
    assert p.artifact is None


def test_croston_handles_intermittent_demand():
    y = np.array([0, 0, 4, 0, 0, 0, 4, 0, 0, 4] * 4, dtype=float)
    rate = demand.croston_sba(y, 0.1)
    assert 0.9 < rate < 1.5  # about 4 every 3.3 weeks
    assert demand.croston_sba(np.zeros(10)) == 0.0


def test_the_time_split_keeps_the_newest_jobs_for_testing(jobs):
    s = time_split(jobs)
    assert s.train["opened_on"].max() <= s.valid["opened_on"].min() <= s.test["opened_on"].min()


def test_bad_datasets_are_refused():
    with pytest.raises(DatasetError):
        read_jsonl(["{not json"])
    with pytest.raises(DatasetError):
        jobs_frame([{"row_id": "a"}])
    with pytest.raises(DatasetError):
        parts_frame([{"part_id": "p", "weekly": [1, -2], "as_of": "2026-10-05"}])


def test_the_portal_address_must_be_https():
    assert _check_url("https://portal.example.com/") == "https://portal.example.com"
    assert _check_url("http://localhost:3001") == "http://localhost:3001"
    with pytest.raises(PortalError):
        _check_url("http://portal.example.com")


def test_an_upload_carries_no_personal_fields(jobs):
    r = lines.train(jobs)
    body = payload("kewalram-nigeria", r, dt.datetime(2026, 10, 15, tzinfo=dt.timezone.utc))
    assert body["version"].startswith("estimate-lines-tfidf-logreg-ovr-20261015-")
    text = json.dumps(body)
    for word in ("row_id", "customer", "phone", "email", "plate"):
        assert word not in text


def test_offline_training_end_to_end(tmp_path):
    data = tmp_path / "data"
    assert main(["synth", "--out", str(data), "--jobs", "500"]) == 0
    out = tmp_path / "out"
    assert main(["train", "--from-dir", str(data), "--out", str(out)]) == 0
    assert sorted(p.stem.upper() for p in out.glob("*.json")) == sorted(TASKS)


def test_committed_fixtures_are_current(tmp_path):
    """The portal's parity tests use ml/fixtures; regenerate them with `python -m ejo_ml fixtures --out fixtures` after any model change."""
    assert main(["fixtures", "--out", str(tmp_path)]) == 0
    for f in sorted((ROOT / "fixtures").glob("*.json")):
        close(json.loads(f.read_text()), json.loads((tmp_path / f.name).read_text()), f.name)


def close(a, b, where: str) -> None:
    """Equal, with numbers allowed to differ in the last digits (another CPU's floating point)."""
    if isinstance(a, dict):
        assert isinstance(b, dict) and a.keys() == b.keys(), f"{where}: keys differ — fixtures out of date"
        for k in a:
            close(a[k], b[k], f"{where}.{k}")
    elif isinstance(a, list):
        assert isinstance(b, list) and len(a) == len(b), f"{where}: length differs — fixtures out of date"
        for i, (x, y) in enumerate(zip(a, b)):
            close(x, y, f"{where}[{i}]")
    elif isinstance(a, float) or isinstance(b, float):
        assert b == pytest.approx(a, rel=1e-6, abs=1e-9), f"{where}: {a} != {b} — fixtures out of date"
    else:
        assert a == b, f"{where}: {a!r} != {b!r} — fixtures out of date"


def test_the_decision_model_learns_send_backs_and_is_calibrated():
    from ejo_ml.data import decisions_frame
    from ejo_ml.tasks import decisions

    r = decisions.train(decisions_frame(synth.decisions()))
    assert r.task == "DECISION_RISK" and r.gate.passed, r.gate.reasons
    assert r.metrics["auc"] >= 0.65 and r.metrics["brier"] < r.baseline["brier"]
    a = r.artifact
    assert a["features"] == decisions.feature_names(a["steps"], a["roles"])
    xs, ys = a["calibration"]["x"], a["calibration"]["y"]
    assert all(b >= c for b, c in zip(xs[1:], xs)) and all(b >= c - 1e-12 for b, c in zip(ys[1:], ys)) and 0 <= min(ys) and max(ys) <= 1
    # Nothing about people: roles and steps only.
    assert not any("@" in str(v) for v in a["roles"] + a["steps"])
    json.dumps(a)


def test_the_decision_model_waits_for_enough_send_backs():
    from ejo_ml.data import decisions_frame
    from ejo_ml.tasks import decisions

    rows = [dict(r, rejected=0) for r in synth.decisions(400)]
    r = decisions.train(decisions_frame(rows))
    assert r.artifact is None and "send-backs" in r.gate.reasons[0]
    few = decisions.train(decisions_frame(synth.decisions(100)))
    assert few.artifact is None and "Needs at least 300" in few.gate.reasons[0]
