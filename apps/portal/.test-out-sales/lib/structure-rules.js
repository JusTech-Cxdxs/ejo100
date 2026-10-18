"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SYSTEM_DEPARTMENT_SLUGS = exports.SYSTEM_DEPARTMENTS = void 0;
/** Departments the workflows depend on — renameable, never switched off. */
exports.SYSTEM_DEPARTMENTS = [
    { slug: 'workshop', name: 'Workshop', why: 'Anchors the branch’s workshop (Job Cards, Vehicle Services, numbering).' },
    { slug: 'workshop-passenger', name: 'Passenger Vehicle Workshop', why: 'Job Cards for passenger vehicles route here.' },
    { slug: 'workshop-commercial', name: 'Commercial Vehicle Workshop', why: 'Job Cards for commercial vehicles route here.' },
    { slug: 'store', name: 'Store', why: 'Parts, stock, receipts and releases.' },
];
exports.SYSTEM_DEPARTMENT_SLUGS = new Set(exports.SYSTEM_DEPARTMENTS.map((d) => d.slug));
