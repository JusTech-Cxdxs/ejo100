/** Departments the workflows depend on — renameable, never switched off. */
export const SYSTEM_DEPARTMENTS: { slug: string; name: string; why: string }[] = [
  { slug: 'workshop', name: 'Workshop', why: 'Anchors the branch’s workshop (Job Cards, Vehicle Services, numbering).' },
  { slug: 'workshop-passenger', name: 'Passenger Vehicle Workshop', why: 'Job Cards for passenger vehicles route here.' },
  { slug: 'workshop-commercial', name: 'Commercial Vehicle Workshop', why: 'Job Cards for commercial vehicles route here.' },
  { slug: 'store', name: 'Store', why: 'Parts, stock, receipts and releases.' },
];
export const SYSTEM_DEPARTMENT_SLUGS = new Set(SYSTEM_DEPARTMENTS.map((d) => d.slug));
