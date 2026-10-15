"""TF-IDF over already-tokenised text.

The portal tokenises (apps/portal/lib/enyo/predict/text.ts) and writes the
tokens into every training row, so Python never re-implements the tokeniser:
training and use see exactly the same words. Here we only weigh them the way
the portal's runtime does (runtime-core.ts `tfidf`): sublinear TF
(1 + ln n), smoothed IDF (ln((N + 1) / (df + 1)) + 1), L2 normalisation.
"""
from __future__ import annotations

from typing import Iterable, Sequence

import numpy as np
from scipy import sparse
from sklearn.feature_extraction.text import TfidfVectorizer


def _identity(tokens: Sequence[str]) -> Sequence[str]:
    return tokens


def fit_tfidf(docs: Iterable[Sequence[str]], min_df: int = 2, max_features: int | None = 8000) -> TfidfVectorizer:
    vec = TfidfVectorizer(analyzer=_identity, lowercase=False, sublinear_tf=True, smooth_idf=True, norm="l2", min_df=min_df, max_features=max_features)
    vec.fit([list(d) for d in docs])
    return vec


def transform(vec: TfidfVectorizer, docs: Iterable[Sequence[str]]) -> sparse.csr_matrix:
    return vec.transform([list(d) for d in docs]).tocsr()


def spec(vec: TfidfVectorizer) -> dict:
    """The portal's TfidfSpec: vocab in column order and the IDF of each column."""
    vocab = [None] * len(vec.vocabulary_)
    for word, col in vec.vocabulary_.items():
        vocab[col] = word
    return {"vocab": vocab, "idf": [float(x) for x in vec.idf_]}


def tfidf_from_spec(spec_: dict, tokens: Sequence[str]) -> dict[int, float]:
    """The portal's runtime TF-IDF, in Python (for the self-check before upload)."""
    index = {w: i for i, w in enumerate(spec_["vocab"])}
    tf: dict[int, int] = {}
    for t in tokens:
        i = index.get(t)
        if i is not None:
            tf[i] = tf.get(i, 0) + 1
    v = {i: (1 + np.log(n)) * spec_["idf"][i] for i, n in tf.items()}
    norm = float(np.sqrt(sum(w * w for w in v.values())))
    return {i: w / norm for i, w in v.items()} if norm > 0 else v
