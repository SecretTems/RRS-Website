/*
  RRS — Shared Utilities (Fixed JSON parse error)
*/
const API_BASE = '/api';

/* HTTP Helper - FIXED: Check status BEFORE json() to handle HTML error pages */
async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('rrs_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { 
    ...options, 
    headers, 
    credentials: 'include' 
  });

  let data;
  let errorMsg = 'An unknown error occurred';

  if (!res.ok) {
    try {
      data = await res.json();
      errorMsg = data.errors ? 
        data.errors.map(e => e.msg).join(', ') : 
        data.message || 'Server responded with error';
    } catch (parseErr) {
      // Non-JSON response (HTML error page), use text preview
      const text = await res.text();
      errorMsg = text.includes('server error') ? 
        'Server error (check console)' : 
        text.slice(0, 100) + '...';
    }
    throw new Error(errorMsg);
  }

  // Success path
  data = await res.json();
  return data;
}

/* Auth */
function getUser() {
  try { return JSON.parse(localStorage.getItem('rrs_user')); } catch { return null; }
}

function setUser(user, token) {
  localStorage.setItem('rrs_user', JSON.stringify(user));
  if (token) localStorage.setItem('rrs_token', token);
}

function clearUser() {
  localStorage.removeItem('rrs_user');
  localStorage.removeItem('rrs_token');
}

function getIsAdmin() {
  const user = getUser();
  return user?.role === 'admin';
}

function requireAuth() {
  const user = getUser();
  if (!user) {
    showLoginPrompt();
    return null;
  }
  return user;
}

function showLoginPrompt() {
  const overlay = document.getElementById('login-prompt-overlay');
  if (overlay) overlay.classList.add('modal-overlay--visible');
}

/* Toast */
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 3500);
}

function createToastContainer() {
  const div = document.createElement('div');
  div.id = 'toast-container';
  div.className = 'toast-container';
  document.body.appendChild(div);
  return div;
}

/* Navbar */
function initNavbar(activePage) {
  const user = getUser();
  const avatar = document.getElementById('navbar-avatar');
  const hamburger = document.getElementById('navbar-hamburger');
  const nav = document.getElementById('navbar-nav');

  // Set active link
  document.querySelectorAll('.navbar__link').forEach(link => {
    link.classList.remove('navbar__link--active');
    if (link.dataset.page === activePage) link.classList.add('navbar__link--active');
  });

  // Set avatar photo
  if (avatar && user && user.profilePhoto) {
    avatar.innerHTML = `<img src="${user.profilePhoto}" alt="avatar">`;
  }

  // Hamburger toggle
  if (hamburger && nav) {
    hamburger.addEventListener('click', () => nav.classList.toggle('navbar__nav--open'));
  }

  // If user is not logged in, show prompt on protected routes
  if (!user && activePage !== 'login' && activePage !== 'signup') {
    showLoginPrompt();
  }
}

/* Format Date -->
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getMonth()+1).padStart(2,'0')} / ${String(d.getDate()).padStart(2,'0')} / ${String(d.getFullYear()).slice(-2)}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* Loading state on button */
function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn._originalText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Loading...';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn._originalText || btn.innerHTML;
    btn._originalText = null;
  }
}

