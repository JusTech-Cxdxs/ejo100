'use client';

import { useState } from 'react';
import {
  getMakesForCategory,
  getModelsForMake,
  getEngineTypesForModel,
  type VehicleCategory,
} from '@/lib/data/vehicle-catalog';

/**
 * Vehicle Type → Make → Model → Engine, with Kewalram's real
 * brand/model/engine suggestions cascading at each step — built on
 * native HTML <datalist> rather than a custom dropdown: it's the
 * standard, zero-dependency way to get exactly "suggestions, but freely
 * editable text" in one input, which is precisely what was asked for
 * (suggestions to make entry fast, but anything outside the list can
 * always be typed manually).
 *
 * Engine is the real addition here — confirmed via real research as the
 * genuine parts-fitment compatibility key, not the model name itself
 * (two different models can share an engine and be fully
 * interchangeable, while the same model name can hide a different
 * engine across a fuel/trim variant). Make, Model, and Engine all stay
 * plain, real, named <input> fields — the catalog only decides which
 * <datalist> options are offered, never what's actually allowed to be
 * submitted.
 */
export function VehicleMakeModelPicker({
  defaultCategory,
  defaultMake,
  defaultModel,
  defaultEngineType,
}: {
  defaultCategory?: VehicleCategory;
  /** Pre-fills an existing vehicle's Make/Model/Engine for editing — a
   * Server Component parent can't set a client component's internal
   * state directly, so these seed useState's own initial value instead.
   * Without these, reusing this picker for editing would always open
   * to blank fields, forcing a full retype of values that already
   * exist. */
  defaultMake?: string;
  defaultModel?: string;
  defaultEngineType?: string;
}) {
  const [category, setCategory] = useState<VehicleCategory>(defaultCategory ?? 'PASSENGER');
  const [make, setMake] = useState(defaultMake ?? '');
  const [model, setModel] = useState(defaultModel ?? '');
  const [engineType, setEngineType] = useState(defaultEngineType ?? '');

  const makeOptions = getMakesForCategory(category);
  const modelOptions = getModelsForMake(category, make);
  const engineOptions = getEngineTypesForModel(category, make, model);

  return (
    <>
      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
          Vehicle type <span className="text-[var(--ejo-error)]">*</span>
        </label>
        <select
          name="vehicleType"
          required
          value={category}
          onChange={(e) => {
            setCategory(e.target.value as VehicleCategory);
            setMake(''); // switching type invalidates any make suggestion picked for the old type
            setModel('');
          }}
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        >
          <option value="PASSENGER">Passenger vehicle</option>
          <option value="COMMERCIAL">Commercial vehicle</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
            Make <span className="text-[var(--ejo-error)]">*</span>
          </label>
          <input
            name="make"
            required
            list="vehicle-make-suggestions"
            value={make}
            onChange={(e) => {
              setMake(e.target.value);
              setModel(''); // switching make invalidates any model/engine suggestion picked for the old make
              setEngineType('');
            }}
            placeholder="Start typing or pick a suggestion…"
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <datalist id="vehicle-make-suggestions">
            {makeOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">
            Model <span className="text-[var(--ejo-error)]">*</span>
          </label>
          <input
            name="model"
            required
            list="vehicle-model-suggestions"
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setEngineType(''); // switching model invalidates any engine suggestion picked for the old model
            }}
            placeholder={modelOptions.length > 0 ? 'Start typing or pick a suggestion…' : 'e.g. Corolla'}
            className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
          />
          <datalist id="vehicle-model-suggestions">
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]">Engine</label>
        <input
          name="engineType"
          list="vehicle-engine-suggestions"
          value={engineType}
          onChange={(e) => setEngineType(e.target.value)}
          placeholder={engineOptions.length > 0 ? 'Start typing or pick a suggestion…' : 'e.g. 4HK1, 2.0L Turbo Diesel'}
          className="w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]"
        />
        <datalist id="vehicle-engine-suggestions">
          {engineOptions.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        <p className="mt-1 text-[11px] text-[var(--ejo-text-muted)]">
          The real engine spec, not the engine&apos;s own serial number — this is what parts fitment actually matches against.
        </p>
      </div>

      <p className="text-[11px] text-[var(--ejo-text-muted)]">
        Suggestions are based on brands Kewalram commonly services — any make, model, or engine can still be typed manually.
      </p>
    </>
  );
}
