"""Talking to the portal's machine endpoints (no database credentials here).

GET  {portal}/api/ml/datasets/jobs?organisation=<slug>    → jobs.jsonl
GET  {portal}/api/ml/datasets/parts?organisation=<slug>   → parts.jsonl
POST {portal}/api/ml/models                               ← one trained model

Authorised by ML_SERVICE_TOKEN (Authorization: Bearer). HTTPS only, except
http://localhost for development. The token is never printed.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 120


class PortalError(RuntimeError):
    pass


def _check_url(base: str) -> str:
    u = urllib.parse.urlparse(base.rstrip("/"))
    if u.scheme == "https" or (u.scheme == "http" and u.hostname in ("localhost", "127.0.0.1")):
        return base.rstrip("/")
    raise PortalError("The portal address must start with https:// (http:// only for localhost).")


def _request(method: str, url: str, token: str, body: bytes | None = None) -> bytes:
    req = urllib.request.Request(url, data=body, method=method, headers={"Authorization": f"Bearer {token}", "Accept": "application/json, application/x-ndjson", **({"Content-Type": "application/json"} if body else {})})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:  # noqa: S310 (scheme checked above)
            return res.read()
    except urllib.error.HTTPError as e:
        detail = e.read(2000).decode("utf-8", "replace")
        try:
            detail = json.loads(detail).get("error", detail)
        except (ValueError, AttributeError):
            pass
        raise PortalError(f"{method} {urllib.parse.urlparse(url).path} answered {e.code}: {detail}") from None
    except urllib.error.URLError as e:
        raise PortalError(f"Could not reach the portal: {e.reason}") from None


def fetch_dataset(base: str, token: str, organisation: str, name: str) -> list[str]:
    url = f"{_check_url(base)}/api/ml/datasets/{name}?{urllib.parse.urlencode({'organisation': organisation})}"
    return _request("GET", url, token).decode("utf-8").splitlines()


def upload_model(base: str, token: str, payload: dict) -> dict:
    url = f"{_check_url(base)}/api/ml/models"
    return json.loads(_request("POST", url, token, json.dumps(payload, separators=(",", ":")).encode("utf-8")) or b"{}")
