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
    /** Rows of the bulk-send card's CSV (fictional people). */
    csv: [
      "Employee name,Employee email",
      "Achieng Otieno,achieng@example.co.ke",
      "Baraka Mwangi,baraka@example.co.ke",
      "Amina Hassan,amina@example.co.ke",
      "Wanjiru Kamau,wanjiru@example.co.ke",
      "Juma Ochieng,juma@example.co.ke",
      "Njeri Wambui,njeri@example.co.ke",
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
 * What the coded demos show: the same fictional workspace as the screenshots
 * (apps/e2e/showcase/seed.ts), so pictures and demos tell one story.
 */
export const sample = {
  workspace: "Tana Freight Ltd",
  user: { name: "Achieng Otieno", initials: "AO" },
  inbox: 2,
  /** All files, newest first. `state` picks the status icon after an envelope's name. */
  files: [
    {
      name: "Board resolution — Athi River depot lease",
      kind: "envelope",
      sub: "Envelope · Achieng Otieno and David Kariuki",
      state: "draft",
    },
    {
      name: "Written Resolution of the Board of Directors.pdf",
      kind: "pdf",
      sub: "Document",
      state: "",
    },
    {
      name: "IT acceptable use policy — Njeri Wambui",
      kind: "envelope",
      sub: "Envelope · Wanjiru Kamau and Njeri Wambui · 1 of 2 signed",
      state: "progress",
    },
    { name: "IT Acceptable Use Policy.pdf", kind: "pdf", sub: "Document", state: "" },
    {
      name: "Offer letter — Juma Ochieng, Operations Coordinator",
      kind: "envelope",
      sub: "Envelope · Achieng Otieno and Juma Ochieng · 1 of 2 signed",
      state: "progress",
    },
    { name: "Offer of Employment.pdf", kind: "pdf", sub: "Document", state: "" },
    {
      name: "Mutual NDA — Kilima Agro",
      kind: "envelope",
      sub: "Envelope · Achieng Otieno + 2 more · 2 of 2 signed",
      state: "done",
    },
    { name: "Mutual Non-Disclosure Agreement.pdf", kind: "pdf", sub: "Document", state: "" },
  ],
  added: "13 Oct 2026",
  /** The drafting conversation: what the person asked, what the assistant did, then its question. */
  chat: {
    ask: "We're Tana Freight Ltd (Godown 14, Enterprise Road, Industrial Area, Nairobi). Draft this NDA with Savanna Fresh Exports Ltd of Moi South Lake Road, Naivasha. We're sharing route plans and pricing before a cold-chain pilot for their cut flowers.",
    updated:
      "Updated First party's name, First party's address, Second party's name, Second party's address, Purpose of the disclosure",
    reply: "Filled in both parties, their addresses, and the route-planning and pricing purpose.",
  },
  /** The drafted NDA as Preview shows it. `b` marks a filled blank; `open` one still empty. */
  draft: {
    title: "Mutual Non-Disclosure Agreement",
    version: "Draft · version 2",
    blanksOpen: "4 blanks open",
    effective: "Effective date",
    parties: [
      { name: "Tana Freight Ltd", address: "Godown 14, Enterprise Road, Industrial Area, Nairobi" },
      { name: "Savanna Fresh Exports Ltd", address: "Moi South Lake Road, Naivasha" },
    ],
    purpose: "sharing route plans and pricing before a cold-chain pilot for their cut flowers",
  },
  /** The board resolution in the envelope editor (page 1). */
  board: {
    title: "Board resolution — Athi River depot lease",
    heading: "Written Resolution of the Board of Directors",
    sections: [
      [
        "1. Company",
        'Written resolution of the directors of Tana Freight Ltd (registration number PVT-7LUQ2KZ8) (the "Company"), dated 9 October 2026.',
      ],
      [
        "2. Background",
        "The directors have considered a lease of a second depot in Athi River. Each director has declared any interest in the matter as the Company's articles and the law require.",
      ],
      [
        "3. Resolutions",
        "The directors resolve: (a) to the Company enter into a five-year lease of Warehouse 3, Export Processing Zone, Athi River, at a monthly rent not exceeding KES 1,200,000; and (b) that the Managing Director is authorised to sign all documents and do everything necessary to give effect to this resolution.",
      ],
      [
        "4. Effect",
        "This resolution is passed as a written resolution under the Company's articles of association. It is as valid as if it had been passed at a meeting of the directors properly called and held.",
      ],
    ],
  },
  certificate: "5XV2-MEVQ-Q84C",
  nda: "Mutual NDA — Kilima Agro",
  ndaFile: "Mutual Non-Disclosure Agreement.pdf",
  completed: "13 Oct 2026 at 11:48",
  question: {
    index: "Question 3 of 3",
    text: "How long should the NDA run from its effective date?",
    fills: "Term of the agreement",
    options: ["1 year", "2 years", "3 years"],
  },
  proposal: {
    section: "7. Term",
    why: "Allow either Party to end the Agreement on 30 days' written notice, keeping the term and survival period.",
    title: ["Term", " and Termination"],
    before: "This Agreement starts on the Effective Date and continues for 2",
    removed: " years.",
    kept: " years",
    inserted:
      ", unless either Party ends it earlier by giving the other Party 30 days' written notice.",
    after: " The obligations in this Agreement survive its end for 3 years.",
  },
  signer: {
    party: "Tana Freight Ltd",
    role: "First party",
    name: "Achieng Otieno",
    email: "achieng@tanafreight.co.ke",
    fields: ["Signature", "Full name", "Date signed"],
  },
  offer: {
    title: "Offer letter — Juma Ochieng",
    from: "Achieng Otieno (Tana Freight Ltd)",
    file: "Offer of Employment.pdf",
    signer: "Juma Ochieng",
    accept: "I accept this offer of employment on the terms set out in this letter.",
  },
  otp: { to: "n••••@tanafreight.co.ke", typed: ["4", "8", "1"] },
  routing: [
    { name: "Achieng Otieno", email: "achieng@tanafreight.co.ke", step: 1, tone: 0 },
    { name: "David Kariuki", email: "david@tanafreight.co.ke", step: 2, tone: 1 },
  ],
  signers: [
    { name: "Achieng Otieno", masked: "a••••••@tanafreight.co.ke" },
    { name: "Baraka Mwangi", masked: "b•••••@kilimaagro.co.ke" },
  ],
  originalSha256: "7794e358cab9467dc0ca24c6fc8185d24e61d66c7a4f960b8b9ab2cac1f52d93",
  signedSha256: "09cdc18f66043d71fb059485c0308be93f20cd6ef6ebe1881028b17c11079285",
  /** Newest first, as the Activity tab lists them. `kind` picks the icon. */
  activity: [
    { text: "Certificate of completion issued", time: "11:48", kind: "seal" },
    { text: "Signed PDF produced", time: "11:48", kind: "file" },
    { text: "Everyone has signed", time: "11:47", kind: "seal" },
    { text: "Baraka Mwangi signed", time: "11:47", kind: "sign" },
    { text: "Baraka Mwangi agreed to sign electronically", time: "11:46", kind: "consent" },
    { text: "Baraka Mwangi viewed the documents", time: "11:40", kind: "view" },
    { text: "Achieng Otieno signed", time: "09:12", kind: "sign" },
  ],
} as const
