/** The test accounts (throwaway test database only). */
export const E2E_PASSWORD = 'E2e-Test-Pass-2026!';
export const MASTER = { email: 'master@e2e.test', password: 'E2e-Master-Pass-2026!' };
export const PEOPLE = [
  { email: 'admin@e2e.test', name: 'Hannah Admin', role: 'administrator' },
  { email: 'branchadmin@e2e.test', name: 'Bola Branchadmin', role: 'branch-administrator' },
  { email: 'frontdesk@e2e.test', name: 'Funmi Frontdesk', role: 'receptionist' },
  { email: 'supervisor@e2e.test', name: 'Sam Supervisor', role: 'workshop-supervisor', dept: 'workshop-passenger' },
  { email: 'tech@e2e.test', name: 'Tunde Technician', role: 'technician', dept: 'workshop-passenger' },
  { email: 'manager@e2e.test', name: 'Mary Manager', role: 'workshop-manager' },
  { email: 'finance@e2e.test', name: 'Femi Finance', role: 'finance-officer' },
  { email: 'store@e2e.test', name: 'Stella Store', role: 'store-manager', dept: 'store' },
  { email: 'security@e2e.test', name: 'Sule Security', role: 'security-officer' },
  // Only for the forgot-password test (its password changes during the run).
  { email: 'reset@e2e.test', name: 'Rita Reset', role: 'calendar-user' },
] as const;
export const OTHER_ORG_ADMIN = { email: 'other-admin@e2e.test', name: 'Olu Otheradmin' };
export const who = (role: string) => PEOPLE.find((p) => p.role === role)!;
