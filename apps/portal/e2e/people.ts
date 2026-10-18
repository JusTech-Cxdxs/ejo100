/** The test accounts (throwaway test database only). */
export const E2E_PASSWORD = 'E2e-Test-Pass-2026!';
export const MASTER = { email: 'master@e2e.test', password: 'E2e-Master-Pass-2026!' };

export type Person = { email: string; name: string; role: string; dept?: string; extraRoles?: string[] };

/** One account per role (the FIRST person with a role is the one `who(role)` returns). */
export const PEOPLE: readonly Person[] = [
  { email: 'admin@e2e.test', name: 'Hannah Admin', role: 'administrator' },
  { email: 'branchadmin@e2e.test', name: 'Bola Branchadmin', role: 'branch-administrator' },
  { email: 'frontdesk@e2e.test', name: 'Funmi Frontdesk', role: 'receptionist' },
  { email: 'supervisor@e2e.test', name: 'Sam Supervisor', role: 'workshop-supervisor', dept: 'workshop-passenger' },
  { email: 'tech@e2e.test', name: 'Tunde Technician', role: 'technician', dept: 'workshop-passenger' },
  { email: 'manager@e2e.test', name: 'Mary Manager', role: 'workshop-manager' },
  { email: 'finance@e2e.test', name: 'Femi Finance', role: 'finance-officer' },
  { email: 'store@e2e.test', name: 'Stella Store', role: 'store-manager', dept: 'store' },
  { email: 'security@e2e.test', name: 'Sule Security', role: 'security-officer' },
  { email: 'storeofficer@e2e.test', name: 'Oscar Storeofficer', role: 'store-officer', dept: 'store' },
  { email: 'chiefsecurity@e2e.test', name: 'Chika Chiefsecurity', role: 'chief-security-officer' },
  { email: 'warrantyhod@e2e.test', name: 'Wale Warrantyhod', role: 'warranty-hod' },
  { email: 'warrantyofficer@e2e.test', name: 'Wura Warrantyofficer', role: 'warranty-officer' },
  { email: 'depthead@e2e.test', name: 'Dayo Depthead', role: 'department-head', dept: 'workshop-passenger' },
  { email: 'calendar@e2e.test', name: 'Cora Calendar', role: 'calendar-user' },
  { email: 'scheduler@e2e.test', name: 'Sade Scheduler', role: 'scheduling-admin' },
  { email: 'broadcaster@e2e.test', name: 'Bimbo Broadcaster', role: 'broadcaster' },
  // Helps colleagues on their behalf (assisted sessions).
  { email: 'assistant@e2e.test', name: 'Ada Assistant', role: 'branch-assistant' },
  // Leadership, IT and the support department.
  { email: 'executive@e2e.test', name: 'Eze Executive', role: 'executive' },
  { email: 'itadmin@e2e.test', name: 'Ifeoma Itadmin', role: 'it-administrator' },
  { email: 'care@e2e.test', name: 'Chidi Care', role: 'customer-care' },
  // Holds BOTH Workshop Supervisor and Workshop Manager — for the
  // segregation-of-duties checks (approves as supervisor, so may not also
  // give the Manager's final approval).
  { email: 'supermanager@e2e.test', name: 'Mike Supermanager', role: 'workshop-supervisor', dept: 'workshop-passenger', extraRoles: ['workshop-manager'] },
  // Only for user-administration tests (given roles / switched off during the run).
  { email: 'switchable@e2e.test', name: 'Sola Switchable', role: 'calendar-user' },
  // Zinox edition: sales, billing, production, warehouses, procurement, service, projects.
  { email: 'sales@e2e.test', name: 'Seun Salesofficer', role: 'sales-officer', dept: 'sales' },
  { email: 'showroom@e2e.test', name: 'Shade Showroom', role: 'showroom-officer', dept: 'showroom' },
  { email: 'kam@e2e.test', name: 'Kola Keyaccount', role: 'key-account-manager', dept: 'sales' },
  { email: 'salesmanager@e2e.test', name: 'Sandra Salesmanager', role: 'sales-manager', dept: 'sales' },
  { email: 'commercial@e2e.test', name: 'Chuka Commercialdirector', role: 'commercial-director', dept: 'sales' },
  { email: 'billing@e2e.test', name: 'Bisi Billing', role: 'billing-officer', dept: 'billing' },
  { email: 'credit@e2e.test', name: 'Charles Creditcontroller', role: 'credit-controller', dept: 'billing' },
  { email: 'financemanager@e2e.test', name: 'Funke Financemanager', role: 'finance-manager', dept: 'billing' },
  { email: 'planner@e2e.test', name: 'Peter Planner', role: 'production-planner', dept: 'production' },
  { email: 'assembler@e2e.test', name: 'Ayo Assembler', role: 'assembler', dept: 'production' },
  { email: 'linesupervisor@e2e.test', name: 'Lanre Linesupervisor', role: 'line-supervisor', dept: 'production' },
  { email: 'qa@e2e.test', name: 'Queen Qainspector', role: 'qa-inspector', dept: 'production' },
  { email: 'productionmanager@e2e.test', name: 'Paul Productionmanager', role: 'production-manager', dept: 'production' },
  { email: 'partswarehouse@e2e.test', name: 'Precious Partswarehouse', role: 'parts-warehouse-officer', dept: 'store' },
  { email: 'fgwarehouse@e2e.test', name: 'Felix Finishedgoods', role: 'fg-warehouse-officer', dept: 'finished-goods' },
  { email: 'dispatch@e2e.test', name: 'Dapo Dispatch', role: 'dispatch-officer', dept: 'finished-goods' },
  { email: 'warehousemanager@e2e.test', name: 'Wale Warehousemanager', role: 'warehouse-manager', dept: 'finished-goods' },
  { email: 'procurement@e2e.test', name: 'Pelumi Procurement', role: 'procurement-officer', dept: 'procurement' },
  { email: 'procurementhead@e2e.test', name: 'Hassan Procurementhead', role: 'procurement-head', dept: 'procurement' },
  { email: 'servicetech@e2e.test', name: 'Segun Servicetech', role: 'service-technician', dept: 'workshop' },
  { email: 'servicesupervisor@e2e.test', name: 'Sarah Servicesupervisor', role: 'service-supervisor', dept: 'workshop' },
  { email: 'warrantymanager@e2e.test', name: 'Wole Warrantymanager', role: 'warranty-manager', dept: 'workshop' },
  { email: 'projectmanager@e2e.test', name: 'Priya Projectmanager', role: 'project-manager', dept: 'projects' },
];
/** Only for the forgot-password test (its password changes during the run). */
export const RESET: Person = { email: 'reset@e2e.test', name: 'Rita Reset', role: 'calendar-user' };
export const SUPERMANAGER = PEOPLE.find((p) => p.email === 'supermanager@e2e.test')!;
export const SWITCHABLE = PEOPLE.find((p) => p.email === 'switchable@e2e.test')!;
export const OTHER_ORG_ADMIN = { email: 'other-admin@e2e.test', name: 'Olu Otheradmin' };
/** A technician in a SECOND branch of the same organisation — for the branch fences. */
export const OTHER_BRANCH_TECH: Person = { email: 'otherbranch@e2e.test', name: 'Bisi Otherbranch', role: 'technician' };
export const SECOND_BRANCH = 'E2E Lekki Branch';
export const who = (role: string): Person => {
  const p = PEOPLE.find((x) => x.role === role);
  if (!p) throw new Error(`No seeded person for role ${role}`);
  return p;
};

/** Customers. */
export const CUSTOMER = { email: 'customer@e2e.test', name: 'Ada Customer' };
/** Customers who use the customer portal (known passwords). */
export const PORTAL_CUSTOMER = { email: 'portal-customer@e2e.test', name: 'Kemi Portal', password: 'Portal-Pass-2026!', plate: 'E2E-PORTAL-1' };
export const OTHER_PORTAL_CUSTOMER = { email: 'portal-other@e2e.test', name: 'Lanre Otherportal', password: 'Portal-Other-2026!', plate: 'E2E-PORTAL-2' };
/** Changes their own password (forgot password, change password) — nobody else signs in as them. */
export const PASSWORD_CUSTOMER = { email: 'portal-password@e2e.test', name: 'Tobi Passwordchange', password: 'Portal-Pwd-2026!', plate: 'E2E-PORTAL-3' };
/** Has their portal access switched off and on again by the front desk (CRM spec). */
export const SWITCH_CUSTOMER = { email: 'portal-switch@e2e.test', name: 'Funmi Switchoff', password: 'Portal-Switch-2026!', plate: 'E2E-PORTAL-4' };
/** Every customer with a portal password, seeded with a vehicle each. */
export const PORTAL_CUSTOMERS = [PORTAL_CUSTOMER, OTHER_PORTAL_CUSTOMER, PASSWORD_CUSTOMER, SWITCH_CUSTOMER] as const;

/** Store data seeded for the workflow specs (each spec uses its own part, so stock numbers never collide). */
export const SEED_PARTS = {
  /** Job Card lifecycle — carries the seeded part warranty. */
  brakePads: { type: 'E2E Brake Pads', name: 'E2E Brake Pad Set', number: 'E2ES-001', price: 15000, stock: 100 },
  /** Cancellation — reserved, then returned when the Job Card is cancelled. */
  oilFilter: { type: 'E2E Oil Filter', name: 'E2E Oil Filter Unit', number: 'E2ES-002', price: 4000, stock: 40 },
  /** Vehicle Service. */
  sparkPlug: { type: 'E2E Spark Plug', name: 'E2E Spark Plug', number: 'E2ES-003', price: 2500, stock: 60 },
} as const;
export const SEED_CATEGORY = { name: 'E2E Seed Parts', code: 'E2ES' };
export const SEED_WARRANTY = { provider: 'E2E Parts Warranty Co', policyCode: 'E2E-PART-12', policyName: 'E2E 12-month part warranty', vehiclePolicyCode: 'E2E-VEH-24', vehiclePolicyName: 'E2E 24-month vehicle warranty' };
