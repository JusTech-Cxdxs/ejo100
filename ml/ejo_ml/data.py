"""The two training sets the portal exports (GET /api/ml/datasets/...).

jobs.jsonl  one finished job per line (predict/dataset-core.ts DatasetRow):
            opened_on, kind, complaint_tokens, feature_tokens, work_numbers,
            turnaround_hours, lines [{type, key, label, quantity, unit_price, amount}]
            — no names, contacts, plates, VINs or record ids.
parts.jsonl one stocked part per line: part_id, weekly (consumption per
            Lagos week, oldest first), as_of (the last week's Monday).
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd

JOB_COLUMNS = ("row_id", "kind", "opened_on", "complaint_tokens", "feature_tokens", "work_numbers", "turnaround_hours", "lines")
PART_COLUMNS = ("part_id", "weekly", "as_of")


class DatasetError(ValueError):
    pass


def read_jsonl(lines: Iterable[str]) -> list[dict]:
    out = []
    for n, line in enumerate(lines, 1):
        line = line.strip()
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as e:
            raise DatasetError(f"Line {n} is not JSON: {e}") from None
        if not isinstance(row, dict):
            raise DatasetError(f"Line {n} is not an object")
        out.append(row)
    return out


def jobs_frame(rows: list[dict]) -> pd.DataFrame:
    """Checked, time-ordered jobs."""
    for i, r in enumerate(rows):
        missing = [c for c in JOB_COLUMNS if c not in r]
        if missing:
            raise DatasetError(f"Job row {i + 1} lacks {', '.join(missing)}")
        for c in ("complaint_tokens", "feature_tokens", "lines"):
            if not isinstance(r[c], list):
                raise DatasetError(f"Job row {i + 1}: {c} must be a list")
        if not isinstance(r["work_numbers"], dict):
            raise DatasetError(f"Job row {i + 1}: work_numbers must be an object")
    df = pd.DataFrame(rows, columns=list(JOB_COLUMNS))
    df["opened_on"] = pd.to_datetime(df["opened_on"], format="%Y-%m-%d", errors="raise")
    df["turnaround_hours"] = pd.to_numeric(df["turnaround_hours"], errors="coerce")
    return df.sort_values(["opened_on", "row_id"], kind="mergesort").reset_index(drop=True)


def parts_frame(rows: list[dict]) -> pd.DataFrame:
    for i, r in enumerate(rows):
        missing = [c for c in PART_COLUMNS if c not in r]
        if missing:
            raise DatasetError(f"Part row {i + 1} lacks {', '.join(missing)}")
        w = r["weekly"]
        if not isinstance(w, list) or not all(isinstance(x, (int, float)) and x >= 0 for x in w):
            raise DatasetError(f"Part row {i + 1}: weekly must be a list of non-negative numbers")
    return pd.DataFrame(rows, columns=list(PART_COLUMNS))


@dataclass
class Split:
    train: pd.DataFrame
    valid: pd.DataFrame
    test: pd.DataFrame


def time_split(df: pd.DataFrame, valid: float = 0.15, test: float = 0.2) -> Split:
    """Oldest → train, then validation, newest → test: a model is judged on the period after the one it learned from."""
    n = len(df)
    n_test = max(1, int(round(n * test)))
    n_valid = max(1, int(round(n * valid)))
    n_train = n - n_valid - n_test
    if n_train < 1:
        raise DatasetError("Not enough rows to split")
    return Split(df.iloc[:n_train].reset_index(drop=True), df.iloc[n_train : n_train + n_valid].reset_index(drop=True), df.iloc[n_train + n_valid :].reset_index(drop=True))


def load_dir(path: Path) -> tuple[pd.DataFrame | None, pd.DataFrame | None]:
    jobs = path / "jobs.jsonl"
    parts = path / "parts.jsonl"
    j = jobs_frame(read_jsonl(jobs.read_text(encoding="utf-8").splitlines())) if jobs.exists() else None
    p = parts_frame(read_jsonl(parts.read_text(encoding="utf-8").splitlines())) if parts.exists() else None
    return j, p


def line_tokens(lines: list[dict]) -> list[str]:
    """As the portal's lineTokens(): "line:<key>", each key once."""
    seen: list[str] = []
    for line in lines:
        t = f"line:{line.get('key', '')}"[:120]
        if t not in seen:
            seen.append(t)
    return seen
