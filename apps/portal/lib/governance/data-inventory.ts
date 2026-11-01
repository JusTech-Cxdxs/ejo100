/**
 * EJO 100 — DATA INVENTORY (Architecture & Security Baseline v1, §8).
 *
 * Every table in the database is declared here: who owns it (tenancy), how
 * sensitive it is, how a record ends, how long it is kept, and whether AI may
 * ever read it. A CI test (tests/data-inventory.test.ts) fails when a table is
 * added to schema.prisma without being declared, or when its declared owner
 * column does not exist — so the isolation model can never drift silently.
 *
 * Pure data: no database, no network. Read by tests and documentation.
 */

/** Who a record belongs to — the fence every query must respect. */
export type Tenancy =
  | 'GLOBAL' //        reference data shared by the whole platform (countries, the permission list)
  | 'PLATFORM' //      the platform team's own machinery (never shown to organisations)
  | 'ORGANISATION' //  owned by one organisation (organisationId)
  | 'BRANCH' //        owned by one branch of one organisation (branchId)
  | 'DEPARTMENT' //    owned by one department (departmentId)
  | 'USER' //          belongs to one person
  | 'VIA_PARENT'; //   a child row — isolated through its parent record

export type Classification =
  | 'PUBLIC' //         written to be published (the website's news & media)
  | 'INTERNAL' //       ordinary business data
  | 'PERSONAL' //       identifies a person (NDPA 2023 personal data)
  | 'FINANCIAL' //      money: prices, costs, payments, refunds
  | 'SECURITY' //       site security: who entered, incidents, passes
  | 'SECRET' //         credentials and sessions — never displayed, exported or given to AI
  | 'AUDIT'; //         the immutable record of what happened

/** How a record ends its life in EJO 100. */
export type Lifecycle =
  | 'STATE_MACHINE' //  never deleted — cancelled / closed through its workflow (with approval)
  | 'IMMUTABLE' //      never changed or deleted once written (append-only)
  | 'ARCHIVE' //        deactivated / archived, kept for history
  | 'CASCADE' //        lives and dies with its parent
  | 'EXPIRES' //        removed when it expires (sessions, tokens)
  | 'RECYCLE_BIN' //    only removed through the Recycle bin (restorable, then purged after the retention period)
  | 'EDITABLE'; //      configuration that is simply edited

/** May AI ever read it? Always through the same authorization as a person — AI is never an authority. */
export type AiAccess = 'NEVER' | 'AGGREGATE_ONLY' | 'AUTHORISED_USER';

export type DataEntry = {
  tenancy: Tenancy;
  /** The column that carries the fence (or the parent link for VIA_PARENT). */
  owner?: string;
  classification: Classification[];
  lifecycle: Lifecycle;
  retention: string;
  ai: AiAccess;
  /** A record created by mistake may be moved to the Recycle bin while nothing
   * of consequence has happened to it (lib/recycle-bin/rules.ts decides). */
  recycleBin?: true;
};

const FIN_RETENTION = 'At least 6 years after the financial year (Nigerian accounting-record retention)';
const PERSONAL_RETENTION = 'While the relationship is active; then as the retention policy allows (NDPA 2023 — no longer than necessary)';
const OPS_RETENTION = 'At least 6 years (operational history and disputes)';
const SEC_RETENTION = '2 years (site-security record), longer if an incident is open';

export const DATA_INVENTORY: Record<string, DataEntry> = {
  // ── Platform & reference ───────────────────────────────────────────
  PlatformModule: { tenancy: 'GLOBAL', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  Permission: { tenancy: 'GLOBAL', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  Country: { tenancy: 'GLOBAL', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Reference data', ai: 'AUTHORISED_USER' },
  State: { tenancy: 'GLOBAL', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Reference data', ai: 'AUTHORISED_USER' },
  City: { tenancy: 'GLOBAL', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Reference data', ai: 'AUTHORISED_USER' },
  Verification: { tenancy: 'PLATFORM', classification: ['SECRET'], lifecycle: 'EXPIRES', retention: 'Until used or expired', ai: 'NEVER' },

  // ── Organisation structure ─────────────────────────────────────────
  Organisation: { tenancy: 'ORGANISATION', owner: 'id', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Life of the contract', ai: 'AUTHORISED_USER' },
  OrganisationModule: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  Branding: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  BusinessUnit: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'ARCHIVE', retention: 'Life of the contract', ai: 'AUTHORISED_USER' },
  CountryLink: { tenancy: 'VIA_PARENT', owner: 'businessUnitId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: 'With its business unit', ai: 'AUTHORISED_USER' },
  Branch: { tenancy: 'VIA_PARENT', owner: 'businessUnitId', classification: ['INTERNAL', 'FINANCIAL'], lifecycle: 'ARCHIVE', retention: 'Life of the contract', ai: 'AUTHORISED_USER' },
  Department: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Life of the contract', ai: 'AUTHORISED_USER' },
  Team: { tenancy: 'DEPARTMENT', owner: 'departmentId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Life of the contract', ai: 'AUTHORISED_USER' },

  // ── People, identity and access ────────────────────────────────────
  User: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['PERSONAL'], lifecycle: 'ARCHIVE', retention: PERSONAL_RETENTION, ai: 'AUTHORISED_USER' },
  EmployeeProfile: { tenancy: 'VIA_PARENT', owner: 'userId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: PERSONAL_RETENTION, ai: 'AGGREGATE_ONLY' },
  EmployeeDocument: { tenancy: 'VIA_PARENT', owner: 'employeeProfileId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: PERSONAL_RETENTION, ai: 'NEVER' },
  Role: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  UserRole: { tenancy: 'VIA_PARENT', owner: 'userId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Changes kept in the audit trail', ai: 'AUTHORISED_USER' },
  RolePermission: { tenancy: 'VIA_PARENT', owner: 'roleId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Changes kept in the audit trail', ai: 'AUTHORISED_USER' },
  Session: { tenancy: 'USER', owner: 'userId', classification: ['SECRET'], lifecycle: 'EXPIRES', retention: 'Until signed out or expired', ai: 'NEVER' },
  Account: { tenancy: 'USER', owner: 'userId', classification: ['SECRET'], lifecycle: 'CASCADE', retention: 'Life of the user account', ai: 'NEVER' },
  NotificationRead: { tenancy: 'USER', owner: 'userId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: '90 days (screen state)', ai: 'NEVER' },
  NotificationPreference: { tenancy: 'USER', owner: 'userId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Life of the user account', ai: 'NEVER' },
  CalendarDelegate: { tenancy: 'USER', owner: 'ownerId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'While the delegation stands', ai: 'AUTHORISED_USER' },

  // ── Customers and vehicles ─────────────────────────────────────────
  Customer: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['PERSONAL'], lifecycle: 'RECYCLE_BIN', retention: PERSONAL_RETENTION, ai: 'AUTHORISED_USER', recycleBin: true },
  CustomerCompany: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: PERSONAL_RETENTION, ai: 'AUTHORISED_USER' },
  CustomerAddress: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: PERSONAL_RETENTION, ai: 'AUTHORISED_USER' },
  CustomerContact: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: PERSONAL_RETENTION, ai: 'AUTHORISED_USER' },
  CustomerSession: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['SECRET'], lifecycle: 'EXPIRES', retention: 'Until signed out or expired', ai: 'NEVER' },
  CustomerAccount: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['SECRET'], lifecycle: 'CASCADE', retention: 'Life of the customer account', ai: 'NEVER' },
  // v28 — customer portal + CRM. A set-password / reset row is keyed by its token; `value` holds the customer id.
  CustomerVerification: { tenancy: 'VIA_PARENT', owner: 'value', classification: ['SECRET'], lifecycle: 'EXPIRES', retention: 'Until used or expired (72 hours / 1 hour)', ai: 'NEVER' },
  CustomerNote: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: PERSONAL_RETENTION, ai: 'AUTHORISED_USER' },
  CustomerNotificationRead: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: 'Life of the customer account', ai: 'NEVER' },
  AssistSession: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['SECURITY', 'AUDIT'], lifecycle: 'IMMUTABLE', retention: 'Kept with the audit trail', ai: 'NEVER' },
  NewsPost: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['PUBLIC'], lifecycle: 'EDITABLE', retention: 'Kept while published or archived; the communications team deletes drafts', ai: 'AUTHORISED_USER' },
  SiteVisit: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EXPIRES', retention: '13 months, then removed by the clean-up job (anonymous, no cookie: a daily keyed hash of address + browser, masked paths, never the customer portal)', ai: 'AUTHORISED_USER' },
  ErrorEvent: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EXPIRES', retention: '90 days, then removed by the clean-up job', ai: 'NEVER' },
  CustomerVehicle: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['PERSONAL'], lifecycle: 'RECYCLE_BIN', retention: OPS_RETENTION, ai: 'AUTHORISED_USER', recycleBin: true },
  ServiceReminderLog: { tenancy: 'VIA_PARENT', owner: 'vehicleId', classification: ['INTERNAL'], lifecycle: 'IMMUTABLE', retention: OPS_RETENTION, ai: 'AUTHORISED_USER' },

  // ── Workshop: Job Cards ────────────────────────────────────────────
  JobCard: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL', 'FINANCIAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER', recycleBin: true },
  JobCardComplaint: { tenancy: 'VIA_PARENT', owner: 'jobCardId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  Estimate: { tenancy: 'VIA_PARENT', owner: 'jobCardId', classification: ['FINANCIAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  EstimateLineItem: { tenancy: 'VIA_PARENT', owner: 'estimateId', classification: ['FINANCIAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  Payment: { tenancy: 'VIA_PARENT', owner: 'jobCardId', classification: ['FINANCIAL'], lifecycle: 'IMMUTABLE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  Refund: { tenancy: 'VIA_PARENT', owner: 'jobCardId', classification: ['FINANCIAL'], lifecycle: 'IMMUTABLE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  CancellationRequest: { tenancy: 'VIA_PARENT', owner: 'jobCardId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  CloseRequest: { tenancy: 'VIA_PARENT', owner: 'jobCardId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },

  // ── Workshop: Vehicle Services ─────────────────────────────────────
  VehicleService: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL', 'FINANCIAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER', recycleBin: true },
  VehicleServiceComplaint: { tenancy: 'VIA_PARENT', owner: 'vehicleServiceId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  VehicleServiceCloseRequest: { tenancy: 'VIA_PARENT', owner: 'vehicleServiceId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  VehicleServiceCancellationRequest: { tenancy: 'VIA_PARENT', owner: 'vehicleServiceId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  VehicleInspection: { tenancy: 'VIA_PARENT', owner: 'vehicleServiceId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  VehicleInspectionItem: { tenancy: 'VIA_PARENT', owner: 'inspectionId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  ServiceEstimate: { tenancy: 'VIA_PARENT', owner: 'vehicleServiceId', classification: ['FINANCIAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  ServiceEstimateLineItem: { tenancy: 'VIA_PARENT', owner: 'estimateId', classification: ['FINANCIAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },

  // ── Store & procurement ────────────────────────────────────────────
  Part: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL', 'FINANCIAL'], lifecycle: 'ARCHIVE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER', recycleBin: true },
  PartUnitOfMeasure: { tenancy: 'VIA_PARENT', owner: 'partId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: 'With its part', ai: 'AUTHORISED_USER' },
  PartStock: { tenancy: 'VIA_PARENT', owner: 'partId', classification: ['FINANCIAL'], lifecycle: 'EDITABLE', retention: 'Current state; movements are kept separately', ai: 'AUTHORISED_USER' },
  PartBatch: { tenancy: 'VIA_PARENT', owner: 'partId', classification: ['FINANCIAL'], lifecycle: 'IMMUTABLE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  PartBatchConsumption: { tenancy: 'VIA_PARENT', owner: 'batchId', classification: ['FINANCIAL'], lifecycle: 'IMMUTABLE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  PartQuantityConsumption: { tenancy: 'VIA_PARENT', owner: 'partId', classification: ['FINANCIAL'], lifecycle: 'IMMUTABLE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  PartSerial: { tenancy: 'VIA_PARENT', owner: 'partId', classification: ['FINANCIAL'], lifecycle: 'IMMUTABLE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  PartFitment: { tenancy: 'VIA_PARENT', owner: 'partId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'With its part', ai: 'AUTHORISED_USER' },
  PartCategory: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  PartType: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  PricingAlert: { tenancy: 'VIA_PARENT', owner: 'partId', classification: ['FINANCIAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  GoodsReceipt: { tenancy: 'BRANCH', owner: 'branchId', classification: ['FINANCIAL'], lifecycle: 'IMMUTABLE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  GoodsReceiptLine: { tenancy: 'VIA_PARENT', owner: 'goodsReceiptId', classification: ['FINANCIAL'], lifecycle: 'IMMUTABLE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  PartRequestSlip: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  PartRequestSlipLine: { tenancy: 'VIA_PARENT', owner: 'slipId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  ExternalProcurementRequest: { tenancy: 'BRANCH', owner: 'branchId', classification: ['FINANCIAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  ExternalProcurementRequestLine: { tenancy: 'VIA_PARENT', owner: 'requestId', classification: ['FINANCIAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  ExternalProcurementSupplementaryLine: { tenancy: 'VIA_PARENT', owner: 'requestId', classification: ['FINANCIAL'], lifecycle: 'CASCADE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },

  // ── Warranty ───────────────────────────────────────────────────────
  WarrantyProvider: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'ARCHIVE', retention: 'Life of the contract', ai: 'AUTHORISED_USER' },
  WarrantyPolicy: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'ARCHIVE', retention: 'Life of the contract', ai: 'AUTHORISED_USER' },
  Warranty: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: 'Warranty term + 6 years', ai: 'AUTHORISED_USER' },
  WarrantyClaim: { tenancy: 'VIA_PARENT', owner: 'customerId', classification: ['FINANCIAL'], lifecycle: 'STATE_MACHINE', retention: FIN_RETENTION, ai: 'AUTHORISED_USER' },
  WarrantyPolicyDeletionRequest: { tenancy: 'VIA_PARENT', owner: 'policyId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: OPS_RETENTION, ai: 'AUTHORISED_USER' },
  WarrantyProviderDeletionRequest: { tenancy: 'VIA_PARENT', owner: 'providerId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: OPS_RETENTION, ai: 'AUTHORISED_USER' },

  // ── Security & gate ────────────────────────────────────────────────
  Visit: { tenancy: 'BRANCH', owner: 'branchId', classification: ['SECURITY', 'PERSONAL'], lifecycle: 'STATE_MACHINE', retention: SEC_RETENTION, ai: 'AUTHORISED_USER' },
  ExitPass: { tenancy: 'BRANCH', owner: 'branchId', classification: ['SECURITY'], lifecycle: 'STATE_MACHINE', retention: SEC_RETENTION, ai: 'AUTHORISED_USER' },
  ExitPassPerson: { tenancy: 'VIA_PARENT', owner: 'exitPassId', classification: ['SECURITY', 'PERSONAL'], lifecycle: 'CASCADE', retention: SEC_RETENTION, ai: 'AUTHORISED_USER' },
  VehicleGateExit: { tenancy: 'BRANCH', owner: 'branchId', classification: ['SECURITY'], lifecycle: 'IMMUTABLE', retention: OPS_RETENTION, ai: 'AUTHORISED_USER' },
  RoadTestPermit: { tenancy: 'BRANCH', owner: 'branchId', classification: ['SECURITY'], lifecycle: 'STATE_MACHINE', retention: OPS_RETENTION, ai: 'AUTHORISED_USER' },
  RoadTestPerson: { tenancy: 'VIA_PARENT', owner: 'roadTestId', classification: ['SECURITY', 'PERSONAL'], lifecycle: 'CASCADE', retention: OPS_RETENTION, ai: 'AUTHORISED_USER' },
  SecurityIncident: { tenancy: 'BRANCH', owner: 'branchId', classification: ['SECURITY'], lifecycle: 'STATE_MACHINE', retention: '6 years after closing', ai: 'AUTHORISED_USER' },
  GateDelivery: { tenancy: 'BRANCH', owner: 'branchId', classification: ['SECURITY'], lifecycle: 'STATE_MACHINE', retention: OPS_RETENTION, ai: 'AUTHORISED_USER' },
  ContractorPass: { tenancy: 'BRANCH', owner: 'branchId', classification: ['SECURITY', 'PERSONAL'], lifecycle: 'STATE_MACHINE', retention: SEC_RETENTION, ai: 'AUTHORISED_USER' },
  ContractorAttendance: { tenancy: 'VIA_PARENT', owner: 'passId', classification: ['SECURITY'], lifecycle: 'IMMUTABLE', retention: SEC_RETENTION, ai: 'AUTHORISED_USER' },
  SecurityEmailLog: { tenancy: 'VIA_PARENT', owner: 'entityId', classification: ['AUDIT', 'PERSONAL'], lifecycle: 'IMMUTABLE', retention: '2 years', ai: 'NEVER' },

  // ── Scheduling & communication ─────────────────────────────────────
  MeetingRoom: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL'], lifecycle: 'ARCHIVE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  Appointment: { tenancy: 'BRANCH', owner: 'branchId', classification: ['INTERNAL', 'PERSONAL'], lifecycle: 'STATE_MACHINE', retention: '2 years', ai: 'AUTHORISED_USER' },
  AppointmentParticipant: { tenancy: 'VIA_PARENT', owner: 'appointmentId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: '2 years', ai: 'AUTHORISED_USER' },
  Broadcast: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: '2 years', ai: 'AUTHORISED_USER' },
  Announcement: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: '2 years', ai: 'AUTHORISED_USER' },

  // ── Enyo (AI), support, reminders, mailbox (v31) ───────────────────
  // Transcripts, memories, predictions and emails are not journaled (high-volume
  // personal content); the business steps around them write their own audit entries.
  EnyoSetting: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Life of the contract', ai: 'AUTHORISED_USER' },
  EnyoConversation: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['PERSONAL'], lifecycle: 'EXPIRES', retention: 'Staff and customer chats 12 months, public website chats 90 days, then removed by the clean-up job', ai: 'AUTHORISED_USER' },
  EnyoMessage: { tenancy: 'VIA_PARENT', owner: 'conversationId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: 'With its conversation', ai: 'AUTHORISED_USER' },
  EnyoMemory: { tenancy: 'USER', owner: 'userId', classification: ['PERSONAL'], lifecycle: 'EDITABLE', retention: 'Until the person deletes it or leaves the organisation', ai: 'AUTHORISED_USER' },
  EnyoLearnedAnswer: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Kept while useful; administrators remove entries on the Enyo learning page', ai: 'AUTHORISED_USER' },
  EnyoModel: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'ARCHIVE', retention: 'Kept while in use; retired models 2 years (model register)', ai: 'AUTHORISED_USER' },
  EnyoPrediction: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL', 'FINANCIAL'], lifecycle: 'IMMUTABLE', retention: '3 years (training and accuracy history)', ai: 'AUTHORISED_USER' },
  SupportTicket: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['PERSONAL'], lifecycle: 'STATE_MACHINE', retention: '3 years after it is closed', ai: 'AUTHORISED_USER' },
  SupportReply: { tenancy: 'VIA_PARENT', owner: 'ticketId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: 'With its ticket', ai: 'AUTHORISED_USER' },
  SupportQueue: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'While the organisation uses it; switched off rather than deleted while tickets point at it', ai: 'AUTHORISED_USER' },
  SupportQueueMember: { tenancy: 'VIA_PARENT', owner: 'queueId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: 'Until the person is taken off the queue', ai: 'NEVER' },
  SupportMailbox: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['SECRET'], lifecycle: 'EDITABLE', retention: 'Until an administrator removes it; the encrypted password goes with it', ai: 'NEVER' },
  // Data Exchange (v-A1): imports from SAP and spreadsheets. The staged rows are the file as uploaded (often personal data):
  // never given to AI, removed with their import, and gone when an import is cancelled.
  ImportJob: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: 'Life of the contract (the record of what was brought in)', ai: 'AGGREGATE_ONLY' },
  ImportRow: { tenancy: 'VIA_PARENT', owner: 'jobId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: 'With its import; deleted at once if the import is cancelled. The file’s cells are released 30 days after it finished (the organisation’s setting), keeping outcomes, rejected rows and what undo needs', ai: 'NEVER' },
  // v-A2: the organisation's suppliers (SAP vendors). Business contacts; restorable from the Recycle bin.
  Supplier: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'RECYCLE_BIN', retention: 'Life of the contract', ai: 'AUTHORISED_USER', recycleBin: true },
  HistoricalInvoice: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['FINANCIAL', 'PERSONAL'], lifecycle: 'ARCHIVE', retention: '7 years (financial records); an undone import voids its rows (kept, restored by reloading the file)', ai: 'AUTHORISED_USER' },
  VehicleHistoryRecord: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL', 'PERSONAL'], lifecycle: 'ARCHIVE', retention: 'Life of the vehicle (quality and warranty evidence); an undone import voids its rows', ai: 'AUTHORISED_USER' },
  // v-A4: an export of a list (which list, which filters, who, when) and who downloaded it. No copy of the data is
  // stored: the file is built at download time for the person downloading it.
  ExportJob: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'ARCHIVE', retention: 'Life of the contract (the record of what left EJO, never deleted); the link itself stops working after 24 hours', ai: 'NEVER' },
  ExportDownload: { tenancy: 'VIA_PARENT', owner: 'exportJobId', classification: ['INTERNAL'], lifecycle: 'CASCADE', retention: 'With its export', ai: 'NEVER' },
  ImportMappingProfile: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Configuration', ai: 'AUTHORISED_USER' },
  MailStyleSample: { tenancy: 'USER', owner: 'userId', classification: ['PERSONAL'], lifecycle: 'EXPIRES', retention: '90 days, at most 200 per person; removed when they withdraw consent or disconnect their mailbox', ai: 'AUTHORISED_USER' },
  IntegrityAlert: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL', 'PERSONAL', 'FINANCIAL', 'AUDIT'], lifecycle: 'STATE_MACHINE', retention: '7 years (internal-control evidence); reviewed alerts are never deleted', ai: 'AUTHORISED_USER' },
  PublicProfile: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['PERSONAL'], lifecycle: 'EDITABLE', retention: 'Until an administrator removes the person (published professional details only, no contact details)', ai: 'AUTHORISED_USER' },
  SupportSetting: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'While the organisation exists', ai: 'NEVER' },
  Reminder: { tenancy: 'USER', owner: 'ownerId', classification: ['INTERNAL'], lifecycle: 'STATE_MACHINE', retention: '12 months after it is done or cancelled', ai: 'AUTHORISED_USER' },
  ReminderDelegate: { tenancy: 'USER', owner: 'ownerId', classification: ['INTERNAL'], lifecycle: 'EDITABLE', retention: 'Until the owner withdraws it', ai: 'NEVER' },
  MailAccount: { tenancy: 'USER', owner: 'userId', classification: ['PERSONAL', 'SECRET'], lifecycle: 'EDITABLE', retention: 'Until the person disconnects it or leaves; the encrypted password is deleted on disconnect', ai: 'NEVER' },
  MailMessage: { tenancy: 'VIA_PARENT', owner: 'accountId', classification: ['PERSONAL'], lifecycle: 'CASCADE', retention: 'The last 90 days, refreshed from the mailbox; removed when the mailbox is disconnected', ai: 'AUTHORISED_USER' },

  // ── Audit ──────────────────────────────────────────────────────────
  // v30 — what was deleted by mistake: a full copy of the deleted rows until it
  // is restored or the retention period (RECYCLE_BIN_DAYS, 7–90, default 30)
  // ends; then only a tombstone without personal details stays. Not journaled
  // (the move, restore and purge write their own audit entries).
  RecycleBinItem: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['PERSONAL', 'FINANCIAL'], lifecycle: 'EXPIRES', retention: 'Copy kept for the restore period (30 days by default), then removed by the daily clean-up; the tombstone is kept with the audit trail', ai: 'NEVER' },
  AuditLog: { tenancy: 'ORGANISATION', owner: 'organisationId', classification: ['AUDIT'], lifecycle: 'IMMUTABLE', retention: 'At least 6 years; never edited or deleted by anyone', ai: 'AGGREGATE_ONLY' },
};
