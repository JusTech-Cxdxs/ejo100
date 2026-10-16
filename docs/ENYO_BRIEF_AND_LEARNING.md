# Enyo: the brief, knowing how you work, and learning from conversations

## The brief (dashboard and chat)

**Dashboard → Your brief** (and "brief me" / "good morning" / "what have I
left?" in chat) lists what is waiting for the person:

- decisions and other steps, with the overdue ones
- support requests for them, and the late ones
- reminders due
- appointments
- open jobs
- their own unread mail (Enyo-flagged first)
- new notifications and announcements

Each item comes with its link. The brief can cover:

- everything waiting now
- today
- since my last brief
- this week
- chosen dates

It is built from the same lists the person sees elsewhere, with their own
permissions. Mail is never included during an assisted session. The small
model writes it up and may only use links we gave it; if the model is off, a
plain list is shown instead. **Listen** reads it aloud.

By default the brief runs once each morning, afternoon and evening when the
dashboard opens. You can switch this off on the card; the choice is remembered
on that device.

## Knowing how you work

In the person's own chat, Enyo is told three things so it can fit answers to
their job:

- their roles
- their branch, department and team
- what they do most in the portal: their own business actions over the last 60
  days, counted

This is never shown to anyone else, never used for training, and not used
during an assisted session. Remembered facts ("remember that…") still work as
before.

## Learning from conversations

**Enyo learning → What Enyo learns from its conversations** shows, for the
last 30 days:

- chats by channel (staff, customers, website) and by role
- what people ask most (words, with names and contact details removed)
- which tools Enyo needed
- ratings and hand-overs
- the gaps to fill: answers rated unhelpful, and chats that ended with "a
  person please"

**Learned answers** all wait for an administrator's approval before Enyo uses
them. They come from:

- staff thumbs-up on a first answer that read nobody's records
- colleagues' support resolutions
- since this release, each day's customer and website chats: a general
  question answered from public information, with no hand-over

**Training set (JSONL, chat fine-tuning format):**

- Download it from the same card.
- It contains approved answers and helpful-rated first answers that read
  nobody's records. Everything is scrubbed again and tagged with channel and
  role, never with a name or an id.
- "Manage Enyo" only, never during an assisted session, and every export is in
  the audit trail.
