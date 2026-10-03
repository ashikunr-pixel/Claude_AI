/**
 * Claude AI Platform - Authentication & Global Layout Manager
 */

document.addEventListener('DOMContentLoaded', async () => {
  const isLoginPage = window.location.pathname.endsWith('login.html');
  const token = api.getToken();

  if (!token && !isLoginPage) {
    window.location.href = 'login.html';
    return;
  }

  // If on login page, attach login/register handlers
  if (isLoginPage) {
    initAuthPage();
  } else {
    // Authenticated layout: populate user profile and sidebar budget meter
    initAuthenticatedLayout();
  }
});

function initAuthPage() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const authTabs = document.querySelectorAll('.auth-tab');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const loginPane = document.getElementById('login-pane');
  const registerPane = document.getElementById('register-pane');

  // Tab switching
  if (tabLogin && tabRegister) {
    tabLogin.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      loginPane.style.display = 'block';
      registerPane.style.display = 'none';
    });

    tabRegister.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      registerPane.style.display = 'block';
      loginPane.style.display = 'none';
    });
  }

  // Quick Demo Buttons
  const btnFillAdmin = document.getElementById('btn-fill-admin');
  const btnFillUser = document.getElementById('btn-fill-user');

  if (btnFillAdmin) {
    btnFillAdmin.addEventListener('click', () => {
      document.getElementById('login-email').value = 'admin@claude.ai';
      document.getElementById('login-password').value = 'AdminPassword123!';
      showToast('Admin credentials filled. Click Sign In.', 'info');
    });
  }

  if (btnFillUser) {
    btnFillUser.addEventListener('click', () => {
      document.getElementById('login-email').value = 'user@claude.ai';
      document.getElementById('login-password').value = 'UserPassword123!';
      showToast('Demo User credentials filled. Click Sign In.', 'info');
    });
  }

  // Handle Login
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Authenticating...';

        const res = await api.login(email, password);
        localStorage.setItem('claude_ai_token', res.token);
        localStorage.setItem('claude_ai_user', JSON.stringify(res.user));

        showToast('Login successful! Welcome back.', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 600);
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign In to Platform';
      }
    });
  }

  // Handle Register
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const password = document.getElementById('reg-password').value;
      const role = document.getElementById('reg-role') ? document.getElementById('reg-role').value : 'USER';
      const submitBtn = registerForm.querySelector('button[type="submit"]');

      try {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating Account...';

        const res = await api.register(name, email, password, role);
        localStorage.setItem('claude_ai_token', res.token);
        localStorage.setItem('claude_ai_user', JSON.stringify(res.user));

        showToast('Account registered successfully!', 'success');
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 600);
      } catch (err) {
        showToast(err.message, 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    });
  }
}

async function initAuthenticatedLayout() {
  const user = api.getUser();
  if (user) {
    // Populate user profile in sidebar
    const nameEl = document.getElementById('sidebar-user-name');
    const roleEl = document.getElementById('sidebar-user-role');
    const avatarEl = document.getElementById('sidebar-user-avatar');

    if (nameEl) nameEl.textContent = user.name;
    if (roleEl) roleEl.textContent = user.role;
    if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();

    // Show/hide admin-only elements
    if (user.role !== 'ADMIN') {
      document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
    }
  }

  // Setup Logout button
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('claude_ai_token');
      localStorage.removeItem('claude_ai_user');
      window.location.href = 'login.html';
    });
  }

  // Refresh Sidebar Budget Mini Widget
  refreshSidebarBudget();
}

async function refreshSidebarBudget() {
  try {
    const res = await api.getBudget();
    const b = res.data;

    const progressEl = document.getElementById('sidebar-budget-progress');
    const spentEl = document.getElementById('sidebar-budget-spent');
    const remainingEl = document.getElementById('sidebar-budget-remaining');

    if (progressEl) {
      progressEl.style.width = `${Math.min(100, b.usagePercentage)}%`;
      if (b.usagePercentage >= 90) progressEl.style.background = 'var(--accent-rose)';
      else if (b.usagePercentage >= 75) progressEl.style.background = 'var(--accent-amber)';
      else progressEl.style.background = 'var(--accent-gradient)';
    }

    if (spentEl) spentEl.textContent = `$${b.cumulativeSpent.toFixed(2)}`;
    if (remainingEl) remainingEl.textContent = `$${b.remainingBudget.toFixed(2)} left`;
  } catch (err) {
    console.warn('Could not update sidebar budget widget:', err);
  }
}

// Reactively refresh sidebar budget when active key changes
window.addEventListener('activeKeyChanged', () => {
  refreshSidebarBudget();
});
