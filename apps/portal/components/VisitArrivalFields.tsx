'use client';

import { useState } from 'react';

export const ID_TYPES: { value: string; label: string; example: string }[] = [
  { value: 'National ID (NIN)', label: 'National ID (NIN slip or card)', example: 'e.g. 12345678901 (11 digits)' },
  { value: "Driver's licence", label: "Driver's licence", example: 'e.g. LAG12345AA67' },
  { value: 'International passport', label: 'International passport', example: 'e.g. A12345678' },
  { value: "Voter's card (PVC)", label: "Voter's card (PVC)", example: 'e.g. 90F5B1234567890123' },
  { value: 'Organisation / staff ID card', label: 'Organisation / staff ID card', example: 'The number on their company ID card' },
  { value: 'Student ID card', label: 'Student ID card', example: 'e.g. matric number' },
  { value: 'OTHER', label: 'Other (type it)', example: 'The number on the document' },
];

export const VEHICLES: { value: string; label: string }[] = [
  { value: 'ON_FOOT', label: 'On foot (no vehicle)' },
  { value: 'CAR', label: 'Car' },
  { value: 'MOTORCYCLE', label: 'Motorcycle (okada)' },
  { value: 'TRUCK', label: 'Truck / lorry' },
  { value: 'BUS', label: 'Bus' },
  { value: 'OTHER', label: 'Other vehicle' },
];

const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2.5 text-sm text-[var(--ejo-text)]';
const label = 'mb-1 block text-xs font-medium text-[var(--ejo-text-muted)]';

/**
 * What Security takes at the gate: the ID shown (chosen, not typed) and how
 * they came — plate boxes appear only for a vehicle; a group may add more
 * vehicles. Nothing is pre-filled.
 */
export function VisitArrivalFields({ fromOrganisation, group }: { fromOrganisation: boolean; group: boolean }) {
  const [idType, setIdType] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [plates, setPlates] = useState(1);
  const ids = fromOrganisation ? [ID_TYPES[4]!, ...ID_TYPES.filter((_, i) => i !== 4)] : ID_TYPES;
  const example = ID_TYPES.find((x) => x.value === idType)?.example ?? 'Choose the ID first';
  return (
    <div className="space-y-4">
      <div>
        <label className={label}>{group ? "ID shown by the group lead (they vouch for the group)" : 'ID the visitor showed'}</label>
        <select name="idType" required value={idType} onChange={(e) => setIdType(e.target.value)} className={input}>
          <option value="" disabled>Tap to choose the ID…</option>
          {ids.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </div>
      {idType === 'OTHER' ? (
        <div><label className={label}>Name of the ID document</label><input name="idTypeOther" required placeholder="e.g. Bank ID card, Church ID" className={input} /></div>
      ) : null}
      {idType ? (
        <div><label className={label}>ID number</label><input name="idNumber" required placeholder={example} className={input} autoComplete="off" /></div>
      ) : null}
      <div>
        <label className={label}>How did {group ? 'they' : 'the visitor'} come?</label>
        <select name="vehicleType" required value={vehicle} onChange={(e) => setVehicle(e.target.value)} className={input}>
          <option value="" disabled>Tap to choose…</option>
          {VEHICLES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </div>
      {vehicle && vehicle !== 'ON_FOOT' ? (
        <div className="space-y-2">
          <label className={label}>Plate number{plates > 1 ? 's' : ''}</label>
          {Array.from({ length: plates }, (_, i) => (
            <div key={i} className="flex gap-2">
              <input name="plate" required placeholder={i === 0 ? 'e.g. KJA 453 GX' : `Vehicle ${i + 1} plate`} className={`${input} uppercase`} autoComplete="off" />
              {i > 0 ? <button type="button" onClick={() => setPlates((n) => n - 1)} className="shrink-0 px-2 text-xs font-medium text-[var(--ejo-error)]">Remove</button> : null}
            </div>
          ))}
          {group && plates < 10 ? <button type="button" onClick={() => setPlates((n) => n + 1)} className="text-xs font-medium text-[var(--ejo-primary)] hover:underline">+ Another vehicle</button> : null}
        </div>
      ) : null}
    </div>
  );
}
