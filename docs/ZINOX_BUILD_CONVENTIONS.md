# EJO 100 module conventions (reference for building the Zinox modules)

Every claim below comes from reading the code; line numbers are approximate after the Zinox additions. Paths are relative to the repository (apps/portal unless stated).

Five places differ from what the request assumed:
- There is no notifications table. The bell, the dashboard's "Needs your attention" list and the "Latest" ticker are worked out live from records and from `audit_logs`.
- Inventory's actions live in `lib/actions/store.ts` and `store-form-handlers.ts`. There is no `inventory*.ts`.
- `waitOutcome` is an e2e helper in `e2e/helpers.ts`, not an app component.
- The workshop `layout.tsx` is only a guard. Workshop has no tab bar; it uses NavCards. Tab bars exist only for Security and Scheduling.
- The Recycle bin covers only 5 entity types. Adding one means changing the union and switch statements in 3 files (section 5).

---

## 1. Authorization

### 1.1 Catalogue — `apps/portal/lib/authz/catalogue.ts`
- **Model** (lines 1-16): User → Role → Permission → Scope → Record → State → Action.
- **Scopes** (line 17): `'ALL' | 'BRANCH' | 'DEPARTMENT' | 'ASSIGNED' | 'OWN'`, ranked OWN < ASSIGNED < DEPARTMENT < BRANCH < ALL (line 18).
- **`PERMISSIONS`** (lines 20-85) is a `const` object of `key → { module, label }`. `module` is the group heading on the Roles and Profile pages. Example:
  ```ts
  'warranty.view': { module: 'Warranty', label: 'View warranties and claims' },
  'warranty.manage': { module: 'Warranty', label: 'Register warranties and prepare claims' },
  'warranty.claim.approve': { module: 'Warranty', label: 'Approve warranty claims, …' },
  ```
  - `PermissionKey = keyof typeof PERMISSIONS` (line 86).
  - Key convention: `<area>.<thing>.<verb>`, with a `<area>.view` key that opens the module.
- **`BASELINE`** (lines 94-96): everyone gets only `'security.exit_pass.request': 'OWN'`.
- **Shorthands** (lines 98-103): `B = 'BRANCH'`, `A = 'ALL'`, `MINE = 'ASSIGNED'`, `VIEW_WORKSHOP = { 'workshop.view': B, 'workshop.job_card.view': B }`.
- **`ROLE_GRANTS: Record<slug, Partial<Record<PermissionKey, Scope>>>`** (lines 111-219): the default grants per role slug. Example (line 172):
  ```ts
  'warranty-hod': { 'warranty.view': B, ...VIEW_WORKSHOP, 'store.view': B, 'warranty.manage': B, 'warranty.claim.approve': B, 'analytics.warranty.view': B, 'security.pass.approve': 'DEPARTMENT' },
  ```
  - Headquarters roles (`administrator`, `executive`, `it-administrator`) get `A`. Branch roles get `B`.
  - The executive is read-only and approves nothing; a test enforces this (section 8).
- **Other exports:**
  - `PLATFORM_ONLY` (222-227).
  - `Principal` type (233-235): userId, isSuperAdmin, roleSlugs, branchId, departmentId, organisationId, orgBranchIds (the tenant fence), extraGrants, lensBranchId.
  - `LENS_KEYS` (238): permissions whose ALL-scope holders get the HQ "branch lens".
  - `RecordContext` (247): `{ branchId, departmentId, ownerIds, assigneeIds, homeBranch }`.
- **`scopeFor(p, key)`** (251-258): super-admin → ALL. Otherwise the widest of BASELINE, `ROLE_GRANTS[slug][key]` for each role slug, and `extraGrants`.
- **`decide(p, key, record?)`** (261-278) is the single rule. Order of checks:
  1. Unknown key → deny.
  2. No scope → deny.
  3. Tenant fence: `record.branchId` must be in `orgBranchIds`, even for ALL.
  4. No record, or ALL → allow.
  5. Otherwise the scope is matched against branch / department / assignees / owners.
  - `homeBranch: true` means a branch-scoped person must actually belong to that branch. It is used for approvals and money.
- **`PAGE_PERMISSIONS`** (281-287): top path segment → permission. Used by `MODULE_NEEDS` in navigation and by the enyo guide test.
- **`ROLE_LABELS`** (290-297), **`ROLE_SENIORITY`** (300; used by `primaryRoleLabel`), **`ROLE_DESCRIPTIONS`** (327-350): every role slug must appear in labels and descriptions (tests in section 8).
- **`SENIOR_REQUESTER_SLUGS`** (312) and **`HQ_ROLE_SLUGS` / `isHqRole`** (314-315).
- **`APPROVAL_PERMISSIONS`** (354-357): drives the Approvals menu item, the dashboard approver card and "assist" sensitivity.
- **`STORE_COST_PERMISSIONS`** (362) and **`SCOPE_WORDS`** (365-367).

**Role slug → grants at runtime.** `principalFor` in `apps/portal/lib/authz/server.ts` lines 34-61:
- It loads the user's `roles.role.slug` and `isSuperAdmin`, plus DB `RolePermission` rows.
- DB grants are honoured only for keys present in `PERMISSIONS`, always at BRANCH scope (line 50):
  ```ts
  for (const r of roles) for (const rp of r.role.permissions) if (rp.permission.key in PERMISSIONS) extra[rp.permission.key as PermissionKey] = 'BRANCH';
  ```
- The Roles page writes these through `apps/portal/lib/actions/roles.ts:44-55` (`prisma.permission.upsert({ where:{key}, create:{ key, description: PERMISSIONS[key].label } })`). The Permission table is filled lazily; there is no seed sync.
- `orgBranchIds` is cached per organisation for 300 s (lines 17-22), tag `org-structure`.

### 1.2 Enforcement helpers — `apps/portal/lib/authz/server.ts`
This is server-only and not a `'use server'` file.
- **Principals:** `getPrincipal()` (77-88) is cached per request. During an assisted session it is the colleague being helped. It applies the branch lens from cookie `ejo-branch-lens` (line 103).
- **Pages:**
  - `guardPage(key, where)` (164-171): on refusal it logs `access.denied` in the audit trail and redirects to `/access-denied?area=<label>`.
  - `guardAnyPage(keys, where)` (175-180). Every module layout uses it.
- **Actions:**
  - `authorize(key, record?, where, message)` (192-199) throws a plain message.
  - `refuse(key, where, msg)` (207-211) is for workflow/assignment refusals and is audited.
  - `authorizeAsSignedIn` (127), `refuseDuringAssist(where)` (145-151).
- **UI:** `allows(key, record?)` (215) gives a quiet yes/no for showing buttons. `can()` (153) returns the Decision.
- **Records:**
  - `canSeeRecord` (220): out of scope behaves exactly like "not found".
  - `seeOrNull` (294), `seeBranch` (345), `seeBranchAnyOf` (376), `seeJobCard` / `seeService` (334-342), `seeVehicle` (358), `seePart` (367).
  - `NOT_AVAILABLE` message (326).
  - `jobCardVisible` / `serviceVisible` (395-403).
- **List fences:**
  - `reachWhere(key, { lens })` (237-247) returns `{ branchId }` for BRANCH scope, the lens branch, `{ branchId: { in: orgBranchIds } }`, or `'__no_access__'`.
  - `firstReach` (184), `jobOrServiceReach` (352), `branchWithinReach` (301).
  - `orgWhere()` (252) for organisation-owned rows; `orgOwned()` (263) also allows a null organisationId.
  - `partsOfMyOrganisation` / `branchOwnedByMyOrganisation` (383-390), `myOrganisationId` (271), `actingOrgWhere` (282), `inMyOrganisation` (288).
- **Assignment-aware checks** (311-322): `authorizeOnJobCard` / `authorizeOnService` build `{ branchId, assigneeIds:[supervisor, technician], ownerIds:[createdBy] }` from the database record, never from the browser.
- **The "branch I'm working in"** comes from `getWorkshopBranchId()` / `getStoreBranchIdForMe()` in `apps/portal/lib/workshop-core.ts:172-203`. It resolves by department slug within the user's organisation.
- **Module-specific role helpers** layer on top. Example: `getWarrantyRoles()` at `apps/portal/lib/actions/warranty.ts:50-67` uses `decide(principal,'warranty.claim.approve',{ branchId, homeBranch:true })`. `requireStaff()` / `requireApprover()` are at `apps/portal/lib/actions/warranty-claims.ts:27-38`.

### 1.3 Sidebar — `apps/portal/lib/authz/navigation.ts`
- **`MODULE_NEEDS`** (7-13): built from `PAGE_PERMISSIONS`, plus `workshop:['workshop.view']`, `inventory:['store.view']`, `warranty:['warranty.view']`, `scheduling:[…]`.
- **`EVERYONE`** (15): dashboard, notifications, security.
- **`navigationFor(p)`** (23-66):
  - Iterates `platformModules` and skips anything whose `status !== 'LIVE'` (line 28).
  - Dashboard also injects `headquarters` (ALL-scope analytics) and `approvals` (any `APPROVAL_PERMISSIONS`).
  - Security has special per-person items.
  - Otherwise `!needs || needs.some(can)` (line 49).
  - Fixed extras are appended: reminders, mail, get-help, it, integrity, assist.
  - **A module key with no entry in `MODULE_NEEDS` is shown to everyone.**
- **Rendering** is in `apps/portal/components/Sidebar.tsx`:
  - `GROUPS` (16-20): Overview / Operations (default bucket) / Administration.
  - Icons come from `MODULE_ICON` in `apps/portal/components/ui/Icon.tsx:112-116`, keyed by nav key.
  - The "Coming next" section renders `ROADMAP` (lines 120-150).
- **Wiring:** `apps/portal/app/(app)/layout.tsx:75` passes `navigationFor(principal)` to `AppShell`; Mail is dropped while assisting.

### 1.4 Module sub-navigation
- **`SubNav`** (`apps/portal/components/ui/SubNav.tsx:8`): `SubNav({ tabs:{href,label,icon}[], active, label })`.
- **Permission-aware wrapper** (`apps/portal/components/SecurityNav.tsx`):
  - A `TABS` array with `needs: PermissionKey[] | 'everyone' | 'off-desk'` (lines 7-19).
  - It filters with `decide(getPrincipal(), k)`.
  - It returns `null` when fewer than 2 tabs remain (line 39).
  - Each page renders it with its own active href, e.g. `<SecurityNav active="/security/incidents" />`.
- **Static wrapper:** `apps/portal/components/ScheduleNav.tsx`. Also `ORGANISATION_TABS` in organisation pages and `SUPPORT_TABS` in `app/(app)/settings/support/shared.tsx:37`.
- **Workshop / Inventory / Warranty use no tab bar:**
  - `layout.tsx` is only a guard (`apps/portal/app/(app)/workshop/layout.tsx`, `/inventory/layout.tsx`, `/warranty/layout.tsx`):
    ```tsx
    export default async function Guard({ children }) { await guardAnyPage(['warranty.view'], '/warranty'); return children; }
    ```
  - The module home page lists sections as `NavCard`s, filtered by `allows()` (`apps/portal/app/(app)/inventory/page.tsx:6-21`), or as `HeaderAction` buttons (`apps/portal/app/(app)/warranty/page.tsx:63-69`).
  - Analytics sub-areas have their own guarded `layout.tsx` (e.g. `app/(app)/warranty/analytics/layout.tsx`).

## 2. Module registry and roadmap
- **`apps/portal/lib/modules.ts:14-33`**: `platformModules: PlatformModuleDescriptor[]`, e.g. `{ key: 'warranty', name: 'Warranty', status: 'LIVE', href: '/warranty', icon: 'shield' }`.
  - Its comment says activating a module means changing its status here.
- **Type** (`packages/types/src/index.ts:8-18`):
  ```ts
  type ModuleStatus = 'LIVE' | 'COMING_SOON' | 'DISABLED';
  interface PlatformModuleDescriptor { key; name; description?; status; icon?; href }
  ```
  - `packages/types` points `main`/`types` at `src/index.ts`, and it is transpiled by Next (`next.config.ts:22`).
- **DB mirror:** `PlatformModule` / `OrganisationModule` models (schema lines 25 and 43), seeded in `packages/database/prisma/seed.ts:42-60` with stale statuses (inventory is still `COMING_SOON` there). Navigation reads only `lib/modules.ts`.
- **Roadmap** (`apps/portal/lib/roadmap.ts`):
  - `RoadmapModule` (lines 14-32): key, name, tagline, description, `icon` (a fixed union), `group`, `next?`, `live?: { href, label, what }` for a partly-live module, `phases[]`, `design?`, `connects[]`.
  - `ROADMAP_GROUPS` (34-42); `ROADMAP` starts at line 44.
  - Two entries are partly live (lines 52 and 91), e.g. `live: { href: '/crm/support', label: 'Open the Support centre', what: '…' }`.
- **Roadmap pages:**
  - `apps/portal/app/(app)/roadmap/page.tsx` groups modules by `ROADMAP_GROUPS`.
  - `apps/portal/app/(app)/roadmap/[module]/page.tsx` uses `generateStaticParams` over `ROADMAP` and shows a "Partly live" banner plus a link when `m.live` is set (lines 36-46).
- **Redirects** (`apps/portal/next.config.ts:28-35`): `planned = ['hr','payroll','finance','procurement','suppliers','warehouse','manufacturing','documents','reports','branding','help']` → `/${k}` redirects to `/roadmap/${k}`.
- **Going LIVE** (module-creation-guide step 6):
  1. Add a `LIVE` entry to `lib/modules.ts`.
  2. Add a menu rule (`MODULE_NEEDS`, or `PAGE_PERMISSIONS`).
  3. Add a `MODULE_ICON` key, and optionally a Sidebar group.
  4. Remove the roadmap entry, or set `live`.
  5. Remove the `next.config.ts` redirect, otherwise `/key` keeps redirecting.
- **Constraint:** `tests/mvp-polish.test.ts:97-115` requires these keys to remain in `ROADMAP`: `hr, payroll, finance, procurement, suppliers, warehouse, manufacturing, documents, reports`. It also checks unique keys, non-empty phases, internal `connects` hrefs, and that `next.config.ts` contains `'hr'`, `'payroll'` and `'finance'`. Making one of those nine live requires editing that test.

## 3. Page, server action and form-handler pattern

### 3.1 Files
- **`lib/actions/<module>.ts`** (`'use server'` in the first 300 chars): the business functions. They take typed inputs, throw a module error class with plain messages, and return data.
- **`lib/actions/<module>-form-handlers.ts`** (`'use server'`): adapts `FormData` → action → `revalidatePath` → `redirect('…?status=<code>')`, or `redirect('…?error=<msg>')`. The source-scanning tests skip these files (`!n.includes('form-handlers')`).
- **Warranty example** (`apps/portal/lib/actions/warranty-claims-form-handlers.ts:27-77`):
  ```ts
  function str(formData, key) { const v = formData.get(key); return typeof v === 'string' ? v.trim() : ''; }
  function fail(path: string, err: unknown, fallback: string): never {
    const message = friendlyError(err, fallback, 'warranty-claims-form-handlers');
    redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
  }
  function done(claimId: string, status: string): never {
    revalidatePath(`/warranty/claims/${claimId}`); revalidatePath('/warranty/claims');
    redirect(`/warranty/claims/${claimId}?status=${status}`);
  }
  export async function approveWarrantyClaimFormAction(formData: FormData) {
    const claimId = str(formData, 'claimId');
    try { await approveWarrantyClaim(claimId); } catch (err) { fail(`/warranty/claims/${claimId}`, err, 'Could not approve the claim.'); }
    done(claimId, 'approved');
  }
  ```
  - `redirect` is always called outside `try`.
  - `friendlyError` (`apps/portal/lib/errors.ts:97`) re-throws `NEXT_*` control flow and maps P2002 / technical errors to plain words.
- **Inventory equivalent:** `apps/portal/lib/actions/store-form-handlers.ts:58-90`, `recordGoodsReceiptFormAction` → `redirect('/inventory/goods-receipts?status=receipt_recorded')`. It passes `idempotencyKey` from `<IdempotencyKey />` (`components/IdempotencyKey.tsx`).
- **Business-action shape** (`apps/portal/lib/actions/warranty-claims.ts`):
  - Guard first: `requireStaff()` → `requireUser()` + `authorize('warranty.manage', { branchId, homeBranch:true }, 'warranty_claim.staff', '<plain msg>')`.
  - Fenced lookup: `prisma.warrantyClaim.findFirst({ where: { customer: await orgWhere(), id } })`.
  - State changes by compare-and-set: `stillAsSeen(await prisma.warrantyClaim.updateMany({ where: { id, status: claim.status }, data }))` (line 181; `claimed` from `lib/integrity`).
  - Audit through a local helper:
    ```ts
    async function audit(userId, claimId, action, metadata) { await writeAuditLog({ userId, action: `warranty_claim.${action}`, entityType: 'WarrantyClaim', entityId: claimId, metadata }); }  // lines 74-76
    ```
  - Decisions start with `await refuseDuringAssist('approveWarrantyClaim')` (line 224) and refuse self-approval (line 228).

### 3.2 Outcome URL convention
- The page reads `searchParams: Promise<{ status?: string; error?: string }>`.
- It renders `<FormFeedbackBanner kind="error" message={error} />` and a success banner, either by a `status === 'x'` check (`apps/portal/app/(app)/inventory/goods-receipts/page.tsx:33-42`) or a `BANNER: Record<string,string>` map (`apps/portal/app/(app)/warranty/claims/[id]/page.tsx:41-55`).
- `FormFeedbackBanner` (`components/FormFeedbackBanner.tsx:15`) hides technical text matching `TECHNICAL`.
- An edit mode uses `?edit=1`. `RevealPanel open={Boolean(error)}` re-opens a failed form.
- **e2e side** (`apps/portal/e2e/helpers.ts:166-184`): `waitOutcome(page, /status=provider_created/)` waits for the success URL, or fails with the `?error=` text. Status codes are therefore part of the test contract (`e2e/warranty.spec.ts:34, 51, 68`).

### 3.3 Components
- **`SubmitButton`** (`components/SubmitButton.tsx:11`, client): `{ label, pendingLabel, className, ariaLabel }`. Uses `useFormStatus`, disables itself and shows a spinner.
- **`FormPendingOverlay`** (`components/FormPendingOverlay.tsx`): place it inside each `<form>`.
- **`RevealPanel`** (`components/ui/RevealPanel.tsx:10`): `{ label, icon='plus', open, children }`, a native `<details>` "Add a …" panel. Usage: `app/(app)/inventory/part-types/page.tsx:121-175`. e2e helper `reveal(page,label)` is in `e2e/workflows.ts:16`.
- **`FilterSelect`** (`components/FilterSelect.tsx:18`, client): a typeable dropdown over a static `options: {value,label,group?,hint?}[]`; submits through a hidden input `name`. Props include `required`, `large`, `defaultValue`, `ariaLabel`, `placeholder`. Usage: `app/(app)/users/page.tsx:165`, `settings/support/shared.tsx:82-87`.
- **`SearchableSelect`** (`components/SearchableSelect.tsx:20`, client) for large lists:
  - `search: (q) => Promise<SearchableOption[]>` (a server action), optional `loadDefaultOptions`, plus `defaultOptionsLabel`, `minQueryLength`, `defaultValue` / `defaultLabel`.
  - Usage: `app/(app)/inventory/part-types/page.tsx:154` (`search={searchPartCategoriesForSelect.bind(null, branchId)}`) and `audit-logs/page.tsx:67` (`searchStaffOptions`). e2e helper `pickSearchable` is in `e2e/workflows.ts:29`.
- **`PrintMenu`** (`components/print/PrintMenu.tsx`, client): `{ orgHref, clientHref, clientLabel='Collector Copy', align, size:'default'|'compact' }`. Usage:
  ```tsx
  <PrintMenu orgHref={`/print/warranty-claims/${c.id}`} clientHref={`/print/warranty-claims/${c.id}?variant=client`} clientLabel="Provider Copy" />
  ```
  A compact variant inside tables is at `app/(app)/warranty/page.tsx:159`.
- **Reference components:**
  - `JobRef` (`components/JobRef.tsx:9`, server component): a link only if `allows('workshop.job_card.view')`, otherwise plain text. `jobHref()` is at line 15.
  - `GrnRef` (`components/GrnRef.tsx`) takes a `link` boolean from the caller.
  - `CustomerLink id name canView` is used with `canSeeCustomers = await allows('crm.view')`.
- **Page building blocks** (`components/ui/index.ts`):
  - `PageHeader { icon, title, description, actions, back:{href,label}, eyebrow, meta, hero, live }` (`components/ui/PageHeader.tsx:16`). Module homes use `hero live eyebrow="Module · Store"`.
  - `HeaderAction { href, icon='plus', variant }`, `BackLink`, and `PageTitle` (the h1 on record pages).
  - `SectionCard { icon, title, description, actions, flush, tone, id }`, `EmptyState`, `NavCard`, `StatTile`, `StatusChip { status, label }`. The single status → tone map is `components/ui/StatusChip.tsx:12-30`; new status words may need adding there.
  - `ResponsiveTable` (cells carry `data-label`), and `LiveSearchInput` for `?q=` search forms.
  - `AuditTrail { entries: {id, actionLabel, userName, detail, dateLabel}[] }` (`components/AuditTrail.tsx`).
- **Loading files:** every route folder has `loading.tsx` containing `export { default } from '@/components/RouteLoading';`.

### 3.4 Example pages
- **List:** `apps/portal/app/(app)/warranty/claims/page.tsx`.
  - `guardAnyPage` → read `searchParams` (q / group / filters) → a fenced lister (`listWarrantyClaims({q})`, which contains `orgWhere()`).
  - Then KPI cards, filter chips built with `LoadingLink` and a `link()` URL builder, a `LiveSearchInput` GET form, and `ResponsiveTable` with `StatusChip`.
  - Module home with clickable KPI cards: `app/(app)/warranty/page.tsx:41-81`.
  - Simpler list: `app/(app)/inventory/goods-receipts/page.tsx`.
- **Detail with action forms:** `apps/portal/app/(app)/warranty/claims/[id]/page.tsx`.
  - `Promise.all([getX(id), getXAuditTrail(id), roles, requireUser()])`, then `notFound()` if missing.
  - The h1 is `PageTitle`, beside `StatusChip` and `PrintMenu`; a steps strip follows.
  - Each state-dependent action is a `<form action={…FormAction}>` with `<FormPendingOverlay/>`, a hidden id, inputs and a `SubmitButton`, shown only when roles or status allow it.
  - Destructive actions sit behind `<details>`. Free text uses `RefineTextButton targetId=…` (Enyo).
  - The audit trail goes in a side card, using an `ACTION_LABEL` map with `humanizeAction` as the fallback (`lib/humanize-action.ts`).
  - Inventory equivalent: `app/(app)/inventory/goods-receipts/[id]/page.tsx` (sticky right-column audit card at 205-220).
- **New:** `apps/portal/app/(app)/warranty/claims/new/page.tsx`.
  - `guardAnyPage`, a context id from `searchParams` (`?warrantyId=`), then `PageHeader back`, an error banner, and one `<form action={createWarrantyClaimFormAction}>` with shared field components (`WarrantyClaimFields`) and a `SubmitButton`.
  - On error the handler redirects back to `/warranty/claims/new?warrantyId=…&error=…`.
  - Also `app/(app)/inventory/goods-receipts/new/page.tsx`: when `allows('store.grn.record', { branchId })` is false it shows an explanation instead of the form.

### 3.5 Record numbering (PREFIX-YYYY-NNNNNN)
- **Job Cards:** `apps/portal/lib/actions/workshop.ts:720-741`, `generateJobNumber()`:
  ```ts
  const prefix = `JC-${lagosYear()}-`;
  const latest = await prisma.jobCard.findFirst({ where: { jobNumber: { startsWith: prefix } }, orderBy: { jobNumber: 'desc' }, select: { jobNumber: true } });
  const binned = await highestBinnedReference('JobCard', prefix);          // lib/recycle-bin/numbers.ts
  return `${prefix}${String(highestSequence(prefix, [latest?.jobNumber, binned]) + 1).padStart(6, '0')}`;
  ```
  It is called at `workshop.ts:969` inside the create, which retries on a number clash.
- **Simpler version:** `nextClaimNumber()` at `warranty-claims.ts:66-72` (`WC-`) and `nextWarrantyNumber()` at `warranty.ts:111-121` (`WR-`).
- **Multi-prefix version:** `nextNumber(prefix)` at `lib/actions/security.ts:145-166`.
- **Collisions:** wrap the create in `retryOnNumberClash('claimNumber', async () => prisma.x.create({ data: { …, claimNumber: await nextClaimNumber() } }))` (`apps/portal/lib/integrity-core.ts:68-91`).
- **Schema:** the number column is `String @unique` (e.g. `WarrantyClaim.claimNumber`, schema line 2522). `lagosYear()` comes from `lib/utils/format-date`.
- **Related places to update:**
  - `GENERATED_NUMBER` in `lib/errors.ts:24` lists the column names treated as "generated number clashed, save again". It knows `referenceNumber` and the existing `*Number` columns; a new column name must be added.
  - The prefix must be registered for search (section 6; enforced by a test).

## 4. Workflow notifications, email, ticker, approvals
- **No Notification table.**
  - "Needs you" items come from `getDashboardNotifications()` in `apps/portal/lib/actions/dashboard.ts:33-258`, built from live record state.
  - "Activity / what's new" is `getActivityFeed()` in `apps/portal/lib/actions/notifications.ts:47-150`, which reads `audit_logs` (not `db:*` journal rows, not `HIDDEN_ACTIONS`) scoped by `entityTypesForRoles` plus records the person is involved in.
  - Read state lives in `NotificationRead` (key `audit:<id>`) and `NotificationPreference`.
  - `getNotificationSummary()` (203-242) combines actions, unread activity, unread broadcasts and mail, cached by the live pulse.
- **`DashboardNotification`** (`dashboard.ts:19-26`): `{ id, kind: 'PRICING_ALERT'|…|'WARRANTY'|'SECURITY'|'SCHEDULING'|'WORKFLOW', title, detail, url, createdAt }`.
  - Module sources run in parallel (lines 47-52): `getWarrantyDashboardItems`, `getWarrantyClaimDashboardItems`, `getSecurityDashboardItems`, `getSchedulingDashboardItems`, `getWorkflowActionItems` (`lib/actions/workflow-actions.ts`), `getMyWorkItems` (`lib/actions/my-work.ts`).
  - Results are pushed with a kind (lines 223-255).
  - Pattern: `getWarrantyClaimDashboardItems()` at `warranty-claims.ts:505-535` returns `{ id: 'warranty-claim-<id>', title: 'Approve warranty claim WC-…', detail, url, createdAt }`.
  - Icons per kind: `ACTION_ICON` in `components/ui/notify-icons.ts:4-7`.
- **Ticker ("Latest")** (`apps/portal/components/Marquee.tsx`): reads `useNotifications().summary`, showing unread broadcasts, then `actions.slice(0,8)`, then `unreadActivity.slice(0,6)`. Nothing is module-specific; items appear automatically from the two feeds.
- **Activity rules** (`apps/portal/lib/notification-rules.ts`):
  - `AREAS` (9-15): area → entityTypes. `ROLE_AREAS` (20-26): head roles see their whole area. `ALL_ACTIVITY_ROLES = ['administrator']`.
  - `HIDDEN_ACTIONS` (33-44).
  - `recordUrl(entityType,id)` (54-95), with `/audit-logs` as the fallback.
  - `areaOf`, `AREA_LABEL` (97-102); `AREA_ICON` is in notify-icons.
  - A new entityType should be added to `AREAS` (plus a head role in `ROLE_AREAS`) and to `recordUrl`.
  - The feed picks the reference number out of metadata keys `jobNumber, serviceNumber, …, claimNumber, referenceNumber, broadcastNumber` (`notifications.ts:131`). Put the number in audit metadata under one of these, or extend that list.
  - Activity titles come from `securityActionLabel` → `SECURITY_ACTION_LABEL` (`lib/security-labels.ts:4, 113`), falling back to `humanizeAction`.
- **Colleague email** (`apps/portal/lib/workflow-notify.ts`, `import 'server-only'`):
  - `emailColleagues(o)` and `emailColleaguesLater(o)` (runs in `after()`).
  - Options: `{ branchId, organisationId?, userIds, exceptUserId, path, where, notice: { subject, heading, intro, facts?, next?, status:{label,tone}, ctaLabel, orgContext? } }`. Recipients are deduplicated, active, same organisation, never the actor; it never throws.
  - Example at `lib/actions/workshop.ts:1292-1309`:
    ```ts
    emailColleaguesLater({ branchId: jobCard.branchId, userIds: [jobCard.supervisorId, ...managers], exceptUserId: user.id, path: `/workshop/job-cards/${id}`, where: 'job_card.quality_check',
      notice: { subject: `Ready for quality check — Job Card ${jobCard.jobNumber}`, heading: '…', intro: '…', facts: [['Job Card', jobCard.jobNumber], …], next: '…', status: { label: 'Quality check', tone: 'info' }, ctaLabel: 'Open the Job Card' } });
    ```
  - Warranty uses its own `notify()` with `renderWarrantyStaffNoticeEmail` (`warranty-claims.ts:51-63`).
- **Email templates** (`apps/portal/lib/email-templates/`):
  - One file per email, exporting `render<Name>Email(opts) → { subject, html }`, built on `layout.ts` helpers (`renderEmailLayout, html, greeting, para, details, callout`).
  - The generic staff template is `workflow-notice.ts`.
  - `tests/emails.test.ts:25-34` fails unless every exported `render\w+Email` has a sample in `tests/email-fixtures.ts`. It also renders realistic and hostile data, requires absolute https links, and checks the website keeps an identical layout copy (line 86).
- **Approvals** (`apps/portal/lib/approvals.ts`): an item counts as a decision by its id prefix.
  - `PREFIXES: [string, ApprovalArea][]` (10-31), e.g. `['prs-hod-','Store']`, `['exitpass-','Security']`.
  - Special case: `warranty-claim-` counts only when the title starts with `'Approve'` (line 36).
  - `ApprovalArea = 'Workshop'|'Store'|'Money'|'Warranty'|'Security'` and `APPROVAL_AREAS` (line 45).
  - The page `apps/portal/app/(app)/approvals/page.tsx` filters `getDashboardNotifications()` with `approvalArea` and groups by area using `AREA_ICON` / `AREA_HINT` (13-20). It lists nothing during an assisted session. The Sidebar badge counts `summary.actions.filter(isApproval)`.
  - "Waiting on others" (the requester's view) is `getMyPending()` in `lib/actions/pending.ts` (`PendingItem`).
- **Registering a new approvable type:**
  1. Emit items from a `get<Module>DashboardItems()` with a unique id prefix, and wire it into `getDashboardNotificationsInner`.
  2. Add the prefix (and a new area if needed, plus `AREA_ICON` / `AREA_HINT`) to `lib/approvals.ts`.
  3. Add the decision permission to `APPROVAL_PERMISSIONS`.
  4. Make the `approve*/decide*/decline*/reject*/release*/verify*/disburse*` action call `refuseDuringAssist(` (test in section 8).
  5. Optionally add to `pending.ts`.
  6. Add a quick test like `tests/role-experience.test.ts:60-68`.

## 5. Audit trail and Recycle bin
- **Business audit:** `writeAuditLog({ userId, action, entityType, entityId, metadata?, organisationId? })` in `apps/portal/lib/workshop-core.ts:64-103`.
  - During an assisted session it adds `assistedBy` / `assistSessionId`. It announces the change (`announceChange`) after the response and never throws.
  - Convention: `action: '<entity_snake>.<verb_past>'` (e.g. `warranty_claim.sent_back`, `goods_receipt.recorded`), `entityType` = Prisma model name, metadata holds plain JSON with the reference number. Edits use `changes: { field: { from, to } }` (`docs/coding-standards.md`).
  - Record history readers filter `auditLog` by `entityType` + a visible `entityId` and add the actor name with `actorLabel` (`warranty-claims.ts:492-501`).
- **Data journal** (`packages/database/src/audit-journal.ts`):
  - Installed on the shared Prisma client (`packages/database/src/index.ts`, `installAuditJournal(prisma)`).
  - Every create / update / delete is written automatically as `entityType 'db:<Model>'`, `action 'data.<op>'`, with before/after values, secrets redacted, and only after COMMIT.
  - The actor is set by `setAuditActor` in `requireUser()` (`lib/actions/workshop.ts:123-132`). The website registers `setAuditActorResolver` (`apps/website/lib/customer-portal/session.ts:74-80`).
  - Nothing to add per module. The `audit_logs` table is append-only (`scripts/postdeploy/0005-audit-log-append-only.sql`).
- **Recycle bin** (only for records created by mistake):
  - `apps/portal/lib/recycle-bin/rules.ts`: `BinEntity` union and `BIN_ENTITIES` (11-12) = JobCard, VehicleService, Customer, CustomerVehicle, Part. Also `BIN_KIND` (15-21), `binHref` (24-32), per-entity `*Eligibility(facts)`.
  - `apps/portal/lib/recycle-bin/server.ts`: `binRecord()` (49-73, an if-chain), `eligibilityOf()` switch (202-209), `snapshotRows`, `LOCK` map (~273), `deleteRoot` (~277), `moveToBin` / `restoreFromBin` / `purgeItems`.
  - UI: `components/RecycleBinPanel.tsx` on record pages (e.g. `app/(app)/crm/customers/[id]/page.tsx:354`); the bin page is `app/(app)/recycle-bin`.
  - `lib/recycle-bin/numbers.ts` keeps binned numbers reserved, so they are never reused.
  - **Registering a type:** extend all of the above, set `recycleBin: true` in the data inventory, and add the table to `LOCKABLE` in `lib/integrity-core.ts:22-34`. `tests/recycle-bin.test.ts:167-171` requires inventory `recycleBin` flags to equal `BIN_ENTITIES` exactly, and forbids Payment, Refund, AuditLog, GoodsReceipt, Warranty and WarrantyClaim. The `moveToBin` shape is regex-checked at line 177.
- **Record resolver** (`apps/portal/lib/record-resolver.ts`):
  - `resolveRecords(pairs)` (22-85) has one `run('<Model>', …)` batched query per type returning `{label, url, branchId}`. It is used by the activity feed and audit pages so items open the exact page. Branch-owned records should return `branchId` so feeds apply reach.
  - `resolveReferenceNumbers(texts)` (96-124) has one `q('<PREFIX>', …)` per prefix for linking numbers inside free text.

## 6. Dashboard, Enyo, global search
- **Dashboard** (`apps/portal/app/(app)/dashboard/page.tsx`):
  - `QUICK` (29-53): `{ key: PermissionKey, label, href, icon }[]`, filtered by `allows(q.key)`, at most 8 plus the "everyone" ones (104-106).
  - Panels in order:
    - `EnyoBriefCard`
    - Leadership / IT overviews, streamed in `Suspense` (`overviewsFor()` in `lib/actions/leadership.ts`; `components/dashboard/LeadershipOverview.tsx`, `ItOverview.tsx`)
    - Workshop `StatTile`s, shown if `allows('workshop.view')`
    - Approvals card, shown if any `APPROVAL_PERMISSIONS`
    - `WaitingOnOthers`
    - "My numbers" (`getMyNumbers()` in `lib/actions/my-work.ts:104+`, branching on `allows(...)` per role, items `{label,value,hint,icon,tone,href}`)
    - My jobs
    - Quick actions
    - "Needs your attention" (`getDashboardNotifications`)
    - What's new (`DashboardActivity`)
    - "At a glance" (`getPlatformGlance()`)
    - Trend chart, Broadcasts, roadmap teaser
  - **KPI tiles:** `getPlatformGlance()` (`lib/actions/dashboard.ts:378-424`) counts with the same reach as each list (`reachWhere(...)`), then filters tiles through `NEED: Record<href, boolean>` from `allows()`. Each tile's icon comes from `GLANCE_ICON[href]` in the page (56-60).
  - A new module adds a count, a `tiles` entry, a `NEED` entry and a `GLANCE_ICON` entry.
- **Enyo staff tools** (`apps/portal/lib/enyo/tools/<area>.ts`):
  - Each file exports `<area>Tools: StaffTool[]` and must be imported and spread in `lib/enyo/tools/index.ts:18-57`; a test checks both regexes.
  - `Tool<Ctx>` (`packages/enyo/src/tools.ts:29-39`): `{ name (snake_case), description (≥40 chars, for the model), parameters (strict JSON schema, additionalProperties:false), kind:'read'|'draft', status (≤60 chars), run(args, ctx) }`.
  - Example `warranty_watch` (`lib/enyo/tools/aftercare.ts:17-60`):
    ```ts
    run: async (args) => { if (!(await allows('warranty.view'))) return refused('…'); const customer = await orgWhere(); … return ok({ …, href: `/warranty/claims/${c.id}` }); }
    ```
  - Helpers `ok`, `refused`, `money`, `day`, `STATUS_WORDS` are in `lib/enyo/tool-helpers.ts`. `draftResult()` is in `lib/enyo/types.ts:32`.
  - Tool files must not be `'use server'`. They must go through `allows( / authorize( / getPrincipal( / requireUser( / reachWhere( / orgWhere( / seeJobCard( / …` or functions imported from `@/lib/actions/*` (tests/enyo.test.ts:214-238).
  - Tool selection: add a `GROUPS` regex → tool names entry in `apps/portal/lib/enyo/tool-select.ts:16-33`. The first regex lists reference prefixes (`JC|SV|…|BC`), so a new prefix goes there too.
  - How-to guide: entries in `apps/portal/lib/enyo/guide.ts` (`GuideEntry {id,title,keywords≥3 lowercase,steps 1-6,page,needs,does?,who?}`; warranty examples at 325-351). `tests/enyo.test.ts:30-61` requires each `page` to exist as `app/(app)<page>/page.tsx` and `needs` to include the area's page permission (`PAGE_PERMISSIONS[top]` or the `AREA` map: workshop / inventory / warranty).
  - The customer-side Enyo tools are separate: `apps/website/lib/enyo/customer-tools.ts`, reading through `lib/customer-portal/data.ts`.
- **Global search:**
  - Prefix registry: `REFERENCE_TYPES` in `apps/portal/lib/search-plan.ts:10-34` (`{ prefix, model, group, path }`). From it come `REFERENCE_PREFIXES`, `REFERENCE_PATTERN` and `referenceUrl`; `planSearch` and `numberFilters` are the pure planner.
  - Executor: `globalSearch()` in `apps/portal/lib/actions/search.ts:86-270`.
    - `MORE_PAGES` (17-42) are list pages found by name: `{ label: 'Warranty claims (WC)', href, needs }`.
    - Reach per type comes via `reachAny([...keys])` / `orgWhere`.
    - One `find(reach, { numbers: [['WC','claimNumber']], text: [...], codes: [...], phones: [...] }, (w) => prisma.x.findMany({ where: w, take, … }))` per table (177-178).
    - A per-record `opens(keys, branchId)` second check, then `ref('WC', 'Warranty claims', hits)` (242).

## 7. Printing
- Pages live at `apps/portal/app/print/<doc>/[id]/page.tsx`. The layout `app/print/layout.tsx` adds the watermark.
- They are not under `(app)`, so there is no sidebar and no layout guard. Access relies on middleware sign-in plus the same fenced reader as the record page (`getWarrantyClaim` → `requireUser` + `orgWhere`), with `notFound()` otherwise.
- Branch-owned documents check explicitly, e.g. `if (!(await serviceVisible(id,'[id]'))) notFound();` (`app/print/vehicle-service/[id]/page.tsx:61`). Some gate on status (job card print requires `CHECKED_OUT`, line 62).
- Pattern from `apps/portal/app/print/warranty-claims/[id]/page.tsx:36-60`:
  ```tsx
  const isOrgCopy = variant !== 'client';
  const [c, organisation] = await Promise.all([getWarrantyClaim(id), getOrganisation()]);
  const branch = await prisma.branch.findUnique({ where: { id: await getWorkshopBranchId() } });
  <div style={{ maxWidth:'800px', margin:'0 auto', padding:'28px 24px', fontFamily:'Arial, Helvetica, sans-serif' }}>
    <PrintOnLoad />
    <DocumentHeader organisation={organisation} branch={branch} logoUrl={`${portalBaseUrl()}/images/logo/logo.png`}
      documentTitle={isOrgCopy ? 'Warranty Claim — Organisation Copy' : `Warranty Claim — ${c.provider.name}`}
      referenceNumber={c.claimNumber} statusLabel={CLAIM_STATUS_LABEL[c.status]} accentColor="#2563EB" />
    … <SignatureBlock …/> <DocumentFooter organisation={organisation} />
  ```
- **`components/print/DocumentHeader.tsx`** exports:
  - `DocumentHeader({ organisation, branch, divisionName?, logoUrl, documentTitle, referenceNumber, statusLabel?, accentColor })` (38-119).
  - `SignatureBlock({ issuerLabel, issuerName, collectorLabel, collectorName })` (122).
  - `DocumentFooter({ organisation })` (148).
  - Inline styles only, for print and PDF engines.
- **Other print components:** `PrintOnLoad` (calls `window.print()` after 200 ms), `PassSheet`, `EstimatePrintDocument`, `WarrantiesIssuedPrint`.
- Copies are chosen with `?variant=client`, matching `PrintMenu`'s `clientHref`.
- The CI security sweep's AC-XORG opens record pages and print views by id from another organisation (`e2e/security/access-control.ts:8-11`).

## 8. Seeding, migrations, roles, and tests that enforce consistency
- **Base seed:** `packages/database/prisma/seed.ts`.
  - Idempotent upserts only. It creates the module registry, the Kewalram org hierarchy and departments (`workshop`, `store`, `workshop-passenger`, `workshop-commercial`), baseline roles (line 155, `roleNames` slugified, `isSystem: true`; "Workshop Manager" is displayed as "Manager"), and the Master Admin from env (no default password).
  - The **full** role set per organisation comes from `scripts/v24-roles.sql`: one `INSERT … SELECT … FROM organisations CROSS JOIN (VALUES (name, slug, description), …) ON CONFLICT ("organisationId","slug") DO NOTHING`.
- **Deploy SQL** (`scripts/apply-predeploy-sql.js`, called by `db-push-if-vercel.js` / `db-push-if-render.js`): order is `predeploy/*.sql` → `prisma db push` (never `--accept-data-loss`) → `postdeploy/*.sql`. CI runs the same order (`.github/workflows/e2e.yml:96-110`, then seed.ts → v24-roles.sql → `apps/portal/e2e/seed.ts`, run twice to prove idempotence) and also upgrades from baselines (e2e.yml:225-243).
  - **predeploy** (e.g. `predeploy/0003-support-centre-unique-keys.sql`): additive DDL that `db push` would refuse, such as a UNIQUE index on a new column. Wrapped in `DO $$ … IF to_regclass(...) IS NOT NULL …`. `tests/mvp-polish.test.ts:160-170` forbids DROP / DELETE / TRUNCATE / RENAME / type change and requires `IF NOT EXISTS` on every CREATE INDEX / ADD COLUMN / CREATE TABLE.
  - **postdeploy:** e.g. 0001 (RLS on every table), 0005 (audit append-only), 0006 (rename). It must not DROP or DELETE (mvp-polish:171-175). Files are never edited after deploy; add a higher-numbered file instead.
- **New role recipe** (examples `scripts/postdeploy/0003-branch-assistant-role.sql`, `0004-support-leadership-it-roles.sql`):
  ```sql
  INSERT INTO "roles" ("id","organisationId","name","slug","description","isSystem","isSuperAdmin")
  SELECT gen_random_uuid()::text, o."id", r.name, r.slug, r.description, true, false
  FROM "organisations" o CROSS JOIN (VALUES ('Customer Care','customer-care','…'), …) AS r(name, slug, description)
  ON CONFLICT ("organisationId", "slug") DO NOTHING;
  ```
  Also:
  - Add the same row to `scripts/v24-roles.sql`.
  - Add `ROLE_GRANTS`, `ROLE_LABELS`, `ROLE_DESCRIPTIONS` (>30 chars) and `ROLE_SENIORITY`.
  - Optionally add to `seed.ts` `roleNames`.
  - Add an e2e person in `apps/portal/e2e/people.ts` `PEOPLE`; `e2e/seed.ts` assigns the role with `findUniqueOrThrow` by slug, so the role must exist first.
  - Add a test asserting the slug in both SQL files, as `tests/roles-support-leadership.test.ts:43-53` does: `ON CONFLICT … DO NOTHING`, no DROP / DELETE / TRUNCATE / UPDATE.
- **Unit tests that a new module must keep green** (all in `apps/portal/tests/`):
  - **`authz.test.ts:181-190`:** every `ROLE_GRANTS` slug has a `ROLE_LABELS` entry; every granted key and every `PAGE_PERMISSIONS` value exists in `PERMISSIONS`; labels are longer than 5 characters with no underscores. Line 16: super-admin holds everything. Add allowed **and** denied cases for the new keys.
  - **`role-experience.test.ts:15-21`:** every role has a description longer than 30 characters, and `APPROVAL_PERMISSIONS` are real keys.
  - **`roles-support-leadership.test.ts:22-41`:** the executive's grants include no approve / record / manage / create / release / disburse / operate key except `security.pass.approve`; the it-administrator has no `workshop|store|procurement|warranty|analytics.*`, recycle, payment or refund keys.
  - **`recycle-bin.test.ts:90-99`:** only the two administrator roles hold `admin.recycle_bin.manage`.
  - **`assist.test.ts`:**
    - Lines 42-45: any role holding a key containing `approve` is non-assistable.
    - Lines 137-145: everything in `APPROVAL_PERMISSIONS` and the cost permissions is sensitive.
    - Lines 147-160: every exported `approve*|decide*|decline*|disburse*|release*|verify*|reject*|returnEstimate*` function in `lib/actions/*.ts` (except `*FormAction`) must contain `refuseDuringAssist(`.
    - Sensitivity rules live in `lib/assist/rules.ts:22-51` (prefixes `admin.`, `analytics.`, `procurement.epr.`, and `/approve/`).
  - **`guard-coverage.test.ts:46-60`:** every `export async function` in a `'use server'` file under `lib/actions/` (not form-handlers) whose body matches a `prisma|tx .x.(create|update|upsert|delete…)(` write must contain one of `GUARDS` (13-25: `authorize`, `allows(`, `refuse(`, `requireStaff(`, `requireApprover(`, …) or be listed in `SELF_SCOPED`. Lines 63-85 require named organisation-owned listers to contain `orgWhere(` / `orgOwned(`.
  - **`tenant-coverage.test.ts:66-105`:** read actions with an `…Id: string` parameter must contain a `READ_FENCES` token (seeOrNull, reachWhere, orgWhere, canSeeRecord, …); writes with an id must contain a `RECORD_CHECKS` token or `authorize(key, { branchId …`. A new helper name must be added to those lists.
  - **`integrity-coverage.test.ts:96-112, 209-224`:** no `update` / `upsert` whose data contains `status` (it must be `updateMany` with the expected state in `where`, wrapped in `claimed`/`stillAsSeen`), and every compare-and-set's where must name something besides `id`.
  - **`data-inventory.test.ts`:** every Prisma model must be declared in `apps/portal/lib/governance/data-inventory.ts` (`DATA_INVENTORY`, types at 14-55) with a tenancy owner column that exists (`ORGANISATION` → `organisationId`, `BRANCH` → `branchId`); secrets must be `ai:'NEVER'`.
  - **`search.test.ts:127-145`:** every generated prefix pattern `` `XX-${lagosYear()}-` `` or `nextNumber('XX')` found in `lib/actions/*.ts` must be in `REFERENCE_PREFIXES`, and each `referenceUrl(prefix,'[id]')` must be a real `app/(app)/…/[id]/page.tsx`.
  - **`enyo.test.ts`:** tool well-formedness, registry and guide (above).
  - **`emails.test.ts`:** fixture for each template.
  - **`mvp-polish.test.ts:97-115`:** every nav item is LIVE, plus the roadmap rules (section 2).
- **e2e role matrix** (`apps/portal/e2e/role-matrix.spec.ts`):
  - `AREAS` (14-52) is a hand-maintained `{ url, needs: PermissionKey[] }` list; `EVERYONE` is at line 54.
  - For each `PEOPLE` account plus master: every menu link opens without 5xx or access-denied; protected areas in the menu must be permitted by `decide`; forbidden ones must redirect to `/access-denied`.
  - A new module should add its URLs to `AREAS`.
  - The CI sweep `e2e/security/access-control.ts` (AC-PAGES) parses literal `guardPage('x')` / `guardAnyPage(['x', …])` strings from every page and layout. Guards written as a variable (e.g. `STORE_COST_PERMISSIONS`) are not parsed. AC-IDOR / AC-ANON call every server action by id via `action-map.mjs`.

## 9. Customer-facing portal (apps/website)
- **Structure:** `apps/website/app/customer-portal/`.
  - `page.tsx` is sign-in (public).
  - `forgot-password`, `reset-password`, `session-ended/route.ts`.
  - `dashboard/layout.tsx` runs `requireCustomer()` on every request and renders `PortalShell`.
  - `dashboard/{page, vehicles, vehicles/[id], services, services/jc/[id], services/vs/[id], payments, warranties, warranties/[id], notifications, profile, support}`.
  - Nav is `NAV` in `apps/website/components/customer/PortalShell.tsx:17-26`; UI kit in `components/customer/*` (`PageHero`, `SectionTitle`, `Badge`, `EmptyState`, `Meter`, `Icon`).
- **Sign-in:** `apps/website/lib/auth-customer.ts` is a separate Better Auth instance on tables `customer` (`fields: { name: 'fullName' }`), `customerAccount` (`userId → customerId`), `customerVerification`, plus `CustomerSession`.
  - `disableSignUp: true` (accounts are opened by the front desk), and `disabledPaths` for update-user / change-email / delete-user / sign-up.
  - It shares `BETTER_AUTH_SECRET` and the database, but sessions cannot cross between staff and customers.
  - The portal issues set-password links via `apps/portal/lib/customer-access.ts` (`issueCustomerSetPasswordLink`, a 72 h `reset-password:<token>` row in customer_verifications).
- **What customers see:** `lib/customer-portal/session.ts:29-69`.
  - `lookupCustomer` (React cache) re-reads `customers` and refuses `!isActive`.
  - `requireCustomer()` is for pages (redirects); `currentCustomer()` is for actions (returns null).
  - All data goes through `lib/customer-portal/data.ts` readers keyed by the signed-in `customerId`, e.g. `loadWarranties = cache(async (customerId) => prisma.warranty.findMany({ where: { customerId }, … claims: { where: { customerId } } }))` (line 223). Estimates appear only once sent; there are no staff names or costs.
  - Customer actions (`lib/customer-portal/actions.ts`) re-resolve the customer, touch only their own rows, and write `writeCustomerAudit` with before/after.
  - Notifications (`lib/customer-portal/notifications.ts`) are derived from record dates plus customer broadcasts; only `CustomerNotificationRead` keys (`<kind>:<recordId>:<event>`) are stored.
- **Shared packages:** both apps depend on `@ejo/database` (the single Prisma client and audit journal), `@ejo/enyo`, `@ejo/types`, `@ejo/ui`, `@ejo/utils` (website `package.json`).
  - Duplicated-by-design copies: `lib/brand.ts` (root script `brand:sync` copies `packages/enyo/src/brand.ts` into both apps) and the email layout (website copy checked identical by `tests/emails.test.ts:86`).
  - Website tests are in `apps/website/tests/*.test.ts` (enyo, visits), with the same tsc → `.test-out` → `node --test` flow, cleaning `.test-out` afterwards.

## 10. Test build and layout
- **Unit tests:** `apps/portal/package.json` runs `"test": "tsc -p tsconfig.test.json && node --test .test-out/tests/*.test.js"`.
  - `apps/portal/tsconfig.test.json`: CommonJS, `outDir: .test-out`, `rootDir: "."`, includes `tests/**/*.ts` plus `lib/authz/catalogue.ts`, `lib/governance/data-inventory.ts` and `lib/integrity-core.ts`.
  - **No `paths`**, so anything a test imports directly (transitively) must use **relative** imports and no `@/` alias. Examples: `lib/authz/navigation.ts` imports `'../modules'`, `lib/enyo/guide.ts` imports `'../authz/catalogue'`, `lib/recycle-bin/rules.ts` imports `'../utils/pluralize'`.
  - Files that use `@/` (e.g. `lib/notification-rules.ts`) are only read as text in tests (`read('lib/…')` + regex).
  - Compiled tests compute `ROOT = join(__dirname, '..', '..')` (apps/portal) from `.test-out/tests`.
  - `.test-out/` is gitignored and excluded from the app tsconfig (`apps/portal/tsconfig.json` exclude).
  - Pure rules go in `lib/<module>-core.ts` / `lib/<x>-rules.ts` style files without the database (e.g. `lib/integrity-core.ts`, `lib/warranty-claim-readiness.ts`, `lib/recycle-bin/rules.ts`).
  - CI (`.github/workflows/ci.yml:56-69`): build `packages/database` → lint → typecheck → portal tests → database tests → enyo tests → website tests → build.
- **e2e** (`apps/portal/e2e/`):
  - `playwright.config.ts`: testDir `.`, `*.spec.ts`, baseURL `:3001`, 2 workers in CI.
  - `people.ts`: one account per role, shared `E2E_PASSWORD`, `who(role)`, portal customers, `SEED_*`.
  - `seed.ts`: idempotent upserts after base seed + v24 SQL; includes a second organisation for cross-org tests.
  - `helpers.ts`: `as(page, role)`, `signIn`, `gotoSettled`, `waitOutcome`, `expectHealthy`, `visitHealthy`, `menuLinks`, `uniq`, `latestMail` (Mailpit), `expectAuditEntry`.
  - `workflows.ts`: `reveal`, `pickSearchable`, job-card flows. `db.ts`: `freshVehicle`, direct Prisma helpers. `customer.ts`: portal helpers on `:3002`.
  - Specs are one per area (`warranty.spec.ts`, `inventory.spec.ts`, `role-matrix.spec.ts`, `customer-portal.spec.ts`, …). Style: `test.describe.configure({ mode: 'serial' })`, a unique `tag = uniq()`, fresh data per spec.
  - `e2e/security/` holds the CI security sweeps (`access-control.ts`, `concurrency.ts`, `rls-check.ts`, `action-map.mjs`, `bundle-scan.mjs`).
  - The module guide asks for a new spec covering the happy path, a refused role and a person from another organisation.
