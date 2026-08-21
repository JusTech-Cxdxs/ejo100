'use client';

import { useState } from 'react';
import {
  getMakesForCategory,
  getModelsForMake,
  type VehicleCategory,
} from '@/lib/data/vehicle-catalog';

/**
 * Vehicle Type → Make → Model, with Kewalram's real brand/model
 * suggestions cascading at each step — built on native HTML <datalist>
 * rather than a custom dropdown: it's the standard, zero-dependency way
 * to get exactly "suggestions, but freely editable text" in one input,
 * which is precisely what was asked for (suggestions to make entry
 * fast, but anything outside the list can always be typed manually).
 *
 * Make and Model stay plain, real, named <input> fields — the catalog
 * only decides which <datalist> options are offered, never what's
 * actually allowed to be submitted.
 */
export function VehicleMakeModelPicker({
  defaultCategory,
}: {
  defaultCategory?: VehicleCategory;
}) {
  const [category, setCategory] = useState<VehicleCategory>(defaultCategory ?? 'PASSENGER');
  const [make, setMake] = useState('');

  const makeOptions = getMakesForCategory(category);
  const modelOptions = getModelsForMake(category, make);

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
            onChange={(e) => setMake(e.target.value)}
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
      <p className="text-[11px] text-[var(--ejo-text-muted)]">
        Suggestions are based on brands Kewalram commonly services — any make or model can still be typed manually.
      </p>
    </>
  );
}
