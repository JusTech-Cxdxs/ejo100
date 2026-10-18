import { allows, guardAnyPage } from '@/lib/authz/server';
import { listSoftwarePackages } from '@/lib/actions/catalogue';
import { createSoftwarePackageFormAction, setSoftwarePackageActiveFormAction } from '@/lib/actions/catalogue-form-handlers';
import { FormFeedbackBanner } from '@/components/FormFeedbackBanner';
import { FormPendingOverlay } from '@/components/FormPendingOverlay';
import { SubmitButton } from '@/components/SubmitButton';
import { EmptyState, PageHeader, ResponsiveTable, RevealPanel, StatusChip } from '@/components/ui';
import { btn, btnSmall, input, label, tableHead, tableRow, tableWrap, td, th } from '@/components/production/styles';

const KIND_LABEL: Record<string, string> = { IMAGE: 'Operating-system image', APPLICATION: 'Application', DRIVER: 'Driver', AGENT: 'Agent' };
const BANNER: Record<string, string> = { software_created: 'Software package added.', software_retired: 'Software package retired.', software_restored: 'Software package restored.' };

/** Software images and packages the line installs, with how many configurations use each. */
export default async function SoftwarePage({ searchParams }: { searchParams: Promise<{ status?: string; error?: string; all?: string }> }) {
  await guardAnyPage(['catalogue.view'], '/catalogue/software');
  const { status, error, all } = await searchParams;
  const [rows, canManage] = await Promise.all([listSoftwarePackages(all === '1'), allows('catalogue.manage')]);
  return (
    <div className="w-full p-4 sm:p-8">
      <PageHeader icon="layers" title="Software packages" back={{ href: '/catalogue', label: 'Back to Catalogue' }} description="The Windows image, Office, antivirus, drivers and the Zinox Care agent — what the line installs and the line supervisor confirms on every unit." />
      {status && BANNER[status] ? <FormFeedbackBanner kind="success" message={BANNER[status]} /> : null}
      {error ? <FormFeedbackBanner kind="error" message={error} /> : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          {rows.length === 0 ? (
            <div className={`${tableWrap} border-dashed`}><EmptyState icon="layers" title="No software packages yet">{canManage ? 'Add the operating-system image first, then the applications and the Zinox Care agent.' : 'The Catalogue team has not added any yet.'}</EmptyState></div>
          ) : (
            <ResponsiveTable className={tableWrap}>
              <table className="w-full text-sm">
                <thead>
                  <tr className={tableHead}><th className={th}>Package</th><th className={th}>Kind</th><th className={th}>Licence</th><th className={`${th} text-right`}>Used by</th><th className={th}>Status</th>{canManage ? <th className={th} /> : null}</tr>
                </thead>
                <tbody>
                  {rows.map((p: (typeof rows)[number]) => (
                    <tr key={p.id} className={tableRow}>
                      <td className={td}><span className="font-medium text-[var(--ejo-text)]">{p.name}</span>{p.version ? <span className="text-[var(--ejo-text-muted)]"> {p.version}</span> : null}</td>
                      <td data-label="Kind" className={td}>{KIND_LABEL[p.kind] ?? p.kind}</td>
                      <td data-label="Licence" className={td}>{p.licenceRequired ? 'Licence required' : 'No licence'}</td>
                      <td data-label="Used by" className={`${td} text-right tabular-nums`}>{p._count.configurations} {p._count.configurations === 1 ? 'configuration' : 'configurations'}</td>
                      <td data-label="Status" className={td}><StatusChip status={p.isActive ? 'ACTIVE' : 'INACTIVE'} label={p.isActive ? 'Active' : 'Retired'} /></td>
                      {canManage ? (
                        <td data-actions className={`${td} text-right`}>
                          <form action={setSoftwarePackageActiveFormAction}>
                            <input type="hidden" name="packageId" value={p.id} />
                            <input type="hidden" name="active" value={p.isActive ? '0' : '1'} />
                            <SubmitButton label={p.isActive ? 'Retire' : 'Restore'} pendingLabel="…" className={btnSmall} ariaLabel={`${p.isActive ? 'Retire' : 'Restore'} ${p.name}`} />
                          </form>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ResponsiveTable>
          )}
          <p className="mt-2 text-xs text-[var(--ejo-text-muted)]">{all === '1' ? <a href="/catalogue/software" className="text-[var(--ejo-primary)] hover:underline">Hide retired packages</a> : <a href="/catalogue/software?all=1" className="text-[var(--ejo-primary)] hover:underline">Show retired packages</a>}</p>
        </div>

        {canManage ? (
          <RevealPanel label="Add a software package" open={Boolean(error)}>
            <form action={createSoftwarePackageFormAction} className="space-y-4">
              <FormPendingOverlay />
              <div><label className={label} htmlFor="name">Name</label><input id="name" name="name" required className={input} placeholder="Windows 11 Pro image" maxLength={120} /></div>
              <div><label className={label} htmlFor="version">Version (optional)</label><input id="version" name="version" className={input} placeholder="23H2" maxLength={40} /></div>
              <div>
                <label className={label} htmlFor="kind">Kind</label>
                <select id="kind" name="kind" className={input} defaultValue="APPLICATION">{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </div>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="licenceRequired" className="h-4 w-4" /> A licence key is needed per unit</label>
              <SubmitButton label="Add package" pendingLabel="Adding…" className={btn} />
            </form>
          </RevealPanel>
        ) : null}
      </div>
    </div>
  );
}
