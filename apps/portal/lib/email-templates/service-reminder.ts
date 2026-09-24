import { renderEmailLayout, escapeHtml } from './layout';
import { pluralize } from '@/lib/utils/pluralize';

export type ServiceReminderStage = 1 | 2 | 3 | 4;

export type ServiceReminderEmailOptions = {
  stage: ServiceReminderStage;
  customerName: string;
  vehicleDescription: string;
  plateNumber: string | null;
  currentMileage: number | null;
  lastServiceMileage: number | null;
  lastServiceDate: Date | null;
  estimatedDueOdometer: number | null;
  estimatedDueDate: Date | null;
  kmRemaining: number | null;
  daysRemaining: number | null;
  isOverdue: boolean;
  /** Which reminder this is for the current service cycle (1st, 2nd, …) —
   * shown to the customer so the count is transparent. */
  reminderCount: number;
  vehicleUrl: string;
  logoUrl: string;
  companyName: string;
  branchName: string;
};

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th'}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Lagos' });
}

/** Real, actual facts only — never invents a number the system
 * doesn't genuinely have. */
function vehicleInfoCard(opts: ServiceReminderEmailOptions): string {
  const { vehicleDescription, plateNumber, currentMileage, lastServiceMileage, lastServiceDate, estimatedDueOdometer, estimatedDueDate, kmRemaining, daysRemaining, isOverdue } = opts;

  const remainingParts = [
    kmRemaining !== null ? `about ${kmRemaining.toLocaleString('en-NG')} km` : null,
    daysRemaining !== null ? pluralize(daysRemaining, 'day') : null,
  ].filter(Boolean);
  const statusLine = isOverdue
    ? '<span style="color: #DC2626; font-weight: bold;">Estimated service point reached</span>'
    : remainingParts.length > 0
      ? `<span style="color: #CA8A04; font-weight: bold;">${remainingParts.join(' or ')} to go — whichever comes first</span>`
      : '';
  const accent = isOverdue ? '#DC2626' : '#16A34A';
  const accentBg = isOverdue ? '#FEF2F2' : '#F0FDF4';
  const accentBorder = isOverdue ? '#FECACA' : '#BBF7D0';
  const dueCell = (label: string, value: string) =>
    `<td style="padding: 6px 12px 6px 0; vertical-align: top;"><p style="margin: 0; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #475569;">${label}</p><p style="margin: 2px 0 0 0; font-size: 26px; line-height: 1.15; font-weight: 800; color: ${accent};">${value}</p></td>`;
  const nextServiceBlock =
    estimatedDueOdometer !== null || estimatedDueDate
      ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 14px 0 4px 0; background-color: ${accentBg}; border: 2px solid ${accentBorder}; border-radius: 12px;">
            <tr><td style="padding: 16px 18px;">
              <p style="margin: 0 0 8px 0; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; color: ${accent};">Next routine service</p>
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                ${estimatedDueOdometer !== null ? dueCell('At odometer', `${estimatedDueOdometer.toLocaleString('en-NG')} km`) : ''}
                ${estimatedDueOdometer !== null && estimatedDueDate ? '<td style="padding: 22px 12px 0 0; font-size: 14px; font-weight: bold; color: #475569;">or</td>' : ''}
                ${estimatedDueDate ? dueCell('By date', formatDate(estimatedDueDate)) : ''}
              </tr></table>
              ${estimatedDueOdometer !== null && estimatedDueDate ? '<p style="margin: 6px 0 0 0; font-size: 12px; color: #475569;">Whichever comes first.</p>' : ''}
            </td></tr>
          </table>`
      : '';

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 20px 0; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 12px;">
      <tr>
        <td style="padding: 20px 24px;">
          <p style="margin: 0 0 2px 0; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748B;">Your Vehicle</p>
          <p style="margin: 0 0 10px 0; font-size: 15px; font-weight: bold; color: #0F172A;">${escapeHtml(vehicleDescription)}${plateNumber ? ` — ${escapeHtml(plateNumber)}` : ''}</p>
          ${currentMileage !== null ? `<p style="margin: 0 0 2px 0; font-size: 12px; color: #64748B;">Current recorded mileage</p><p style="margin: 0 0 10px 0; font-size: 13px; color: #0F172A;">${currentMileage.toLocaleString('en-NG')} km</p>` : ''}
          ${lastServiceMileage !== null || lastServiceDate ? `<p style="margin: 0 0 2px 0; font-size: 12px; color: #64748B;">Last recorded service</p><p style="margin: 0 0 10px 0; font-size: 13px; color: #0F172A;">${lastServiceMileage !== null ? `${lastServiceMileage.toLocaleString('en-NG')} km` : ''}${lastServiceMileage !== null && lastServiceDate ? ' — ' : ''}${lastServiceDate ? formatDate(lastServiceDate) : ''}</p>` : ''}
          ${nextServiceBlock}
          ${statusLine ? `<p style="margin: 8px 0 0 0; font-size: 13px;">${statusLine}</p>` : ''}
          <p style="margin: 10px 0 0 0; font-size: 11px; color: #94A3B8; font-style: italic;">
            The date and mileage shown above are estimates based on the latest service information available to us. Actual timing depends on how the vehicle is used — please check your current odometer regularly.
          </p>
        </td>
      </tr>
    </table>
  `;
}

/** The same recognizable safety paragraph on every single stage —
 * deliberately never varies, so it becomes a familiar, trusted part
 * of every reminder rather than sounding like the system claims to
 * know the vehicle's actual condition. */
function safetyParagraph(): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0; background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 12px;">
      <tr>
        <td style="padding: 16px 20px;">
          <p style="margin: 0 0 6px 0; font-size: 12px; font-weight: bold; color: #92400E;">A quick reminder about your vehicle</p>
          <p style="margin: 0; font-size: 13px; color: #78350F; line-height: 1.5;">
            Your vehicle can sometimes give you small signs before a problem becomes more serious — warning lights, unusual sounds, changes in braking or steering, overheating, fluid leaks, tyre problems, or anything that feels different from normal.
            Please don't wait for your next routine service if something feels off. Contact us and we'll help you work out the right next step.
          </p>
        </td>
      </tr>
    </table>
  `;
}

function alreadyServicedLine(): string {
  return `<p style="margin: 16px 0 0 0; font-size: 12px; color: #64748B;">If you've already had this vehicle serviced elsewhere, please let us know so we can update your service information.</p>`;
}

const STAGE_COPY: Record<ServiceReminderStage, { subject: string; heading: string; iconGlyph: string; iconTone: 'neutral' | 'positive' | 'negative'; opening: (name: string, vehicle: string) => string; body: string }> = {
  1: {
    subject: 'A friendly reminder to keep your vehicle on track',
    heading: 'Keeping an eye on your vehicle',
    iconGlyph: '🚗',
    iconTone: 'neutral',
    opening: (name, vehicle) => `Hello ${escapeHtml(name)}, we hope everything is going well with you and your ${escapeHtml(vehicle)}.`,
    body: `Based on your vehicle's service information, your next routine service is currently estimated below. Please note this is an estimate based on the information currently available to us — your actual service timing may change depending on how much you drive and how the vehicle is used. If you've been driving more than usual, your current odometer reading is the best guide.`,
  },
  2: {
    subject: 'Your vehicle is getting closer to its next routine service',
    heading: 'Getting closer to your next service',
    iconGlyph: '🚗',
    iconTone: 'neutral',
    opening: (name, vehicle) => `Hello ${escapeHtml(name)}, we hope you're doing well and that your ${escapeHtml(vehicle)} is serving you well.`,
    body: `This is a follow-up reminder about your vehicle's next routine service. Please remember this is a maintenance estimate, not a fixed appointment date or exact mileage — your actual service point depends on how the vehicle is being used. If you've been driving more than usual, please use your current odometer reading as your best guide.`,
  },
  3: {
    subject: 'Your vehicle may be due for its next routine service',
    heading: 'Your vehicle may be due',
    iconGlyph: '!',
    iconTone: 'neutral',
    opening: (name, vehicle) => `Hello ${escapeHtml(name)}, this is another reminder about the next routine service for your ${escapeHtml(vehicle)}.`,
    body: `Because vehicle usage varies, we recommend checking your current odometer reading rather than relying on the estimated date alone. If your vehicle has reached the recommended mileage interval, or the estimated date has passed, please consider arranging your routine service — even a small issue can become a larger one when left unattended.`,
  },
  4: {
    subject: "Your vehicle's routine service may now be due",
    heading: 'Routine service may now be due',
    iconGlyph: '!',
    iconTone: 'negative',
    opening: (name) => `Hello ${escapeHtml(name)}, we hope you're doing well.`,
    body: `Our records indicate that your ${'{{VEHICLE}}'} has reached or passed its current estimated routine service point. This reminder is based on the service information currently available to us — actual usage can cause the real interval to be reached earlier or later than the original estimate. We recommend checking your current odometer reading and arranging a routine service if the interval has genuinely been reached.`,
  },
};

/**
 * The one real, shared email covering all four progressive stages —
 * same real layout throughout, the tone and wording genuinely
 * shifting stage by stage exactly as agreed: warm and preventive
 * first, more attentive second, more actionable third, and factual
 * rather than alarmist once truly overdue. Never claims the estimate
 * is exact; always tells the customer plainly that real usage moves
 * the real date.
 */
export function renderServiceReminderEmail(opts: ServiceReminderEmailOptions): string {
  const stage = STAGE_COPY[opts.stage];
  const openingLine = stage.opening(opts.customerName, opts.vehicleDescription).replace('{{VEHICLE}}', escapeHtml(opts.vehicleDescription));
  const bodyLine = stage.body.replace('{{VEHICLE}}', escapeHtml(opts.vehicleDescription));

  const counter = `<p style="margin: 0 0 14px 0; display: inline-block; padding: 4px 10px; border-radius: 999px; background-color: #EEF2FF; color: #3730A3; font-size: 12px; font-weight: bold;">This is our ${ordinal(Math.max(1, opts.reminderCount))} reminder about this service</p>`;
  const bodyHtml = `
    ${counter}
    <p style="margin: 0 0 16px 0;">${openingLine}</p>
    <p style="margin: 0 0 8px 0;">${bodyLine}</p>
    ${vehicleInfoCard(opts)}
    ${safetyParagraph()}
    <p style="margin: 16px 0 0 0;">If you notice anything unusual, or would simply like us to take a look, please contact our service team.</p>
    ${alreadyServicedLine()}
  `;

  return renderEmailLayout({
    previewText: stage.subject,
    companyName: opts.companyName,
    orgContext: [opts.companyName, opts.branchName],
    iconGlyph: stage.iconGlyph,
    iconTone: stage.iconTone,
    heading: stage.heading,
    bodyHtml,
    ctaLabel: 'View Vehicle',
    ctaUrl: opts.vehicleUrl,
    logoUrl: opts.logoUrl,
  });
}

export function serviceReminderSubject(stage: ServiceReminderStage): string {
  return STAGE_COPY[stage].subject;
}
