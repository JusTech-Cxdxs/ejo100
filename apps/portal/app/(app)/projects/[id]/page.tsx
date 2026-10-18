import { notFound } from 'next/navigation';
import { allows, guardAnyPage } from '@/lib/authz/server';
import { getProject, getProjectAuditTrail, searchProjectProductOptions, searchProjectConfigurationOptions } from '@/lib/actions/projects';
import { addProjectMilestoneFormAction, completeProjectMilestoneFormAction, addProjectDeliverableFormAction, recordProjectDeliveryFormAction, acceptProjectDeliverableFormAction, moveProjectStatusFormAction, updateProjectDetailsFormAction } from '@/lib/actions/projects-form-handlers';
import { humanizeAction } from '@/lib/humanize-action';
import { LoadingLink } from '@/components/LoadingLink';
import { PrintMenu } from '@/components/print/PrintMenu';
import { AuditTrail } from '@/components/AuditTrail';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { SearchableSelect } from '@/components/SearchableSelect';
import { CustomerLink } from '@/components/CustomerLink';
import { DeliveryProgress } from '@/components/projects/DeliveryProgress';
import { BackLink, PageTitle, StatusChip, SectionCard, RevealPanel } from '@/components/ui';
import { PROJECT_STATUS_LABEL, PROJECT_MOVE_LABEL, PROJECT_KIND_LABEL, MILESTONE_STATE_LABEL, nextProjectStatuses, type ProjectStatus, type ProjectKind } from '@/lib/projects-core';
import { formatDateOnly, formatDateTime } from '@/lib/utils/format-date';
import { formatCurrency } from '@ejo/utils';

const BANNER: Record<string, string> = {
  created: 'Project recorded. Add its milestones and deliverables.',
  saved: 'Project details saved.',
  milestone_added: 'Milestone added.',
  milestone_completed: 'Milestone completed.',
  deliverable_added: 'Deliverable added.',
  delivery_recorded: 'Delivery recorded.',
  deliverable_accepted: 'Acceptance recorded for the deliverable.',
  moved_awarded: 'Marked as awarded — well done.',
  moved_in_progress: 'Delivery started.',
  moved_delivered: 'Marked as delivered — record the customer\'s acceptance next.',
  moved_accepted: 'Acceptance recorded. Print the acceptance certificate.',
  moved_closed: 'Project closed.',
  moved_lost: 'Marked as lost.',
};
const ACTION_LABEL: Record<string, string> = {
  'project.created': 'Project recorded', 'project.updated': 'Details edited', 'project.milestone_added': 'Milestone added', 'project.milestone_completed': 'Milestone completed',
  'project.deliverable_added': 'Deliverable added', 'project.delivery_recorded': 'Delivery recorded', 'project.deliverable_accepted': 'Deliverable accepted',
  'project.status_awarded': 'Awarded', 'project.status_in_progress': 'Delivery started', 'project.status_delivered': 'Delivered', 'project.status_accepted': 'Accepted by the customer', 'project.status_closed': 'Closed', 'project.status_lost': 'Lost',
};
const input = 'w-full rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-3 py-2 text-sm text-[var(--ejo-text)]';
const btn = 'rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90';
const btnLine = 'rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-4 py-2 text-sm font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]';
const lbl = 'block text-xs font-medium text-[var(--ejo-text-muted)]';
const MILESTONE_TONE: Record<string, string> = { DONE: 'text-[var(--ejo-success)]', OVERDUE: 'text-[var(--ejo-error)]', DUE_SOON: 'text-[var(--ejo-warning)]', UPCOMING: 'text-[var(--ejo-text-muted)]', UNDATED: 'text-[var(--ejo-text-muted)]' };

/** One project: status, milestones, deliverables per site, linked records, acceptance certificate. */
export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ status?: string; error?: string; edit?: string }> }) {
  await guardAnyPage(['projects.view'], '/projects');
  const { id } = await params;
  const { status, error, edit } = await searchParams;
  const [p, trail, canManage, canSeeCustomers, canSales, canProduction] = await Promise.all([getProject(id), getProjectAuditTrail(id), allows('projects.manage'), allows('crm.view'), allows('sales.view'), allows('production.view')]);
  if (!p) notFound();
  const s = p.status as ProjectStatus;
  const next = nextProjectStatuses(s);
  const finished = ['CLOSED', 'LOST'].includes(s);
  const editing = edit === '1' && canManage && !finished;
  const dateInput = (d: Date | null) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' }) : '');
  const customerName = p.customer.customerCompany?.companyName ? `${p.customer.customerCompany.companyName} (${p.customer.fullName})` : p.customer.fullName;

  return (
    <div className="p-8">
      <BackLink href="/projects" label="Back to Projects" className="mb-4" />
      {status && BANNER[status] ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="success" message={BANNER[status]} /></div> : null}
      {error ? <div className="mb-6 max-w-2xl"><FormFeedbackBanner kind="error" message={error} /></div> : null}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <PageTitle icon="handshake">{p.number}</PageTitle>
          <p className="mt-1 text-sm text-[var(--ejo-text)]">{p.name}</p>
          <p className="text-sm text-[var(--ejo-text-muted)]"><CustomerLink id={p.customer.id} name={customerName} canView={canSeeCustomers} /> · {PROJECT_KIND_LABEL[p.kind as ProjectKind]}{p.tenderReference ? ` · ref ${p.tenderReference}` : ''} · managed by {p.manager.fullName}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={p.status} label={PROJECT_STATUS_LABEL[s]} className="px-3 py-1 text-sm" />
          {['DELIVERED', 'ACCEPTED', 'CLOSED'].includes(s) ? <PrintMenu orgHref={`/print/project-acceptance/${p.id}`} clientHref={`/print/project-acceptance/${p.id}?variant=client`} clientLabel="Customer Copy" align="right" /> : null}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4"><p className="text-xs text-[var(--ejo-text-muted)]">Contract value</p><p className="mt-1 text-xl font-bold text-[var(--ejo-text)]">{formatCurrency(p.contractValue, p.currency)}</p></div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4"><p className="text-xs text-[var(--ejo-text-muted)]">Dates</p><p className="mt-1 text-sm font-semibold text-[var(--ejo-text)]">{p.startDate ? formatDateOnly(p.startDate) : '—'} – {p.endDate ? formatDateOnly(p.endDate) : '—'}</p></div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4"><p className="text-xs text-[var(--ejo-text-muted)]">Milestones</p><p className="mt-1 text-xl font-bold text-[var(--ejo-text)]">{p.milestones.filter((m) => m.completedAt).length} / {p.milestones.length}</p></div>
        <div className="rounded-[var(--ejo-radius-lg)] border border-[var(--ejo-border)] bg-[var(--ejo-surface)] p-4"><p className="text-xs text-[var(--ejo-text-muted)]">Delivery</p><div className="mt-1"><DeliveryProgress progress={p.progress} /></div></div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {editing ? (
            <SectionCard icon="file" title="Edit the project">
              <form action={updateProjectDetailsFormAction} className="grid gap-3 sm:grid-cols-2">
                <FormPendingOverlay />
                <input type="hidden" name="projectId" value={p.id} />
                <div><label className={lbl} htmlFor="contractValue">Contract value (₦)</label><input id="contractValue" name="contractValue" type="number" min="0" step="0.01" defaultValue={p.contractValue} className={`${input} mt-1`} /></div>
                <div><label className={lbl} htmlFor="tenderReference">Tender / contract reference</label><input id="tenderReference" name="tenderReference" defaultValue={p.tenderReference ?? ''} className={`${input} mt-1`} /></div>
                <div><label className={lbl} htmlFor="startDate">Start</label><input id="startDate" name="startDate" type="date" defaultValue={dateInput(p.startDate)} className={`${input} mt-1`} /></div>
                <div><label className={lbl} htmlFor="endDate">End</label><input id="endDate" name="endDate" type="date" defaultValue={dateInput(p.endDate)} className={`${input} mt-1`} /></div>
                <div className="sm:col-span-2"><label className={lbl} htmlFor="description">Scope</label><textarea id="description" name="description" rows={3} defaultValue={p.description ?? ''} className={`${input} mt-1`} /></div>
                <div className="flex gap-2 sm:col-span-2"><SubmitButton label="Save" pendingLabel="Saving…" className={btn} /><LoadingLink href={`/projects/${p.id}`} className={btnLine}>Cancel</LoadingLink></div>
              </form>
            </SectionCard>
          ) : (
            <SectionCard icon="file" title="Scope" actions={canManage && !finished ? <LoadingLink href={`/projects/${p.id}?edit=1`} className="text-[var(--ejo-primary)] hover:underline">Edit</LoadingLink> : undefined}>
              <p className="whitespace-pre-line text-sm text-[var(--ejo-text)]">{p.description ?? <span className="text-[var(--ejo-text-muted)]">No scope recorded yet.</span>}</p>
            </SectionCard>
          )}

          <SectionCard icon="calendar" title={`Milestones (${p.milestones.length})`} description="Site surveys, deliveries, training, commissioning — each with a due date.">
            {p.milestones.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No milestones yet.</p> : (
              <ul className="divide-y divide-[var(--ejo-border)] text-sm">
                {p.milestones.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <p className={`font-medium ${m.completedAt ? 'text-[var(--ejo-text-muted)] line-through' : 'text-[var(--ejo-text)]'}`}>{m.name}</p>
                      <p className="text-xs text-[var(--ejo-text-muted)]">{m.dueDate ? `Due ${formatDateOnly(m.dueDate)}` : 'No due date'}{m.completedAt ? ` · done ${formatDateOnly(m.completedAt)}` : ''}{m.notes ? ` · ${m.notes}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${MILESTONE_TONE[m.state]}`}>{MILESTONE_STATE_LABEL[m.state]}</span>
                      {canManage && !m.completedAt && !finished ? (
                        <form action={completeProjectMilestoneFormAction}><FormPendingOverlay /><input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="milestoneId" value={m.id} /><SubmitButton label="Mark done" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-3 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" /></form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canManage && !finished ? (
              <RevealPanel label="Add a milestone" className="mt-4">
                <form action={addProjectMilestoneFormAction} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
                  <FormPendingOverlay />
                  <input type="hidden" name="projectId" value={p.id} />
                  <div><label className={lbl} htmlFor="msName">Milestone</label><input id="msName" name="name" required maxLength={120} className={`${input} mt-1`} placeholder="e.g. Site survey — 40 schools" /></div>
                  <div><label className={lbl} htmlFor="msDue">Due</label><input id="msDue" name="dueDate" type="date" className={`${input} mt-1`} /></div>
                  <SubmitButton label="Add milestone" pendingLabel="Adding…" className={btn} />
                  <div className="sm:col-span-3"><label className={lbl} htmlFor="msNotes">Notes (optional)</label><input id="msNotes" name="notes" className={`${input} mt-1`} /></div>
                </form>
              </RevealPanel>
            ) : null}
          </SectionCard>

          <SectionCard icon="truck" title={`Deliverables (${p.deliverables.length})`} description="Quantities per product and configuration, per site; record what was delivered and the customer's acceptance.">
            {p.deliverables.length === 0 ? <p className="text-sm text-[var(--ejo-text-muted)]">No deliverables yet.</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-[var(--ejo-text-muted)]"><th className="py-1">Product</th><th className="py-1">Site</th><th className="py-1 text-right">Delivered</th><th className="py-1">Acceptance</th>{canManage && !finished ? <th className="py-1"></th> : null}</tr></thead>
                <tbody>
                  {p.deliverables.map((d) => (
                    <tr key={d.id} className="border-t border-[var(--ejo-border)] align-top">
                      <td className="py-2 text-[var(--ejo-text)]">{d.product.name}{d.configuration ? <div className="text-xs text-[var(--ejo-text-muted)]">{d.configuration.name} ({d.configuration.code})</div> : null}</td>
                      <td className="py-2 text-xs text-[var(--ejo-text)]">{d.siteName ?? '—'}</td>
                      <td className="py-2 text-right text-[var(--ejo-text)]">{d.deliveredQuantity} / {d.quantity}</td>
                      <td className="py-2 text-xs">{d.acceptedAt ? <span className="text-[var(--ejo-success)]">Accepted {formatDateOnly(d.acceptedAt)}</span> : d.canAccept ? <span className="text-[var(--ejo-warning)]">Delivered — awaiting acceptance</span> : <span className="text-[var(--ejo-text-muted)]">{d.outstanding} to deliver</span>}</td>
                      {canManage && !finished ? (
                        <td className="py-2">
                          {!d.acceptedAt && d.outstanding > 0 ? (
                            <form action={recordProjectDeliveryFormAction} className="flex items-center gap-1">
                              <FormPendingOverlay />
                              <input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="deliverableId" value={d.id} />
                              <input name="quantity" type="number" min="1" max={d.outstanding} defaultValue={d.outstanding} required aria-label="Units delivered" className="w-20 rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] bg-[var(--ejo-bg)] px-2 py-1 text-xs text-[var(--ejo-text)]" />
                              <SubmitButton label="Delivered" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] border border-[var(--ejo-border)] px-2 py-1 text-xs font-medium text-[var(--ejo-text)] hover:bg-[var(--ejo-bg)]" />
                            </form>
                          ) : d.canAccept ? (
                            <form action={acceptProjectDeliverableFormAction}><FormPendingOverlay /><input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="deliverableId" value={d.id} /><SubmitButton label="Accepted" pendingLabel="Saving…" className="rounded-[var(--ejo-radius-md)] bg-[var(--ejo-primary)] px-2 py-1 text-xs font-medium text-white hover:opacity-90" /></form>
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canManage && !finished ? (
              <RevealPanel label="Add a deliverable" className="mt-4">
                <form action={addProjectDeliverableFormAction} className="grid gap-3 sm:grid-cols-2">
                  <FormPendingOverlay />
                  <input type="hidden" name="projectId" value={p.id} />
                  <div><label className={lbl} htmlFor="dlProduct">Product</label><div className="mt-1"><SearchableSelect id="dlProduct" name="productId" required search={searchProjectProductOptions} placeholder="Search the catalogue…" /></div></div>
                  <div><label className={lbl} htmlFor="dlConfig">Configuration (optional)</label><div className="mt-1"><SearchableSelect id="dlConfig" name="configurationId" search={searchProjectConfigurationOptions} placeholder="Search configurations…" /></div></div>
                  <div><label className={lbl} htmlFor="dlQty">Quantity</label><input id="dlQty" name="quantity" type="number" min="1" step="1" required className={`${input} mt-1`} /></div>
                  <div><label className={lbl} htmlFor="dlSite">Site (optional)</label><input id="dlSite" name="siteName" maxLength={120} className={`${input} mt-1`} placeholder="e.g. Government Secondary School, Ikorodu" /></div>
                  <div className="sm:col-span-2"><SubmitButton label="Add deliverable" pendingLabel="Adding…" className={btn} /></div>
                </form>
              </RevealPanel>
            ) : null}
          </SectionCard>

          <SectionCard icon="layers" title="Linked records" description="Quotations, sales orders and build orders raised for this project.">
            <div className="grid gap-4 text-sm sm:grid-cols-3">
              <div>
                <p className={lbl}>Quotations ({p.quotations.length})</p>
                <ul className="mt-1 space-y-1">{p.quotations.map((q) => <li key={q.id}>{canSales ? <LoadingLink href={`/sales/quotations/${q.id}`} className="text-[var(--ejo-primary)] hover:underline">{q.number}</LoadingLink> : q.number} <span className="text-xs text-[var(--ejo-text-muted)]">· {q.status.toLowerCase().replace(/_/g, ' ')} · {formatCurrency(q.total, 'NGN')}</span></li>)}{p.quotations.length === 0 ? <li className="text-xs text-[var(--ejo-text-muted)]">None yet</li> : null}</ul>
              </div>
              <div>
                <p className={lbl}>Sales orders ({p.salesOrders.length})</p>
                <ul className="mt-1 space-y-1">{p.salesOrders.map((o) => <li key={o.id}>{canSales ? <LoadingLink href={`/sales/orders/${o.id}`} className="text-[var(--ejo-primary)] hover:underline">{o.number}</LoadingLink> : o.number} <span className="text-xs text-[var(--ejo-text-muted)]">· {o.status.toLowerCase().replace(/_/g, ' ')} · {formatCurrency(o.total, 'NGN')}</span></li>)}{p.salesOrders.length === 0 ? <li className="text-xs text-[var(--ejo-text-muted)]">None yet</li> : null}</ul>
              </div>
              <div>
                <p className={lbl}>Build orders ({p.buildOrders.length})</p>
                <ul className="mt-1 space-y-1">{p.buildOrders.map((b) => <li key={b.id}>{canProduction ? <LoadingLink href={`/production/build-orders/${b.id}`} className="text-[var(--ejo-primary)] hover:underline">{b.number}</LoadingLink> : b.number} <span className="text-xs text-[var(--ejo-text-muted)]">· {b.quantity} × {b.configuration.product.name} · {b.status.toLowerCase().replace(/_/g, ' ')}</span></li>)}{p.buildOrders.length === 0 ? <li className="text-xs text-[var(--ejo-text-muted)]">None yet</li> : null}</ul>
              </div>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          {canManage && next.length ? (
            <SectionCard icon="arrow-right" title="Move the project along">
              <div className="space-y-2">
                {next.map((to) => (
                  <form key={to} action={moveProjectStatusFormAction} className="flex items-center gap-2">
                    <FormPendingOverlay />
                    <input type="hidden" name="projectId" value={p.id} /><input type="hidden" name="to" value={to} />
                    <SubmitButton label={PROJECT_MOVE_LABEL[to]} pendingLabel="Saving…" className={to === 'LOST' ? `${btnLine} w-full text-[var(--ejo-error)]` : `${btn} w-full`} />
                  </form>
                ))}
              </div>
              {s === 'DELIVERED' ? <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">Acceptance needs every deliverable accepted.</p> : null}
            </SectionCard>
          ) : null}
          <SectionCard icon="history" title="Audit trail">
            <AuditTrail entries={trail.map((e) => {
              const meta = (e.metadata ?? {}) as Record<string, unknown>;
              const parts = [typeof meta.milestone === 'string' ? meta.milestone : null, typeof meta.product === 'string' ? `${meta.product}${typeof meta.quantity === 'number' ? ` × ${meta.quantity}` : ''}` : null, typeof meta.to === 'string' ? `→ ${String(meta.to).replace(/_/g, ' ').toLowerCase()}` : null, typeof meta.note === 'string' ? meta.note : null].filter(Boolean);
              return { id: e.id, actionLabel: ACTION_LABEL[e.action] ?? humanizeAction(e.action), userName: e.userName, detail: parts.join(' · ') || null, dateLabel: formatDateTime(e.createdAt) };
            })} />
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
