# Harbor UI

A calm, friendly product language for people-ops and back-office SaaS: off-white canvas, white cards edged by a faint ring, pill-shaped controls, pastel icon discs and a single sky-blue action color.

Values were measured from the computed CSS of a live HR SaaS marketing site and from screenshots of its web app. The visual language (scale, color, radius, shadow, layout patterns) is captured here; the source's logo, mascot illustration, avatar art, product name and copy are not included. Replace the neutral logo tile and the auth panel shapes with your own brand assets.

## Content fundamentals

- Short, warm, plain sentences. Greet by first name on the home page ("Good morning, Ana").
- Buttons are verbs plus object: "Add employee", "Create post", "Save view...". Ellipsis only when the action opens a dialog.
- Empty states say what is missing in one line ("You have no assigned tasks"), muted, with a faint icon. No illustrations inside widgets.
- Errors are three or four words next to a red warning icon ("Code is invalid").
- Changelog lines read `Date · Feature name`.

## Visual foundations

**Canvas.** `bg-page` (#fafafa) everywhere; content sits on `bg-surface` white. Cards get `shadow-ring` (a 1px 8% black ring), not a border.

**Color.** One action color: `brand-500` sky blue, used as a top-down gradient from `brand-300` on primary buttons, and as `brand-50` / `brand-100` tints for active nav and secondary buttons. Everything else is neutral ink. Personality comes from pastels (`pastel-butter`, `pastel-pink`, `pastel-lime`, `pastel-sky`, `pastel-peach`, `pastel-lavender`, `pastel-mint`) used as big flat grounds: icon discs, the note card, avatars, the auth panel. Saturated accents (`accent-violet`, `accent-orange`, `accent-teal`) appear only as marketing eyebrows and small icons.

**Type.** The OS system face (`--font-sans`: SF Pro on Apple, Segoe UI on Windows). Marketing headlines are 600 weight with slight negative tracking (display 64px / -0.6px). App UI runs 15 to 16px at weight 500 for labels and 400 for data. Muted text is `ink-muted`, never lighter for readable copy.

**Shape.** Pills for anything you press (`radius-pill`), `radius-xl` 16px for widgets and notes, `radius-md` 8px for inputs and tables, `radius-3xl` 32px for the hero product frame.

**Depth.** Flat by default. Lift only primary buttons (`shadow-button`) and floating marketing panels (`shadow-card`). Focus is `shadow-focus`, a soft blue halo.

**Layout.** App: 56px top bar, content column around 1100px centered, page title, a row of quick-action chips, then a 2-column widget grid with `space-6` gaps (wide widget + narrow note on top, half + half below). List pages: 260px side list plus a full-bleed gridded table. Marketing: centered hero, two pill CTAs side by side, changelog line, then the product screenshot inside a 32px-radius sky gradient frame.

## Iconography

Rounded 1.8px-stroke line icons at 20px in the app bar and widgets (check, gift, calendar, search, bell), filled glyphs for the create and tasks buttons. Icons inside discs are ink on pastel. The previews use simple placeholder SVGs; swap in a full set such as an SF Symbols-like or Lucide-style family at 1.8 stroke.

## Usage rules

- One `hb-btn-primary` per view. Pair it with `hb-btn-tint`, never with a second primary.
- `brand-600` text passes only at large sizes; below 18px use `brand-700`.
- White on `brand-500` is 2.9:1: primary labels stay 15px semibold or bigger.
- `ink-subtle` is for placeholders and decorative icons only.
- Pastel grounds always carry `ink` text, never white.
- Assign each widget type one disc pastel and keep it everywhere (lime tasks, pink birthdays and time-off, peach out-of-office, sky onboarding).

## Components

Button, IconButton, QuickAction, NavBar, SideList, WidgetCard, NoteCard, StatusTag, Avatar, Announcement, NoticeBanner, TextField, CodeInput, FilterBar, DataTable, AuthSplit. Styles live in `components/bundle.css` with the `hb-` prefix; each component folder has a live preview and guidelines.

## Not captured yet

Dark theme (the source has none), modal / dropdown / toast / date picker, the chat co-pilot panel, the onboarding and time-off flows. Send screenshots of those screens to extend the system.
