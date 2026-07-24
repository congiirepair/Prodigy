window.RC_DRIFT_CLIENT_CONFIG = {
  platform: {
    productName: "Prodigy Event Control",
    buildLabel: "Prodigy Native Stream Studio Build 2026.04.23.3",
    browserTitle: "Prodigy Event Control",
    // Browser application state always targets the configured production
    // collection; test fixtures live exclusively in automated tests.
  },
  branding: {
    venueName: "Prodigy RC Drift Arena",
    venueLabelPlaceholder: "Prodigy RC Drift Arena",
    eventNamePlaceholder: "Prodigy RC Drift Arena",
    logoPrimary: "./assets/prodigy-rc-logo-transparent.png?v=cc152aa894d9",
    logoInverted: "./assets/prodigy-rc-logo-white-transparent.png?v=cc152aa894d9",
    logoTreatment: {
      invertLight: false,
      invertDark: false
    },
    logoAlt: "Prodigy RC logo",
    backgroundImage: "./assets/track-background.png?v=cc152aa894d9",
    homeHeroImage: "./assets/track-background.png?v=cc152aa894d9",
    shopUrl: "https://www.prodigydrift.com/",
    shopLabel: "Shop Prodigy RC Here",
    pdfHeaderTitle: "PRODIGY RC",
    demoVenueLabel: "Prodigy Demo Arena",
    demoShowcaseName: "Prodigy Showcase"
  },
  typography: {
    displayFont: "'Ethnocentric', 'Orbitron', 'Inter', sans-serif",
    bodyFont: "'Inter', sans-serif",
    fontImports: [],
    customFonts: {}
  },
  theme: {
    light: {
      accent: "#000000",
      accentDark: "#1f1f1f",
      buttonAccent: "#000000",
      buttonAccentDark: "#2a2a2a",
      accentCyan: "#5d7381",
      accentGreen: "#717171",
      accentGreenDark: "#4e4e4e",
      panelHighlight: "#ffffff",
      accentWarm: "#d9d9d9",
      wordmarkColor: "#111111"
    },
    dark: {
      accent: "#ffffff",
      accentDark: "#bfbfbf",
      buttonAccent: "#f3f3f3",
      buttonAccentDark: "#bcbcbc",
      accentCyan: "#93a7b5",
      accentGreen: "#b0b0b0",
      accentGreenDark: "#858585",
      panelHighlight: "#ffffff",
      accentWarm: "#f5f5f5",
      wordmarkColor: "#ffffff"
    }
  },
  layout: {
    centerAllText: false
  },
  streaming: {
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302"
        ]
      }
    ]
  },
  voiceAi: {
    enabled: true,
    endpoint: "/api/parse-voice-deductions"
  },
  resultsEmail: {
    enabled: true,
    endpoint: "/api/email-event-results"
  },
  landing: {
    whySectionKicker: "Why Prodigy",
    heroCopy: "Follow {eventName} live with qualifying, competition brackets, and results from one Prodigy event hub.",
    emptyHeroCopy: "Follow the next event, jump into qualifying and competition, and see why Prodigy is built for real live RC drift events.",
    whySectionCopy: "Prodigy keeps check-in, live scoring, bracket control, and results connected in one smoother event-day flow.",
    benefits: [
      [
        "3-Judge Cloud Sync",
        "Judge phones and tablets stay on the same live scoring state without separate tools."
      ],
      [
        "QR Check-In",
        "Drivers can scan a Prodigy QR code and jump straight into the public registration flow."
      ],
      [
        "Venue Check-In Control",
        "Pre-register from home, then validate arrival at the venue before event admin approves the roster."
      ],
      [
        "Live Qualifying Boards",
        "Show the current driver, run averages, and standings in a clean public display."
      ],
      [
        "Broadcast Bracket Views",
        "Competition screens are ready for TVs, projectors, and venue monitors."
      ],
      [
        "Archive And PDF Exports",
        "Completed events save into the results archive and can be exported as shareable PDF summaries."
      ]
    ]
  },
  routing: {
    spectatorHost: "prodigyrccomp.com",
    spectatorAliases: [
      "www.prodigyrccomp.com",
      "prodigyrcccomp.com",
      "www.prodigyrcccomp.com",
      "prodigy-rc-competitions.web.app",
      "prodigy-rc-competitions.firebaseapp.com"
    ],
    streamerHost: "streamer.prodigyrccomp.com",
    streamerAliases: [
      "streamer.prodigyrcccomp.com"
    ],
    websiteAdminHost: "websiteadmin.prodigyrccomp.com",
    adminHost: "eventadmin.prodigyrccomp.com",
    judgeHosts: {
      j1: "judge1.prodigyrccomp.com",
      j2: "judge2.prodigyrccomp.com",
      j3: "judge3.prodigyrccomp.com"
    }
  },
  firebase: {
    appId: "1:292850527697:web:6b9cb5249f2716e42e44f0",
    config: {
      projectId: "prodigy-rc-competitions",
      appId: "1:292850527697:web:6b9cb5249f2716e42e44f0",
      storageBucket: "prodigy-rc-competitions.firebasestorage.app",
      apiKey: "AIzaSyD-Do4oY_hpAB7zYHp9OzzzfPUU63UH1Ow",
      authDomain: "prodigy-rc-competitions.firebaseapp.com",
      messagingSenderId: "292850527697"
    },
    spectatorAliases: [
      "www.prodigyrccomp.com",
      "prodigyrcccomp.com",
      "www.prodigyrcccomp.com",
      "prodigy-rc-competitions.web.app",
      "prodigy-rc-competitions.firebaseapp.com"
    ]
  }
};
