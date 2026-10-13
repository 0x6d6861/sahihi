/**
 * All page copy lives here. Swap these values for your product —
 * components read from this file and contain no marketing text of their own.
 */

export const site = {
  name: "Atelier",
  title: "Atelier — sketch & ship in one place",
  description:
    "Atelier is a workspace for your product: a canvas, a browser and an agent that share one source of truth.",

  nav: [
    { label: "Log in", href: "#" },
    { label: "Download", href: "#pricing" },
  ],

  cta: {
    primary: { label: "Download for macOS", href: "#pricing" },
    secondary: { label: "Open in web", href: "#" },
  },

  hero: {
    headline: ["Sketch & ship", "in one place."],
    subtitle: ["Atelier is a canvas for your codebase,", "and an agent that can see it."],
    worksWith: "Works with the tools you already use.",
  },

  /** The three things the scroll story merges into one window. */
  pillars: ["Canvas", "Browser", "Agent"] as const,

  pillarIntro:
    "Three tools you use to make software, now in one place. Built for people who design & ship with care.",

  chapters: [
    {
      id: "canvas",
      eyebrow: "Design canvas",
      headline: ["An infinite canvas", "made of real code."],
      body: "Everything you expect from a design tool — drag & drop, layers, an inspector. The difference is that every frame is real HTML, so what you draw is what ships.",
      demos: [
        {
          kind: "explorations",
          wide: true,
          lead: "Explore freely.",
          text: "Keep every idea, variant and state side by side. Duplicate and iterate until it feels right.",
        },
        {
          kind: "comments",
          wide: true,
          lead: "Review together.",
          text: "Share a link, comment in a thread, then hand the feedback straight to your agent.",
        },
      ],
      features: [
        {
          icon: "compass",
          lead: "Precise control.",
          text: "Insert, drag, duplicate or edit inline with layers and properties.",
        },
        {
          icon: "ruler",
          lead: "1:1 with code.",
          text: "Every layer maps to a real element with responsive flex behaviour.",
        },
        {
          icon: "knob",
          lead: "Components.",
          text: "Props, slots and variants, synced with the design system in your repo.",
        },
        {
          icon: "puck",
          lead: "Multiplayer.",
          text: "Work on the same canvas with your team or your agent.",
        },
        {
          icon: "loupe",
          lead: "Design tokens.",
          text: "Manage colour, type and spacing across light & dark themes.",
        },
        {
          icon: "slider",
          lead: "Prompt inline.",
          text: "Ask for a variation or automate a chore without leaving the canvas.",
        },
      ],
    },
    {
      id: "browser",
      eyebrow: "Built-in browser",
      headline: ["Preview & edit", "your running app."],
      body: "Open localhost or any site in a tab. Make visual edits live, or pull an existing screen onto the canvas to keep designing. It's a browser, for building.",
      demos: [
        {
          kind: "capture",
          lead: "Capture to canvas.",
          text: "Select any element in the browser and paste it onto the canvas as an editable design.",
          wide: true,
        },
        {
          kind: "inspect",
          lead: "Inspect & tweak.",
          text: "Adjust tokens, components and class names with real design controls.",
        },
        {
          kind: "pin",
          lead: "Prompt with precision.",
          text: "Pin a comment to an element and the agent edits exactly that.",
        },
      ],
    },
    {
      id: "agent",
      eyebrow: "Coding agent",
      headline: ["One agent for", "design & code."],
      body: "Bring your own coding agent. Atelier gives it a canvas to design on, a browser to check its work, and your repo to commit to.",
      demos: [
        {
          kind: "agent-build",
          lead: "Builds in your repo.",
          text: "Implements straight into your codebase, referencing your exact designs.",
        },
        {
          kind: "agent-design",
          lead: "Designs on your canvas.",
          text: "Kick off explorations or document existing UI, with full code context.",
        },
      ],
    },
  ],

  context: {
    headline: "The agent sees what you see.",
    cards: [
      { lead: "Your selection.", text: "Point at an element or paste a design into chat." },
      { lead: "Your designs.", text: "Every frame on the canvas can be referenced by name." },
      { lead: "Your browser.", text: "The agent screenshots tabs and reads the code behind them." },
      { lead: "Your codebase.", text: "Components, tokens and code stay the source of truth." },
    ],
  },

  process: {
    headline: ["Designing & building", "is a roundtrip."],
    steps: [
      {
        title: "Connect.",
        lines: ["Open your codebase.", "Preview the running app.", "Plan with the agent."],
      },
      {
        title: "Explore.",
        lines: ["Design from scratch.", "Capture from browser.", "Generate new flows."],
      },
      { title: "Build.", lines: ["Paste any design.", "Inspect and tweak.", "Implement in code."] },
      { title: "Ship.", lines: ["Manage branches.", "Share prototypes.", "Open pull requests."] },
    ],
  },

  testimonials: {
    headline: "Made for people who make things.",
    quotes: [
      { text: "I don't bounce between six apps to make the thing in my head real any more." },
      { text: "I finally own the source of truth. That's huge." },
      { text: "The design tool I wanted ten years ago." },
      { text: "It actually closes the gap between design and engineering." },
      { text: "It solves problems I hadn't noticed yet… in a good way." },
    ],
  },

  pricing: {
    headline: "Pricing.",
    plans: [
      {
        name: "Free",
        price: "$0",
        unit: "/ month",
        features: [
          "One project",
          "Unlimited viewers & editors",
          "Bring your own agent",
          "Limited AI credits",
        ],
        cta: "Download for macOS",
        featured: false,
      },
      {
        name: "Pro",
        price: "$20",
        unit: "/ editor / month",
        features: [
          "Unlimited projects",
          "Unlimited viewers & editors",
          "Bring your own agent",
          "6× AI credits",
        ],
        cta: "Upgrade to Pro",
        featured: true,
      },
    ],
    footnote:
      "AI credits are only used in the web version, or when you choose them over your own agent subscription.",
  },

  faq: {
    headline: "FAQ.",
    items: [
      {
        q: "What is Atelier?",
        a: "A desktop and web app that puts a design canvas, a browser and a coding agent in one window, all working against your real codebase.",
      },
      {
        q: "Does it replace my design tool?",
        a: "For product UI, often yes. The canvas is built from real components, so there is nothing to hand off. Many teams still keep a whiteboard tool for early sketching.",
      },
      {
        q: "Which coding agents are supported?",
        a: "Any agent you connect with your own subscription, plus anything that speaks MCP.",
      },
      {
        q: "Does my code leave my machine?",
        a: "In the desktop app your repository stays local. Only the context you send to your agent leaves your machine.",
      },
      {
        q: "Can I use my existing design system?",
        a: "Yes. Atelier reads your components and tokens straight from the repo and keeps them in sync.",
      },
      {
        q: "Does it work with my stack?",
        a: "Anything that renders HTML in a browser. React and Tailwind get the deepest integration.",
      },
    ],
  },

  footer: {
    year: 2026,
    links: [
      { label: "Docs", href: "#" },
      { label: "Changelog", href: "#" },
      { label: "Privacy", href: "#" },
      { label: "Terms", href: "#" },
    ],
  },
} as const

/**
 * The fictional app shown inside every mockup. One consistent sample
 * keeps the story continuous across sections.
 */
export const sampleApp = {
  name: "Larder",
  heading: "Cooked.",
  meta: "38 recipes · 12 cooks",
  categories: [
    { name: "Mains", color: "#d9482b" },
    { name: "Baking", color: "#2f5bd3" },
    { name: "Sides", color: "#7b7b74" },
  ],
  items: [
    {
      title: "Saffron risotto. Bright yellow, parmesan snow.",
      category: "Mains",
      date: "26 Aug",
      photo: ["#f3c13a", "#e19b1c", "#fbe7a4"],
    },
    {
      title: "Blood orange tart. Glossy, set overnight.",
      category: "Baking",
      date: "3 Sep",
      photo: ["#c8352a", "#f07a3c", "#2b2b2f"],
    },
    {
      title: "Charred greens. Lemon, chilli, a lot of oil.",
      category: "Sides",
      date: "27 Aug",
      photo: ["#2f6b3d", "#9ec46b", "#1d2a20"],
    },
    {
      title: "Blue plate miso aubergine. Sticky and dark.",
      category: "Mains",
      date: "3 Sep",
      photo: ["#2f5bd3", "#4b2a5f", "#d6c39b"],
    },
    {
      title: "Rye loaf. Dense crumb, crackly crust.",
      category: "Baking",
      date: "26 Aug",
      photo: ["#7a4b2a", "#c49a6c", "#3a2414"],
    },
    {
      title: "Pickled shallots. Pink, sharp, sweet.",
      category: "Sides",
      date: "27 Aug",
      photo: ["#d36a9a", "#f2c1d4", "#8a2d55"],
    },
  ],
} as const

export type SampleItem = (typeof sampleApp.items)[number]
