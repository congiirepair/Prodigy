export function renderPrivacyView(options = {}) {
  return `
    <header class="hero hero-simple spectator-only">
      <div class="hero-copy-block">
        <div class="hero-logo-shell"><img class="hero-logo" src="./assets/prodigy-rc-logo-transparent.png" alt="Prodigy RC logo" /></div>
        <p class="eyebrow">Privacy</p>
        <h1>Privacy Notice</h1>
        <p class="hero-copy">Prodigy Event Control stores only the event and driver details needed to run RC drift competitions, check drivers in, publish results, and support live event operations.</p>
      </div>
    </header>
    <main class="privacy-layout spectator-only">
      <section class="privacy-copy-card">
        <h2>Driver And Event Information</h2>
        <p>Events may store driver names, driver numbers, teams, chassis details, preregistration status, payment or approval status, judging scores, bracket placement, and final results so staff can run and archive the competition.</p>
      </section>
      <section class="privacy-copy-card">
        <h2>Location For Venue Check-In</h2>
        <p>If venue check-in is enabled, your browser may ask for location permission to confirm you are inside the event check-in area. Location is used for arrival verification and may save a check-in distance or timestamp with the event record.</p>
      </section>
      <section class="privacy-copy-card">
        <h2>Saved Profiles And Access</h2>
        <p>Saved driver profiles can live on your device to make future preregistration faster. Event staff and website admins can access event data needed for registration, approvals, scoring, streaming, results, and archive management.</p>
      </section>
      <section class="privacy-copy-card">
        <h2>Removal And Archives</h2>
        <p>Event staff can reject, remove, archive, or delete event records through the admin tools when those tools are available for the event. Contact the event organizer if a driver record needs to be corrected or removed.</p>
      </section>
      <footer class="public-footer">
        <a href="/" data-public-route="home">Back to Prodigy RC Comp</a>
      </footer>
    </main>
  `;
}
