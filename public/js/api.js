const SCORE_NEGATIVE_COLOR = '#3355ff';
const SCORE_POSITIVE_COLOR = '#ff6b6b';
const SCORE_NEUTRAL_COLOR = '#888888';
const SCORE_GRADIENT_BASE_COLOR = '#252547';

// API Client for Aion
const API = {
  token: localStorage.getItem('aion_token'),

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('aion_token', token);
    } else {
      localStorage.removeItem('aion_token');
    }
  },

  isLoggedIn() {
    return !!this.token;
  },

  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const opts = { method, headers };
    if (method === 'GET' || method === 'HEAD') {
      opts.cache = 'no-store';
    }
    if (body) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);

    // Extract JWT token from Authorization header on sign_in
    const authHeader = res.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      this.setToken(authHeader.replace('Bearer ', ''));
    }

    if (res.status === 204) return null;
    const data = await res.json();
    if (!res.ok) {
      throw { status: res.status, data };
    }
    return data;
  },

  // Auth
  register(email, password, passwordConfirmation) {
    return this.request('POST', '/users', {
      email, password, password_confirmation: passwordConfirmation
    });
  },

  login(email, password) {
    return this.request('POST', '/users/sign_in', {
      user: { email, password }
    });
  },

  logout() {
    return this.request('DELETE', '/users/sign_out').finally(() => {
      this.setToken(null);
    });
  },

  me() {
    return this.request('GET', '/v1/user/me');
  },

  // Password Reset
  requestPasswordReset(email) {
    return this.request('POST', '/users/password', { email });
  },

  resetPassword(token, password, passwordConfirmation) {
    return this.request('PUT', '/users/password', {
      reset_password_token: token,
      password,
      password_confirmation: passwordConfirmation
    });
  },

  // Shops
  getShops() {
    return this.request('GET', '/v1/shops');
  },

  createShop(data) {
    return this.request('POST', '/v1/shops', data);
  },

  updateShop(id, data) {
    return this.request('PUT', `/v1/shops/${id}`, data);
  },

  deleteShop(id) {
    return this.request('DELETE', `/v1/shops/${id}`);
  },

  getShopMonthlyShifts(shopId, year, month) {
    return this.request('GET', `/v1/shops/${shopId}/monthly_shifts?year=${year}&month=${month}`);
  },

  // Staffs
  getStaffs(shopId = null) {
    const query = shopId ? `?shop_id=${shopId}` : '';
    return this.request('GET', `/v1/staffs${query}`);
  },

  createStaff(data) {
    return this.request('POST', '/v1/staffs', data);
  },

  updateStaff(id, data) {
    return this.request('PUT', `/v1/staffs/${id}`, data);
  },

  deleteStaff(id) {
    return this.request('DELETE', `/v1/staffs/${id}`);
  },

  getStaffUpcomingShifts(staffId, page = 1, size = 10) {
    return this.request('GET', `/v1/staffs/${staffId}/upcoming_shifts?p=${page}&s=${size}`);
  },

  getStaffMonthlyShifts(staffId, year, month) {
    return this.request('GET', `/v1/staffs/${staffId}/monthly_shifts?year=${year}&month=${month}`);
  },

  // Staff Shifts
  getStaffShifts(shopId) {
    return this.request('GET', `/v1/shops/${shopId}/staff_shifts`);
  },

  createStaffShift(shopId, data) {
    return this.request('POST', `/v1/shops/${shopId}/staff_shifts`, data);
  },

  bulkCreateStaffShifts(shopId, data) {
    return this.request('POST', `/v1/shops/${shopId}/staff_shifts/bulk_create`, data);
  },

  getShiftImportCandidates(page = 1, size = 20) {
    return this.request('GET', `/v1/shift_import_candidates?p=${page}&s=${size}`);
  },

  importShiftCandidatesFromX() {
    return this.request('POST', '/v1/shift_import_candidates/import_from_x');
  },

  approveShiftImportCandidate(id) {
    return this.request('PATCH', `/v1/shift_import_candidates/${id}/approve`);
  },

  deleteShiftImportCandidate(id) {
    return this.request('DELETE', `/v1/shift_import_candidates/${id}`);
  },

  updateStaffShift(shopId, id, data) {
    return this.request('PATCH', `/v1/shops/${shopId}/staff_shifts/${id}`, data);
  },

  deleteStaffShift(shopId, id) {
    return this.request('DELETE', `/v1/shops/${shopId}/staff_shifts/${id}`);
  },

  // Staff Preferences
  getPreferences() {
    return this.request('GET', '/v1/staff_preferences');
  },

  setPreference(staffId, score) {
    return this.request('POST', '/v1/staff_preferences', {
      staff_id: staffId, score
    });
  },

  deletePreference(staffId) {
    return this.request('DELETE', `/v1/staff_preferences/${staffId}`);
  },

  // Schedules
  getTodaySchedule() {
    return this.request('GET', '/v1/schedules/today');
  },

  getNowSchedule() {
    return this.request('GET', '/v1/schedules/now');
  },

  getSchedules(datetimeBegin, datetimeEnd) {
    const params = new URLSearchParams({
      datetime_begin: datetimeBegin,
      datetime_end: datetimeEnd
    });
    return this.request('GET', `/v1/schedules?${params}`);
  },

  // Profile
  updateProfile(data) {
    return this.request('PATCH', '/v1/user/profile', data);
  },

  // Notification Settings
  getNotificationSettings() {
    return this.request('GET', '/v1/user/notification_settings');
  },

  updateNotificationSettings(data) {
    return this.request('PATCH', '/v1/user/notification_settings', data);
  },

  sendTestNotification() {
    return this.request('POST', '/v1/user/notification_settings/test');
  },

  // Push Subscriptions
  savePushSubscription(subscription) {
    return this.request('POST', '/v1/user/push_subscriptions', subscription);
  },

  deleteAllPushSubscriptions() {
    return this.request('DELETE', '/v1/user/push_subscriptions');
  },

  // Events
  getEvents(shopId = null, futureOnly = false, page = 1, size = 10) {
    const params = new URLSearchParams();
    if (shopId) params.set('shop_id', shopId);
    if (futureOnly) params.set('future_only', '1');
    params.set('p', page);
    params.set('s', size);
    const query = params.toString();
    return this.request('GET', `/v1/events${query ? '?' + query : ''}`);
  },

  createEvent(data) {
    return this.request('POST', '/v1/events', data);
  },

  parseEventsFromUrl(url) {
    return this.request('POST', '/v1/events/parse_from_url', { url });
  },

  updateEvent(id, data) {
    return this.request('PUT', `/v1/events/${id}`, data);
  },

  deleteEvent(id) {
    return this.request('DELETE', `/v1/events/${id}`);
  },

  // Action Logs
  getActionLogs(filters = {}) {
    const params = new URLSearchParams();
    if (filters.shop_id) params.set('shop_id', filters.shop_id);
    if (filters.staff_id) params.set('staff_id', filters.staff_id);
    if (filters.target_type) params.set('target_type', filters.target_type);
    const query = params.toString();
    return this.request('GET', `/v1/action_logs${query ? '?' + query : ''}`);
  },

  // Users
  getUsers(page = 1, size = 10) {
    const params = new URLSearchParams({ p: page, s: size });
    return this.request('GET', `/v1/users?${params}`);
  },

  updateUser(id, data) {
    return this.request('PATCH', `/v1/users/${id}`, data);
  },

  deleteUser(id) {
    return this.request('DELETE', `/v1/users/${id}`);
  }
};

// Color utility
function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(ch => ch + ch).join('')
    : normalized;
  const num = Number.parseInt(value, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function scoreToColor(score) {
  const clamped = Math.max(-10, Math.min(10, score));
  const ratio = (clamped + 10) / 20;
  const negative = hexToRgb(SCORE_NEGATIVE_COLOR);
  const positive = hexToRgb(SCORE_POSITIVE_COLOR);

  return {
    r: Math.round(negative.r + (positive.r - negative.r) * ratio),
    g: Math.round(negative.g + (positive.g - negative.g) * ratio),
    b: Math.round(negative.b + (positive.b - negative.b) * ratio)
  };
}

function scoreToGradient(score) {
  const { r, g, b } = scoreToColor(score);
  return `linear-gradient(135deg, ${SCORE_GRADIENT_BASE_COLOR} 0%, rgba(${r},${g},${b},0.35) 100%)`;
}

function scoreToRgb(score) {
  const { r, g, b } = scoreToColor(score);
  return `rgb(${r},${g},${b})`;
}

document.documentElement.style.setProperty('--score-negative-color', SCORE_NEGATIVE_COLOR);
document.documentElement.style.setProperty('--score-positive-color', SCORE_POSITIVE_COLOR);
document.documentElement.style.setProperty('--score-neutral-color', SCORE_NEUTRAL_COLOR);
