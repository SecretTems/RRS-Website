/* Shared Navbar HTML injector */
function injectNavbar(activePage) {
  const navbarHTML = `
  <nav class="navbar">
    <a href="/pages/announcements.html" class="navbar__brand">
      <img
        src="/assets/logo.png"
        alt="RRS"
        class="navbar__brand-logo-img"
        onerror="this.style.display='none'"
      />
      RRS
    </a>

    <button class="navbar__hamburger" id="navbar-hamburger" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>

    <div class="navbar__nav" id="navbar-nav">
      <a href="/pages/announcements.html" class="navbar__link" data-page="announcements">Announcements</a>
      <a href="/pages/schedule.html" class="navbar__link" data-page="schedule">Schedule</a>
    <a href="/pages/rooms.html" class="navbar__link" data-page="rooms">Rooms</a>
${getIsAdmin() ? '      <a href="/pages/admin.html" class="navbar__link" data-page="admin">Admin</a>' : ''}
    </div>

    <a href="/pages/account.html" class="navbar__avatar" id="navbar-avatar" title="Account">
      <svg class="navbar__avatar-icon" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </a>
  </nav>`;

  document.body.insertAdjacentHTML('afterbegin', navbarHTML);
  initNavbar(activePage);
}
