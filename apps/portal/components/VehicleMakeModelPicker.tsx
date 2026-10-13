'use client';

import { useState } from 'react';
import {
  getMakesForCategory,
  getModelsForMake,
  getEngineTypesForModel,
  type VehicleCategory,
} from '@/lib/data/vehicle-catalog';

/**
 * Vehicle Type → Make → Model → Engine, with suggestions at each step through
 * <datalist> (any text is accepted). Engine matters because parts fitment
 * follows the engine, not the model name.
 */
export function VehicleMakeModelPicker({
  defaultCategory,
  defaultMake,
  defaultModel,
  defaultEngineType,
}: {
  defaultCategory?: VehicleCategory;
  /** Initial Make/Model/Engine when editing an existing vehicle. */
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
          The engine type (not its serial number). Parts are matched to the vehicle by engine.
        </p>
      </div>

      <p className="text-[11px] text-[var(--ejo-text-muted)]">
        Suggestions are brands the workshop commonly services. You can type any make, model or engine.
      </p>
    </>
  );
}
