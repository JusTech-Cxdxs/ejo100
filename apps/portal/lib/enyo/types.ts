/**
 * Shared shapes for Enyo in the staff portal. Every staff tool receives a
 * StaffCtx describing who is asking; the tool itself still calls the normal
 * authorised code (authorize / reachWhere / the existing readers), which reads
 * the session again, so a tool can never act as anyone else.
 */
import type { Tool } from '@ejo/enyo';

export type StaffCtx = {
  userId: string;
  organisationId: string;
  branchId: string | null;
  roleSlugs: string[];
  isSuperAdmin: boolean;
  /** The person's full name, for greetings and drafts. */
  name: string;
  /** Set while a Branch Assistant is helping this person (assisted session). */
  assisted: boolean;
  /** The page the person had open when they asked, e.g. "/workshop/job-cards/abc". */
  page?: string;
  /**
   * The person's own message this turn. Tools that change Enyo's memory act
   * only when this message asks for it, never because an email or web page
   * read in the same turn told the model to.
   */
  question?: string;
};

export type StaffTool = Tool<StaffCtx>;

/** A tool result that prepares something for the person to confirm on a normal page. */
export function draftResult(draft: { kind: string; title: string; lines: string[]; href: string; confirmLabel: string }) {
  return { ok: true as const, data: { draft } };
}

/** Same wording everywhere a tool is refused because of permissions. */
export const NOT_PERMITTED = { ok: false as const, refused: true, message: 'This person is not allowed to see this. Say so kindly and offer what they can see instead.' };
