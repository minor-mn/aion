const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

const app = createApp({
  setup() {
    // ========== State ==========
    const currentUser = ref(null);
    const currentView = ref('home'); // home, login, register, forgotPassword, resetPassword, shopForm, staffForm, shiftForm, shiftEdit
    const resetPasswordToken = ref(null);
    const menuOpen = ref(false);
    const loading = ref(true);
    const error = ref('');
    const success = ref('');

    // Calendar state
    const calendarYear = ref(new Date().getFullYear());
    const calendarMonth = ref(new Date().getMonth()); // 0-indexed
    const scheduleData = ref([]);
    const selectedDate = ref(null);
    const modalOpen = ref(false);

    // Today's data (for unauthenticated + bottom section)
    const todayShops = ref([]);
    const todayShifts = ref({});
    const todayEvents = ref([]);

    // Form data
    const shops = ref([]);
    const staffs = ref([]);

    // Staff schedule modal state
    const staffScheduleOpen = ref(false);
    const staffScheduleStaff = ref(null);
    const staffScheduleShifts = ref([]);
    const staffScheduleLoading = ref(false);

    // Shift edit state
    const editingShift = ref(null);

    // Staff edit state
    const editingStaff = ref(null);

    // Shop edit state
    const editingShop = ref(null);

    // ========== Auth ==========
    function decodeJwtPayload(token) {
      try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(decodeURIComponent(atob(base64).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')));
        // Check expiration
        if (payload.exp && payload.exp * 1000 < Date.now()) return null;
        return payload;
      } catch (e) {
        return null;
      }
    }

    function checkAuth() {
      if (!API.isLoggedIn()) {
        loading.value = false;
        return;
      }
      const payload = decodeJwtPayload(API.token);
      if (payload) {
        currentUser.value = {
          id: payload.sub,
          nickname: payload.nickname || '',
          email: payload.email || ''
        };
      } else {
        API.setToken(null);
        currentUser.value = null;
      }
      loading.value = false;
    }

    async function handleLogin(email, password) {
      error.value = '';
      try {
        await API.login(email, password);
        // Extract user info from JWT token (set by API.request via Authorization header)
        const payload = decodeJwtPayload(API.token);
        if (payload) {
          currentUser.value = {
            id: payload.sub,
            nickname: payload.nickname || '',
            email: payload.email || ''
          };
        }
        currentView.value = 'home';
        history.replaceState(null, '', window.location.pathname + window.location.search);
        success.value = 'サインインしました';
        await loadHomeData();
      } catch (e) {
        error.value = e.data?.error || 'サインインに失敗しました';
      }
    }

    async function handleRegister(email, password, passwordConfirmation) {
      error.value = '';
      try {
        const data = await API.register(email, password, passwordConfirmation);
        success.value = data.message || '登録が完了しました';
        currentView.value = 'login';
      } catch (e) {
        error.value = e.data?.errors?.join(', ') || e.data?.message || '登録に失敗しました';
      }
    }

    async function handleLogout() {
      try {
        await API.logout();
      } catch (e) {
        // ignore
      }
      currentUser.value = null;
      menuOpen.value = false;
      scheduleData.value = [];
      currentView.value = 'home';
      history.replaceState(null, '', window.location.pathname + window.location.search);
      await loadTodayData();
      await loadScheduleData();
    }

    // ========== Data Loading ==========
    async function loadTodayData() {
      try {
        const data = await API.getTodaySchedule();
        const shops = data.shops || [];
        todayShops.value = shops.map(s => ({ id: s.shop_id, name: s.shop_name }));
        const shifts = {};
        const allEvents = [];
        for (const shop of shops) {
          if (shop.staffs && shop.staffs.length > 0) {
            shifts[shop.shop_id] = shop.staffs;
          }
          if (shop.events && shop.events.length > 0) {
            for (const ev of shop.events) {
              allEvents.push({ ...ev, shop_name: shop.shop_name });
            }
          }
        }
        todayShifts.value = shifts;
        todayEvents.value = allEvents;
      } catch (e) {
        // ignore
      }
    }

    async function loadScheduleData() {
      try {
        const year = calendarYear.value;
        const month = calendarMonth.value;
        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0, 23, 59, 59);
        const data = await API.getSchedules(start.toISOString(), end.toISOString());
        scheduleData.value = data.days || [];
      } catch (e) {
        scheduleData.value = [];
      }
    }

    async function loadShops() {
      try {
        const data = await API.getShops();
        shops.value = data.shops || [];
      } catch (e) {
        // ignore
      }
    }

    async function loadStaffs() {
      try {
        const data = await API.getStaffs();
        staffs.value = data.staffs || [];
      } catch (e) {
        // ignore
      }
    }

    async function loadHomeData() {
      await loadTodayData();
      await loadScheduleData();
    }

    // ========== Calendar Helpers ==========
    function prevMonth() {
      if (calendarMonth.value === 0) {
        calendarMonth.value = 11;
        calendarYear.value--;
      } else {
        calendarMonth.value--;
      }
      loadScheduleData();
    }

    function nextMonth() {
      if (calendarMonth.value === 11) {
        calendarMonth.value = 0;
        calendarYear.value++;
      } else {
        calendarMonth.value++;
      }
      loadScheduleData();
    }

    const calendarTitle = computed(() => {
      return `${calendarYear.value}年${calendarMonth.value + 1}月`;
    });

    const calendarDays = computed(() => {
      const year = calendarYear.value;
      const month = calendarMonth.value;
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const today = new Date();

      const cells = [];
      // Empty cells for days before the 1st
      for (let i = 0; i < firstDay; i++) {
        cells.push({ day: null, empty: true });
      }
      // Day cells
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const scheduleDay = scheduleData.value.find(s => s.date === dateStr);
        const totalScore = scheduleDay ? scheduleDay.total_score : null;
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

        const hasEvents = scheduleDay && scheduleDay.events && scheduleDay.events.length > 0;
        const hasStaffs = scheduleDay && scheduleDay.staffs && scheduleDay.staffs.length > 0;

        const gradient = scheduleDay
                    ? (currentUser.value ? scoreToGradient(totalScore) : 'linear-gradient(135deg, #252547 0%, rgba(204,204,102,0.35) 100%)')
                    : '#252547';

        cells.push({
          day: d,
          dateStr,
          empty: false,
          isToday,
          totalScore,
          hasData: !!scheduleDay,
          hasEvents,
          gradient
        });
      }
      return cells;
    });

    function openDayModal(cell) {
      if (cell.empty) return;
      selectedDate.value = cell.dateStr;
      modalOpen.value = true;
      document.body.classList.add('modal-open');
    }

    const selectedDayData = computed(() => {
      if (!selectedDate.value) return null;
      return scheduleData.value.find(s => s.date === selectedDate.value) || null;
    });

    const selectedDayEvents = computed(() => {
      const day = selectedDayData.value;
      if (!day || !day.events) return [];
      return day.events;
    });

    const selectedDayShopGroups = computed(() => {
      const day = selectedDayData.value;
      if (!day || !day.staffs) return [];
      // Group by shop
      const groups = {};
      for (const staff of day.staffs) {
        const key = staff.shop_id;
        if (!groups[key]) {
          groups[key] = {
            shop_id: staff.shop_id,
            shop_name: staff.shop_name,
            staffs: [],
            totalScore: 0
          };
        }
        groups[key].staffs.push(staff);
        groups[key].totalScore += staff.score;
      }
      // Sort staffs in each group by start time, then name
      const sortFn = (a, b) => {
        const ta = new Date(a.datetime_begin).getTime();
        const tb = new Date(b.datetime_begin).getTime();
        if (ta !== tb) return ta - tb;
        return (a.name || '').localeCompare(b.name || '', 'ja');
      };
      for (const g of Object.values(groups)) {
        g.staffs.sort(sortFn);
      }
      // Sort shop groups by earliest start time, then shop name
      const result = Object.values(groups);
      result.sort((a, b) => {
        const ta = new Date(a.staffs[0].datetime_begin).getTime();
        const tb = new Date(b.staffs[0].datetime_begin).getTime();
        if (ta !== tb) return ta - tb;
        return (a.shop_name || '').localeCompare(b.shop_name || '', 'ja');
      });
      return result;
    });

    function closeModal() {
      modalOpen.value = false;
      selectedDate.value = null;
      if (!staffScheduleOpen.value) document.body.classList.remove('modal-open');
    }

    // ========== Staff Schedule Modal ==========
    async function openStaffSchedule(staffId, staffName, shopId, imageUrl, siteUrl) {
      const fullStaff = staffs.value.find(st => st.id === staffId || st.id == staffId);
      staffScheduleStaff.value = {
        id: staffId, name: staffName, shop_id: shopId,
        image_url: imageUrl || fullStaff?.image_url || '',
        site_url: siteUrl || fullStaff?.site_url || ''
      };
      staffScheduleShifts.value = [];
      staffScheduleOpen.value = true;
      document.body.classList.add('modal-open');
      loadModalPreferences();
      staffScheduleLoading.value = true;
      try {
        const data = await API.getStaffUpcomingShifts(staffId);
        staffScheduleShifts.value = (data.staff_shifts || []);
      } catch (e) { /* ignore */ }
      staffScheduleLoading.value = false;
    }

    function closeStaffSchedule() {
      staffScheduleOpen.value = false;
      staffScheduleStaff.value = null;
      staffScheduleShifts.value = [];
      if (!modalOpen.value) document.body.classList.remove('modal-open');
    }

    async function confirmDeleteShift(shift) {
      if (!confirm('このシフトを削除しますか？')) return;
      try {
        await API.deleteStaffShift(shift._shop_id, shift.id);
        staffScheduleShifts.value = staffScheduleShifts.value.filter(s => s.id !== shift.id);
      } catch (e) { /* ignore */ }
    }

    function editShift(shift) {
      editingShift.value = shift;
      staffScheduleOpen.value = false;
      modalOpen.value = false;
      document.body.classList.remove('modal-open');
      currentView.value = 'shiftEdit';
    }

    function editStaff(staffInfo) {
      // Look up full staff data from already-loaded staffs array
      const full = staffs.value.find(st => st.id === staffInfo.id || st.id == staffInfo.id);
      editingStaff.value = full || staffInfo;
      staffScheduleOpen.value = false;
      modalOpen.value = false;
      document.body.classList.remove('modal-open');
      if (currentView.value === 'staffForm') {
        // Force re-mount when already on staffForm
        currentView.value = '';
        nextTick(() => { currentView.value = 'staffForm'; });
      } else {
        currentView.value = 'staffForm';
      }
    }

    async function confirmDeleteStaff(staffInfo) {
      if (!confirm(`「${staffInfo.name}」を削除しますか？`)) return;
      try {
        await API.deleteStaff(staffInfo.id);
        staffScheduleOpen.value = false;
        modalOpen.value = false;
        document.body.classList.remove('modal-open');
        await loadStaffs();
        await loadHomeData();
      } catch (e) { /* ignore */ }
    }

    function editShop(shopInfo) {
      const full = shops.value.find(s => s.id === shopInfo.id || s.id == shopInfo.id)
        || todayShops.value.find(s => s.id === shopInfo.id || s.id == shopInfo.id);
      editingShop.value = full || shopInfo;
      modalOpen.value = false;
      document.body.classList.remove('modal-open');
      currentView.value = 'shopForm';
    }

    // ========== Modal Preference ==========
    const modalPreferences = reactive({});
    const modalPrefDragging = ref(false);
    const modalPrefDraggingValue = ref(0);
    const modalPrefTooltipStyle = ref({});
    let modalPrefDebounceTimer = null;

    async function loadModalPreferences() {
      if (!currentUser.value) return;
      try {
        const data = await API.getPreferences();
        for (const p of (data.staff_preferences || [])) {
          modalPreferences[p.staff_id] = p.score;
        }
      } catch (e) { /* ignore */ }
    }

    function getModalPreference(staffId) {
      return modalPreferences[staffId] !== undefined ? modalPreferences[staffId] : 0;
    }

    async function saveModalPreference(staffId, score) {
      try {
        await API.setPreference(staffId, parseInt(score));
        modalPreferences[staffId] = parseInt(score);
      } catch (e) { /* ignore */ }
    }

    function onModalSliderInput(staffId, event) {
      const val = parseInt(event.target.value);
      modalPrefDragging.value = true;
      modalPrefDraggingValue.value = val;
      modalPreferences[staffId] = val;
      const slider = event.target;
      const rect = slider.getBoundingClientRect();
      const ratio = (val - (-10)) / 20;
      const thumbX = rect.left + ratio * rect.width;
      const containerRect = slider.closest('.pref-slider-container').getBoundingClientRect();
      modalPrefTooltipStyle.value = { left: (thumbX - containerRect.left) + 'px' };
      if (modalPrefDebounceTimer) clearTimeout(modalPrefDebounceTimer);
      modalPrefDebounceTimer = setTimeout(() => {
        saveModalPreference(staffId, val);
        modalPrefDragging.value = false;
      }, 2000);
    }

    function onModalSliderCommit(staffId, value) {
      const val = parseInt(value);
      modalPreferences[staffId] = val;
      if (modalPrefDebounceTimer) clearTimeout(modalPrefDebounceTimer);
      modalPrefDragging.value = false;
      saveModalPreference(staffId, val);
    }

    // ========== Monthly Calendar (おきゅよて) ==========
    const monthlyCalendarOpen = ref(false);
    const monthlyCalendarStaff = ref(null);
    const monthlyYear = ref(new Date().getFullYear());
    const monthlyMonth = ref(new Date().getMonth() + 1);
    const monthlyShifts = ref([]);
    const monthlyLoading = ref(false);
    const monthNames = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const monthlyMonthName = computed(() => monthNames[monthlyMonth.value - 1]);

    function openMonthlyCalendar(staff) {
      monthlyCalendarStaff.value = staff;
      monthlyYear.value = new Date().getFullYear();
      monthlyMonth.value = new Date().getMonth() + 1;
      monthlyCalendarOpen.value = true;
      loadMonthlyShifts();
    }

    function closeMonthlyCalendar() {
      monthlyCalendarOpen.value = false;
      monthlyCalendarStaff.value = null;
      monthlyShifts.value = [];
    }

    function changeMonth(delta) {
      let y = monthlyYear.value;
      let m = monthlyMonth.value + delta;
      if (m < 1) { m = 12; y--; }
      if (m > 12) { m = 1; y++; }
      monthlyYear.value = y;
      monthlyMonth.value = m;
      loadMonthlyShifts();
    }

    async function loadMonthlyShifts() {
      if (!monthlyCalendarStaff.value) return;
      monthlyLoading.value = true;
      try {
        const data = await API.getStaffMonthlyShifts(monthlyCalendarStaff.value.id, monthlyYear.value, monthlyMonth.value);
        monthlyShifts.value = data.staff_shifts || [];
      } catch (e) { monthlyShifts.value = []; }
      monthlyLoading.value = false;
    }

    const monthlyCalendarCells = computed(() => {
      const y = monthlyYear.value;
      const m = monthlyMonth.value;
      const firstDay = new Date(y, m - 1, 1);
      const lastDay = new Date(y, m, 0);
      const startDow = firstDay.getDay();
      const daysInMonth = lastDay.getDate();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;

      const cells = [];

      // Previous month padding
      const prevLast = new Date(y, m - 1, 0);
      for (let i = startDow - 1; i >= 0; i--) {
        cells.push({ day: prevLast.getDate() - i, current: false, isToday: false, shifts: [] });
      }

      // Current month
      for (let d = 1; d <= daysInMonth; d++) {
        const isToday = todayStr === `${y}-${m}-${d}`;
        const dayShifts = [];
        for (const shift of monthlyShifts.value) {
          const start = new Date(shift.start_at);
          const end = new Date(shift.end_at);
          const dayStart = new Date(y, m - 1, d, 0, 0, 0);
          const dayEnd = new Date(y, m - 1, d, 23, 59, 59);
          if (start <= dayEnd && end >= dayStart) {
            const sh = start.getHours();
            const eh = end.getHours() || 24;
            dayShifts.push({ id: shift.id, label: `${sh}-${eh === 24 ? 0 : eh}` });
          }
        }
        cells.push({ day: d, current: true, isToday, shifts: dayShifts });
      }

      // Next month padding
      const remainder = cells.length % 7;
      if (remainder > 0) {
        for (let d = 1; d <= 7 - remainder; d++) {
          cells.push({ day: d, current: false, isToday: false, shifts: [] });
        }
      }

      return cells;
    });

    // ========== Staff name helper ==========
    function getStaffName(staffId) {
      const staff = staffs.value.find(s => s.id === staffId);
      return staff ? staff.name : `Staff #${staffId}`;
    }

    // ========== Navigation ==========
    const authRequiredViews = ['shopForm', 'staffForm', 'shiftForm', 'shiftEdit', 'myPage', 'eventForm'];

    // Mapping between hash fragments and view names
    const hashToView = {
      '': 'home', 'home': 'home',
      'map': 'mapView', 'login': 'login', 'register': 'register',
      'forgot-password': 'forgotPassword', 'my-page': 'myPage',
      'shops': 'shopForm', 'staffs': 'staffForm', 'shifts': 'shiftForm',
      'events': 'eventForm'
    };
    const viewToHash = {
      'home': '', 'mapView': 'map', 'login': 'login', 'register': 'register',
      'forgotPassword': 'forgot-password', 'myPage': 'my-page',
      'shopForm': 'shops', 'staffForm': 'staffs', 'shiftForm': 'shifts',
      'eventForm': 'events'
    };

    function navigate(view, updateHash = true) {
      // Redirect to login if auth required and not logged in
      if (authRequiredViews.includes(view) && !currentUser.value) {
        currentView.value = 'login';
        menuOpen.value = false;
        error.value = 'この機能を使うにはサインインが必要です';
        if (updateHash) window.location.hash = 'login';
        return;
      }
      currentView.value = view;
      menuOpen.value = false;
      error.value = '';
      success.value = '';
      if (updateHash && viewToHash[view] !== undefined) {
        const newHash = viewToHash[view];
        if (newHash) {
          window.location.hash = newHash;
        } else {
          // Remove hash for home
          history.replaceState(null, '', window.location.pathname + window.location.search);
        }
      }
      if (view === 'home') loadHomeData();
      if (view === 'shopForm') loadShops();
      if (view === 'staffForm') { loadShops(); loadStaffs(); }
      if (view === 'shiftForm') { loadShops(); loadStaffs(); }
      if (view === 'shiftEdit') { loadShops(); }
      if (view === 'mapView') { loadShops(); }
      if (view === 'eventForm') { loadShops(); }
    }

    function handleHashChange() {
      const hash = window.location.hash.replace('#', '');
      const view = hashToView[hash];
      if (view && view !== currentView.value) {
        navigate(view, false);
      }
    }

    window.addEventListener('hashchange', handleHashChange);

    // ========== Push Notification Registration ==========
    const VAPID_PUBLIC_KEY = 'BEaEKm3DUk5UNG6F8NeOcg2CooLz_rKvNv6AqKXBu0p7i2NtWB9dd_vu7S0iG2PIGddYCIW5LAsJgPXTPH7HzGA=';

    function urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    }

    async function registerPushSubscription() {
      if (!currentUser.value) return;
      if (!('Notification' in window) || !('PushManager' in window)) return;
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const swReg = await navigator.serviceWorker.ready;

        // Unsubscribe old subscription if exists
        const existingSub = await swReg.pushManager.getSubscription();
        if (existingSub) {
          await existingSub.unsubscribe();
        }

        // Create new push subscription with VAPID key
        const subscription = await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        const subJson = subscription.toJSON();
        await API.deleteAllPushSubscriptions();
        await API.savePushSubscription({
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth
        });
        console.log('[Push] サブスクリプション登録成功');
      } catch (e) {
        console.warn('[Push] サブスクリプション登録に失敗:', e);
      }
    }

    async function unregisterPushSubscription() {
      try {
        const swReg = await navigator.serviceWorker.ready;
        const sub = await swReg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        await API.deleteAllPushSubscriptions();
      } catch (e) {
        console.warn('[Push] サブスクリプション削除に失敗:', e);
      }
    }

    // ========== Init ==========
    onMounted(async () => {
      // Handle email confirmation redirect
      const params = new URLSearchParams(window.location.search);
      if (params.get('confirmed') === 'true') {
        success.value = 'メールアドレスが確認されました。サインインしてください。';
        currentView.value = 'login';
        window.history.replaceState({}, '', '/');
      } else if (params.get('confirmation_error')) {
        error.value = params.get('confirmation_error');
        currentView.value = 'login';
        window.history.replaceState({}, '', '/');
      } else if (params.get('reset_password_token')) {
        resetPasswordToken.value = params.get('reset_password_token');
        currentView.value = 'resetPassword';
        window.history.replaceState({}, '', '/');
      }

      await checkAuth();

      // Handle initial hash route (e.g. #map)
      const initialHash = window.location.hash.replace('#', '');
      if (initialHash && hashToView[initialHash]) {
        navigate(hashToView[initialHash], false);
      } else {
        await loadHomeData();
      }

      // Auto-refresh push subscription on every page load for logged-in users
      // This ensures old Firebase SDK subscriptions get replaced with VAPID ones
      if (currentUser.value && 'Notification' in window && Notification.permission === 'granted' && 'PushManager' in window) {
        registerPushSubscription();
      }
    });

    return {
      registerPushSubscription, unregisterPushSubscription,
      resetPasswordToken,
      currentUser, currentView, menuOpen, loading, error, success,
      calendarYear, calendarMonth, scheduleData, selectedDate, modalOpen,
      todayShops, todayShifts, todayEvents, shops, staffs,
      staffScheduleOpen, staffScheduleStaff, staffScheduleShifts, staffScheduleLoading,
      editingShift, editingStaff, editingShop,
      handleLogin, handleRegister, handleLogout,
      prevMonth, nextMonth, calendarTitle, calendarDays,
      openDayModal, selectedDayData, selectedDayEvents, selectedDayShopGroups, closeModal,
      openStaffSchedule, closeStaffSchedule, confirmDeleteShift, editShift,
      editStaff, confirmDeleteStaff, editShop,
      getStaffName, navigate, loadShops, loadStaffs, loadHomeData,
      loadScheduleData, loadTodayData,
      scoreToGradient,
      modalPreferences, getModalPreference, onModalSliderInput, onModalSliderCommit,
      modalPrefDragging, modalPrefDraggingValue, modalPrefTooltipStyle,
      monthlyCalendarOpen, monthlyCalendarStaff, monthlyYear, monthlyMonth,
      monthlyMonthName, monthlyShifts, monthlyLoading, monthlyCalendarCells,
      openMonthlyCalendar, closeMonthlyCalendar, changeMonth
    };
  }
});

// ========== Login Component ==========
app.component('login-page', {
  template: `
    <div class="auth-container">
      <h2>サインイン</h2>
      <div v-if="$root.error" class="alert alert-error">{{ $root.error }}</div>
      <div v-if="$root.success" class="alert alert-success">{{ $root.success }}</div>
      <div class="form-group">
        <label>メールアドレス</label>
        <input v-model="email" type="email" placeholder="email@example.com" @keyup.enter="submit">
      </div>
      <div class="form-group">
        <label>パスワード</label>
        <input v-model="password" type="password" placeholder="パスワード" @keyup.enter="submit">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" @click="submit" :disabled="submitting">
          {{ submitting ? 'サインイン中...' : 'サインイン' }}
        </button>
      </div>
      <div class="auth-link">
        アカウントをお持ちでない方は <a @click="$root.navigate('register')">新規登録</a>
      </div>
      <div class="auth-link">
        <a @click="$root.navigate('forgotPassword')">パスワードを忘れた方はこちら</a>
      </div>
    </div>
  `,
  data() {
    return { email: '', password: '', submitting: false };
  },
  methods: {
    async submit() {
      if (!this.email || !this.password) return;
      this.submitting = true;
      await this.$root.handleLogin(this.email, this.password);
      this.submitting = false;
    }
  }
});

// ========== Forgot Password Component ==========
app.component('forgot-password-page', {
  template: `
    <div class="auth-container">
      <h2>パスワード再設定</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>
      <p style="margin-bottom:16px;color:#a0a0b8;font-size:0.9rem">登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをメールで送信します。</p>
      <div class="form-group">
        <label>メールアドレス</label>
        <input v-model="email" type="email" placeholder="email@example.com" @keyup.enter="submit">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" @click="submit" :disabled="submitting">
          {{ submitting ? '送信中...' : '再設定メールを送信' }}
        </button>
      </div>
      <div class="auth-link">
        <a @click="$root.navigate('login')">サインインに戻る</a>
      </div>
    </div>
  `,
  data() {
    return { email: '', submitting: false, localError: '', localSuccess: '' };
  },
  methods: {
    async submit() {
      if (!this.email) return;
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        const data = await API.requestPasswordReset(this.email);
        this.localSuccess = data.message || 'パスワード再設定メールを送信しました。';
        this.email = '';
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || 'メールの送信に失敗しました。';
      }
      this.submitting = false;
    }
  }
});

// ========== Reset Password Component ==========
app.component('reset-password-page', {
  template: `
    <div class="auth-container">
      <h2>新しいパスワードの設定</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>
      <div class="form-group">
        <label>新しいパスワード</label>
        <input v-model="password" type="password" placeholder="6文字以上">
      </div>
      <div class="form-group">
        <label>新しいパスワード（確認）</label>
        <input v-model="passwordConfirmation" type="password" placeholder="パスワード再入力" @keyup.enter="submit">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" @click="submit" :disabled="submitting">
          {{ submitting ? '設定中...' : 'パスワードを再設定' }}
        </button>
      </div>
      <div class="auth-link">
        <a @click="$root.navigate('login')">サインインに戻る</a>
      </div>
    </div>
  `,
  data() {
    return { password: '', passwordConfirmation: '', submitting: false, localError: '', localSuccess: '' };
  },
  methods: {
    async submit() {
      if (!this.password || !this.passwordConfirmation) return;
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        const data = await API.resetPassword(
          this.$root.resetPasswordToken,
          this.password,
          this.passwordConfirmation
        );
        this.localSuccess = data.message || 'パスワードを再設定しました。';
        this.$root.resetPasswordToken = null;
        setTimeout(() => { this.$root.navigate('login'); }, 2000);
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || 'パスワードの再設定に失敗しました。';
      }
      this.submitting = false;
    }
  }
});

// ========== Register Component ==========
app.component('register-page', {
  template: `
    <div class="auth-container">
      <h2>新規登録</h2>
      <div v-if="$root.error" class="alert alert-error">{{ $root.error }}</div>
      <div v-if="$root.success" class="alert alert-success">{{ $root.success }}</div>
      <div class="form-group">
        <label>メールアドレス</label>
        <input v-model="email" type="email" placeholder="email@example.com">
      </div>
      <div class="form-group">
        <label>パスワード</label>
        <input v-model="password" type="password" placeholder="6文字以上">
      </div>
      <div class="form-group">
        <label>パスワード（確認）</label>
        <input v-model="passwordConfirmation" type="password" placeholder="パスワード再入力" @keyup.enter="submit">
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" @click="submit" :disabled="submitting">
          {{ submitting ? '登録中...' : '新規登録' }}
        </button>
      </div>
      <div class="auth-link">
        すでにアカウントをお持ちの方は <a @click="$root.navigate('login')">サインイン</a>
      </div>
    </div>
  `,
  data() {
    return { email: '', password: '', passwordConfirmation: '', submitting: false };
  },
  methods: {
    async submit() {
      if (!this.email || !this.password || !this.passwordConfirmation) return;
      this.submitting = true;
      await this.$root.handleRegister(this.email, this.password, this.passwordConfirmation);
      this.submitting = false;
    }
  }
});

// ========== Shop Form Component ==========
app.component('shop-form-page', {
  template: `
    <div class="register-container">
      <h2>店舗管理</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>

      <h3 style="margin-bottom:12px">{{ editMode ? '店舗編集' : '新規店舗登録' }}</h3>
      <div class="form-group">
        <label>店舗名 *</label>
        <input v-model="form.name" type="text" placeholder="店舗名">
      </div>
      <div class="form-group">
        <label>サイトURL</label>
        <input v-model="form.site_url" type="url" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>画像URL</label>
        <input v-model="form.image_url" type="url" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>住所</label>
        <input v-model="form.address" type="text" placeholder="例: 東京都新宿区歌舞伎町1-1" @blur="onAddressBlur">
        <div v-if="geocoding" style="font-size:0.8rem;color:#a0a0b8;margin-top:4px">住所を検索中...</div>
      </div>
      <div class="form-group">
        <label>所在地（地図をタップまたはピンをドラッグ）</label>
        <div id="shop-map" style="height:300px;border-radius:8px;border:1px solid #3a3a5c"></div>
      </div>
      <div class="form-actions" style="margin-bottom:16px" :style="editMode ? 'display:flex;gap:8px' : ''">
        <template v-if="editMode">
          <button class="btn btn-primary" @click="updateShop" :disabled="submitting" style="flex:1">
            {{ submitting ? '更新中...' : '更新' }}
          </button>
          <button class="btn btn-danger" @click="deleteShopWithCascade" :disabled="submitting" style="flex:1">
            削除
          </button>
          <button class="btn btn-secondary" @click="cancelEdit" style="flex:1">
            キャンセル
          </button>
        </template>
        <template v-else>
          <button class="btn btn-primary" @click="createShop" :disabled="submitting">
            {{ submitting ? '登録中...' : '店舗を登録' }}
          </button>
        </template>
      </div>

      <h3 style="margin-bottom:12px">登録済み店舗</h3>
      <div v-if="$root.shops.length === 0" class="no-data">店舗がありません</div>
      <div v-for="shop in $root.shops" :key="shop.id"       class="shop-block" style="background:#1e1e38">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div class="shop-block-name">{{ shop.name }}</div>
                  <div v-if="shop.site_url" style="font-size:0.8rem;color:#a0a0b8">{{ shop.site_url }}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-secondary btn-sm" @click="editExistingShop(shop)">編集</button>
            <button class="btn btn-danger btn-sm" @click="deleteShop(shop)">削除</button>
          </div>
        </div>
      </div>
      <!-- 更新完了モーダル -->
      <div v-if="showSuccessModal" class="modal-overlay" @click.self="closeSuccessModal">
        <div class="modal-content" style="text-align:center;padding:32px">
          <p style="font-size:1.1rem;margin-bottom:20px">更新しました</p>
          <button class="btn btn-primary" @click="closeSuccessModal">OK</button>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      form: { name: '', site_url: '', image_url: '', address: '', latitude: '', longitude: '' },
      geocoding: false,
      editMode: false,
      editShopId: null,
      submitting: false,
      localError: '',
      localSuccess: '',
      showSuccessModal: false,
      map: null,
      marker: null
    };
  },
  async mounted() {
    await this.$root.loadShops();
    const es = this.$root.editingShop;
    if (es) {
      this.form = {
        name: es.name || '',
        site_url: es.site_url || '',
        image_url: es.image_url || '',
        address: es.address || '',
        latitude: es.latitude || '',
        longitude: es.longitude || ''
      };
      this.editMode = true;
      this.editShopId = es.id;
      this.$root.editingShop = null;
    }
    this.$nextTick(() => { this.initMap(); });
  },
  beforeUnmount() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  },
  methods: {
    initMap() {
      const mapEl = document.getElementById('shop-map');
      if (!mapEl || !window.L) return;
      const lat = parseFloat(this.form.latitude) || 35.6762;
      const lng = parseFloat(this.form.longitude) || 139.6503;
      const zoom = (this.form.latitude && this.form.longitude) ? 16 : 5;
      this.map = L.map('shop-map').setView([lat, lng], zoom);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(this.map);
      if (this.form.latitude && this.form.longitude) {
        this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
        this.marker.on('dragend', (e) => {
          const pos = e.target.getLatLng();
          this.form.latitude = pos.lat.toFixed(6);
          this.form.longitude = pos.lng.toFixed(6);
        });
      }
      this.map.on('click', (e) => {
        this.form.latitude = e.latlng.lat.toFixed(6);
        this.form.longitude = e.latlng.lng.toFixed(6);
        if (this.marker) {
          this.marker.setLatLng(e.latlng);
        } else {
          this.marker = L.marker(e.latlng, { draggable: true }).addTo(this.map);
          this.marker.on('dragend', (ev) => {
            const pos = ev.target.getLatLng();
            this.form.latitude = pos.lat.toFixed(6);
            this.form.longitude = pos.lng.toFixed(6);
          });
        }
      });
    },
    async onAddressBlur() {
      const addr = (this.form.address || '').trim();
      if (!addr) return;
      this.geocoding = true;
      try {
        const res = await fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(addr));
        const data = await res.json();
        if (data.length > 0) {
          const coords = data[0].geometry.coordinates;
          const lat = coords[1];
          const lng = coords[0];
          this.form.latitude = lat.toFixed(6);
          this.form.longitude = lng.toFixed(6);
          if (this.map) {
            this.map.setView([lat, lng], 16);
            if (this.marker) {
              this.marker.setLatLng([lat, lng]);
            } else {
              this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
              this.marker.on('dragend', (ev) => {
                const pos = ev.target.getLatLng();
                this.form.latitude = pos.lat.toFixed(6);
                this.form.longitude = pos.lng.toFixed(6);
              });
            }
          }
        }
      } catch (e) {
        // geocoding failed silently
      }
      this.geocoding = false;
    },
    closeSuccessModal() {
      this.showSuccessModal = false;
    },
    editExistingShop(shop) {
      this.form = {
        name: shop.name || '',
        site_url: shop.site_url || '',
        image_url: shop.image_url || '',
        address: shop.address || '',
        latitude: shop.latitude || '',
        longitude: shop.longitude || ''
      };
      this.editMode = true;
      this.editShopId = shop.id;
      this.localError = '';
      this.localSuccess = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
      this.$nextTick(() => {
        if (this.map) {
          const lat = parseFloat(shop.latitude) || 35.6762;
          const lng = parseFloat(shop.longitude) || 139.6503;
          const zoom = (shop.latitude && shop.longitude) ? 16 : 5;
          this.map.setView([lat, lng], zoom);
          if (shop.latitude && shop.longitude) {
            if (this.marker) {
              this.marker.setLatLng([lat, lng]);
            } else {
              this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
              this.marker.on('dragend', (ev) => {
                const pos = ev.target.getLatLng();
                this.form.latitude = pos.lat.toFixed(6);
                this.form.longitude = pos.lng.toFixed(6);
              });
            }
          } else if (this.marker) {
            this.map.removeLayer(this.marker);
            this.marker = null;
          }
        }
      });
    },
    cancelEdit() {
      this.editMode = false;
      this.editShopId = null;
      this.form = { name: '', site_url: '', image_url: '', address: '', latitude: '', longitude: '' };
      if (this.marker) {
        this.map.removeLayer(this.marker);
        this.marker = null;
      }
      if (this.map) {
        this.map.setView([35.6762, 139.6503], 5);
      }
      this.localError = '';
      this.localSuccess = '';
    },
    async createShop() {
      if (!this.form.name) {
        this.localError = '店舗名は必須です';
        return;
      }
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.createShop(this.form);
        this.localSuccess = '店舗を登録しました';
        this.form = { name: '', site_url: '', image_url: '', address: '', latitude: '', longitude: '' };
        if (this.marker) {
          this.map.removeLayer(this.marker);
          this.marker = null;
        }
        if (this.map) {
          this.map.setView([35.6762, 139.6503], 5);
        }
        await this.$root.loadShops();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '登録に失敗しました';
      }
      this.submitting = false;
    },
    async updateShop() {
      if (!this.form.name) {
        this.localError = '店舗名は必須です';
        return;
      }
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.updateShop(this.editShopId, this.form);
        this.cancelEdit();
        await this.$root.loadShops();
        this.showSuccessModal = true;
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '更新に失敗しました';
      }
      this.submitting = false;
    },
    async deleteShopWithCascade() {
      if (!confirm('削除しますか？ 所属するキャストも削除されます')) return;
      this.submitting = true;
      this.localError = '';
      try {
        await API.deleteShop(this.editShopId);
        this.localSuccess = '店舗と所属キャストを削除しました';
        this.cancelEdit();
        await this.$root.loadShops();
        await this.$root.loadStaffs();
      } catch (e) {
        this.localError = '削除に失敗しました';
      }
      this.submitting = false;
    },
    async deleteShop(shop) {
      if (!confirm('削除しますか？ 所属するキャストも削除されます')) return;
      try {
        await API.deleteShop(shop.id);
        this.localSuccess = '店舗と所属キャストを削除しました';
        await this.$root.loadShops();
      } catch (e) {
        this.localError = '削除に失敗しました';
      }
    }
  }
});

// ========== Staff Form Component ==========
app.component('staff-form-page', {
  template: `
    <div class="register-container">
      <h2>キャスト管理</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>

      <h3 style="margin-bottom:12px">{{ editMode ? 'キャスト編集' : '新規キャスト登録' }}</h3>
      <div class="form-group">
        <label>キャスト名 *</label>
        <input v-model="form.name" type="text" placeholder="キャスト名">
      </div>
      <div class="form-group">
        <label>所属店舗 *</label>
        <select v-model="form.shop_id">
          <option value="">選択してください</option>
          <option v-for="shop in $root.shops" :key="shop.id" :value="shop.id">{{ shop.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>サイトURL</label>
        <input v-model="form.site_url" type="url" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>画像URL</label>
        <input v-model="form.image_url" type="url" placeholder="https://...">
      </div>
      <div class="form-actions" style="margin-bottom:12px">
        <button class="btn btn-primary" @click="editMode ? updateStaff() : createStaff()" :disabled="submitting">
          {{ submitting ? (editMode ? '更新中...' : '登録中...') : (editMode ? 'キャストを更新' : 'キャストを登録') }}
        </button>
      </div>
      <div v-if="editMode" style="margin-bottom:32px">
        <button class="btn btn-outline" @click="cancelEdit">新規登録に切り替え</button>
      </div>

      <h3 style="margin-bottom:12px">登録済みキャスト</h3>
      <div class="form-group">
        <label>店舗で絞り込み</label>
        <select v-model="filterShopId" @change="loadFilteredStaffs">
          <option value="">全て</option>
          <option v-for="shop in $root.shops" :key="shop.id" :value="shop.id">{{ shop.name }}</option>
        </select>
      </div>
      <div v-if="filteredStaffs.length === 0" class="no-data">キャストがいません</div>
      <div v-for="staff in filteredStaffs" :key="staff.id"       class="shop-block" style="background:#1e1e38">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div>
                  <div class="shop-block-name cast-name-link" @click="$root.openStaffSchedule(staff.id, staff.name, staff.shop_id)">{{ staff.name }}</div>
                  <div style="font-size:0.8rem;color:#a0a0b8">{{ getShopName(staff.shop_id) }}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <div v-if="$root.currentUser" class="pref-slider-container">
              <span style="font-size:0.75rem;color:#74b9ff">-10</span>
              <span class="pref-tooltip" :class="{ visible: draggingStaffId === staff.id }" :style="tooltipStyle">{{ draggingValue }}</span>
              <input type="range" class="pref-slider" min="-10" max="10" step="1"
                :value="getPreference(staff.id)"
                @input="onSliderInput(staff.id, $event)"
                @change="onSliderCommit(staff.id, $event.target.value)"
                @mousedown="draggingStaffId = staff.id"
                @touchstart="draggingStaffId = staff.id">
              <span style="font-size:0.75rem;color:#ff6b6b">+10</span>
              <span class="pref-value">{{ getPreference(staff.id) }}</span>
            </div>
            <button class="btn btn-danger btn-sm" @click="deleteStaff(staff)">削除</button>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      form: { name: '', shop_id: '', site_url: '', image_url: '' },
      editMode: false,
      editStaffId: null,
      submitting: false,
      localError: '',
      localSuccess: '',
      filterShopId: '',
      preferences: {},
      draggingStaffId: null,
      draggingValue: 0,
      tooltipStyle: {},
      _debounceTimers: {}
    };
  },
  computed: {
    filteredStaffs() {
      if (!this.filterShopId) return this.$root.staffs;
      return this.$root.staffs.filter(s => s.shop_id == this.filterShopId);
    }
  },
  async mounted() {
    await this.$root.loadShops();
    await this.$root.loadStaffs();
    await this.loadPreferences();
    const es = this.$root.editingStaff;
    if (es) {
      this.form = {
        name: es.name || '',
        shop_id: es.shop_id || '',
        site_url: es.site_url || '',
        image_url: es.image_url || ''
      };
      this.editMode = true;
      this.editStaffId = es.id;
      this.$root.editingStaff = null;
    }
  },
  methods: {
    getShopName(shopId) {
      const shop = this.$root.shops.find(s => s.id === shopId);
      return shop ? shop.name : '';
    },
    getPreference(staffId) {
      return this.preferences[staffId] !== undefined ? this.preferences[staffId] : 0;
    },
    async loadPreferences() {
      if (!this.$root.currentUser) return;
      try {
        const data = await API.getPreferences();
        const prefs = {};
        for (const p of (data.staff_preferences || [])) {
          prefs[p.staff_id] = p.score;
        }
        this.preferences = prefs;
      } catch (e) {
        // ignore
      }
    },
    onSliderInput(staffId, event) {
      const val = parseInt(event.target.value);
      this.draggingStaffId = staffId;
      this.draggingValue = val;
      this.preferences[staffId] = val;
      const slider = event.target;
      const rect = slider.getBoundingClientRect();
      const ratio = (val - (-10)) / 20;
      const thumbX = rect.left + ratio * rect.width;
      const containerRect = slider.closest('.pref-slider-container').getBoundingClientRect();
      this.tooltipStyle = { left: (thumbX - containerRect.left) + 'px' };
      if (this._debounceTimers[staffId]) clearTimeout(this._debounceTimers[staffId]);
      this._debounceTimers[staffId] = setTimeout(() => {
        this.savePreference(staffId, val);
        this.draggingStaffId = null;
      }, 2000);
    },
    onSliderCommit(staffId, value) {
      const val = parseInt(value);
      this.preferences[staffId] = val;
      if (this._debounceTimers[staffId]) clearTimeout(this._debounceTimers[staffId]);
      this.draggingStaffId = null;
      this.savePreference(staffId, val);
    },
    async savePreference(staffId, score) {
      try {
        await API.setPreference(staffId, parseInt(score));
      } catch (e) {
        this.localError = 'スコアの設定に失敗しました';
      }
    },
    cancelEdit() {
      this.editMode = false;
      this.editStaffId = null;
      this.form = { name: '', shop_id: '', site_url: '', image_url: '' };
      this.localError = '';
      this.localSuccess = '';
    },
    async createStaff() {
      if (!this.form.name || !this.form.shop_id) {
        this.localError = 'キャスト名と所属店舗は必須です';
        return;
      }
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.createStaff(this.form);
        this.localSuccess = 'キャストを登録しました';
        this.form = { name: '', shop_id: '', site_url: '', image_url: '' };
        await this.$root.loadStaffs();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '登録に失敗しました';
      }
      this.submitting = false;
    },
    async updateStaff() {
      if (!this.form.name || !this.form.shop_id) {
        this.localError = 'キャスト名と所属店舗は必須です';
        return;
      }
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.updateStaff(this.editStaffId, this.form);
        this.localSuccess = 'キャストを更新しました';
        this.editMode = false;
        this.editStaffId = null;
        this.form = { name: '', shop_id: '', site_url: '', image_url: '' };
        await this.$root.loadStaffs();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '更新に失敗しました';
      }
      this.submitting = false;
    },
    async deleteStaff(staff) {
      if (!confirm(`「${staff.name}」を削除しますか？`)) return;
      try {
        await API.deleteStaff(staff.id);
        this.localSuccess = '削除しました';
        await this.$root.loadStaffs();
      } catch (e) {
        this.localError = '削除に失敗しました';
      }
    },
    async loadFilteredStaffs() {
      // staffs are already loaded, filtering is done by computed
    }
  }
});

// ========== Shift Form Component ==========
app.component('shift-form-page', {
  template: `
    <div class="register-container">
      <h2>シフト登録</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>

      <div class="form-group">
        <label>店舗 *</label>
        <select v-model="selectedShopId" @change="onShopChange">
          <option value="">選択してください</option>
          <option v-for="shop in $root.shops" :key="shop.id" :value="shop.id">{{ shop.name }}</option>
        </select>
      </div>

      <div class="form-group">
        <label>キャスト *</label>
        <select v-model="selectedStaffId" :disabled="!selectedShopId">
          <option value="">選択してください</option>
          <option v-for="staff in filteredStaffs" :key="staff.id" :value="staff.id">{{ staff.name }}</option>
        </select>
      </div>

      <template v-if="selectedShopId && selectedStaffId">
        <h3 style="margin-top:16px;margin-bottom:12px">シフト日時</h3>
        <div v-for="(entry, index) in entries" :key="index" class="shift-entry">
          <div class="shift-entry-fields">
            <div class="form-group" style="margin-bottom:0">
              <label>日付</label>
              <input type="date" v-model="entry.date">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>開始時刻</label>
              <input type="time" v-model="entry.startTime" step="3600">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <label>終了時刻</label>
              <input type="time" v-model="entry.endTime" step="3600">
            </div>
            <button v-if="entries.length > 1" class="btn btn-danger btn-sm shift-remove-btn" @click="removeEntry(index)">&times;</button>
          </div>
          <div v-if="entry.endTime && entry.startTime && entry.endTime <= entry.startTime" class="shift-hint">
            ※ 終了時刻が開始時刻以前のため、翌日の終了として扱います
          </div>
        </div>

        <div style="margin-bottom:16px">
          <button class="btn btn-secondary btn-sm" @click="addEntry">+ 追加</button>
        </div>

        <div class="form-actions" style="margin-bottom:32px">
          <button class="btn btn-primary" @click="submitShifts" :disabled="submitting">
            {{ submitting ? '登録中...' : 'シフトを登録' }}
          </button>
        </div>
      </template>
    </div>
  `,
  data() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return {
      selectedShopId: '',
      selectedStaffId: '',
      entries: [{ date: dateStr, startTime: '17:00', endTime: '23:00' }],
      submitting: false,
      localError: '',
      localSuccess: ''
    };
  },
  computed: {
    filteredStaffs() {
      if (!this.selectedShopId) return [];
      return this.$root.staffs.filter(s => s.shop_id == this.selectedShopId);
    }
  },
  async mounted() {
    await this.$root.loadShops();
    await this.$root.loadStaffs();
  },
  methods: {
    newEntry() {
      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      return { date: dateStr, startTime: '', endTime: '' };
    },
    addEntry() {
      const last = this.entries[this.entries.length - 1];
      const entry = this.newEntry();
      if (last) {
        // 日付は直前の翌日を設定
        const d = new Date(last.date);
        d.setDate(d.getDate() + 1);
        entry.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        entry.startTime = last.startTime;
        entry.endTime = last.endTime;
      }
      this.entries.push(entry);
    },
    removeEntry(index) {
      this.entries.splice(index, 1);
    },
    onShopChange() {
      this.selectedStaffId = '';
    },
    buildDatetime(date, time, isNextDay) {
      const dt = new Date(`${date}T${time}:00`);
      if (isNextDay) {
        dt.setDate(dt.getDate() + 1);
      }
      return dt.toISOString();
    },
    async submitShifts() {
      this.localError = '';
      this.localSuccess = '';

      // Validate
      for (let i = 0; i < this.entries.length; i++) {
        const e = this.entries[i];
        if (!e.date || !e.startTime || !e.endTime) {
          this.localError = `${i + 1}行目: 日付・開始時刻・終了時刻を全て入力してください`;
          return;
        }
      }

      this.submitting = true;
      let successCount = 0;
      const errors = [];

      for (let i = 0; i < this.entries.length; i++) {
        const e = this.entries[i];
        const isNextDay = e.endTime <= e.startTime;
        const startAt = this.buildDatetime(e.date, e.startTime, false);
        const endAt = this.buildDatetime(e.date, e.endTime, isNextDay);

        try {
          await API.createStaffShift(this.selectedShopId, {
            staff_id: this.selectedStaffId,
            start_at: startAt,
            end_at: endAt
          });
          successCount++;
        } catch (err) {
          const msg = err.data?.errors?.join(', ') || '登録に失敗しました';
          errors.push(`${i + 1}行目: ${msg}`);
        }
      }

      if (successCount > 0) {
        const skipped = this.entries.length - successCount;
        this.localSuccess = skipped > 0
          ? `${successCount}件のシフトを登録しました（${skipped}件は時間重複のためスキップ）`
          : `${successCount}件のシフトを登録しました`;
        this.entries = [this.newEntry()];
      } else if (errors.length > 0) {
        this.localError = '登録できるシフトがありませんでした（時間帯が重複しています）';
      }
      this.submitting = false;
    }
  }
});

// ========== Shift Edit Component ==========
app.component('shift-edit-page', {
  template: `
    <div class="register-container">
      <h2>シフト編集</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>

      <div class="form-group">
        <label>店舗</label>
        <input type="text" :value="shopName" disabled>
      </div>
      <div class="form-group">
        <label>キャスト</label>
        <input type="text" :value="staffName" disabled>
      </div>
      <div class="form-group">
        <label>開始日時</label>
        <div class="shift-entry-fields">
          <div class="form-group" style="margin-bottom:0">
            <input type="date" v-model="form.startDate">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <input type="time" v-model="form.startTime" step="3600">
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>終了日時</label>
        <div class="shift-entry-fields">
          <div class="form-group" style="margin-bottom:0">
            <input type="date" v-model="form.endDate">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <input type="time" v-model="form.endTime" step="3600">
          </div>
        </div>
      </div>

      <div class="form-actions" style="margin-bottom:16px">
        <button class="btn btn-primary" @click="save" :disabled="submitting">
          {{ submitting ? '保存中...' : '保存' }}
        </button>
      </div>
      <button class="btn btn-outline" @click="$root.navigate('home')">戻る</button>
    </div>
  `,
  data() {
    return {
      form: { startDate: '', startTime: '', endDate: '', endTime: '' },
      submitting: false,
      localError: '',
      localSuccess: ''
    };
  },
  computed: {
    shift() { return this.$root.editingShift; },
    shopName() {
      if (!this.shift) return '';
      const shop = this.$root.shops.find(s => s.id == this.shift._shop_id);
      return shop ? shop.name : (this.shift._shop_name || '');
    },
    staffName() {
      if (!this.shift) return '';
      return this.$root.getStaffName(this.shift.staff_id);
    }
  },
  mounted() {
    if (!this.shift) {
      this.$root.navigate('home');
      return;
    }
    const start = new Date(this.shift.start_at);
    const end = new Date(this.shift.end_at);
    this.form.startDate = this.toDateStr(start);
    this.form.startTime = this.toTimeStr(start);
    this.form.endDate = this.toDateStr(end);
    this.form.endTime = this.toTimeStr(end);
  },
  methods: {
    toDateStr(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    toTimeStr(d) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
    async save() {
      this.localError = '';
      this.localSuccess = '';
      if (!this.form.startDate || !this.form.startTime || !this.form.endDate || !this.form.endTime) {
        this.localError = '全ての項目を入力してください';
        return;
      }
      this.submitting = true;
      try {
        const startAt = new Date(`${this.form.startDate}T${this.form.startTime}:00`).toISOString();
        const endAt = new Date(`${this.form.endDate}T${this.form.endTime}:00`).toISOString();
        await API.updateStaffShift(this.shift._shop_id, this.shift.id, {
          start_at: startAt,
          end_at: endAt
        });
        this.localSuccess = 'シフトを更新しました';
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '更新に失敗しました';
      }
      this.submitting = false;
    }
  }
});

// ========== My Page Component ==========
app.component('my-page', {
  template: `
    <div class="container">
      <div class="mypage-section">
        <h2 class="section-title">マイページ</h2>

        <!-- Nickname -->
        <div class="mypage-card">
          <h3 class="mypage-card-title">ニックネーム</h3>
          <div v-if="nicknameMsg" class="alert" :class="nicknameMsgType === 'success' ? 'alert-success' : 'alert-error'">{{ nicknameMsg }}</div>
          <div class="form-group">
            <input v-model="nickname" type="text" placeholder="ニックネームを入力">
          </div>
          <button class="btn btn-primary btn-block" @click="saveNickname" :disabled="savingNickname">
            {{ savingNickname ? '保存中...' : 'ニックネームを保存' }}
          </button>
        </div>

        <!-- Email Change -->
        <div class="mypage-card">
          <h3 class="mypage-card-title">サインインID (メールアドレス) 変更</h3>
          <div v-if="emailMsg" class="alert" :class="emailMsgType === 'success' ? 'alert-success' : 'alert-error'">{{ emailMsg }}</div>
          <div class="form-group">
            <label>新しいメールアドレス</label>
            <input v-model="newEmail" type="email" placeholder="新しいメールアドレス">
          </div>
          <div class="form-group">
            <label>現在のパスワード</label>
            <input v-model="emailCurrentPassword" type="password" placeholder="現在のパスワード">
          </div>
          <button class="btn btn-primary btn-block" @click="saveEmail" :disabled="savingEmail">
            {{ savingEmail ? '変更中...' : 'メールアドレスを変更' }}
          </button>
        </div>

        <!-- Password Change -->
        <div class="mypage-card">
          <h3 class="mypage-card-title">パスワード変更</h3>
          <div v-if="passwordMsg" class="alert" :class="passwordMsgType === 'success' ? 'alert-success' : 'alert-error'">{{ passwordMsg }}</div>
          <div class="form-group">
            <label>現在のパスワード</label>
            <input v-model="currentPassword" type="password" placeholder="現在のパスワード">
          </div>
          <div class="form-group">
            <label>新しいパスワード</label>
            <input v-model="newPassword" type="password" placeholder="6文字以上">
          </div>
          <div class="form-group">
            <label>新しいパスワード（確認）</label>
            <input v-model="newPasswordConfirmation" type="password" placeholder="パスワード再入力">
          </div>
          <button class="btn btn-primary btn-block" @click="savePassword" :disabled="savingPassword">
            {{ savingPassword ? '変更中...' : 'パスワードを変更' }}
          </button>
        </div>

        <!-- Notification Settings -->
        <div class="mypage-card">
          <h3 class="mypage-card-title">通知の設定</h3>
          <div v-if="notifMsg" class="alert" :class="notifMsgType === 'success' ? 'alert-success' : 'alert-error'">{{ notifMsg }}</div>

          <div class="notif-instruction-box">
            iPhoneのホーム画面に追加すると、指定の条件でアプリに通知が届きます。ホーム画面に追加するには、Safariでこのページを開き、メニュー (おそらく画面下のアドレスバーの横の&hellip;) から 共有 &rarr; もっと見る &rarr; ホーム画面に追加 を選択します。その後、ホーム画面に追加されたアイコンをタップして、この画面で「通知を許可する」をOFF&rarr;ONすると、そのiPhoneに通知が届きます。
          </div>

          <div class="mypage-toggle-row">
            <span>通知を許可する</span>
            <label class="toggle-switch">
              <input type="checkbox" v-model="notifEnabled">
              <span class="toggle-slider"></span>
            </label>
          </div>

          <template v-if="notifEnabled">
            <div class="mypage-sub-section">
              <div class="mypage-sub-title">通知の条件</div>
              <div class="form-group">
                <label>合計n点以上の店舗がある日</label>
                <input v-model.number="scoreThresholdShop" type="number" min="-10" max="10" step="1">
              </div>
              <div class="form-group">
                <label>n点以上のキャストがいる日</label>
                <input v-model.number="scoreThresholdStaff" type="number" min="-10" max="10" step="1">
              </div>
            </div>

            <div class="mypage-sub-section">
              <div class="mypage-sub-title">通知のタイミング</div>
              <div class="form-group">
                <label>シフト開始前</label>
                <div class="minutes-input">
                  <input v-model.number="notifyMinutesBefore" type="number" min="0" step="5">
                  <span class="minutes-suffix">分前</span>
                </div>
                <div class="form-hint">0の場合は通知しません</div>
              </div>
            </div>
          </template>

          <button class="btn btn-primary btn-block" @click="saveNotification" :disabled="savingNotif">
            {{ savingNotif ? '保存中...' : '通知設定を保存' }}
          </button>
        </div>

      </div>
    </div>
  `,
  data() {
    return {
      // Nickname
      nickname: '',
      savingNickname: false,
      nicknameMsg: '',
      nicknameMsgType: '',
      // Email
      newEmail: '',
      emailCurrentPassword: '',
      savingEmail: false,
      emailMsg: '',
      emailMsgType: '',
      // Password
      currentPassword: '',
      newPassword: '',
      newPasswordConfirmation: '',
      savingPassword: false,
      passwordMsg: '',
      passwordMsgType: '',
      // Notification
      notifEnabled: false,
      scoreThresholdShop: 0,
      scoreThresholdStaff: 0,
      notifyMinutesBefore: 0,
      savingNotif: false,
      notifMsg: '',
      notifMsgType: ''
    };
  },
  async mounted() {
    // Load current user info
    if (this.$root.currentUser) {
      this.nickname = this.$root.currentUser.nickname || '';
      this.newEmail = this.$root.currentUser.email || '';
    }
    // Load notification settings
    try {
      const data = await API.getNotificationSettings();
      const s = data.notification_setting;
      if (s) {
        this.notifEnabled = s.notifications_enabled || false;
        this.scoreThresholdShop = s.score_threshold_shop || 0;
        this.scoreThresholdStaff = s.score_threshold_staff || 0;
        this.notifyMinutesBefore = s.notify_minutes_before || 0;
      }
    } catch (e) {
      // ignore - new user without settings
    }
  },
  methods: {
    async saveNickname() {
      this.savingNickname = true;
      this.nicknameMsg = '';
      try {
        const data = await API.updateProfile({ nickname: this.nickname });
        this.nicknameMsg = 'ニックネームを保存しました';
        this.nicknameMsgType = 'success';
        if (data.token) {
          API.setToken(data.token);
          const base64 = data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(decodeURIComponent(atob(base64).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')));
          this.$root.currentUser = { id: payload.sub, nickname: payload.nickname || '', email: payload.email || '' };
        }
      } catch (e) {
        this.nicknameMsg = e.data?.error || '保存に失敗しました';
        this.nicknameMsgType = 'error';
      }
      this.savingNickname = false;
    },
    async saveEmail() {
      this.savingEmail = true;
      this.emailMsg = '';
      if (!this.emailCurrentPassword) {
        this.emailMsg = '現在のパスワードを入力してください';
        this.emailMsgType = 'error';
        this.savingEmail = false;
        return;
      }
      try {
        const data = await API.updateProfile({
          email: this.newEmail,
          current_password: this.emailCurrentPassword
        });
        this.emailMsg = 'メールアドレスを変更しました';
        this.emailMsgType = 'success';
        this.emailCurrentPassword = '';
        if (data.token) {
          API.setToken(data.token);
          const base64 = data.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
          const payload = JSON.parse(decodeURIComponent(atob(base64).split('').map(function(c) { return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2); }).join('')));
          this.$root.currentUser = { id: payload.sub, nickname: payload.nickname || '', email: payload.email || '' };
        }
      } catch (e) {
        this.emailMsg = e.data?.error || '変更に失敗しました';
        this.emailMsgType = 'error';
      }
      this.savingEmail = false;
    },
    async savePassword() {
      this.savingPassword = true;
      this.passwordMsg = '';
      if (!this.currentPassword) {
        this.passwordMsg = '現在のパスワードを入力してください';
        this.passwordMsgType = 'error';
        this.savingPassword = false;
        return;
      }
      if (this.newPassword !== this.newPasswordConfirmation) {
        this.passwordMsg = '新しいパスワードが一致しません';
        this.passwordMsgType = 'error';
        this.savingPassword = false;
        return;
      }
      try {
        const data = await API.updateProfile({
          password: this.newPassword,
          password_confirmation: this.newPasswordConfirmation,
          current_password: this.currentPassword
        });
        this.passwordMsg = 'パスワードを変更しました';
        if (data && data.token) API.setToken(data.token);
        this.passwordMsgType = 'success';
        this.currentPassword = '';
        this.newPassword = '';
        this.newPasswordConfirmation = '';
      } catch (e) {
        this.passwordMsg = e.data?.error || '変更に失敗しました';
        this.passwordMsgType = 'error';
      }
      this.savingPassword = false;
    },
    async saveNotification() {
      this.savingNotif = true;
      this.notifMsg = '';
      try {
        await API.updateNotificationSettings({
          notifications_enabled: this.notifEnabled,
          score_threshold_shop: this.scoreThresholdShop,
          score_threshold_staff: this.scoreThresholdStaff,
          notify_minutes_before: this.notifyMinutesBefore
        });
        this.notifMsg = '通知設定を保存しました';
        this.notifMsgType = 'success';
        // Register or unregister push subscription based on notification setting
        if (this.notifEnabled) {
          await this.$root.registerPushSubscription();
        } else {
          await this.$root.unregisterPushSubscription();
        }
      } catch (e) {
        this.notifMsg = e.data?.error || '保存に失敗しました';
        this.notifMsgType = 'error';
      }
      this.savingNotif = false;
    }
  }
});

// ========== Event Form Component ==========
app.component('event-form-page', {
  template: `
    <div class="register-container">
      <h2>イベント管理</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>

      <h3 style="margin-bottom:12px">{{ editMode ? 'イベント編集' : '新規イベント登録' }}</h3>
      <div class="form-group">
        <label>イベント名 *</label>
        <input v-model="form.title" type="text" placeholder="イベント名">
      </div>
      <div class="form-group">
        <label>店舗 *</label>
        <select v-model="form.shop_id">
          <option value="">選択してください</option>
          <option v-for="shop in $root.shops" :key="shop.id" :value="shop.id">{{ shop.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>URL</label>
        <input v-model="form.url" type="url" placeholder="https://...">
      </div>
      <div class="form-group">
        <label>開始日時</label>
        <div class="shift-entry-fields">
          <div class="form-group" style="margin-bottom:0">
            <input type="date" v-model="form.startDate">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <input type="time" v-model="form.startTime" step="3600">
          </div>
        </div>
      </div>
      <div class="form-group">
        <label>終了日時</label>
        <div class="shift-entry-fields">
          <div class="form-group" style="margin-bottom:0">
            <input type="date" v-model="form.endDate">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <input type="time" v-model="form.endTime" step="3600">
          </div>
        </div>
      </div>
      <div class="form-actions" style="margin-bottom:12px">
        <button class="btn btn-primary" @click="editMode ? updateEvent() : createEvent()" :disabled="submitting">
          {{ submitting ? (editMode ? '更新中...' : '登録中...') : (editMode ? 'イベントを更新' : 'イベントを登録') }}
        </button>
      </div>
      <div v-if="editMode" style="margin-bottom:32px">
        <button class="btn btn-outline" @click="cancelEdit">新規登録に切り替え</button>
      </div>

      <h3 style="margin-bottom:12px">登録済みイベント</h3>
      <div class="form-group">
        <label>店舗で絞り込み</label>
        <select v-model="filterShopId">
          <option value="">全て</option>
          <option v-for="shop in $root.shops" :key="shop.id" :value="shop.id">{{ shop.name }}</option>
        </select>
      </div>
      <div v-if="filteredEvents.length === 0" class="no-data">イベントがありません</div>
      <div v-for="event in filteredEvents" :key="event.id" class="shop-block" style="background:#1e1e38">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="min-width:0;flex:1;overflow:hidden">
            <div class="shop-block-name">{{ event.title }}</div>
            <div style="font-size:0.8rem;color:#a0a0b8">{{ event.shop ? event.shop.name : '' }}</div>
            <div v-if="event.start_at" style="font-size:0.8rem;color:#a0a0b8">
              {{ formatDatetime(event.start_at) }}
              <template v-if="event.end_at"> 〜 {{ formatDatetime(event.end_at) }}</template>
            </div>
            <div v-if="event.url" style="font-size:0.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><a :href="event.url" target="_blank" rel="noopener noreferrer" style="color:#a29bfe">{{ event.url }}</a></div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-secondary btn-sm" @click="editExisting(event)">編集</button>
            <button class="btn btn-danger btn-sm" @click="deleteEvent(event)">削除</button>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      form: { title: '', shop_id: '', url: '', startDate: '', startTime: '', endDate: '', endTime: '' },
      editMode: false,
      editEventId: null,
      submitting: false,
      localError: '',
      localSuccess: '',
      filterShopId: '',
      events: []
    };
  },
  computed: {
    filteredEvents() {
      if (!this.filterShopId) return this.events;
      return this.events.filter(e => e.shop_id == this.filterShopId);
    }
  },
  async mounted() {
    await this.$root.loadShops();
    await this.loadEvents();
  },
  methods: {
    formatDatetime(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }) +
        ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    },
    async loadEvents() {
      try {
        const data = await API.getEvents();
        this.events = data.events || [];
      } catch (e) {
        // ignore
      }
    },
    editExisting(event) {
      this.form.title = event.title || '';
      this.form.shop_id = event.shop_id || '';
      this.form.url = event.url || '';
      if (event.start_at) {
        const s = new Date(event.start_at);
        this.form.startDate = this.toDateStr(s);
        this.form.startTime = this.toTimeStr(s);
      } else {
        this.form.startDate = '';
        this.form.startTime = '';
      }
      if (event.end_at) {
        const e = new Date(event.end_at);
        this.form.endDate = this.toDateStr(e);
        this.form.endTime = this.toTimeStr(e);
      } else {
        this.form.endDate = '';
        this.form.endTime = '';
      }
      this.editMode = true;
      this.editEventId = event.id;
      this.localError = '';
      this.localSuccess = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    toDateStr(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    toTimeStr(d) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
    cancelEdit() {
      this.editMode = false;
      this.editEventId = null;
      this.form = { title: '', shop_id: '', url: '', startDate: '', startTime: '', endDate: '', endTime: '' };
      this.localError = '';
      this.localSuccess = '';
    },
    buildPayload() {
      const payload = {
        title: this.form.title,
        shop_id: this.form.shop_id,
        url: this.form.url || null
      };
      if (this.form.startDate && this.form.startTime) {
        payload.start_at = new Date(`${this.form.startDate}T${this.form.startTime}:00`).toISOString();
      } else if (this.form.startDate) {
        payload.start_at = new Date(`${this.form.startDate}T00:00:00`).toISOString();
      }
      if (this.form.endDate && this.form.endTime) {
        payload.end_at = new Date(`${this.form.endDate}T${this.form.endTime}:00`).toISOString();
      } else if (this.form.endDate) {
        payload.end_at = new Date(`${this.form.endDate}T23:59:00`).toISOString();
      }
      return payload;
    },
    async createEvent() {
      if (!this.form.title || !this.form.shop_id) {
        this.localError = 'イベント名と店舗は必須です';
        return;
      }
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.createEvent(this.buildPayload());
        this.localSuccess = 'イベントを登録しました';
        this.form = { title: '', shop_id: '', url: '', startDate: '', startTime: '', endDate: '', endTime: '' };
        await this.loadEvents();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '登録に失敗しました';
      }
      this.submitting = false;
    },
    async updateEvent() {
      if (!this.form.title || !this.form.shop_id) {
        this.localError = 'イベント名と店舗は必須です';
        return;
      }
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.updateEvent(this.editEventId, this.buildPayload());
        this.localSuccess = 'イベントを更新しました';
        this.cancelEdit();
        await this.loadEvents();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '更新に失敗しました';
      }
      this.submitting = false;
    },
    async deleteEvent(event) {
      if (!confirm(`「${event.title}」を削除しますか？`)) return;
      try {
        await API.deleteEvent(event.id);
        this.localSuccess = '削除しました';
        await this.loadEvents();
      } catch (e) {
        this.localError = '削除に失敗しました';
      }
    }
  }
});

// ========== Map View Component ==========
app.component('map-view-page', {
  template: `
    <div class="register-container">
      <h2>地図で見る</h2>
      <div v-if="locating" style="text-align:center;padding:16px;color:#a0a0b8">現在地を取得中...</div>
      <div id="map-view" style="height:calc(100vh - 320px);min-height:300px;border-radius:8px;border:1px solid #3a3a5c"></div>
    </div>
  `,
  data() {
    return {
      map: null,
      locating: true,
      shopShifts: {},
      nowShops: []
    };
  },
  async mounted() {
    await this.loadNowData();
    this.$nextTick(() => { this.initMap(); });
  },
  beforeUnmount() {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  },
  methods: {
    async loadNowData() {
      try {
        const data = await API.getNowSchedule();
        const shops = data.shops || [];
        this.nowShops = shops;
        const shifts = {};
        for (const shop of shops) {
          if (shop.staffs && shop.staffs.length > 0) {
            shifts[shop.shop_id] = shop.staffs;
          }
        }
        this.shopShifts = shifts;
      } catch (e) {
        // ignore
      }
    },
    initMap() {
      const mapEl = document.getElementById('map-view');
      if (!mapEl || !window.L) return;
      this.map = L.map('map-view').setView([35.6762, 139.6503], 5);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(this.map);
      this.addShopMarkers();
      this.getCurrentLocation();
    },
    shopScore(shopId) {
      const shifts = this.shopShifts[shopId] || [];
      if (shifts.length === 0) return null;
      let total = 0;
      for (const shift of shifts) {
        total += shift.score || 0;
      }
      return total;
    },
    createMarkerIcon(score) {
      let color, borderColor;
      if (score === null) {
        color = '#c8a800';
        borderColor = '#e8d040';
      } else {
        const { r, g, b } = scoreToColor(score);
        color = `rgb(${r},${g},${b})`;
        borderColor = `rgb(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)})`;
      }
      return L.divIcon({
        className: 'shop-marker',
        html: '<div style="width:14px;height:14px;background:' + color + ';border:3px solid ' + borderColor + ';border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.6)"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -10]
      });
    },
    addShopMarkers() {
      const shops = this.nowShops || [];
      for (const shop of shops) {
        if (shop.latitude && shop.longitude) {
          const lat = parseFloat(shop.latitude);
          const lng = parseFloat(shop.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            const score = this.$root.currentUser ? this.shopScore(shop.shop_id) : null;
            const icon = this.createMarkerIcon(score);
            const marker = L.marker([lat, lng], { icon: icon }).addTo(this.map);
            let popupHtml = '<strong>' + this.escapeHtml(shop.shop_name) + '</strong>';
            if (shop.address) {
              popupHtml += '<br><span style="font-size:0.85rem;color:#a0a0b8">' + this.escapeHtml(shop.address) + '</span>';
            }
            const events = shop.events || [];
            if (events.length > 0) {
              popupHtml += '<hr style="margin:4px 0;border:none;border-top:1px solid #3a3a5c">';
              popupHtml += '<div style="font-size:0.8rem;color:#000;font-weight:bold">イベント開催中</div>';
              for (const ev of events) {
                popupHtml += '<div style="font-size:0.8rem">';
                if (ev.url) {
                  popupHtml += '<a href="' + this.escapeHtml(ev.url) + '" target="_blank" rel="noopener" style="color:#000;text-decoration:none">' + this.escapeHtml(ev.title) + '</a>';
                } else {
                  popupHtml += this.escapeHtml(ev.title);
                }
                popupHtml += '</div>';
              }
            }
            const shifts = shop.staffs || [];
            if (shifts.length > 0) {
              popupHtml += '<hr style="margin:4px 0;border:none;border-top:1px solid #3a3a5c">';
              popupHtml += '<div style="font-size:0.8rem;color:#000;font-weight:bold">シフト中</div>';
              for (const shift of shifts) {
                const startTime = new Date(shift.start_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                const endTime = new Date(shift.end_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
                popupHtml += '<div style="font-size:0.8rem">' + this.escapeHtml(shift.name) + ' <span style="color:#a0a0b8">' + startTime + '-' + endTime + '</span></div>';
              }
            }
            popupHtml += '<div style="margin-top:6px"><a href="https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lng + '&travelmode=walking" target="_blank" rel="noopener" style="font-size:0.8rem;color:#a29bfe;text-decoration:none">Google Mapsでナビ</a></div>';
            marker.bindPopup(popupHtml);
          }
        }
      }
    },
    getCurrentLocation() {
      if (!navigator.geolocation) {
        this.locating = false;
        alert('位置情報を取得できませんでした');
        if (this.map) {
          this.map.setView([35.6984, 139.7731], 15);
        }
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.locating = false;
          if (!this.map) return;
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          this.map.setView([lat, lng], 15);
          const currentIcon = L.divIcon({
            className: 'current-location-marker',
            html: '<div style="width:16px;height:16px;background:#4285f4;border:3px solid #7ab8ff;border-radius:50%;box-shadow:0 0 6px rgba(66,133,244,0.6)"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });
          L.marker([lat, lng], { icon: currentIcon, zIndexOffset: 1000 })
            .addTo(this.map)
            .bindPopup('現在地');
        },
        (err) => {
          this.locating = false;
          const reasons = {
            1: '位置情報の権限がありません。iPhoneの場合: 設定→プライバシーとセキュリティ→位置情報サービス→Safari Webサイト を「確認」または「使用中のみ」に設定してください。',
            2: '位置情報を取得できませんでした（位置情報が利用できません）',
            3: '位置情報の取得がタイムアウトしました'
          };
          alert(reasons[err.code] || '位置情報を取得できませんでした（エラーコード: ' + err.code + '）');
          if (this.map) {
            this.map.setView([35.6984, 139.7731], 15);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    },
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }
});

// Mount the app
app.mount('#app');
