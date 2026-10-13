/**
 * All page copy lives here. Components read from this file and contain no
 * marketing text of their own. Long-form pages (security, privacy, terms) are
 * MDX files under src/app/(legal)/.
 */

/** The web app. Placeholder until the production domain is final. */
const appUrl = "https://app.sahihi.co.ke"
const contact = "mailto:hello@sahihi.co.ke"

export const site = {
  name: "Sahihi",
  /** This site's origin, for metadata, the sitemap and social cards. Placeholder. */
  url: "https://sahihi.co.ke",
  appUrl,
  contact,
  title: "Sahihi — draft, sign and prove your agreements",
  description:
    "Sahihi drafts agreements with you, collects signatures by link, then seals the PDF with a certificate anyone can verify.",

  nav: [
    { label: "Security", href: "/security" },
    { label: "Pricing", href: "/#pricing" },
    { label: "Log in", href: `${appUrl}/sign-in` },
  ],

  cta: {
    primary: { label: "Start free", href: `${appUrl}/sign-up` },
    secondary: { label: "Verify a document", href: `${appUrl}/verify` },
  },

  hero: {
    headline: ["Signed, sealed", "and provable."],
    subtitle: [
      "Draft the agreement, send one link per signer,",
      "and keep evidence anyone can check.",
    ],
    worksWith: "Signers need no account. Works on any phone.",
  },

  /** The three things the scroll story merges into one window. */
  pillars: ["Draft", "Send", "Prove"] as const,

  pillarIntro:
    "Three steps that used to need a printer, a courier and a scanner. Now they need one link.",

  chapters: [
    {
      id: "draft",
      eyebrow: "Drafting assistant",
      headline: ["Draft with help.", "Decide every word."],
      body: "Start from a reviewed starter or your own PDF or Word file. The assistant asks what it needs, fills the blanks and suggests edits you accept or reject. Nothing changes without you.",
      demos: [
        {
          kind: "questions",
          wide: true,
          lead: "Asks, then fills.",
          text: "A few questions at a time. Skip any of them and fill the blank yourself.",
        },
        {
          kind: "proposal",
          lead: "Edits you approve.",
          text: "Every suggested change arrives as a diff to accept or reject.",
        },
        {
          kind: "signers",
          lead: "Signers included.",
          text: "It names the parties and places their fields, ready to send.",
        },
      ],
      features: [
        {
          icon: "quill",
          lead: "Starters.",
          text: "Mutual NDA, offer letter, board resolution and more, in reviewed wording.",
        },
        {
          icon: "brackets",
          lead: "Blanks, not guesses.",
          text: "Every name, date and amount is a blank you can see and fill.",
        },
        {
          icon: "tray",
          lead: "Bring your own.",
          text: "Import a PDF or Word file and keep drafting from it.",
        },
        {
          icon: "stack",
          lead: "Templates.",
          text: "Save a finished draft for the workspace, with its roles and blanks intact.",
        },
        {
          icon: "padlock",
          lead: "Locked once final.",
          text: "Finalised fields stay put. A change after sending means a new version.",
        },
        {
          icon: "clip",
          lead: "Attach context.",
          text: "Give the assistant a term sheet or an earlier contract to work from.",
        },
      ],
    },
    {
      id: "send",
      eyebrow: "Send & sign",
      headline: ["Place the fields.", "Send the link."],
      body: "Add recipients, set the signing order and drop signature, date and text fields on the page. Each signer gets their own link and signs in the browser, on any phone, without an account.",
      demos: [
        {
          kind: "signing",
          wide: true,
          lead: "Signs on any phone.",
          text: "Next field, draw or type a signature, done. No app and no sign-up.",
        },
        {
          kind: "otp",
          lead: "A code first.",
          text: "Ask for a six-digit code by email or SMS before anyone can sign.",
        },
        {
          kind: "routing",
          lead: "In the right order.",
          text: "Signing order, reminders and an expiry date, set once.",
        },
      ],
    },
    {
      id: "prove",
      eyebrow: "Certificate of Completion",
      headline: ["Proof anyone", "can check."],
      body: "When the last person signs, Sahihi stamps the values into the PDF on the server, fingerprints every file and issues a certificate listing each signer, each event and a code anyone can check.",
      demos: [
        {
          kind: "verify",
          lead: "Check any copy.",
          text: "Drop a PDF on the verify page. It is hashed in your browser, never uploaded.",
        },
        {
          kind: "audit",
          lead: "A chained history.",
          text: "Every event links to the one before, so a rewritten log shows.",
        },
      ],
    },
  ],

  context: {
    headline: "It fits the systems you already run.",
    cards: [
      { lead: "Public API.", text: "Create, send and track envelopes with a scoped API key." },
      { lead: "Webhooks.", text: "Signed events when an envelope is sent, signed or completed." },
      { lead: "Bulk send.", text: "One template and a CSV of recipients. Hundreds of envelopes." },
      { lead: "Embedded signing.", text: "Signers finish inside your own site, in an iframe." },
    ],
  },

  process: {
    headline: ["From first draft", "to sealed PDF."],
    steps: [
      {
        title: "Draft.",
        lines: ["Start from a starter.", "Or upload a PDF or Word file.", "Fill in every blank."],
      },
      {
        title: "Place.",
        lines: [
          "Add recipients in order.",
          "Drop fields on the pages.",
          "Ask for email or SMS codes.",
        ],
      },
      {
        title: "Send.",
        lines: ["One link per signer.", "No account needed.", "Reminders go out on time."],
      },
      {
        title: "Seal.",
        lines: [
          "Values stamped on the server.",
          "Every file fingerprinted.",
          "A certificate to check.",
        ],
      },
    ],
  },

  trust: {
    headline: "Evidence, not promises.",
    facts: [
      { text: "Every file gets a SHA‑256 fingerprint." },
      { text: "The audit trail is chained, and the database refuses edits." },
      { text: "Anyone can verify a document, by its code or by the file itself." },
      { text: "Retention, export and deletion, built for Kenya's Data Protection Act." },
      { text: "Links and codes are stored only as hashes." },
    ],
  },

  pricing: {
    headline: "Pricing.",
    plans: [
      {
        name: "Free",
        price: "5",
        unit: "envelopes / month",
        features: ["2 seats", "30 assistant replies a month", "Certificates and /verify"],
        cta: "Start free",
        href: `${appUrl}/sign-up`,
        featured: true,
      },
      {
        name: "Starter",
        price: "50",
        unit: "envelopes / month",
        features: ["5 seats", "300 assistant replies a month", "Templates and bulk send"],
        cta: "Talk to us",
        href: contact,
        featured: false,
      },
      {
        name: "Business",
        price: "300",
        unit: "envelopes / month",
        features: ["20 seats", "1,500 assistant replies a month", "API, webhooks and embedding"],
        cta: "Talk to us",
        href: contact,
        featured: false,
      },
      {
        name: "Enterprise",
        price: "∞",
        unit: "envelopes / month",
        features: [
          "Unlimited seats",
          "Unlimited assistant replies",
          "Retention set to your policy",
        ],
        cta: "Talk to us",
        href: contact,
        featured: false,
      },
    ],
    footnote:
      "Paid plans are set up for you by our team. Monthly limits reset on the 1st, Nairobi time. Voided envelopes count; drafts don't.",
  },

  faq: {
    headline: "FAQ.",
    items: [
      {
        q: "Do signers need an account?",
        a: "No. Each signer gets their own link by email and signs in the browser. You can ask for a one-time code by email or SMS before they sign.",
      },
      {
        q: "Is an electronic signature legally binding?",
        a: "Kenyan law recognises electronic signatures, and Sahihi records who signed, when and how they were identified. Some documents need an advanced electronic signature from a licensed provider; support for one is on the way. Ask your lawyer which of your documents Sahihi suits today.",
      },
      {
        q: "How does someone check a signed document?",
        a: "Scan the QR code on the certificate, type its code on the verify page, or drop the PDF there. The file is hashed in the browser and only the fingerprint is sent.",
      },
      {
        q: "Does the drafting assistant read my documents?",
        a: "Only once an owner or admin turns it on for the workspace. It is off by default, because document text goes to the model provider while it's on.",
      },
      {
        q: "Can we connect Sahihi to our own systems?",
        a: "Yes. There is a public API with scoped keys, signed webhooks, bulk send from a CSV, and embedded signing inside your own site.",
      },
      {
        q: "What happens to our data over time?",
        a: "You choose how long completed envelopes are kept, and you can export everything. Deleting removes files and personal data but keeps the fingerprints and audit trail, so certificates still verify.",
      },
    ],
  },

  footer: {
    year: 2026,
    links: [
      { label: "Security", href: "/security" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Verify", href: `${appUrl}/verify` },
      { label: "Log in", href: `${appUrl}/sign-in` },
    ],
  },
} as const

/**
 * The sample envelope shown inside every mockup. Fictional people and
 * companies; one consistent example keeps the story continuous.
 */
export const sample = {
  workspace: "Tana Freight",
  title: "Mutual NDA",
  file: "Mutual NDA.pdf",
  pages: 3,
  parties: ["Tana Freight Ltd", "Kilima Agro Ltd"],
  /** `tone` picks the recipient colour, as Recipient.colorIndex does in the app. */
  recipients: [
    {
      name: "Achieng Otieno",
      email: "achieng@tanafreight.co.ke",
      role: "First party",
      status: "Signed",
      tone: 0,
      verify: "Email code",
      signedAt: "14 Oct 2026, 09:12",
      ip: "196.201.214.10",
    },
    {
      name: "Baraka Mwangi",
      email: "baraka@kilimaagro.co.ke",
      role: "Second party",
      status: "Signed",
      tone: 1,
      verify: "SMS code",
      signedAt: "14 Oct 2026, 11:47",
      ip: "105.163.2.88",
    },
    {
      name: "Amina Hassan",
      email: "amina@kilimaagro.co.ke",
      role: "Gets a copy",
      status: "Viewed",
      tone: 2,
      verify: "None",
      signedAt: "",
      ip: "",
    },
  ],
  sections: [
    "Definitions",
    "Confidential information",
    "Obligations of the receiving party",
    "Term and termination",
    "Governing law",
  ],
  blanks: {
    effectiveDate: "1 November 2026",
    term: "two (2) years",
    purpose: "evaluating a cold-chain logistics partnership",
    law: "the laws of Kenya",
  },
  code: "K7QM-2XDP-9RTA",
  originalSha256: "9f2c4e81a07d3b56c1e8f40a2d9b7c63e5a1f08d4b2c97e6a3d58f1c0b4e72a9",
  signedSha256: "4be17d09c3a8e2f56b1d0c94a7e3f28b5c6d1a09e8f7b3c24d5a6e1f09c8b7d32",
  chainHead: "c03e9a71f5b2d8e4a6c1907f3b5e2d8a4c6f1b9e7d3a5c2f8e0b4d6a1c9e7f35",
  events: [
    { time: "13 Oct 16:02", event: "Envelope sent", actor: "Achieng Otieno" },
    { time: "14 Oct 09:05", event: "Email code verified", actor: "Achieng Otieno" },
    { time: "14 Oct 09:12", event: "Signed", actor: "Achieng Otieno" },
    { time: "14 Oct 11:40", event: "SMS code verified", actor: "Baraka Mwangi" },
    { time: "14 Oct 11:47", event: "Signed", actor: "Baraka Mwangi" },
    { time: "14 Oct 11:48", event: "Completed", actor: "Sahihi" },
  ],
} as const

export type SampleRecipient = (typeof sample.recipients)[number]
