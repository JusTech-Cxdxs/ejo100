"""Command line.

  python -m ejo_ml train --portal https://portal.example.com --organisation kewalram-nigeria
        Fetches the organisation's de-identified history from the portal, trains
        every task, and uploads each model that was trained (as CANDIDATE, or
        REJECTED with its reasons). Needs ML_SERVICE_TOKEN in the environment.
  python -m ejo_ml train --from-dir data/ --out out/          (offline: files in, files out)
  python -m ejo_ml synth --out data/                          (an invented history to try it)
  python -m ejo_ml fixtures --out fixtures/                   (parity cases for the portal's tests)
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import sys
from pathlib import Path

from . import TASKS, __version__
from .client import PortalError, fetch_dataset, upload_model
from .data import DatasetError, jobs_frame, load_dir, parts_frame, read_jsonl
from .tasks import Result, anomaly, demand, duration, lines, themes

JOB_TASKS = {"JOB_DURATION": duration.train, "ESTIMATE_LINES": lines.train, "PRICE_ANOMALY": anomaly.train, "COMPLAINT_THEMES": themes.train}


def trainer_name() -> str:
    import lightgbm
    import sklearn

    return f"ejo-ml {__version__} · python {platform.python_version()} · scikit-learn {sklearn.__version__} · lightgbm {lightgbm.__version__}"


def version_of(result: Result, when: dt.datetime) -> str:
    digest = hashlib.sha256(json.dumps(result.artifact, sort_keys=True).encode()).hexdigest()[:6]
    return f"{result.task.lower().replace('_', '-')}-{result.algorithm}-{when:%Y%m%d}-{digest}"


def payload(organisation: str, result: Result, when: dt.datetime) -> dict:
    return {
        "organisation": organisation, "task": result.task, "version": version_of(result, when), "algorithm": result.algorithm,
        "metrics": result.metrics, "baseline": result.baseline, "gate": result.gate.as_dict(), "artifact": result.artifact,
        "rows": result.rows, "dataFrom": result.data_from.isoformat() if result.data_from else None, "dataTo": result.data_to.isoformat() if result.data_to else None,
        "trainer": trainer_name(), "trainedAt": when.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
    }


def run_tasks(jobs, parts, tasks: list[str]) -> list[Result]:
    out = []
    for task in tasks:
        if task == "PARTS_DEMAND":
            if parts is not None:
                out.append(demand.train(parts))
        elif jobs is not None:
            out.append(JOB_TASKS[task](jobs))
    return out


def summary(r: Result) -> str:
    state = "passed" if r.gate.passed else ("rejected" if r.artifact else "not trained")
    return f"{r.task:<17} {state:<11} rows={r.rows:<6} {' '.join(r.gate.reasons)}"


def cmd_train(a) -> int:
    when = dt.datetime.now(dt.timezone.utc)
    tasks = [t.strip().upper() for t in a.tasks.split(",")] if a.tasks else list(TASKS)
    bad = [t for t in tasks if t not in TASKS]
    if bad:
        print(f"Unknown task(s): {', '.join(bad)}", file=sys.stderr)
        return 2
    try:
        if a.from_dir:
            jobs, parts = load_dir(Path(a.from_dir))
        else:
            token = os.environ.get("ML_SERVICE_TOKEN", "")
            if not a.portal or not a.organisation or len(token) < 32:
                print("Needs --portal, --organisation and ML_SERVICE_TOKEN (at least 32 characters) in the environment.", file=sys.stderr)
                return 2
            jobs = jobs_frame(read_jsonl(fetch_dataset(a.portal, token, a.organisation, "jobs")))
            parts = parts_frame(read_jsonl(fetch_dataset(a.portal, token, a.organisation, "parts")))
    except (DatasetError, PortalError, OSError) as e:
        print(f"Could not load the data: {e}", file=sys.stderr)
        return 1
    results = run_tasks(jobs, parts, tasks)
    out_dir = Path(a.out) if a.out else None
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
    failures = 0
    for r in results:
        print(summary(r))
        if not r.artifact:
            continue
        body = payload(a.organisation or "offline", r, when)
        if out_dir:
            (out_dir / f"{r.task.lower()}.json").write_text(json.dumps(body, separators=(",", ":")), encoding="utf-8")
        if not a.from_dir and not a.dry_run:
            try:
                res = upload_model(a.portal, os.environ["ML_SERVICE_TOKEN"], body)
                print(f"  uploaded {body['version']} → {res.get('status', '?')}")
            except PortalError as e:
                failures += 1
                print(f"  upload failed: {e}", file=sys.stderr)
    return 1 if failures else 0


def cmd_synth(a) -> int:
    from . import synth

    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    (out / "jobs.jsonl").write_text("".join(json.dumps(r) + "\n" for r in synth.jobs(a.jobs)), encoding="utf-8")
    (out / "parts.jsonl").write_text("".join(json.dumps(r) + "\n" for r in synth.parts()), encoding="utf-8")
    print(f"Wrote {a.jobs} invented jobs and {len(synth.parts())} parts to {out}")
    return 0


def cmd_fixtures(a) -> int:
    from .fixtures import write_fixtures

    write_fixtures(Path(a.out))
    return 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="ejo_ml", description="Enyo machine learning for EJO 100")
    sub = p.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("train", help="train an organisation's models")
    t.add_argument("--portal", help="the portal's address, e.g. https://portal.example.com")
    t.add_argument("--organisation", help="the organisation's slug (Organisation page)")
    t.add_argument("--tasks", help=f"comma-separated, default all: {','.join(TASKS)}")
    t.add_argument("--from-dir", help="train from jobs.jsonl / parts.jsonl in this folder instead of the portal")
    t.add_argument("--out", help="also write each model's upload to this folder")
    t.add_argument("--dry-run", action="store_true", help="train and report, upload nothing")
    t.set_defaults(fn=cmd_train)
    s = sub.add_parser("synth", help="write an invented workshop history")
    s.add_argument("--out", required=True)
    s.add_argument("--jobs", type=int, default=900)
    s.set_defaults(fn=cmd_synth)
    f = sub.add_parser("fixtures", help="write parity fixtures for the portal's tests")
    f.add_argument("--out", required=True)
    f.set_defaults(fn=cmd_fixtures)
    a = p.parse_args(argv)
    return a.fn(a)
