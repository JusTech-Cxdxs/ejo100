/** The styles a person can send an email in (browser-safe: no imports). */
export const MAIL_STYLES = ['standard', 'action', 'urgent', 'info', 'plain'] as const;
export type MailStyle = (typeof MAIL_STYLES)[number];

export const MAIL_STYLE_LABEL: Record<MailStyle, { label: string; help: string }> = {
  standard: { label: 'Standard', help: 'The organisation letterhead, logo and footer.' },
  action: { label: 'Action needed', help: 'Letterhead with an amber "Action needed" label.' },
  urgent: { label: 'Urgent', help: 'Letterhead with a red "Urgent" label.' },
  info: { label: 'For information', help: 'Letterhead with a blue "For information" label.' },
  plain: { label: 'Plain text', help: 'Your text exactly as typed, no letterhead.' },
};

