# Enyo machine learning (ML-1)

Each organisation gets its own models, trained on its own de-identified history. The models are trained in Python, then run inside the portal, so production needs no Python server.

## The pieces

| Piece | Where | What it does |
| --- | --- | --- |
| Trainer | `ml/` (Python: pandas, scikit-learn, LightGBM) | Reads the history, trains every task, tests each model on the newest jobs against a simple baseline, and uploads each model. |
| Trainer's door | `/api/ml/datasets/jobs`, `/api/ml/datasets/parts`, `/api/ml/models` | Gives out the de-identified datasets and takes trained models. Authorised by `ML_SERVICE_TOKEN` only, and answers 404 when that is not set. |
| Model register | Table `enyo_models` (v32) | Stores each model with its metrics, its baseline, its gate result and its portable artifact (`ejo-ml/1`). |
| Runtime | `apps/portal/lib/enyo/ml/runtime-core.ts` | Runs the artifacts in TypeScript. Parity tests check its results against the trainer's own, to 9 decimal places. |
| Ladder | Settings → Enyo → Models (`/enyo/models`) | An administrator chooses the model in use and sets each capability to Off, Shadow or Assist. |

The trainer never holds database credentials. The portal removes names, contacts, plates, VINs and record numbers before any data leaves it (`predict/dataset-core.ts`).

## The five tasks

| Task | Algorithm | Baseline it must beat | Shown to people (Assist) |
| --- | --- | --- | --- |
| Job time (opening → ready) | LightGBM quantile regression (10th / 50th / 90th percentile) on complaint words, vehicle context and the approved lines | Median time for the same kind of job (needs 10% less error, and 60–95% of jobs inside the range) | "Likely ready around …" on Job Cards and Vehicle Services after the estimate's final approval |
| Estimate lines | TF-IDF + one-vs-rest logistic regression | The current similar-jobs method, knn-tfidf-1 (needs F1 at least 0.02 higher) | Compared on `/enyo/models` only; it replaces knn in a later release |
| Parts demand | Per part, the best of Croston–SBA, exponential smoothing and a 12-week average, chosen on the last 8 weeks | "Same as last week" | `/inventory/reorder`: the reorder point and a suggested order quantity |
| Unusual prices | Isolation Forest on price, quantity and amount compared with what is usual for that line | A rule that flags prices over 3× or under ⅓ of the usual | A warning under typed-in estimate prices |
| Complaint themes | TF-IDF + k-means, with k chosen by silhouette | — (needs a silhouette of at least 0.05) | Themes and their shares on `/enyo/models` |

A model that fails its gate is stored as **REJECTED**, with its reasons. A model that passes is stored as **CANDIDATE**. Nothing is used until an administrator presses **Use this model**. Every choice, retirement and level change is written to the audit trail.

Levels are Off → Shadow (measured, not shown) → Assist (shown; people decide). None of these capabilities saves, orders or changes a price, so none of them offers Partial or Full automation.

Job time estimates are stored when the estimate gets its final approval. The daily scheduled job then scores them against when the vehicle was actually ready. `/enyo/models` shows the average error and how many estimates fell inside their range.

## Switching it on (owner, once)

1. **Make a token.** In a browser console, run `btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))`. You get a value of about 44 characters.
2. **Set it in the portal.** Vercel → `ejo100-portal` → Environment Variables → `ML_SERVICE_TOKEN` = that value (Production). Then redeploy.
3. **Set the GitHub secrets.** In GitHub → Settings → Secrets and variables → Actions, add:
   - `PORTAL_URL` = `https://ejo100-portal.vercel.app`
   - `ML_SERVICE_TOKEN` = the same value
4. **Train.** In GitHub → Actions → **Train Enyo models** → Run workflow, set organisation to `kewalram-nigeria`. It takes about 3 minutes. The run's summary lists every task with **passed**, **rejected** or **not trained**, and the reason.
5. **Choose the models.** In the portal, go to Enyo learning → **Models** and press **Use this model** on each model marked Ready to use. Leave job times and price warnings in **Shadow** until the measured numbers look right, then move them to **Assist**.

Each task needs a minimum amount of history:

| Task | Needs at least |
| --- | --- |
| Job times | 150 finished jobs with a ready time |
| Estimate lines | 150 finished jobs |
| Unusual prices | 200 typed-in priced lines |
| Complaint themes | 100 complaints |
| Parts demand | 5 parts with 26 weeks of history |

Until then, a task reports "not trained" and nothing changes.

To retrain weekly, uncomment the `schedule:` lines in `.github/workflows/ml-train.yml`.

## Things to know

- **Caching.** Each server keeps the model in use for up to a minute. After **Use this model** or **Retire**, another server can carry on with the previous model for up to 60 seconds.
- **Names in free text.** Training removes the names of the customer and the staff from complaint text. Use in the portal removes contacts, plates and links, but not names. A name is a rare word that the models ignore, so the effect is negligible.
- **Unusual prices.** The model learns what normal looks like only from lines within 3× of the usual price. Its gate checks two things: that it flags a small share of new lines, and that it catches at least 80% of test prices made ten times too high or too low.
- **Job times.** Jobs opened within the usual longest turnaround are left out of training and testing. The long jobs from that period are still open, so the finished ones would be the quick ones and flatter the model.

## Running the trainer elsewhere

```bash
cd ml
python -m venv .venv && . .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q                                   # the trainer's own tests
python -m ejo_ml synth --out /tmp/data                # an invented history
python -m ejo_ml train --from-dir /tmp/data --out /tmp/out
ML_SERVICE_TOKEN=… python -m ejo_ml train --portal https://… --organisation kewalram-nigeria --dry-run
```

## Changing a model

1. Change the task in `ml/ejo_ml/tasks/`.
2. Regenerate the parity fixtures with `python -m ejo_ml fixtures --out fixtures`.
3. Run `pytest` in `ml/` and the portal unit tests (`tests/enyo-ml.test.ts`).

CI runs both. A test fails if the fixtures are out of date.

## Next (ML-2)

- The logistic-regression estimate-lines model goes into the live suggestions, compared in Shadow against knn.
- Diagnostics: likely faults from symptoms and fault codes, which needs a "fault found" field on closing a job.
- Risk scores (late payment, no-show), learning-to-rank for assigning technicians, and drift monitoring.
- The company's own language-model adapter (LoRA), after a contract and a data-processing agreement.
