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

  // Staff Shifts
  getStaffShifts(shopId) {
    return this.request('GET', `/v1/shops/${shopId}/staff_shifts`);
  },

  createStaffShift(shopId, data) {
    return this.request('POST', `/v1/shops/${shopId}/staff_shifts`, data);
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

  // Push Subscriptions
  savePushSubscription(subscription) {
    return this.request('POST', '/v1/user/push_subscriptions', subscription);
  },

  deleteAllPushSubscriptions() {
    return this.request('DELETE', '/v1/user/push_subscriptions');
  },

  // Action Logs
  getActionLogs(filters = {}) {
    const params = new URLSearchParams();
    if (filters.shop_id) params.set('shop_id', filters.shop_id);
    if (filters.staff_id) params.set('staff_id', filters.staff_id);
    if (filters.target_type) params.set('target_type', filters.target_type);
    const query = params.toString();
    return this.request('GET', `/v1/action_logs${query ? '?' + query : ''}`);
  }
};

// Color utility
function scoreToColor(score) {
  const clamped = Math.max(-10, Math.min(10, score));
  const r = Math.round((clamped + 10) / 20 * 255);
  const b = Math.round((10 - clamped) / 20 * 255);
  return { r, g: 0, b };
}

function scoreToGradient(score) {
  const { r, g, b } = scoreToColor(score);
  return `linear-gradient(135deg, #252547 0%, rgba(${r},${g},${b},0.35) 100%)`;
}

function scoreToRgb(score) {
  const { r, g, b } = scoreToColor(score);
  return `rgb(${r},${g},${b})`;
}
