const { createApp, ref, reactive, computed, onMounted, onBeforeUnmount, nextTick, defineAsyncComponent } = Vue;
const DEFAULT_PAGE_SIZE = 10;
const HOME_DATA_REFRESH_INTERVAL_MS = 60 * 1000;
const HOME_DATA_STALE_AFTER_MS = 30 * 60 * 1000;
const STAFF_PREFERENCES_CACHE_VERSION = 1;

// ========== 日本の祝日判定 ==========
function getNthMonday(year, month, n) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const firstMonday = (firstDay <= 1) ? 1 + (1 - firstDay) : 1 + (7 - firstDay + 1);
  return firstMonday + (n - 1) * 7;
}

function is_pure_holiday(y, m, d) {
  const h = {
    1: [1], 2: [11, 23], 4: [29], 5: [3, 4, 5], 8: [11], 11: [3, 23]
  };
  if (h[m] && h[m].includes(d)) return true;
  if (m === 1 && d === getNthMonday(y, 1, 2)) return true;
  if (m === 7 && d === getNthMonday(y, 7, 3)) return true;
  if (m === 9 && d === getNthMonday(y, 9, 3)) return true;
  if (m === 10 && d === getNthMonday(y, 10, 2)) return true;
  if (m === 3 && d === Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))) return true;
  if (m === 9 && d === Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4))) return true;
  return false;
}

function is_holiday_in_japan(year, month, day) {
  const date = new Date(year, month - 1, day);
  const dayOfWeek = date.getDay();

  if (is_pure_holiday(year, month, day)) return true;

  // 振替休日: 当日が日曜でなければ、前日以前に遡って日曜の祝日があれば振替
  if (dayOfWeek !== 0) {
    for (let i = 1; i < 7; i++) {
      const prev = new Date(year, month - 1, day - i);
      if (is_pure_holiday(prev.getFullYear(), prev.getMonth() + 1, prev.getDate())) {
        if (prev.getDay() === 0) return true;
      } else {
        break;
      }
    }
  }

  // 国民の休日: 前後の日がともに純粋な祝日
  const prevDay = new Date(year, month - 1, day - 1);
  const nextDay = new Date(year, month - 1, day + 1);
  if (is_pure_holiday(prevDay.getFullYear(), prevDay.getMonth() + 1, prevDay.getDate()) &&
      is_pure_holiday(nextDay.getFullYear(), nextDay.getMonth() + 1, nextDay.getDate())) {
    return true;
  }

  return false;
}

function isHolidayOrWeekend(year, month, day) {
  const dow = new Date(year, month - 1, day).getDay();
  if (dow === 0 || dow === 6) return true;
  return is_holiday_in_japan(year, month, day);
}

const app = createApp({
  setup() {
    // ========== State ==========
    const currentUser = ref(null);
    const authResolved = ref(false);
    const currentView = ref('home'); // home, login, register, forgotPassword, resetPassword, shopForm, staffForm, shiftForm, shiftImportPage, shiftBulkForm, shiftEdit
    const resetPasswordToken = ref(null);
    const menuOpen = ref(false);
    const loading = ref(true);
    const error = ref('');
    const success = ref('');
    const homeSlideFromLeft = ref(false);

    // Calendar state
    const calendarYear = ref(new Date().getFullYear());
    const calendarMonth = ref(new Date().getMonth()); // 0-indexed
    const calendarSlideDirection = ref(null); // prev | next | null
    const homeCalendarLoading = ref(false);
    const scheduleData = ref([]);
    const selectedDate = ref(null);
    const modalOpen = ref(false);
    const timelineModalOpen = ref(false);
    const timelinePopup = ref(null);
    const dayModalOriginStyle = ref({});
    const dayModalAnimating = ref(false);

    // Today's data (for unauthenticated + bottom section)
    const todayShops = ref([]);
    const todayShifts = ref({});
    const todayEvents = ref([]);
    const lastHomeDataLoadedAt = ref(0);
    const homeDataRefreshing = ref(false);
    let homeDataRefreshPromise = null;
    let homeCalendarRequestSeq = 0;
    let refreshTimer = null;
    let handleVisibilityChange = null;

    // Form data
    const shops = ref([]);
    const staffs = ref([]);
    const users = ref([]);
    const shopHomeShop = ref(null);
    const shopHomeStaffs = ref([]);
    const shopHomeEvents = ref([]);
    const shopHomeLoading = ref(false);

    // Staff home state
    const staffHomeStaff = ref(null);
    const staffHomeLoading = ref(false);
    let recentTweetsScriptPromise = null;


    // Shift edit state
    const editingShift = ref(null);

    // Shift form preset state
    const shiftFormPreset = ref(null);

    // Staff edit state
    const editingStaff = ref(null);

    // Shop edit state
    const editingShop = ref(null);

    // Check-in state
    const activeCheckIn = ref(null);
    const ratingCheckIn = ref(null);
    const ratingCandidateStaffs = ref([]);
    const limitMeters = ref(50);
    const thankYouOpen = ref(false);

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
        authResolved.value = true;
        return;
      }
      const payload = decodeJwtPayload(API.token);
      if (payload) {
        currentUser.value = {
          id: Number(payload.sub),
          nickname: payload.nickname || '',
          email: payload.email || '',
          role: payload.role || 'user'
        };
      } else {
        API.setToken(null);
        currentUser.value = null;
      }
      loading.value = false;
      authResolved.value = true;
    }

    async function handleLogin(email, password) {
      error.value = '';
      try {
        await API.login(email, password);
        // Extract user info from JWT token (set by API.request via Authorization header)
        const payload = decodeJwtPayload(API.token);
        if (payload) {
          currentUser.value = {
            id: Number(payload.sub),
            nickname: payload.nickname || '',
            email: payload.email || '',
            role: payload.role || 'user'
          };
        }
        todayShops.value = [];
        todayShifts.value = {};
        todayEvents.value = [];
        scheduleData.value = [];
        lastHomeDataLoadedAt.value = 0;
        currentView.value = 'home';
        history.replaceState(null, '', window.location.pathname + window.location.search);
        success.value = 'サインインしました';
        await Promise.all([
          loadHomeData(true),
          loadStaffPreferences(true)
        ]);
        loadConfig();
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
      activeCheckIn.value = null;
      menuOpen.value = false;
      scheduleData.value = [];
      currentView.value = 'home';
      history.replaceState(null, '', window.location.pathname + window.location.search);
      lastHomeDataLoadedAt.value = 0;
      await loadHomeData(true);
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

    async function fetchScheduleData(year, month) {
      const formatClientDateTime = (date) => {
        const pad = (n) => String(n).padStart(2, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const hh = pad(date.getHours());
        const mm = pad(date.getMinutes());
        const ss = pad(date.getSeconds());
        const tz = -date.getTimezoneOffset();
        const sign = tz >= 0 ? '+' : '-';
        const tzAbs = Math.abs(tz);
        const tzH = pad(Math.floor(tzAbs / 60));
        const tzM = pad(tzAbs % 60);
        return `${y}-${m}-${d}T${hh}:${mm}:${ss}${sign}${tzH}:${tzM}`;
      };

      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59);
      const data = await API.getSchedules(
        formatClientDateTime(start),
        formatClientDateTime(end)
      );
      return data.days || [];
    }

    async function loadScheduleData() {
      const requestSeq = ++homeCalendarRequestSeq;
      homeCalendarLoading.value = true;
      try {
        const days = await fetchScheduleData(calendarYear.value, calendarMonth.value);
        if (requestSeq !== homeCalendarRequestSeq) return;
        scheduleData.value = days;
      } catch (e) {
        if (requestSeq !== homeCalendarRequestSeq) return;
        scheduleData.value = [];
      } finally {
        if (requestSeq === homeCalendarRequestSeq) {
          homeCalendarLoading.value = false;
        }
      }
    }

    function targetMonth(delta) {
      let year = calendarYear.value;
      let month = calendarMonth.value + delta;
      if (month < 0) {
        month = 11;
        year -= 1;
      } else if (month > 11) {
        month = 0;
        year += 1;
      }
      return { year: year, month: month };
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

    async function loadUsers(page = 1, size = DEFAULT_PAGE_SIZE) {
      try {
        const data = await API.getUsers(page, size);
        users.value = data.users || [];
      } catch (e) {
        users.value = [];
      }
    }

    function staffPreferencesStorageKey() {
      const userId = Number(currentUser.value?.id || 0);
      if (!userId) return null;
      return `staff_preferences:v${STAFF_PREFERENCES_CACHE_VERSION}:user:${userId}`;
    }

    function readCachedStaffPreferences() {
      const key = staffPreferencesStorageKey();
      if (!key) return null;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || !parsed.by_staff_id || typeof parsed.by_staff_id !== 'object') {
          return null;
        }
        return parsed.by_staff_id;
      } catch (e) {
        return null;
      }
    }

    function writeCachedStaffPreferences(byStaffId) {
      const key = staffPreferencesStorageKey();
      if (!key) return;
      const normalized = {};
      for (const [staffId, score] of Object.entries(byStaffId || {})) {
        normalized[String(staffId)] = Number(score) || 0;
      }
      try {
        localStorage.setItem(key, JSON.stringify({
          by_staff_id: normalized,
          updated_at: new Date().toISOString()
        }));
      } catch (e) {
        // ignore
      }
    }

    function configStorageKey() {
      const userId = Number(currentUser.value?.id || 0);
      if (!userId) return null;
      return `config:v1:user:${userId}`;
    }

    function applyConfigData(data) {
      if (data && data.limit_meters) {
        limitMeters.value = Number(data.limit_meters);
      }
      activeCheckIn.value = data?.checked_in || null;
    }

    function updateCachedConfigCheckedIn(checkedIn) {
      const key = configStorageKey();
      if (!key) return;
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : {};
        const nextConfig = (parsed && typeof parsed === 'object') ? parsed : {};
        nextConfig.checked_in = checkedIn;
        localStorage.setItem(key, JSON.stringify(nextConfig));
      } catch (e) {
        // ignore
      }
    }

    function normalizeStaffPreferencesResponse(data) {
      const prefs = {};
      for (const p of (data?.staff_preferences || [])) {
        if (p?.staff_id == null) continue;
        prefs[String(p.staff_id)] = Number(p.score) || 0;
      }
      return prefs;
    }

    async function loadStaffPreferences(force = false) {
      if (!currentUser.value) return {};

      const cached = readCachedStaffPreferences();
      if (!force && cached) return cached;

      try {
        const data = await API.getPreferences();
        const prefs = normalizeStaffPreferencesResponse(data);
        writeCachedStaffPreferences(prefs);
        return readCachedStaffPreferences() || {};
      } catch (e) {
        return cached || {};
      }
    }

    async function setStaffPreference(staffId, score) {
      const targetStaffId = Number(staffId);
      const targetScore = Number(score) || 0;
      await API.setPreference(targetStaffId, targetScore);
      const currentPrefs = readCachedStaffPreferences() || {};
      currentPrefs[String(targetStaffId)] = targetScore;
      writeCachedStaffPreferences(currentPrefs);
      return currentPrefs;
    }

    async function loadShopHome(shopId) {
      shopHomeLoading.value = true;
      shopHomeShop.value = null;
      shopHomeStaffs.value = [];
      shopHomeEvents.value = [];
      try {
        const [shopData, staffsData] = await Promise.all([
          API.getShop(shopId),
          API.getStaffs(shopId)
        ]);
        shopHomeShop.value = shopData || null;
        shopHomeStaffs.value = staffsData.staffs || [];
      } catch (e) {
        shopHomeShop.value = null;
        shopHomeStaffs.value = [];
      }
      shopHomeLoading.value = false;
    }

    async function loadStaffHome(staffId) {
      ensureRecentTweetsScript().catch(() => {});
      staffHomeLoading.value = true;
      staffHomeStaff.value = null;
      try {
        staffHomeStaff.value = await API.getStaff(staffId);
      } catch (e) {
        staffHomeStaff.value = null;
      }
      staffHomeLoading.value = false;
    }

    function ensureRecentTweetsScript() {
      if (window.RecentTweetsRenderer) return Promise.resolve();
      if (recentTweetsScriptPromise) return recentTweetsScriptPromise;

      recentTweetsScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-module="recent-tweets"]');
        if (existing) {
          existing.addEventListener('load', () => resolve(), { once: true });
          existing.addEventListener('error', () => reject(new Error('recent-tweets.js load failed')), { once: true });
          return;
        }

        const script = document.createElement('script');
        script.src = '/js/recent-tweets.js';
        script.async = true;
        script.dataset.module = 'recent-tweets';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('recent-tweets.js load failed'));
        document.head.appendChild(script);
      }).catch((e) => {
        recentTweetsScriptPromise = null;
        return Promise.reject(e);
      });

      return recentTweetsScriptPromise;
    }

    async function openStaffHome(staffId) {
      modalOpen.value = false;
      timelineModalOpen.value = false;
      timelinePopup.value = null;
      document.body.classList.remove('modal-open');
      staffHomeLoading.value = true;
      staffHomeStaff.value = null;
      currentView.value = 'staffHome';
      error.value = '';
      success.value = '';
      window.location.hash = `staff-${staffId}`;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function loadHomeData(force = false) {
      if (homeDataRefreshing.value) {
        if (homeDataRefreshPromise) {
          await homeDataRefreshPromise;
        }
        if (!force) return;
      }
      if (!force && Date.now() - lastHomeDataLoadedAt.value < HOME_DATA_STALE_AFTER_MS) return;

      homeDataRefreshing.value = true;
      homeDataRefreshPromise = (async () => {
        await Promise.all([loadTodayData(), loadScheduleData()]);
        lastHomeDataLoadedAt.value = Date.now();
      })();
      try {
        await homeDataRefreshPromise;
      } finally {
        homeDataRefreshPromise = null;
        homeDataRefreshing.value = false;
      }
    }

    function shouldRefreshHomeData() {
      if (currentView.value !== 'home') return false;
      if (document.visibilityState !== 'visible') return false;
      return Date.now() - lastHomeDataLoadedAt.value >= HOME_DATA_STALE_AFTER_MS;
    }

    async function refreshHomeDataIfStale() {
      if (!shouldRefreshHomeData()) return;
      await loadHomeData(true);
    }

    // ========== Calendar Helpers ==========
    async function prevMonth() {
      if (homeCalendarLoading.value) return;
      const target = targetMonth(-1);
      const requestSeq = ++homeCalendarRequestSeq;
      homeCalendarLoading.value = true;
      try {
        const days = await fetchScheduleData(target.year, target.month);
        if (requestSeq !== homeCalendarRequestSeq) return;
        calendarSlideDirection.value = 'prev';
        calendarYear.value = target.year;
        calendarMonth.value = target.month;
        scheduleData.value = days;
      } catch (e) {
        if (requestSeq !== homeCalendarRequestSeq) return;
      } finally {
        if (requestSeq === homeCalendarRequestSeq) {
          homeCalendarLoading.value = false;
        }
      }
    }

    async function nextMonth() {
      if (homeCalendarLoading.value) return;
      const target = targetMonth(1);
      const requestSeq = ++homeCalendarRequestSeq;
      homeCalendarLoading.value = true;
      try {
        const days = await fetchScheduleData(target.year, target.month);
        if (requestSeq !== homeCalendarRequestSeq) return;
        calendarSlideDirection.value = 'next';
        calendarYear.value = target.year;
        calendarMonth.value = target.month;
        scheduleData.value = days;
      } catch (e) {
        if (requestSeq !== homeCalendarRequestSeq) return;
      } finally {
        if (requestSeq === homeCalendarRequestSeq) {
          homeCalendarLoading.value = false;
        }
      }
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
        const maxSeatScore = maxSeatScoreForDay(scheduleDay);

        const hasEvents = scheduleDay && scheduleDay.events && scheduleDay.events.length > 0;
        const hasStaffs = scheduleDay && scheduleDay.staffs && scheduleDay.staffs.length > 0;

        const gradient = hasStaffs
                    ? (currentUser.value ? scoreToGradient(totalScore) : 'linear-gradient(135deg, #252547 0%, #2f335f 55%, #3b4378 100%)')
                    : '#252547';

        cells.push({
          day: d,
          dateStr,
          empty: false,
          isToday,
          totalScore,
          hasData: !!scheduleDay,
          hasEvents,
          gradient,
          seatGauge: formatCalendarSeatGauge(maxSeatScore)
        });
      }
      return cells;
    });

    function activeSeatScoreForStaff(staff, requirePositiveScore = false) {
      const seatScore = Number(staff?.seat_score) || 0;
      if (seatScore <= 0) return 0;
      if (requirePositiveScore && currentUser.value && Number(staff?.score) <= 0) return 0;

      const shiftEnd = new Date(staff.datetime_end || staff.end_at);
      if (Number.isNaN(shiftEnd.getTime())) return 0;
      if (Date.now() >= shiftEnd.getTime()) return 0;

      return seatScore;
    }

    function maxSeatScoreForDay(scheduleDay) {
      if (!scheduleDay?.staffs?.length) return 0;

      return scheduleDay.staffs.reduce((maxScore, staff) => {
        const score = activeSeatScoreForStaff(staff, !!currentUser.value);
        return Math.max(maxScore, score);
      }, 0);
    }

    function openDayModal(cell, event) {
      if (cell.empty) return;
      const clickX = event?.clientX ?? (window.innerWidth / 2);
      const clickY = event?.clientY ?? (window.innerHeight / 2);
      selectedDate.value = cell.dateStr;
      dayModalAnimating.value = false;
      modalOpen.value = true;
      document.body.classList.add('modal-open');
      nextTick(() => {
        const modalEl = document.querySelector('.day-detail-modal-content');
        if (!modalEl) {
          dayModalOriginStyle.value = {};
          return;
        }
        const rect = modalEl.getBoundingClientRect();
        const originX = Math.min(Math.max(clickX - rect.left, 0), rect.width);
        const originY = Math.min(Math.max(clickY - rect.top, 0), rect.height);
        dayModalOriginStyle.value = {
          '--day-modal-origin-x': `${originX}px`,
          '--day-modal-origin-y': `${originY}px`
        };
        requestAnimationFrame(() => {
          dayModalAnimating.value = true;
        });
      });
    }

    async function openTodayTimelineModal() {
      const today = new Date();
      const todayYear = today.getFullYear();
      const todayMonth = today.getMonth();
      const todayDateStr = `${todayYear}-${String(todayMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      if (calendarYear.value !== todayYear || calendarMonth.value !== todayMonth) {
        calendarYear.value = todayYear;
        calendarMonth.value = todayMonth;
        await loadScheduleData();
      }

      selectedDate.value = todayDateStr;
      timelineModalOpen.value = true;
      document.body.classList.add('modal-open');
    }

    const selectedDayData = computed(() => {
      if (!selectedDate.value) return null;
      return scheduleData.value.find(s => s.date === selectedDate.value) || null;
    });

    const selectedDayEvents = computed(() => {
      const day = selectedDayData.value;
      if (!day || !day.events) return [];

      const visibleShopIds = new Set(
        selectedDayShopGroups.value.map(group => Number(group.shop_id))
      );
      return day.events.filter(event => visibleShopIds.has(Number(event.shop_id)));
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
            totalScore: 0,
            scoredStaffIds: new Set()
          };
        }
        groups[key].staffs.push(staff);
        if (!groups[key].scoredStaffIds.has(staff.staff_id)) {
          groups[key].totalScore += staff.score;
          groups[key].scoredStaffIds.add(staff.staff_id);
        }
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
      // Sort shop groups by total score desc, then earliest start time, then shop name
      const result = Object.values(groups);
      for (const group of result) {
        delete group.scoredStaffIds;
      }
      result.sort((a, b) => {
        if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
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
      dayModalOriginStyle.value = {};
      dayModalAnimating.value = false;
      if (!timelineModalOpen.value) document.body.classList.remove('modal-open');
    }

    async function openTimelineModal() {
      if (!selectedDate.value) return;
      timelineModalOpen.value = true;
      document.body.classList.add('modal-open');
    }

    function closeTimelineModal() {
      timelineModalOpen.value = false;
      timelinePopup.value = null;
      if (!modalOpen.value) document.body.classList.remove('modal-open');
    }

    function formatTimelineTime(dateTime) {
      const date = new Date(dateTime);
      return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function openTimelinePopup(shop, bar) {
      timelinePopup.value = {
        shopId: shop.shop_id,
        shopName: shop.shop_name,
        staffs: bar.activeStaffs
      };
    }

    function closeTimelinePopup() {
      timelinePopup.value = null;
    }

    const timelineHourLabels = computed(() => {
      const labels = [];
      for (let hour = 0; hour <= 24; hour++) {
        labels.push(`${String(hour).padStart(2, '0')}:00`);
      }
      return labels;
    });

    const timelineHourSlots = computed(() => timelineHourLabels.value.slice(0, 24));

    const currentTimelineHourLabel = computed(() => {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}:00`;
    });

    const timelineShopColumns = computed(() => {
      if (!selectedDate.value) return [];

      const dayStart = new Date(`${selectedDate.value}T00:00:00+09:00`);
      const dayEnd = new Date(`${selectedDate.value}T24:00:00+09:00`);
      const dayStartMs = dayStart.getTime();
      const dayEndMs = dayEnd.getTime();

      return selectedDayShopGroups.value.map(group => {
        const clippedShifts = group.staffs.map(staff => {
          const startMs = new Date(staff.datetime_begin).getTime();
          const endMs = new Date(staff.datetime_end).getTime();
          const clippedStart = Math.max(startMs, dayStartMs);
          const clippedEnd = Math.min(endMs, dayEndMs);
          return {
            name: staff.name,
            staff_id: staff.staff_id,
            score: Number(staff.score || 0),
            startMs: clippedStart,
            endMs: clippedEnd,
            timeLabel: `${formatTimelineTime(clippedStart)}-${formatTimelineTime(clippedEnd)}`
          };
        }).filter(shift => shift.endMs > shift.startMs);

        const boundaries = new Set();
        for (const shift of clippedShifts) {
          boundaries.add(shift.startMs);
          boundaries.add(shift.endMs);
        }

        const sortedBoundaries = [...boundaries].sort((a, b) => a - b);

        const totalMinutes = 24 * 60;
        const bars = [];

        for (let i = 0; i < sortedBoundaries.length - 1; i++) {
          const segmentStart = sortedBoundaries[i];
          const segmentEnd = sortedBoundaries[i + 1];
          if (segmentEnd <= segmentStart) continue;

          const activeShifts = clippedShifts.filter(shift => shift.startMs < segmentEnd && shift.endMs > segmentStart);
          if (activeShifts.length === 0) continue;

          const segmentScore = activeShifts.reduce((sum, shift) => sum + shift.score, 0);
          const activeSignature = activeShifts
            .map(shift => `${shift.name}:${shift.startMs}:${shift.endMs}`)
            .sort()
            .join('|');
          const startMinutes = (segmentStart - dayStartMs) / 60000;
          const endMinutes = (segmentEnd - dayStartMs) / 60000;
          const color = currentUser.value ? scoreToRgb(segmentScore) : 'rgba(238,238,238,0.9)';
          const rawHeightPercent = ((endMinutes - startMinutes) / totalMinutes) * 100;
          const topPercent = (startMinutes / totalMinutes) * 100;
          const heightPercent = Math.min(Math.max(rawHeightPercent, 0.6), 100 - topPercent);
          const lastBar = bars[bars.length - 1];

          if (lastBar && lastBar.segmentEnd === segmentStart && lastBar.color === color && lastBar.activeSignature === activeSignature) {
            lastBar.segmentEnd = segmentEnd;
            const mergedRawHeightPercent = ((((segmentEnd - dayStartMs) / 60000) - lastBar.startMinutes) / totalMinutes) * 100;
            lastBar.heightPercent = Math.min(Math.max(mergedRawHeightPercent, 0.6), 100 - lastBar.topPercent);
          } else {
            bars.push({
              activeSignature,
              activeStaffs: activeShifts
                .map(shift => ({ name: shift.name, staff_id: shift.staff_id, timeLabel: shift.timeLabel }))
                .sort((a, b) => a.name.localeCompare(b.name, 'ja')),
              color,
              segmentEnd,
              startMinutes,
              topPercent,
              heightPercent
            });
          }
        }

        return {
          shop_id: group.shop_id,
          shop_name: group.shop_name,
          bars
        };
      });
    });

    function editShift(shift) {
      editingShift.value = shift;
      modalOpen.value = false;
      document.body.classList.remove('modal-open');
      currentView.value = 'shiftEdit';
      if (staffs.value.length === 0) loadStaffs();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function canManageOwnedRecord(record) {
      if (!currentUser.value) return false;
      if (currentUser.value.role === 'admin' || currentUser.value.role === 'operator') return true;
      return record?.user_id === currentUser.value.id;
    }

    function isOperatorOrAdmin() {
      return currentUser.value?.role === 'admin' || currentUser.value?.role === 'operator';
    }

    function editStaff(staffInfo) {
      // Look up full staff data from already-loaded staffs array
      const full = staffs.value.find(st => st.id === staffInfo.id || st.id == staffInfo.id);
      editingStaff.value = full || staffInfo;
      modalOpen.value = false;
      document.body.classList.remove('modal-open');
      if (currentView.value === 'staffForm') {
        // Force re-mount when already on staffForm
        currentView.value = '';
        nextTick(() => { currentView.value = 'staffForm'; });
      } else {
        currentView.value = 'staffForm';
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function confirmDeleteStaff(staffInfo) {
      if (!confirm(`「${staffInfo.name}」を削除しますか？`)) return;
      try {
        await API.deleteStaff(staffInfo.id);
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function openShopHome(shopId) {
      modalOpen.value = false;
      timelineModalOpen.value = false;
      timelinePopup.value = null;
      document.body.classList.remove('modal-open');
      shopHomeLoading.value = true;
      shopHomeShop.value = null;
      currentView.value = 'shopHome';
      error.value = '';
      success.value = '';
      window.location.hash = `shop-${shopId}`;
    }

    function extractXUsername(rawUrl) {
      if (!rawUrl) return null;
      try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase();
        const xHosts = [ "x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.x.com", "mobile.twitter.com" ];
        if (!xHosts.includes(host)) return null;
        const username = url.pathname.split("/").filter(Boolean)[0];
        return username || null;
      } catch (e) {
        return null;
      }
    }

    function isXSiteUrl(url) {
      return !!extractXUsername(url);
    }

    function extractXStatusId(rawUrl) {
      if (!rawUrl) return null;
      try {
        const url = new URL(rawUrl);
        const host = url.hostname.toLowerCase();
        const xHosts = [ "x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.x.com", "mobile.twitter.com" ];
        if (!xHosts.includes(host)) return null;
        const match = url.pathname.match(/\/status\/(\d+)/);
        return match ? match[1] : null;
      } catch (e) {
        return null;
      }
    }

    function seatScoreUrlForDevice(url) {
      if (!url) return '';
      if (!isSmartPhone()) return url;
      const statusId = extractXStatusId(url);
      return statusId ? `twitter://status?id=${encodeURIComponent(statusId)}` : url;
    }

    function seatScoreLinkTarget(url) {
      const targetUrl = seatScoreUrlForDevice(url);
      return /^https?:\/\//.test(targetUrl) ? '_blank' : null;
    }

    function seatScoreLinkRel(url) {
      return seatScoreLinkTarget(url) ? 'noopener noreferrer' : null;
    }

    function openSiteUrl(url) {
      if (!url) return;

      const username = extractXUsername(url);
      if (!username) {
        window.open(url, "_blank", "noopener,noreferrer");
        return;
      }

      const webUrl = `https://x.com/${encodeURIComponent(username)}`;
      if (!isSmartPhone()) {
        window.open(webUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const appUrl = `twitter://user?screen_name=${encodeURIComponent(username)}`;
      window.location.href = appUrl;
    }



    // ========== Monthly Calendar (おきゅよて) ==========
    const monthlyCalendarOpen = ref(false);
    const monthlyCalendarStaff = ref(null);
    const monthlyYear = ref(new Date().getFullYear());
    const monthlyMonth = ref(new Date().getMonth() + 1);
    const monthlyShifts = ref([]);
    const monthlyEvents = ref([]);
    const monthlyLoading = ref(false);
    const monthlyMouseDown = ref(false);
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
      monthlyEvents.value = [];
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
        monthlyEvents.value = data.events || [];
      } catch (e) { monthlyShifts.value = []; monthlyEvents.value = []; }
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
        const dayEvents = [];
        for (const ev of monthlyEvents.value) {
          const start = new Date(ev.start_at);
          const end = new Date(ev.end_at);
          const dayStart = new Date(y, m - 1, d, 0, 0, 0);
          const dayEnd = new Date(y, m - 1, d, 23, 59, 59);
          if (start <= dayEnd && end >= dayStart) {
            const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            const totalDays = Math.round((endDate - startDate) / 86400000) + 1;
            const thisDate = new Date(y, m - 1, d);
            const dayNum = Math.round((thisDate - startDate) / 86400000) + 1;
            const label = totalDays > 1 ? `${ev.title}\n${dayNum}日目` : ev.title;
            const hue = (ev.id * 137) % 360;
            dayEvents.push({ id: ev.id, title: label, color: `hsla(${hue},60%,65%,0.45)` });
          }
        }
        cells.push({ day: d, current: true, isToday, shifts: dayShifts, events: dayEvents });
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

    function formatEventTimeRange(startAt, endAt) {
      if (!startAt) return '';
      const start = new Date(startAt);
      const end = endAt ? new Date(endAt) : null;
      if (!end) {
        return start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      }

      const durationMs = end.getTime() - start.getTime();
      if (durationMs > 24 * 60 * 60 * 1000) {
        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const startLabel = `${start.getMonth() + 1}月${start.getDate()}日(${days[start.getDay()]}) ${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
        const endLabel = `${end.getMonth() + 1}月${end.getDate()}日(${days[end.getDay()]}) ${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
        return `${startLabel} 〜 ${endLabel}`;
      }

      return `${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 〜 ${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    }

    function formatSeatGauge(score) {
      const normalized = Number(score) || 0;
      return normalized > 0 ? '🪑'.repeat(normalized) : '';
    }

    function isSmartPhone() {
      const ua = (navigator.userAgent || "").toLowerCase();
      const mobileLike = /iphone|ipod|android.+mobile|windows phone/.test(ua);
      const iPadOSLike = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
      return mobileLike || iPadOSLike;
    }

    function formatCalendarSeatGauge(score) {
      const normalized = Number(score) || 0;
      if (normalized <= 0) return '';
      return isSmartPhone() ? '🪑' : '🪑'.repeat(normalized);
    }

    // ========== Navigation ==========
    const authRequiredViews = ['shopForm', 'staffForm', 'shiftForm', 'shiftImportPage', 'shiftBulkForm', 'shiftEdit', 'myPage', 'eventForm', 'userList', 'checkInRating'];
    const operatorOnlyViews = ['shiftImportPage', 'shiftBulkForm'];

    // Mapping between hash fragments and view names
    const hashToView = {
      '': 'home', 'home': 'home',
      'map': 'mapView', 'login': 'login', 'register': 'register',
      'forgot-password': 'forgotPassword', 'my-page': 'myPage',
      'users': 'userList', 'shops': 'shopForm', 'staffs': 'staffForm', 'shifts': 'shiftForm', 'shift-import': 'shiftImportPage', 'shift-bulk': 'shiftBulkForm',
      'events': 'eventForm',
      'introduction': 'introduction',
      'check-in-rating': 'checkInRating'
    };
    const viewToHash = {
      'home': '', 'mapView': 'map', 'login': 'login', 'register': 'register',
      'forgotPassword': 'forgot-password', 'myPage': 'my-page',
      'userList': 'users', 'shopForm': 'shops', 'staffForm': 'staffs', 'shiftForm': 'shifts', 'shiftImportPage': 'shift-import', 'shiftBulkForm': 'shift-bulk',
      'eventForm': 'events',
      'introduction': 'introduction',
      'checkInRating': 'check-in-rating'
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
      if (operatorOnlyViews.includes(view) && !isOperatorOrAdmin()) {
        currentView.value = 'home';
        menuOpen.value = false;
        error.value = 'この機能は利用できません';
        if (updateHash) history.replaceState(null, '', window.location.pathname + window.location.search);
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
      if (view === 'home') { loadHomeData(true); window.scrollTo(0, 0); }
      if (view === 'shiftEdit') { loadShops(); }
      if (view === 'mapView') { loadShops(); }
    }

    function navigateHomeFromHeader() {
      if (currentView.value !== 'home') {
        homeSlideFromLeft.value = true;
      }
      navigate('home');
    }

    function onHomeSlideAnimationEnd() {
      homeSlideFromLeft.value = false;
    }

    async function loadConfig() {
      const key = configStorageKey();
      if (key) {
        const raw = localStorage.getItem(key);
        if (raw !== null) {
          try {
            applyConfigData(JSON.parse(raw));
          } catch (e) {
            activeCheckIn.value = null;
          }
          return;
        }
      }

      try {
        const data = await API.getConfig();
        applyConfigData(data);
        if (key) {
          localStorage.setItem(key, JSON.stringify(data || {}));
        }
      } catch (e) {
        activeCheckIn.value = null;
        // keep default
      }
    }

    function getCurrentPosition() {
      return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error('位置情報が利用できません'));
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
      });
    }

    async function performCheckIn(shopId) {
      if (!currentUser.value) {
        error.value = 'サインインしてください';
        return;
      }
      try {
        const pos = await getCurrentPosition();
        const data = await API.createCheckIn(shopId, pos.latitude, pos.longitude);
        activeCheckIn.value = data.check_in;
        success.value = `${data.check_in.shop_name} にチェックインしました`;
      } catch (e) {
        if (e && e.data && e.data.error) {
          error.value = e.data.error;
        } else if (e && e.message) {
          error.value = `現在地取得に失敗しました: ${e.message}`;
        } else {
          error.value = 'チェックインに失敗しました';
        }
      }
    }

    async function performCheckOut() {
      if (!activeCheckIn.value) return;
      try {
        const data = await API.checkOut(activeCheckIn.value.id);
        ratingCheckIn.value = data.check_in;
        ratingCandidateStaffs.value = data.staffs || [];
        activeCheckIn.value = null;
        updateCachedConfigCheckedIn(null);
        navigate('checkInRating');
      } catch (e) {
        error.value = e?.data?.error || 'チェックアウトに失敗しました';
      }
    }

    async function submitCheckInRates(payload) {
      if (!ratingCheckIn.value) return;
      try {
        await API.submitStaffRates(ratingCheckIn.value.id, payload);
        ratingCheckIn.value = null;
        ratingCandidateStaffs.value = [];
        thankYouOpen.value = true;
      } catch (e) {
        const msg = e?.data?.error;
        if (Array.isArray(msg)) {
          error.value = msg.join(', ');
        } else {
          error.value = msg || '評価の送信に失敗しました';
        }
      }
    }

    function closeThankYouModal() {
      thankYouOpen.value = false;
      navigate('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function handleHashChange() {
      const hash = window.location.hash.replace('#', '');
      const shopMatch = hash.match(/^shop-(\d+)$/);
      if (shopMatch) {
        const shopId = Number(shopMatch[1]);
        if (currentView.value !== 'shopHome' || shopHomeShop.value?.id !== shopId) {
          currentView.value = 'shopHome';
          menuOpen.value = false;
          error.value = '';
          success.value = '';
          loadShopHome(shopId);
        }
        return;
      }
      const staffMatch = hash.match(/^staff-(\d+)$/);
      if (staffMatch) {
        const staffId = Number(staffMatch[1]);
        currentView.value = 'staffHome';
        menuOpen.value = false;
        error.value = '';
        success.value = '';
        loadStaffHome(staffId);
        return;
      }
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
        const existingSub = await swReg.pushManager.getSubscription();
        const subscription = existingSub || await swReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        const subJson = subscription.toJSON();
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
      if (currentUser.value) {
        loadStaffPreferences(true);
        loadConfig();
      }

      // Handle initial hash route (e.g. #map)
      const initialHash = window.location.hash.replace('#', '');
      const initialShopMatch = initialHash.match(/^shop-(\d+)$/);
      const initialStaffMatch = initialHash.match(/^staff-(\d+)$/);
      if (initialShopMatch) {
        currentView.value = 'shopHome';
        await loadShopHome(Number(initialShopMatch[1]));
      } else if (initialStaffMatch) {
        currentView.value = 'staffHome';
        await loadStaffHome(Number(initialStaffMatch[1]));
      } else if (initialHash && hashToView[initialHash]) {
        navigate(hashToView[initialHash], false);
      } else {
        await loadHomeData(true);
      }

      refreshTimer = window.setInterval(() => {
        refreshHomeDataIfStale();
      }, HOME_DATA_REFRESH_INTERVAL_MS);

      handleVisibilityChange = () => {
        refreshHomeDataIfStale();
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
    });

    onBeforeUnmount(() => {
      if (refreshTimer) window.clearInterval(refreshTimer);
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    });

    return {
      registerPushSubscription, unregisterPushSubscription,
      resetPasswordToken,
      currentUser, currentView, menuOpen, loading, authResolved, error, success,
      homeSlideFromLeft,
      calendarYear, calendarMonth, calendarSlideDirection, homeCalendarLoading, scheduleData, selectedDate, modalOpen, timelineModalOpen,
      dayModalOriginStyle, dayModalAnimating,
      todayShops, todayShifts, todayEvents, shops, staffs, users, shopHomeShop, shopHomeStaffs, shopHomeEvents, shopHomeLoading,
      staffHomeStaff, staffHomeLoading,
      editingShift, editingStaff, editingShop, shiftFormPreset,
      handleLogin, handleRegister, handleLogout,
      prevMonth, nextMonth, calendarTitle, calendarDays,
      openDayModal, openTodayTimelineModal, selectedDayData, selectedDayEvents, selectedDayShopGroups, closeModal,
      openTimelineModal, closeTimelineModal, timelinePopup, openTimelinePopup, closeTimelinePopup, timelineHourLabels, timelineHourSlots, currentTimelineHourLabel, timelineShopColumns,
      editShift, canManageOwnedRecord, isOperatorOrAdmin,
      editStaff, confirmDeleteStaff, editShop, openShopHome, openStaffHome, openSiteUrl, isXSiteUrl,
      seatScoreUrlForDevice, seatScoreLinkTarget, seatScoreLinkRel,
      getStaffName, navigate, navigateHomeFromHeader, onHomeSlideAnimationEnd, loadShops, loadStaffs, loadUsers, loadShopHome, loadStaffHome, loadHomeData,
      loadStaffPreferences, setStaffPreference,
      loadScheduleData, loadTodayData,
      isSmartPhone,
      scoreToGradient, formatEventTimeRange, formatSeatGauge, activeSeatScoreForStaff,
      negativeScoreColor: SCORE_NEGATIVE_COLOR,
      positiveScoreColor: SCORE_POSITIVE_COLOR,
      monthlyCalendarOpen, monthlyCalendarStaff, monthlyYear, monthlyMonth,
      monthlyMonthName, monthlyShifts, monthlyLoading, monthlyCalendarCells,
      openMonthlyCalendar, closeMonthlyCalendar, changeMonth, monthlyMouseDown,
      activeCheckIn, ratingCheckIn, ratingCandidateStaffs, limitMeters, thankYouOpen,
      performCheckIn, performCheckOut, submitCheckInRates, closeThankYouModal
    };
  }
});

app.component('shop-home-page', {
  template: `
    <div class="register-container">
      <div v-if="$root.shopHomeLoading" class="loading">読み込み中</div>
      <div v-else-if="!$root.shopHomeShop" class="no-data">店舗が見つかりません</div>
      <template v-else>
        <div style="display:flex;align-items:center;gap:20px;min-width:0">
          <a
            v-if="shop.site_url"
            href="#"
            @click.prevent="$root.openSiteUrl(shop.site_url)"
            style="text-decoration:none;display:block"
            aria-label="店舗のXを開く"
          >
            <div
              style="width:150px;height:150px;border-radius:50%;border:10px solid #2a2a44;overflow:hidden;flex-shrink:0;background:#2a2a44;display:flex;align-items:center;justify-content:center"
            >
              <img
                v-if="$root.shopHomeShop.image_url"
                :src="$root.shopHomeShop.image_url"
                :alt="$root.shopHomeShop.name"
                style="width:100%;height:100%;object-fit:cover;display:block"
              >
              <div v-else style="color:#a0a0b8;font-size:0.85rem;text-align:center;padding:12px">no image</div>
            </div>
          </a>
          <div
            v-else
            style="width:150px;height:150px;border-radius:50%;border:10px solid #2a2a44;overflow:hidden;flex-shrink:0;background:#2a2a44;display:flex;align-items:center;justify-content:center"
          >
            <img
              v-if="$root.shopHomeShop.image_url"
              :src="$root.shopHomeShop.image_url"
              :alt="$root.shopHomeShop.name"
              style="width:100%;height:100%;object-fit:cover;display:block"
            >
            <div v-else style="color:#a0a0b8;font-size:0.85rem;text-align:center;padding:12px">no image</div>
          </div>
          <h2 style="margin:0;color:#f3f3ff;flex:1;min-width:0;overflow-wrap:anywhere;word-break:break-word;line-height:1.3">{{ shop.name }}</h2>
        </div>
        <div v-if="showCheckInBlock" style="margin-top:20px;text-align:center">
          <button
            class="btn-checkin"
            :disabled="!canCheckIn || checkInBusy"
            @click="handleCheckIn"
          >チェックイン</button>
          <div v-if="checkInHint" style="margin-top:8px;font-size:0.8rem;color:#a0a0b8">{{ checkInHint }}</div>
        </div>
        <div v-if="shop.address || hasCoordinates" style="margin-top:30px;text-align:left">
          <div style="margin-bottom:12px;font-size:1rem;font-weight:700;color:#f3f3ff">所在地</div>
          <div v-if="shop.address" style="margin-bottom:16px;color:#d6d6e7;line-height:1.7">
            {{ shop.address }}
          </div>
          <div
            v-if="hasCoordinates"
            id="shop-home-map"
            style="height:260px;border-radius:14px;border:1px solid #3a3a5c;overflow:hidden"
          ></div>
        </div>
        <div class="calendar-section" style="margin-top:30px">
          <div class="calendar-header">
            <button class="calendar-nav" @click="prevMonth" :disabled="monthSwitching">&laquo; 前月</button>
            <h2>{{ calendarTitle }}</h2>
            <button class="calendar-nav" @click="nextMonth" :disabled="monthSwitching">翌月 &raquo;</button>
          </div>
          <div v-if="calendarLoading" class="loading">読み込み中</div>
          <div
            v-else
            :key="calendarYear + '-' + calendarMonth"
            :class="[
              'shop-home-calendar-animated',
              calendarSlideDirection === 'prev' ? 'calendar-grid-slide-from-left' : '',
              calendarSlideDirection === 'next' ? 'calendar-grid-slide-from-right' : ''
            ]"
          >
            <div class="calendar-grid shop-home-calendar-grid">
              <div class="calendar-dow" v-for="dow in ['日','月','火','水','木','金','土']" :key="dow">{{ dow }}</div>
              <div
                v-for="(cell, idx) in calendarDays"
                :key="idx"
                class="calendar-cell shop-home-calendar-cell"
                :class="{ empty: cell.empty, 'is-today': cell.isToday }"
                :style="{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'6px', cursor: ($root.currentUser && !cell.empty) ? 'pointer' : 'default', textAlign:'center' }"
                @click="$root.currentUser && !cell.empty && onDayClick(cell)"
              >
                <template v-if="!cell.empty">
                  <div
                    class="date-num"
                    :class="{ 'weekend-date-num': $isHolidayOrWeekend(calendarYear, calendarMonth + 1, cell.day) }"
                    :style="{ position: 'static', marginBottom: '6px', borderBottom: cell.hasEvent ? '2px solid #e8d040' : 'none' }"
                  >{{ cell.day }}</div>
                  <div v-if="cell.label" class="shop-home-calendar-label">{{ cell.label }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div v-if="$root.shopHomeEvents.length > 0" style="margin-top:30px;text-align:left">
          <div style="margin-bottom:12px;font-size:1rem;font-weight:700;color:#f3f3ff">イベント</div>
          <div v-for="event in $root.shopHomeEvents" :key="event.id" class="shop-block" style="background:#1e1e38;margin-bottom:12px">
            <div style="font-size:1rem;font-weight:700;color:#f3f3ff;margin-bottom:6px">
              <a v-if="event.url" :href="event.url" target="_blank" rel="noopener noreferrer" style="color:#f3f3ff;text-decoration:none">{{ event.title }}</a>
              <template v-else>{{ event.title }}</template>
            </div>
            <div style="font-size:0.85rem;color:#d6d6e7;line-height:1.6">{{ formatEventRange(event.start_at, event.end_at) }}</div>
          </div>
        </div>
        <div style="margin-top:30px;text-align:left">
          <div style="margin-bottom:12px;font-size:1rem;font-weight:700;color:#f3f3ff">キャスト</div>
          <div v-if="$root.shopHomeStaffs.length === 0" class="no-data">キャストが未登録です</div>
          <div v-for="staff in $root.shopHomeStaffs" :key="staff.id" class="shop-block" style="background:#1e1e38;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
              <div style="display:flex;align-items:center;gap:16px;cursor:pointer;min-width:0;flex:1" @click="$root.openStaffHome(staff.id)">
                <div style="width:100px;height:100px;flex-shrink:0">
                  <img
                    v-if="staff.image_url"
                    :src="staff.image_url"
                    :alt="staff.name"
                    style="width:100px;height:100px;object-fit:cover;border-radius:50%;border:8px solid #2a2a44;background:#2a2a44;display:block"
                  >
                  <div
                    v-else
                    style="width:100px;height:100px;border-radius:50%;border:8px solid #2a2a44;background:#2a2a44;display:flex;align-items:center;justify-content:center;color:#a0a0b8;font-size:0.8rem;text-align:center"
                  >no image</div>
                </div>
                <div
                  class="cast-name-link"
                  style="font-size:1rem;font-weight:700;color:#f3f3ff"
                >{{ staff.name }}</div>
              </div>
              <button v-if="$root.canManageOwnedRecord(staff)" class="btn btn-primary btn-sm" style="white-space:nowrap;flex-shrink:0" @click="$root.editStaff(staff)">編集</button>
            </div>
            <div v-if="$root.currentUser" class="pref-slider-container" style="margin-top:12px">
              <span :style="{ fontSize: '0.75rem', color: $root.negativeScoreColor }">-10</span>
              <span class="pref-tooltip" :class="{ visible: draggingStaffId === staff.id }" :style="tooltipStyle">{{ draggingValue }}</span>
              <input type="range" class="pref-slider" min="-10" max="10" step="1"
                :value="getPreference(staff.id)"
                @input="onSliderInput(staff.id, $event)"
                @change="onSliderCommit(staff.id, $event.target.value)"
                @mousedown="draggingStaffId = staff.id"
                @touchstart="draggingStaffId = staff.id">
              <span :style="{ fontSize: '0.75rem', color: $root.positiveScoreColor }">+10</span>
              <span class="pref-value">{{ getPreference(staff.id) }}</span>
            </div>
          </div>
        </div>
        <div v-if="$root.canManageOwnedRecord(shop)" style="margin-top:30px;text-align:left">
          <div class="shop-block" style="background:#1e1e38">
            <div style="display:flex;justify-content:center">
              <button class="btn btn-primary" @click="$root.editShop(shop)">編集</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  `,
  data() {
    return {
      map: null,
      marker: null,
      currentLocationMarker: null,
      mapPopupEvents: [],
      mapPopupStaffs: [],
      popupAutoOpened: false,
      calendarYear: new Date().getFullYear(),
      calendarMonth: new Date().getMonth(),
      calendarDaysData: [],
      calendarLoading: false,
      calendarSlideDirection: null,
      monthSwitching: false,
      preferences: {},
      draggingStaffId: null,
      draggingValue: 0,
      tooltipStyle: {},
      _debounceTimers: {},
      currentPosition: null,
      positionError: null,
      checkInBusy: false
    };
  },
  computed: {
    shop() {
      return this.$root.shopHomeShop;
    },
    hasCoordinates() {
      if (!this.shop) return false;
      return this.shop.latitude !== null && this.shop.latitude !== '' && this.shop.longitude !== null && this.shop.longitude !== '';
    },
    distanceToShop() {
      if (!this.hasCoordinates || !this.currentPosition) return null;
      const R = 6371000;
      const toRad = (d) => d * Math.PI / 180;
      const lat1 = toRad(Number(this.shop.latitude));
      const lat2 = toRad(Number(this.currentPosition.latitude));
      const dLat = toRad(Number(this.currentPosition.latitude) - Number(this.shop.latitude));
      const dLng = toRad(Number(this.currentPosition.longitude) - Number(this.shop.longitude));
      const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    },
    canCheckIn() {
      if (!this.$root.currentUser) return false;
      if (!this.hasCoordinates) return false;
      if (this.$root.activeCheckIn) return false;
      if (this.currentPosition == null) return false;
      const limit = Number(this.$root.limitMeters || 50);
      return this.distanceToShop !== null && this.distanceToShop <= limit;
    },
    showCheckInBlock() {
      return !!this.$root.currentUser && this.hasCoordinates && !this.$root.activeCheckIn;
    },
    checkInHint() {
      if (!this.hasCoordinates) return '';
      const suffix = '（チェックインには位置情報が必要です）';
      switch (this.positionError) {
        case 'unsupported': return `この端末は位置情報に対応していません${suffix}`;
        case 'denied':      return `位置情報の許可が拒否されました${suffix}`;
        case 'unavailable': return `位置情報を取得できませんでした${suffix}`;
        case 'timeout':     return `位置情報の取得がタイムアウトしました${suffix}`;
        case 'unknown':     return `位置情報の取得に失敗しました${suffix}`;
      }
      if (this.currentPosition == null) return '位置情報を取得中...';
      if (this.canCheckIn) return '';
      const limit = Number(this.$root.limitMeters || 50);
      return `店舗から ${Math.round(this.distanceToShop)}m 離れています（チェックインには ${limit}m 以内が必要です）`;
    },
    calendarTitle() {
      return `${this.calendarYear}年${this.calendarMonth + 1}月`;
    },
    calendarDays() {
      const firstDay = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
      const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const dayMap = {};
      const eventDates = new Set();
      for (const day of this.calendarDaysData) {
        dayMap[day.date] = day;
      }
      for (const event of this.$root.shopHomeEvents) {
        const current = new Date(event.start_at);
        const last = new Date(event.end_at);
        current.setHours(0, 0, 0, 0);
        last.setHours(0, 0, 0, 0);

        while (current <= last) {
          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          eventDates.add(dateStr);
          current.setDate(current.getDate() + 1);
        }
      }

      const cells = [];
      for (let i = 0; i < firstDay; i++) {
        cells.push({ empty: true });
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cells.push({
          empty: false,
          day,
          label: dayMap[dateStr]?.label || '',
          hasEvent: eventDates.has(dateStr),
          isToday: dateStr === todayStr
        });
      }

      return cells;
    }
  },
  watch: {
    async shop() {
      const today = new Date();
      this.calendarYear = today.getFullYear();
      this.calendarMonth = today.getMonth();
      this.popupAutoOpened = false;
      await this.loadMapPopupData();
      this.$nextTick(() => {
        this.renderMap();
        this.loadCalendarData();
        this.loadPreferences();
        this.acquirePosition();
      });
    }
  },
  async mounted() {
    await this.loadMapPopupData();
    this.$nextTick(() => {
      this.renderMap();
      this.loadCalendarData();
      this.loadPreferences();
      this.acquirePosition();
    });
  },
  beforeUnmount() {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.marker = null;
      this.currentLocationMarker = null;
    }
  },
  methods: {
    async loadMapPopupData() {
      if (!this.shop?.id) {
        this.mapPopupEvents = [];
        this.mapPopupStaffs = [];
        return;
      }

      try {
        const data = await API.getNowSchedule(this.shop.id);
        const targetShop = (data.shops || [])[0];
        this.mapPopupEvents = targetShop?.events || [];
        this.mapPopupStaffs = targetShop?.staffs || [];
      } catch (e) {
        this.mapPopupEvents = [];
        this.mapPopupStaffs = [];
      }

      this.updateMapPopup();
    },
    acquirePosition() {
      if (!this.hasCoordinates || !this.$root.currentUser) return;
      if (!navigator.geolocation) {
        this.currentPosition = null;
        this.positionError = 'unsupported';
        return;
      }
      this.currentPosition = null;
      this.positionError = null;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.currentPosition = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          this.positionError = null;
        },
        (err) => {
          this.currentPosition = null;
          switch (err && err.code) {
            case 1: this.positionError = 'denied'; break;
            case 2: this.positionError = 'unavailable'; break;
            case 3: this.positionError = 'timeout'; break;
            default: this.positionError = 'unknown';
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    },
    async handleCheckIn() {
      if (this.checkInBusy) return;
      this.checkInBusy = true;
      try {
        await this.$root.performCheckIn(this.shop.id);
      } finally {
        this.checkInBusy = false;
      }
    },
    getPreference(staffId) {
      return this.preferences[staffId] !== undefined ? this.preferences[staffId] : 0;
    },
    async loadPreferences() {
      if (!this.$root.currentUser) {
        this.preferences = {};
        return;
      }
      try {
        this.preferences = await this.$root.loadStaffPreferences();
      } catch (e) { /* ignore */ }
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
        this.preferences = await this.$root.setStaffPreference(staffId, parseInt(score));
      } catch (e) { /* ignore */ }
    },
    formatEventRange(startAt, endAt) {
      const start = new Date(startAt);
      const end = new Date(endAt);
      const startLabel = `${start.getMonth() + 1}月${start.getDate()}日(${['日','月','火','水','木','金','土'][start.getDay()]}) ${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      const endLabel = `${end.getMonth() + 1}月${end.getDate()}日(${['日','月','火','水','木','金','土'][end.getDay()]}) ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
      return `${startLabel} 〜 ${endLabel}`;
    },
    onDayClick(cell) {
      const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
      this.$root.shiftFormPreset = {
        shopId: this.shop.id,
        staffId: null,
        date: dateStr
      };
      this.$root.navigate('shiftForm');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    async loadCalendarData() {
      if (!this.shop?.id) {
        this.calendarDaysData = [];
        return;
      }

      this.calendarLoading = true;
      try {
        const data = await API.getShopMonthlyShifts(this.shop.id, this.calendarYear, this.calendarMonth + 1);
        this.calendarDaysData = data.days || [];
        this.$root.shopHomeEvents = data.events || [];
      } catch (e) {
        this.calendarDaysData = [];
        this.$root.shopHomeEvents = [];
      }
      this.calendarLoading = false;
    },
    async prevMonth() {
      if (this.monthSwitching) return;
      if (!this.shop?.id) return;
      this.monthSwitching = true;
      const target = this.calendarMonth === 0
        ? { year: this.calendarYear - 1, month: 11 }
        : { year: this.calendarYear,     month: this.calendarMonth - 1 };
      try {
        const data = await API.getShopMonthlyShifts(this.shop.id, target.year, target.month + 1);
        this.calendarSlideDirection = 'prev';
        this.calendarYear = target.year;
        this.calendarMonth = target.month;
        this.calendarDaysData = data.days || [];
        this.$root.shopHomeEvents = data.events || [];
      } catch (e) {
        // 失敗時は現在の月を維持してチラつかせない
      } finally {
        this.monthSwitching = false;
      }
    },
    async nextMonth() {
      if (this.monthSwitching) return;
      if (!this.shop?.id) return;
      this.monthSwitching = true;
      const target = this.calendarMonth === 11
        ? { year: this.calendarYear + 1, month: 0 }
        : { year: this.calendarYear,     month: this.calendarMonth + 1 };
      try {
        const data = await API.getShopMonthlyShifts(this.shop.id, target.year, target.month + 1);
        this.calendarSlideDirection = 'next';
        this.calendarYear = target.year;
        this.calendarMonth = target.month;
        this.calendarDaysData = data.days || [];
        this.$root.shopHomeEvents = data.events || [];
      } catch (e) {
        // 失敗時は現在の月を維持してチラつかせない
      } finally {
        this.monthSwitching = false;
      }
    },
    renderMap() {
      if (!this.hasCoordinates || !window.L) {
        if (this.map) {
          this.map.remove();
          this.map = null;
          this.marker = null;
          this.currentLocationMarker = null;
        }
        return;
      }

      const mapEl = document.getElementById('shop-home-map');
      if (!mapEl) return;

      const lat = parseFloat(this.shop.latitude);
      const lng = parseFloat(this.shop.longitude);
      if (Number.isNaN(lat) || Number.isNaN(lng)) return;

      if (this.map) {
        this.map.setView([lat, lng], 16);
        if (this.marker) {
          this.marker.setLatLng([lat, lng]);
        } else {
          this.marker = L.marker([lat, lng]).addTo(this.map);
        }
        this.updateMapPopup();
        if (!this.popupAutoOpened) {
          this.marker.openPopup();
          this.popupAutoOpened = true;
        }
        return;
      }

      this.map = L.map('shop-home-map', {
        zoomControl: true,
        dragging: true,
        scrollWheelZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        tap: true,
        touchZoom: true
      }).setView([lat, lng], 16);

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(this.map);

      this.marker = L.marker([lat, lng]).addTo(this.map);
      this.updateMapPopup();
      this.marker.openPopup();
      this.popupAutoOpened = true;
      this.getCurrentLocation();
    },
    updateMapPopup() {
      if (!this.marker || !this.shop) return;

      let popupHtml = '<strong><a href="#shop-' + this.shop.id + '" style="color:#000;text-decoration:none">' + this.escapeHtml(this.shop.name) + '</a></strong>';

      if (this.mapPopupEvents.length > 0) {
        popupHtml += '<hr style="margin:6px 0;border:none;border-top:1px solid #3a3a5c">';
        popupHtml += '<div style="font-size:0.8rem;color:#000;font-weight:bold">開催中のイベント</div>';
        for (const ev of this.mapPopupEvents) {
          popupHtml += '<div style="font-size:0.8rem">';
          if (ev.url) {
            popupHtml += '<a href="' + this.escapeHtml(ev.url) + '" target="_blank" rel="noopener" style="color:#000;text-decoration:none">' + this.escapeHtml(ev.title) + '</a>';
          } else {
            popupHtml += this.escapeHtml(ev.title);
          }
          popupHtml += '</div>';
        }
      }

      if (this.mapPopupStaffs.length > 0) {
        popupHtml += '<hr style="margin:6px 0;border:none;border-top:1px solid #3a3a5c">';
        popupHtml += '<div style="font-size:0.8rem;color:#000;font-weight:bold">シフト中</div>';
        for (const shift of this.mapPopupStaffs) {
          const startTime = new Date(shift.start_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          const endTime = new Date(shift.end_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
          popupHtml += '<div style="font-size:0.8rem">' + this.escapeHtml(shift.name) + ' <span style="color:#a0a0b8">' + startTime + '-' + endTime + '</span></div>';
        }
      }

      if (this.currentPosition && this.hasCoordinates) {
        const origin = this.currentPosition.latitude + ',' + this.currentPosition.longitude;
        const destination = this.shop.latitude + ',' + this.shop.longitude;
        popupHtml += '<div style="margin-top:6px"><a href="https://www.google.com/maps/dir/?api=1&origin=' + origin + '&destination=' + destination + '&travelmode=walking" target="_blank" rel="noopener" style="font-size:0.8rem;color:#a29bfe;text-decoration:none">Google Mapsでナビ</a></div>';
      }

      this.marker.bindPopup(popupHtml);
    },
    getCurrentLocation() {
      if (!navigator.geolocation || !this.map) return;

      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!this.map) return;

          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          this.currentPosition = { latitude: lat, longitude: lng };
          const currentIcon = L.divIcon({
            className: 'current-location-marker',
            html: '<div style="width:16px;height:16px;background:#4285f4;border:3px solid #7ab8ff;border-radius:50%;box-shadow:0 0 6px rgba(66,133,244,0.6)"></div>',
            iconSize: [22, 22],
            iconAnchor: [11, 11]
          });

          if (this.currentLocationMarker) {
            this.currentLocationMarker.setLatLng([lat, lng]);
          } else {
            this.currentLocationMarker = L.marker([lat, lng], { icon: currentIcon, zIndexOffset: 1000 })
              .addTo(this.map)
              .bindPopup('現在地');
          }
          this.updateMapPopup();
        },
        () => {},
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

// ========== Staff Home Component ==========
app.component('staff-home-page', {
  template: `
    <div class="register-container">
      <div v-if="$root.staffHomeLoading" class="loading">読み込み中</div>
      <div v-else-if="!$root.staffHomeStaff" class="no-data">キャストが見つかりません</div>
      <template v-else>
        <div style="display:flex;align-items:center;gap:20px;min-width:0">
          <a
            v-if="staff.site_url"
            href="#"
            @click.prevent="$root.openSiteUrl(staff.site_url)"
            style="text-decoration:none;display:block"
            aria-label="キャストのXを開く"
          >
            <div
              style="width:150px;height:150px;border-radius:50%;border:10px solid #2a2a44;overflow:hidden;flex-shrink:0;background:#2a2a44;display:flex;align-items:center;justify-content:center"
            >
              <img
                v-if="staff.image_url"
                :src="staff.image_url"
                :alt="staff.name"
                style="width:100%;height:100%;object-fit:cover;display:block"
              >
              <div v-else style="color:#a0a0b8;font-size:0.85rem;text-align:center;padding:12px">no image</div>
            </div>
          </a>
          <div
            v-else
            style="width:150px;height:150px;border-radius:50%;border:10px solid #2a2a44;overflow:hidden;flex-shrink:0;background:#2a2a44;display:flex;align-items:center;justify-content:center"
          >
            <img
              v-if="staff.image_url"
              :src="staff.image_url"
              :alt="staff.name"
              style="width:100%;height:100%;object-fit:cover;display:block"
            >
            <div v-else style="color:#a0a0b8;font-size:0.85rem;text-align:center;padding:12px">no image</div>
          </div>
          <div style="flex:1;min-width:0">
            <div v-if="overallRateStars > 0" class="rating-stars" style="font-size:1.1rem;margin-bottom:4px">
              <span v-for="n in 5" :key="n" class="rating-star" :class="{ filled: overallRateStars >= n }">{{ overallRateStars >= n ? '★' : '☆' }}</span>
            </div>
            <h2 style="margin:0;color:#f3f3ff;overflow-wrap:anywhere;word-break:break-word;line-height:1.3">{{ staff.name }}</h2>
            <div v-if="staff.shop_name" class="cast-name-link" style="margin-top:6px;font-size:0.85rem;color:#a0a0b8" @click.stop.prevent="$root.openShopHome(staff.shop_id)">{{ staff.shop_name }}</div>
          </div>
        </div>
        <div v-if="$root.currentUser" style="margin-top:24px">
          <div class="pref-slider-container" style="justify-content:center">
            <span :style="{ fontSize: '0.75rem', color: $root.negativeScoreColor }">-10</span>
            <span class="pref-tooltip" :class="{ visible: prefDragging }" :style="prefTooltipStyle">{{ prefDraggingValue }}</span>
            <input type="range" class="pref-slider" min="-10" max="10" step="1"
              :value="preference"
              @input="onSliderInput($event)"
              @change="onSliderCommit($event.target.value)"
              @mousedown="prefDragging = true"
              @touchstart="prefDragging = true">
            <span :style="{ fontSize: '0.75rem', color: $root.positiveScoreColor }">+10</span>
            <span class="pref-value">{{ preference }}</span>
          </div>
        </div>
        <div class="calendar-section" style="margin-top:30px">
          <div class="calendar-header">
            <button class="calendar-nav" @click="prevMonth" :disabled="monthSwitching">&laquo; 前月</button>
            <h2>{{ calendarTitle }}</h2>
            <button class="calendar-nav" @click="nextMonth" :disabled="monthSwitching">翌月 &raquo;</button>
          </div>
          <div v-if="calendarLoading" class="loading">読み込み中</div>
          <div
            v-else
            :key="calendarYear + '-' + calendarMonth"
            :class="[
              'shop-home-calendar-animated',
              calendarSlideDirection === 'prev' ? 'calendar-grid-slide-from-left' : '',
              calendarSlideDirection === 'next' ? 'calendar-grid-slide-from-right' : ''
            ]"
          >
            <div class="calendar-grid shop-home-calendar-grid">
              <div class="calendar-dow" v-for="dow in ['日','月','火','水','木','金','土']" :key="dow">{{ dow }}</div>
              <div
                v-for="(cell, idx) in calendarDays"
                :key="idx"
                class="calendar-cell shop-home-calendar-cell"
                :class="{ empty: cell.empty, 'is-today': cell.isToday }"
                :style="{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'6px', cursor: ($root.currentUser && !cell.empty && cell.shifts.length === 0) ? 'pointer' : 'default', textAlign:'center' }"
                @click="$root.currentUser && !cell.empty && cell.shifts.length === 0 && onEmptyDayClick(cell)"
              >
                <template v-if="!cell.empty">
                  <div
                    class="date-num"
                    :class="{ 'weekend-date-num': $isHolidayOrWeekend(calendarYear, calendarMonth + 1, cell.day) }"
                    :style="{ position: 'static', marginBottom: '6px', borderBottom: cell.hasEvent ? '2px solid #e8d040' : 'none' }"
                  >{{ cell.day }}</div>
                  <div v-for="shift in cell.shifts" :key="shift.id"
                    :class="['shop-home-calendar-label', { 'cast-name-link': $root.currentUser }]"
                    @click.stop="$root.currentUser && onShiftClick(shift)"
                  >{{ formatShiftTime(shift) }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>
        <div v-if="hasRateSummary" style="margin-top:30px;text-align:left">
          <div style="margin-bottom:12px;font-size:1rem;font-weight:700;color:#f3f3ff">みんなの評価</div>
          <table class="rate-summary-table" style="width:100%;border-collapse:collapse">
            <tbody>
              <tr v-for="row in rateSummaryRows" :key="row.label" style="border-bottom:1px solid #3a3a5c">
                <td style="padding:10px 8px;color:#d6d6e7;font-size:0.9rem">{{ row.label }}</td>
                <td style="padding:10px 8px;text-align:right">
                  <span class="rating-stars" style="font-size:1.1rem">
                    <span v-for="n in 5" :key="n" class="rating-star" :class="{ filled: row.stars >= n }">{{ row.stars >= n ? '★' : '☆' }}</span>
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-if="calendarEvents.length > 0" style="margin-top:30px;text-align:left">
          <div style="margin-bottom:12px;font-size:1rem;font-weight:700;color:#f3f3ff">イベント</div>
          <div v-for="event in calendarEvents" :key="event.id" class="shop-block" style="background:#1e1e38;margin-bottom:12px">
            <div style="font-size:1rem;font-weight:700;color:#f3f3ff;margin-bottom:6px">
              <a v-if="event.url" :href="event.url" target="_blank" rel="noopener noreferrer" style="color:#f3f3ff;text-decoration:none">{{ event.title }}</a>
              <template v-else>{{ event.title }}</template>
            </div>
            <div style="font-size:0.85rem;color:#d6d6e7;line-height:1.6">{{ formatEventRange(event.start_at, event.end_at) }}</div>
          </div>
        </div>
        <div v-if="$root.isXSiteUrl(staff.site_url)" style="margin-top:30px;text-align:left">
          <div style="margin-bottom:12px;font-size:1rem;font-weight:700;color:#f3f3ff">最近のポスト</div>
          <div class="recent-tweets-root" :data-staff-id="staff.id" data-limit="3"></div>
        </div>
        <div style="margin-top:30px;text-align:left">
          <div class="shop-block" style="background:#1e1e38">
            <div class="staff-detail-actions" style="display:flex;justify-content:center;gap:12px;flex-wrap:wrap">
              <button class="btn btn-outline btn-sm" @click="$root.openMonthlyCalendar(staff)">おきゅよて</button>
              <button v-if="$root.canManageOwnedRecord(staff)" class="btn btn-primary" @click="$root.editStaff(staff)">編集</button>
              <button v-if="$root.canManageOwnedRecord(staff)" class="btn btn-danger btn-sm" @click="$root.confirmDeleteStaff(staff)">削除</button>
            </div>
          </div>
        </div>
      </template>
    </div>
  `,
  data() {
    return {
      calendarYear: new Date().getFullYear(),
      calendarMonth: new Date().getMonth(),
      calendarDaysData: [],
      calendarEvents: [],
      calendarLoading: false,
      calendarSlideDirection: null,
      monthSwitching: false,
      preference: 0,
      prefDragging: false,
      prefDraggingValue: 0,
      prefTooltipStyle: {},
      _prefDebounceTimer: null
    };
  },
  computed: {
    staff() {
      return this.$root.staffHomeStaff;
    },
    overallRateStars() {
      return this.starsFor('overall_rate_total');
    },
    hasRateSummary() {
      if (!this.$root.currentUser || !this.staff) return false;
      return (Number(this.staff.check_in_count) || 0) > 0;
    },
    rateSummaryRows() {
      return RATE_LABELS.map(r => ({
        label: r.label,
        stars: this.starsFor(`${r.key}_total`)
      }));
    },
    calendarTitle() {
      return `${this.calendarYear}年${this.calendarMonth + 1}月`;
    },
    calendarDays() {
      const firstDay = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
      const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const dayMap = {};
      const eventDates = new Set();
      for (const day of this.calendarDaysData) {
        dayMap[day.date] = day;
      }
      for (const event of this.calendarEvents) {
        const current = new Date(event.start_at);
        const last = new Date(event.end_at);
        current.setHours(0, 0, 0, 0);
        last.setHours(0, 0, 0, 0);
        while (current <= last) {
          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          eventDates.add(dateStr);
          current.setDate(current.getDate() + 1);
        }
      }
      const cells = [];
      for (let i = 0; i < firstDay; i++) {
        cells.push({ empty: true });
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cells.push({
          empty: false,
          day,
          label: dayMap[dateStr]?.label || '',
          shifts: dayMap[dateStr]?.shifts || [],
          hasEvent: eventDates.has(dateStr),
          isToday: dateStr === todayStr
        });
      }
      return cells;
    }
  },
  watch: {
    staff: {
      immediate: true,
      async handler() {
        if (!this.staff) {
          this.preference = 0;
          return;
        }
        const today = new Date();
        this.calendarYear = today.getFullYear();
        this.calendarMonth = today.getMonth();

        let initialPreference = Number(this.staff.staff_preference_score ?? 0);
        if (this.$root.currentUser) {
          try {
            const cached = await this.$root.loadStaffPreferences();
            const cachedValue = cached?.[String(this.staff.id)];
            if (cachedValue !== undefined) initialPreference = Number(cachedValue) || 0;
          } catch (e) {
            // ignore
          }
        }
        this.preference = initialPreference;
        this.$nextTick(() => {
          this.loadCalendarData();
        });
      }
    }
  },
  methods: {
    starsFor(field) {
      if (!this.$root.currentUser || !this.staff) return 0;
      const count = Number(this.staff.check_in_count) || 0;
      if (count <= 0) return 0;
      const total = Number(this.staff[field]) || 0;
      const avg = total / count;
      if (avg >= 4.5) return 5;
      if (avg >= 3.5) return 4;
      if (avg >= 2.5) return 3;
      if (avg >= 1.5) return 2;
      return 1;
    },
    async loadCalendarData() {
      if (!this.staff?.id) {
        this.calendarDaysData = [];
        this.calendarEvents = [];
        return;
      }
      this.calendarLoading = true;
      try {
        const data = await API.getStaffMonthlyShifts(this.staff.id, this.calendarYear, this.calendarMonth + 1);
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        this.calendarDaysData = [];
        this.calendarEvents = [];
      }
      this.calendarLoading = false;
    },
    _buildCalendarDays(data) {
      const shifts = data.staff_shifts || [];
      const dayEntries = {};
      for (const shift of shifts) {
        const start = new Date(shift.start_at);
        const end = new Date(shift.end_at);
        const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        const sh = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
        const eh = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
        if (!dayEntries[dateStr]) dayEntries[dateStr] = { labels: [], shifts: [] };
        dayEntries[dateStr].labels.push(`${sh}-${eh}`);
        dayEntries[dateStr].shifts.push(shift);
      }
      return Object.entries(dayEntries).map(([date, entry]) => ({
        date, label: entry.labels.join('\n'), shifts: entry.shifts
      }));
    },
    onSliderInput(event) {
      const val = parseInt(event.target.value);
      this.prefDragging = true;
      this.prefDraggingValue = val;
      this.preference = val;
      const slider = event.target;
      const rect = slider.getBoundingClientRect();
      const ratio = (val - (-10)) / 20;
      const thumbX = rect.left + ratio * rect.width;
      const containerRect = slider.closest('.pref-slider-container').getBoundingClientRect();
      this.prefTooltipStyle = { left: (thumbX - containerRect.left) + 'px' };
      if (this._prefDebounceTimer) clearTimeout(this._prefDebounceTimer);
      this._prefDebounceTimer = setTimeout(() => {
        this.savePreference(val);
        this.prefDragging = false;
      }, 2000);
    },
    onSliderCommit(value) {
      const val = parseInt(value);
      this.preference = val;
      if (this._prefDebounceTimer) clearTimeout(this._prefDebounceTimer);
      this.prefDragging = false;
      this.savePreference(val);
    },
    async savePreference(score) {
      try {
        await this.$root.setStaffPreference(this.staff.id, parseInt(score));
      } catch (e) { /* ignore */ }
    },
    formatShiftTime(shift) {
      const start = new Date(shift.start_at);
      const end = new Date(shift.end_at);
      const sh = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
      const eh = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
      return `${sh}\n${eh}`;
    },
    onShiftClick(shift) {
      this.$root.editShift(shift);
    },
    onEmptyDayClick(cell) {
      const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
      this.$root.shiftFormPreset = {
        shopId: this.staff.shop_id,
        staffId: this.staff.id,
        date: dateStr
      };
      this.$root.navigate('shiftForm');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    async prevMonth() {
      if (this.monthSwitching) return;
      if (!this.staff?.id) return;
      this.monthSwitching = true;
      const target = this.calendarMonth === 0
        ? { year: this.calendarYear - 1, month: 11 }
        : { year: this.calendarYear,     month: this.calendarMonth - 1 };
      try {
        const data = await API.getStaffMonthlyShifts(this.staff.id, target.year, target.month + 1);
        this.calendarSlideDirection = 'prev';
        this.calendarYear = target.year;
        this.calendarMonth = target.month;
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        // 失敗時は現在の月を維持してチラつかせない
      } finally {
        this.monthSwitching = false;
      }
    },
    async nextMonth() {
      if (this.monthSwitching) return;
      if (!this.staff?.id) return;
      this.monthSwitching = true;
      const target = this.calendarMonth === 11
        ? { year: this.calendarYear + 1, month: 0 }
        : { year: this.calendarYear,     month: this.calendarMonth + 1 };
      try {
        const data = await API.getStaffMonthlyShifts(this.staff.id, target.year, target.month + 1);
        this.calendarSlideDirection = 'next';
        this.calendarYear = target.year;
        this.calendarMonth = target.month;
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        // 失敗時は現在の月を維持してチラつかせない
      } finally {
        this.monthSwitching = false;
      }
    },
    formatEventRange(startAt, endAt) {
      const start = new Date(startAt);
      const end = new Date(endAt);
      const dow = ['日','月','火','水','木','金','土'];
      const startLabel = `${start.getMonth() + 1}月${start.getDate()}日(${dow[start.getDay()]}) ${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`;
      const endLabel = `${end.getMonth() + 1}月${end.getDate()}日(${dow[end.getDay()]}) ${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
      return `${startLabel} 〜 ${endLabel}`;
    }
  }
});

// ========== Introduction Component (async) ==========
app.component('introduction-page', defineAsyncComponent(() =>
  fetch('/introduction.html').then(r => r.text()).then(html => ({ template: html }))
));

// ========== Check-In Rating Component ==========
app.component('check-in-rating-page', {
  template: `
    <div class="register-container">
      <div v-if="!$root.ratingCheckIn" class="no-data">評価対象のチェックインがありません</div>
      <template v-else>
        <h2>チェックアウトしました</h2>
        <template v-if="$root.ratingCandidateStaffs.length === 0">
          <div class="form-actions" style="margin-top:24px">
            <button class="btn btn-outline" @click="goBack">戻る</button>
          </div>
        </template>
        <template v-else>
          <p style="color:#d6d6e7;font-size:0.9rem;line-height:1.6;margin:12px 0 20px">
            本日の {{ $root.ratingCheckIn.shop_name }} はいかがでしたか。よろしければ5点満点での簡単なアンケートにご協力ください。
          </p>
          <div v-for="staff in $root.ratingCandidateStaffs" :key="staff.id" class="rating-staff-block">
            <div class="rating-staff-header">
              <div v-if="staff.image_url" :style="{ width:'64px', height:'64px', borderRadius:'50%', overflow:'hidden', flexShrink:0 }">
                <img :src="staff.image_url" :alt="staff.name" style="width:100%;height:100%;object-fit:cover;display:block">
              </div>
              <div v-else :style="{ width:'64px', height:'64px', borderRadius:'50%', background:'#2a2a44', flexShrink:0 }"></div>
              <div class="rating-staff-name">{{ staff.name }}</div>
            </div>
            <div v-for="row in rows" :key="row.key" class="rating-row">
              <div class="rating-row-label">{{ row.label }}</div>
              <div class="rating-stars" role="radiogroup" :aria-label="row.label">
                <span
                  v-for="n in 5"
                  :key="n"
                  class="rating-star"
                  :class="{ filled: getRate(staff.id, row.key) >= n }"
                  @click="setRate(staff.id, row.key, n)"
                  role="radio"
                  :aria-checked="getRate(staff.id, row.key) === n"
                >{{ getRate(staff.id, row.key) >= n ? '★' : '☆' }}</span>
              </div>
            </div>
          </div>
          <div class="form-actions" style="margin-top:24px">
            <button class="btn btn-primary" @click="submit" :disabled="submitting">
              {{ submitting ? '送信中...' : '送信' }}
            </button>
          </div>
        </template>
      </template>
    </div>
  `,
  data() {
    return {
      rows: RATE_LABELS,
      ratesByStaff: {},
      submitting: false
    };
  },
  watch: {
    '$root.ratingCandidateStaffs': {
      immediate: true,
      handler(list) {
        const next = {};
        for (const s of (list || [])) {
          next[s.id] = {
            overall_rate: 2,
            appearance_rate: 2,
            service_rate: 2,
            mood_rate: 2
          };
        }
        this.ratesByStaff = next;
      }
    }
  },
  mounted() {
    if (!this.$root.ratingCheckIn) {
      this.$root.navigate('home');
    }
  },
  methods: {
    getRate(staffId, key) {
      return this.ratesByStaff[staffId]?.[key] ?? 0;
    },
    setRate(staffId, key, value) {
      if (!this.ratesByStaff[staffId]) {
        this.ratesByStaff[staffId] = { overall_rate: 2, appearance_rate: 2, service_rate: 2, mood_rate: 2 };
      }
      this.ratesByStaff[staffId][key] = value;
    },
    async submit() {
      if (this.submitting) return;
      this.submitting = true;
      const payload = [];
      for (const staff of this.$root.ratingCandidateStaffs) {
        const r = this.ratesByStaff[staff.id] || {};
        payload.push({
          staff_id: staff.id,
          overall_rate: r.overall_rate ?? 0,
          appearance_rate: r.appearance_rate ?? 0,
          service_rate: r.service_rate ?? 0,
          mood_rate: r.mood_rate ?? 0
        });
      }
      try {
        await this.$root.submitCheckInRates(payload);
      } finally {
        this.submitting = false;
      }
    },
    formatRange(startIso, endIso) {
      if (!startIso) return '';
      const start = new Date(startIso);
      const end = endIso ? new Date(endIso) : null;
      const fmt = (d) => `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      return end ? `${fmt(start)} 〜 ${fmt(end)}` : fmt(start);
    },
    goBack() {
      this.$root.ratingCheckIn = null;
      this.$root.ratingCandidateStaffs = [];
      this.$root.navigate('home');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
        <label>サイトURL (𝕏)</label>
        <input v-model="form.site_url" type="url" placeholder="https://x.com/xxx">
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
            新規登録へ
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
                  <div class="shop-block-name cast-name-link" @click="$root.openShopHome(shop.id)">{{ shop.name }}</div>
                  <div v-if="shop.site_url" style="font-size:0.8rem;color:#a0a0b8">{{ shop.site_url }}</div>
          </div>
          <div v-if="$root.canManageOwnedRecord(shop)" style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" @click="editExistingShop(shop)">編集</button>
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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

app.component('user-list-page', {
  template: `
    <div class="register-container">
      <h2>ユーザー管理</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>

      <template v-if="editMode">
        <h3 style="margin-bottom:12px">ユーザー編集</h3>
        <div class="form-group">
          <label>メールアドレス</label>
          <input v-model="form.email" type="email" disabled>
        </div>
        <div class="form-group">
          <label>ニックネーム</label>
          <input v-model="form.nickname" type="text" placeholder="ニックネーム">
        </div>
        <div class="form-group">
          <label>ロール</label>
          <select v-model="form.role">
            <option value="admin">admin</option>
            <option value="operator">operator</option>
            <option value="user">user</option>
          </select>
        </div>
        <div class="form-actions" style="display:flex;gap:8px;margin-bottom:16px">
          <button class="btn btn-primary" @click="updateUser" :disabled="submitting">
            {{ submitting ? '更新中...' : '更新' }}
          </button>
        </div>
      </template>
      <div v-else class="no-data" style="margin-bottom:16px">登録済みユーザーから編集対象を選択してください</div>

      <h3 style="margin-bottom:12px">登録済みユーザー</h3>
      <div v-if="$root.users.length === 0" class="no-data">ユーザーがありません</div>
      <div v-for="user in $root.users" :key="user.id" class="shop-block" style="background:#1e1e38">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="shop-block-name">{{ user.nickname || 'ニックネーム未設定' }}</div>
            <div style="font-size:0.8rem;color:#a0a0b8">{{ user.email }}</div>
            <div style="font-size:0.8rem;color:#a0a0b8">role: {{ user.role }}</div>
          </div>
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" @click="editExistingUser(user)">編集</button>
            <button v-if="user.id !== $root.currentUser.id" class="btn btn-danger btn-sm" @click="deleteUserWithConfirm(user)">削除</button>
          </div>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-top:16px" v-if="showPrev || showNext">
        <button v-if="showPrev" class="btn btn-secondary btn-sm" @click="goPrev">prev</button>
        <div v-else></div>
        <button v-if="showNext" class="btn btn-secondary btn-sm" @click="goNext">next</button>
      </div>
    </div>
  `,
  data() {
    return {
      form: { email: '', nickname: '', role: 'user' },
      editMode: false,
      editUserId: null,
      currentPage: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      submitting: false,
      localError: '',
      localSuccess: ''
    };
  },
  computed: {
    showPrev() {
      return this.currentPage > 1;
    },
    showNext() {
      return this.$root.users.length === this.pageSize;
    }
  },
  async mounted() {
    await this.$root.loadUsers(this.currentPage, this.pageSize);
  },
  methods: {
    editExistingUser(user) {
      this.editMode = true;
      this.editUserId = user.id;
      this.form = {
        email: user.email || '',
        nickname: user.nickname || '',
        role: user.role
      };
      this.localError = '';
      this.localSuccess = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelEdit() {
      this.editMode = false;
      this.editUserId = null;
      this.form = { email: '', nickname: '', role: 'user' };
      this.localError = '';
      this.localSuccess = '';
    },
    async updateUser() {
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.updateUser(this.editUserId, this.form);
        this.localSuccess = '更新しました';
        this.cancelEdit();
        this.localSuccess = '更新しました';
        await this.$root.loadUsers(this.currentPage, this.pageSize);
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || e.data?.error || '更新に失敗しました';
      }
      this.submitting = false;
    },
    async deleteUserWithConfirm(user) {
      if (!confirm('削除しますか？')) return;
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.deleteUser(user.id);
        this.localSuccess = '削除しました';
        if (this.editUserId === user.id) this.cancelEdit();
        await this.$root.loadUsers(this.currentPage, this.pageSize);
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || e.data?.error || '削除に失敗しました';
      }
      this.submitting = false;
    },
    async goPrev() {
      if (this.currentPage <= 1) return;
      this.currentPage -= 1;
      await this.$root.loadUsers(this.currentPage, this.pageSize);
    },
    async goNext() {
      this.currentPage += 1;
      await this.$root.loadUsers(this.currentPage, this.pageSize);
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
        <label>キャスト名</label>
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
        <label>サイトURL (𝕏なら自動更新されます)</label>
        <input v-model="form.site_url" type="url" placeholder="https://x.com/zzzz">
      </div>
      <div class="form-group">
        <label>画像URL</label>
        <input v-model="form.image_url" type="url" placeholder="https://...">
      </div>
      <div class="form-actions" style="margin-bottom:16px" :style="editMode ? 'display:flex;gap:8px' : ''">
        <template v-if="editMode">
          <button class="btn btn-primary" @click="updateStaff()" :disabled="submitting" style="flex:1">
            {{ submitting ? '更新中...' : '更新' }}
          </button>
          <button class="btn btn-danger" @click="deleteStaff({ id: editStaffId, name: form.name })" :disabled="submitting" style="flex:1">
            削除
          </button>
          <button class="btn btn-secondary" @click="cancelEdit" style="flex:1">
            新規登録へ
          </button>
        </template>
        <template v-else>
          <button class="btn btn-primary" @click="createStaff()" :disabled="submitting">
            {{ submitting ? '登録中...' : 'キャストを登録' }}
          </button>
        </template>
      </div>

      <h3 style="margin-bottom:12px">登録済みキャスト</h3>
      <div class="form-group">
        <label>店舗で絞り込み</label>
        <select v-model="filterShopId" @change="loadFilteredStaffs">
          <option v-for="shop in $root.shops" :key="shop.id" :value="shop.id">{{ shop.name }}</option>
        </select>
      </div>
      <div v-if="filteredStaffs.length === 0" class="no-data">キャストがいません</div>
      <div v-for="staff in filteredStaffs" :key="staff.id" class="shop-block" style="background:#1e1e38">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div style="min-width:0;flex:1">
            <div class="shop-block-name cast-name-link" @click="$root.openStaffHome(staff.id)">{{ staff.name }}</div>
            <div class="cast-name-link" style="font-size:0.8rem;color:#a0a0b8" @click="$root.openShopHome(staff.shop_id)">{{ getShopName(staff.shop_id) }}</div>
          </div>
          <button v-if="$root.canManageOwnedRecord(staff)" class="btn btn-primary btn-sm" style="white-space:nowrap;flex-shrink:0" @click="startEdit(staff)">編集</button>
        </div>
        <div v-if="$root.currentUser" class="pref-slider-container" style="margin-top:12px">
          <span :style="{ fontSize: '0.75rem', color: negativeScoreColor }">-10</span>
          <span class="pref-tooltip" :class="{ visible: draggingStaffId === staff.id }" :style="tooltipStyle">{{ draggingValue }}</span>
          <input type="range" class="pref-slider" min="-10" max="10" step="1"
            :value="getPreference(staff.id)"
            @input="onSliderInput(staff.id, $event)"
            @change="onSliderCommit(staff.id, $event.target.value)"
            @mousedown="draggingStaffId = staff.id"
            @touchstart="draggingStaffId = staff.id">
          <span :style="{ fontSize: '0.75rem', color: positiveScoreColor }">+10</span>
          <span class="pref-value">{{ getPreference(staff.id) }}</span>
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
    this.resetFilterShopId();
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
    resetFilterShopId() {
      if (this.$root.shops.length === 0) {
        this.filterShopId = '';
        return;
      }
      const shopIds = this.$root.shops
        .map(shop => Number(shop.id))
        .filter(id => !Number.isNaN(id))
        .sort((a, b) => a - b);
      this.filterShopId = shopIds.length > 0 ? String(shopIds[0]) : '';
    },
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
        this.preferences = await this.$root.loadStaffPreferences();
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
        this.preferences = await this.$root.setStaffPreference(staffId, parseInt(score));
      } catch (e) {
        this.localError = 'スコアの設定に失敗しました';
      }
    },
    startEdit(staff) {
      this.form = {
        name: staff.name || '',
        shop_id: staff.shop_id || '',
        site_url: staff.site_url || '',
        image_url: staff.image_url || ''
      };
      this.editMode = true;
      this.editStaffId = staff.id;
      this.localError = '';
      this.localSuccess = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelEdit() {
      this.editMode = false;
      this.editStaffId = null;
      this.form = { name: '', shop_id: '', site_url: '', image_url: '' };
      this.localError = '';
      this.localSuccess = '';
    },
    async createStaff() {
      if (!this.form.shop_id) {
        this.localError = '所属店舗は必須です';
        return;
      }
      if (!this.form.name && !this.form.site_url) {
        this.localError = 'キャスト名またはサイトURLを入力してください';
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
        this.resetFilterShopId();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '登録に失敗しました';
      }
      this.submitting = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    async updateStaff() {
      if (!this.form.shop_id) {
        this.localError = '所属店舗は必須です';
        return;
      }
      if (!this.form.name && !this.form.site_url) {
        this.localError = 'キャスト名またはサイトURLを入力してください';
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
        this.resetFilterShopId();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '更新に失敗しました';
      }
      this.submitting = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    async deleteStaff(staff) {
      if (!confirm(`「${staff.name}」を削除しますか？`)) return;
      try {
        await API.deleteStaff(staff.id);
        this.cancelEdit();
        this.localSuccess = '削除しました';
        await this.$root.loadStaffs();
        if (!this.$root.staffs.some(s => String(s.shop_id) === String(this.filterShopId))) {
          this.resetFilterShopId();
        }
      } catch (e) {
        this.localError = '削除に失敗しました';
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <h2>シフト新規登録</h2>
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

      <div class="form-group">
        <label>シフト先店舗 (他店に出勤する場合)</label>
        <select v-model="shiftTargetShopId">
          <option value="">同上</option>
          <option v-for="shop in $root.shops" :key="shop.id" :value="shop.id">{{ shop.name }}</option>
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
            {{ submitting ? '登録中...' : 'シフトを新規登録' }}
          </button>
        </div>
        <div class="calendar-section" style="margin-top:30px">
          <div class="calendar-header">
            <button class="calendar-nav" @click="prevMonth" :disabled="monthSwitching">&laquo; 前月</button>
            <h2>{{ calendarTitle }}</h2>
            <button class="calendar-nav" @click="nextMonth" :disabled="monthSwitching">翌月 &raquo;</button>
          </div>
          <div v-if="calendarLoading" class="loading">読み込み中</div>
          <div
            v-else
            :key="calendarYear + '-' + calendarMonth"
            :class="[
              'shop-home-calendar-animated',
              calendarSlideDirection === 'prev' ? 'calendar-grid-slide-from-left' : '',
              calendarSlideDirection === 'next' ? 'calendar-grid-slide-from-right' : ''
            ]"
          >
            <div class="calendar-grid shop-home-calendar-grid">
              <div class="calendar-dow" v-for="dow in ['日','月','火','水','木','金','土']" :key="dow">{{ dow }}</div>
              <div
                v-for="(cell, idx) in calendarDays"
                :key="idx"
                class="calendar-cell shop-home-calendar-cell"
                :class="{ empty: cell.empty }"
                :style="{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'6px', cursor: (!cell.empty && cell.shifts.length === 0) ? 'pointer' : 'default', textAlign:'center' }"
                @click="!cell.empty && cell.shifts.length === 0 && onCalendarEmptyDayClick(cell)"
              >
                <template v-if="!cell.empty">
                  <div
                    class="date-num"
                    :class="{ 'weekend-date-num': $isHolidayOrWeekend(calendarYear, calendarMonth + 1, cell.day) }"
                    :style="{ position: 'static', marginBottom: '6px', borderBottom: cell.hasEvent ? '2px solid #e8d040' : 'none' }"
                  >{{ cell.day }}</div>
                  <div v-for="shift in cell.shifts" :key="shift.id"
                    class="shop-home-calendar-label cast-name-link"
                    @click.stop="$root.editShift(shift)"
                  >{{ formatShiftTime(shift) }}</div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </template>
      <button v-if="selectedShopId" class="btn btn-outline" @click="goBack">戻る</button>
    </div>
  `,
  data() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return {
      selectedShopId: '',
      selectedStaffId: '',
      shiftTargetShopId: '',
      entries: [{ date: dateStr, startTime: '17:00', endTime: '23:00' }],
      submitting: false,
      localError: '',
      localSuccess: '',
      calendarYear: today.getFullYear(),
      calendarMonth: today.getMonth(),
      calendarDaysData: [],
      calendarEvents: [],
      calendarLoading: false,
      calendarSlideDirection: null,
      monthSwitching: false
    };
  },
  computed: {
    filteredStaffs() {
      if (!this.selectedShopId) return [];
      return this.$root.staffs.filter(s => s.shop_id == this.selectedShopId);
    },
    calendarTitle() {
      return `${this.calendarYear}年${this.calendarMonth + 1}月`;
    },
    calendarDays() {
      const firstDay = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
      const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
      const dayMap = {};
      const eventDates = new Set();
      for (const day of this.calendarDaysData) {
        dayMap[day.date] = day;
      }
      for (const event of this.calendarEvents) {
        const current = new Date(event.start_at);
        const last = new Date(event.end_at);
        current.setHours(0, 0, 0, 0);
        last.setHours(0, 0, 0, 0);
        while (current <= last) {
          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          eventDates.add(dateStr);
          current.setDate(current.getDate() + 1);
        }
      }
      const cells = [];
      for (let i = 0; i < firstDay; i++) {
        cells.push({ empty: true });
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cells.push({
          empty: false,
          day,
          label: dayMap[dateStr]?.label || '',
          shifts: dayMap[dateStr]?.shifts || [],
          hasEvent: eventDates.has(dateStr)
        });
      }
      return cells;
    }
  },
  watch: {
    selectedStaffId(val) {
      const today = new Date();
      this.calendarYear = today.getFullYear();
      this.calendarMonth = today.getMonth();
      if (val) {
        this.$nextTick(() => this.loadCalendarData());
      } else {
        this.calendarDaysData = [];
        this.calendarEvents = [];
      }
    }
  },
  async mounted() {
    await this.$root.loadShops();
    await this.$root.loadStaffs();
    const preset = this.$root.shiftFormPreset;
    if (preset) {
      this.selectedShopId = preset.shopId || '';
      this.selectedStaffId = preset.staffId || '';
      if (preset.date) {
        this.entries = [{ date: preset.date, startTime: '17:00', endTime: '23:00' }];
        const [py, pm] = preset.date.split('-').map(v => parseInt(v, 10));
        if (!isNaN(py) && !isNaN(pm)) {
          this.calendarYear = py;
          this.calendarMonth = pm - 1;
          if (this.selectedStaffId) {
            this.$nextTick(() => this.loadCalendarData());
          }
        }
      }
      this.$root.shiftFormPreset = null;
    }
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
    goBack() {
      if (this.selectedStaffId) {
        this.$root.openStaffHome(this.selectedStaffId);
      } else if (this.selectedShopId) {
        this.$root.openShopHome(this.selectedShopId);
      } else {
        this.$root.navigate('home');
      }
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
      const targetShopId = this.shiftTargetShopId || this.selectedShopId;

      for (let i = 0; i < this.entries.length; i++) {
        const e = this.entries[i];
        const isNextDay = e.endTime <= e.startTime;
        const startAt = this.buildDatetime(e.date, e.startTime, false);
        const endAt = this.buildDatetime(e.date, e.endTime, isNextDay);

        try {
          await API.createStaffShift(targetShopId, {
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
        const lastEntry = this.entries[this.entries.length - 1];
        const next = this.newEntry();
        if (lastEntry) {
          next.date = lastEntry.date;
          next.startTime = lastEntry.startTime;
          next.endTime = lastEntry.endTime;
        }
        this.entries = [next];
      } else if (errors.length > 0) {
        this.localError = '登録できるシフトがありませんでした（時間帯が重複しています）';
      }
      this.submitting = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (successCount > 0 && this.selectedStaffId) {
        this.loadCalendarData();
      }
    },
    async loadCalendarData() {
      if (!this.selectedStaffId) {
        this.calendarDaysData = [];
        this.calendarEvents = [];
        return;
      }
      this.calendarLoading = true;
      try {
        const data = await API.getStaffMonthlyShifts(this.selectedStaffId, this.calendarYear, this.calendarMonth + 1);
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        this.calendarDaysData = [];
        this.calendarEvents = [];
      }
      this.calendarLoading = false;
    },
    _buildCalendarDays(data) {
      const shifts = data.staff_shifts || [];
      const dayEntries = {};
      for (const shift of shifts) {
        const start = new Date(shift.start_at);
        const end = new Date(shift.end_at);
        const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        const sh = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
        const eh = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
        if (!dayEntries[dateStr]) dayEntries[dateStr] = { labels: [], shifts: [] };
        dayEntries[dateStr].labels.push(`${sh}-${eh}`);
        dayEntries[dateStr].shifts.push(shift);
      }
      return Object.entries(dayEntries).map(([date, entry]) => ({
        date, label: entry.labels.join('\n'), shifts: entry.shifts
      }));
    },
    async prevMonth() {
      if (this.monthSwitching) return;
      if (!this.selectedStaffId) return;
      this.monthSwitching = true;
      const target = this.calendarMonth === 0
        ? { year: this.calendarYear - 1, month: 11 }
        : { year: this.calendarYear,     month: this.calendarMonth - 1 };
      try {
        const data = await API.getStaffMonthlyShifts(this.selectedStaffId, target.year, target.month + 1);
        this.calendarSlideDirection = 'prev';
        this.calendarYear = target.year;
        this.calendarMonth = target.month;
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        // 失敗時は現在の月を維持してチラつかせない
      } finally {
        this.monthSwitching = false;
      }
    },
    async nextMonth() {
      if (this.monthSwitching) return;
      if (!this.selectedStaffId) return;
      this.monthSwitching = true;
      const target = this.calendarMonth === 11
        ? { year: this.calendarYear + 1, month: 0 }
        : { year: this.calendarYear,     month: this.calendarMonth + 1 };
      try {
        const data = await API.getStaffMonthlyShifts(this.selectedStaffId, target.year, target.month + 1);
        this.calendarSlideDirection = 'next';
        this.calendarYear = target.year;
        this.calendarMonth = target.month;
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        // 失敗時は現在の月を維持してチラつかせない
      } finally {
        this.monthSwitching = false;
      }
    },
    formatShiftTime(shift) {
      const start = new Date(shift.start_at);
      const end = new Date(shift.end_at);
      const sh = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
      const eh = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
      return `${sh}\n${eh}`;
    },
    onCalendarEmptyDayClick(cell) {
      const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
      const last = this.entries[this.entries.length - 1];
      const entry = this.newEntry();
      entry.date = dateStr;
      if (last) {
        entry.startTime = last.startTime || '17:00';
        entry.endTime = last.endTime || '23:00';
      }
      this.entries.push(entry);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <input type="text" :value="homeShopName" disabled>
      </div>
      <div class="form-group">
        <label>キャスト</label>
        <input type="text" :value="staffName" disabled>
      </div>
      <div class="form-group">
        <label>シフト先店舗 (他店に出勤する場合)</label>
        <select v-model="form.targetShopId">
          <option value="">同上</option>
          <option v-for="shop in $root.shops" :key="shop.id" :value="shop.id">{{ shop.name }}</option>
        </select>
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

      <template v-if="canEditShift">
        <div class="form-actions" style="margin-bottom:16px">
          <button class="btn btn-primary" @click="save" :disabled="submitting">
            {{ submitting ? '保存中...' : '保存' }}
          </button>
        </div>
        <div class="form-actions" style="margin-bottom:16px">
          <button class="btn btn-danger" @click="deleteShift" :disabled="submitting">削除</button>
        </div>
      </template>
      <div v-else class="notif-instruction-box" style="margin-bottom:16px">
        シフトの変更と削除はadminとoperatorとowner(このシフトを登録した人)が行えます。どうしてもこのシフトを編集・削除したい場合、これらの権限のあるユーザに相談するか、これらの権限を付与してもらってください。
      </div>
      <button class="btn btn-outline" @click="goBack">戻る</button>

      <div v-if="shift && shift.staff_id" class="calendar-section" style="margin-top:30px">
        <div class="calendar-header">
          <button class="calendar-nav" @click="prevMonth" :disabled="monthSwitching">&laquo; 前月</button>
          <h2>{{ calendarTitle }}</h2>
          <button class="calendar-nav" @click="nextMonth" :disabled="monthSwitching">翌月 &raquo;</button>
        </div>
        <div v-if="calendarLoading" class="loading">読み込み中</div>
        <div
          v-else
          :key="calendarYear + '-' + calendarMonth"
          :class="[
            'shop-home-calendar-animated',
            calendarSlideDirection === 'prev' ? 'calendar-grid-slide-from-left' : '',
            calendarSlideDirection === 'next' ? 'calendar-grid-slide-from-right' : ''
          ]"
        >
          <div class="calendar-grid shop-home-calendar-grid">
            <div class="calendar-dow" v-for="dow in ['日','月','火','水','木','金','土']" :key="dow">{{ dow }}</div>
            <div
              v-for="(cell, idx) in calendarDays"
              :key="idx"
              class="calendar-cell shop-home-calendar-cell"
              :class="{ empty: cell.empty }"
              :style="{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start', padding:'6px', cursor: (!cell.empty && cell.shifts.length === 0) ? 'pointer' : 'default', textAlign:'center' }"
              @click="!cell.empty && cell.shifts.length === 0 && onCalendarEmptyDayClick(cell)"
            >
              <template v-if="!cell.empty">
                <div
                  class="date-num"
                  :class="{ 'weekend-date-num': $isHolidayOrWeekend(calendarYear, calendarMonth + 1, cell.day) }"
                  :style="{ position: 'static', marginBottom: '6px', borderBottom: cell.hasEvent ? '2px solid #e8d040' : 'none' }"
                >{{ cell.day }}</div>
                <div v-for="s in cell.shifts" :key="s.id"
                  class="shop-home-calendar-label cast-name-link"
                  @click.stop="$root.editShift(s)"
                >{{ formatShiftTime(s) }}</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      form: { targetShopId: '', startDate: '', startTime: '', endDate: '', endTime: '' },
      submitting: false,
      localError: '',
      localSuccess: '',
      calendarYear: new Date().getFullYear(),
      calendarMonth: new Date().getMonth(),
      calendarDaysData: [],
      calendarEvents: [],
      calendarLoading: false,
      calendarSlideDirection: null,
      monthSwitching: false
    };
  },
  computed: {
    shift() { return this.$root.editingShift; },
    calendarTitle() {
      return `${this.calendarYear}年${this.calendarMonth + 1}月`;
    },
    calendarDays() {
      const firstDay = new Date(this.calendarYear, this.calendarMonth, 1).getDay();
      const daysInMonth = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();
      const dayMap = {};
      const eventDates = new Set();
      for (const day of this.calendarDaysData) {
        dayMap[day.date] = day;
      }
      for (const event of this.calendarEvents) {
        const current = new Date(event.start_at);
        const last = new Date(event.end_at);
        current.setHours(0, 0, 0, 0);
        last.setHours(0, 0, 0, 0);
        while (current <= last) {
          const dateStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
          eventDates.add(dateStr);
          current.setDate(current.getDate() + 1);
        }
      }
      const cells = [];
      for (let i = 0; i < firstDay; i++) {
        cells.push({ empty: true });
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        cells.push({
          empty: false,
          day,
          label: dayMap[dateStr]?.label || '',
          shifts: dayMap[dateStr]?.shifts || [],
          hasEvent: eventDates.has(dateStr)
        });
      }
      return cells;
    },
    canEditShift() {
      if (!this.$root.currentUser) return false;
      if (this.$root.currentUser.role === 'admin' || this.$root.currentUser.role === 'operator') return true;
      return this.shift?.user_id === this.$root.currentUser.id;
    },
    shopName() {
      if (!this.shift) return '';
      const shop = this.$root.shops.find(s => s.id == this.shift.shop_id);
      return shop ? shop.name : (this.shift.shop_name || '');
    },
    staffName() {
      if (!this.shift) return '';
      return this.$root.getStaffName(this.shift.staff_id);
    },
    homeShopName() {
      if (!this.shift) return '';
      const staff = this.$root.staffs.find(s => s.id == this.shift.staff_id);
      if (staff) {
        const shop = this.$root.shops.find(s => s.id == staff.shop_id);
        if (shop) return shop.name;
      }
      return this.shopName;
    }
  },
  watch: {
    shift: {
      immediate: false,
      handler(val) {
        if (!val) return;
        const start = new Date(val.start_at);
        this.calendarYear = start.getFullYear();
        this.calendarMonth = start.getMonth();
        this.$nextTick(() => this.loadCalendarData());
      }
    }
  },
    async mounted() {
      if (!this.shift) {
        this.$root.navigate('home');
        return;
      }
      await this.$root.loadShops();
      await this.$root.loadStaffs();
      const start = new Date(this.shift.start_at);
      const end = new Date(this.shift.end_at);
      const staff = this.$root.staffs.find(s => s.id == this.shift.staff_id);
      const homeShopId = staff?.shop_id;
      this.form.targetShopId = (this.shift.shop_id && this.shift.shop_id != homeShopId) ? this.shift.shop_id : '';
      this.form.startDate = this.toDateStr(start);
      this.form.startTime = this.toTimeStr(start);
      this.form.endDate = this.toDateStr(end);
      this.form.endTime = this.toTimeStr(end);
      this.calendarYear = start.getFullYear();
      this.calendarMonth = start.getMonth();
      this.loadCalendarData();
  },
  methods: {
    toDateStr(d) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },
    toTimeStr(d) {
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    },
    goBack() {
      if (this.shift?.staff_id) {
        this.$root.openStaffHome(this.shift.staff_id);
      } else {
        this.$root.navigate('home');
      }
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
        const staff = this.$root.staffs.find(s => s.id == this.shift.staff_id);
        const effectiveShopId = this.form.targetShopId || staff?.shop_id || this.shift.shop_id;
        await API.updateStaffShift(this.shift.shop_id, this.shift.id, {
          shop_id: effectiveShopId,
          start_at: startAt,
          end_at: endAt
        });
        this.localSuccess = 'シフトを更新しました';
        this.loadCalendarData();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '更新に失敗しました';
      }
      this.submitting = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    async deleteShift() {
      if (!confirm('このシフトを削除しますか？')) return;
      this.submitting = true;
      this.localError = '';
      try {
        await API.deleteStaffShift(this.shift.shop_id, this.shift.id);
        this.goBack();
      } catch (e) {
        this.localError = '削除に失敗しました';
      }
      this.submitting = false;
    },
    async loadCalendarData() {
      const staffId = this.shift?.staff_id;
      if (!staffId) {
        this.calendarDaysData = [];
        this.calendarEvents = [];
        return;
      }
      this.calendarLoading = true;
      try {
        const data = await API.getStaffMonthlyShifts(staffId, this.calendarYear, this.calendarMonth + 1);
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        this.calendarDaysData = [];
        this.calendarEvents = [];
      }
      this.calendarLoading = false;
    },
    _buildCalendarDays(data) {
      const shifts = data.staff_shifts || [];
      const dayEntries = {};
      for (const s of shifts) {
        const start = new Date(s.start_at);
        const end = new Date(s.end_at);
        const dateStr = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
        const sh = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
        const eh = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
        if (!dayEntries[dateStr]) dayEntries[dateStr] = { labels: [], shifts: [] };
        dayEntries[dateStr].labels.push(`${sh}-${eh}`);
        dayEntries[dateStr].shifts.push(s);
      }
      return Object.entries(dayEntries).map(([date, entry]) => ({
        date, label: entry.labels.join('\n'), shifts: entry.shifts
      }));
    },
    async prevMonth() {
      if (this.monthSwitching) return;
      const staffId = this.shift?.staff_id;
      if (!staffId) return;
      this.monthSwitching = true;
      const target = this.calendarMonth === 0
        ? { year: this.calendarYear - 1, month: 11 }
        : { year: this.calendarYear,     month: this.calendarMonth - 1 };
      try {
        const data = await API.getStaffMonthlyShifts(staffId, target.year, target.month + 1);
        this.calendarSlideDirection = 'prev';
        this.calendarYear = target.year;
        this.calendarMonth = target.month;
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        // 失敗時は現在の月を維持してチラつかせない
      } finally {
        this.monthSwitching = false;
      }
    },
    async nextMonth() {
      if (this.monthSwitching) return;
      const staffId = this.shift?.staff_id;
      if (!staffId) return;
      this.monthSwitching = true;
      const target = this.calendarMonth === 11
        ? { year: this.calendarYear + 1, month: 0 }
        : { year: this.calendarYear,     month: this.calendarMonth + 1 };
      try {
        const data = await API.getStaffMonthlyShifts(staffId, target.year, target.month + 1);
        this.calendarSlideDirection = 'next';
        this.calendarYear = target.year;
        this.calendarMonth = target.month;
        this.calendarDaysData = this._buildCalendarDays(data);
        this.calendarEvents = data.events || [];
      } catch (e) {
        // 失敗時は現在の月を維持してチラつかせない
      } finally {
        this.monthSwitching = false;
      }
    },
    formatShiftTime(shift) {
      const start = new Date(shift.start_at);
      const end = new Date(shift.end_at);
      const sh = String(start.getHours()).padStart(2, '0') + ':' + String(start.getMinutes()).padStart(2, '0');
      const eh = String(end.getHours()).padStart(2, '0') + ':' + String(end.getMinutes()).padStart(2, '0');
      return `${sh}\n${eh}`;
    },
    onCalendarEmptyDayClick(cell) {
      const dateStr = `${this.calendarYear}-${String(this.calendarMonth + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
      const staff = this.$root.staffs.find(s => s.id == this.shift.staff_id);
      this.$root.shiftFormPreset = {
        shopId: staff?.shop_id || this.shift.shop_id,
        staffId: this.shift.staff_id,
        date: dateStr
      };
      this.$root.navigate('shiftForm');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
});

app.component('shift-bulk-form-page', {
  template: `
    <div class="register-container">
      <h2>シフト一括登録</h2>
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

      <div class="form-group">
        <label>シフトテキスト *</label>
        <textarea
          v-model="bulkText"
          rows="8"
          placeholder="2026.4.1 17:00 - 23:00&#10;2026.4.2 17:00 - 23:00&#10;2026.4.3 17:00 - 23:00"
        ></textarea>
      </div>

      <div class="form-actions" style="margin-bottom:20px">
        <button class="btn btn-primary" @click="submitBulkShifts" :disabled="submitting">
          {{ submitting ? '登録中...' : '一括登録' }}
        </button>
      </div>

      <div v-if="parsedRows.length > 0">
        <h3 style="margin-bottom:12px">プレビュー</h3>
        <div v-for="(row, index) in parsedRows" :key="index" class="staff-schedule-item">
          <div class="staff-schedule-info">
            <div class="staff-schedule-date">{{ row.dateLabel }}</div>
            <div class="staff-schedule-time">{{ row.timeLabel }}</div>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      selectedShopId: '',
      selectedStaffId: '',
      bulkText: '',
      submitting: false,
      localError: '',
      localSuccess: ''
    };
  },
  computed: {
    filteredStaffs() {
      if (!this.selectedShopId) return [];
      return this.$root.staffs.filter(s => s.shop_id == this.selectedShopId);
    },
    parsedRows() {
      const rows = [];
      for (const line of this.normalizedLines()) {
        const parsed = this.parseLine(line);
        if (parsed.error) return [];
        rows.push(parsed);
      }
      return rows;
    }
  },
  async mounted() {
    if (!this.$root.isOperatorOrAdmin()) {
      this.$root.navigate('home');
      return;
    }

    await this.$root.loadShops();
    await this.$root.loadStaffs();
  },
  methods: {
    onShopChange() {
      this.selectedStaffId = '';
      this.localError = '';
      this.localSuccess = '';
    },
    normalizedLines() {
      return this.bulkText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
    },
    parseLine(line) {
      const match = line.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (!match) {
        return { error: `解釈できない行です: ${line}` };
      }

      const [, year, month, day, startTime, endTime] = match;
      const datePrefix = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const startAt = new Date(`${datePrefix}T${startTime}:00`);
      const endAt = new Date(`${datePrefix}T${endTime}:00`);
      if (endAt <= startAt) {
        endAt.setDate(endAt.getDate() + 1);
      }

      const sameDate = startAt.toDateString() === endAt.toDateString();
      return {
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        dateLabel: startAt.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short' }),
        timeLabel: sameDate
          ? `${startAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 〜 ${endAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
          : `${startAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 〜 ${endAt.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })} ${endAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
      };
    },
    async submitBulkShifts() {
      this.localError = '';
      this.localSuccess = '';

      if (!this.selectedShopId || !this.selectedStaffId) {
        this.localError = '店舗とキャストを選択してください';
        return;
      }

      const lines = this.normalizedLines();
      if (lines.length === 0) {
        this.localError = 'シフトテキストを入力してください';
        return;
      }

      const shifts = [];
      for (const line of lines) {
        const parsed = this.parseLine(line);
        if (parsed.error) {
          this.localError = parsed.error;
          return;
        }
        shifts.push({ start_at: parsed.startAt, end_at: parsed.endAt });
      }

      this.submitting = true;
      try {
        const data = await API.bulkCreateStaffShifts(this.selectedShopId, {
          staff_id: this.selectedStaffId,
          shifts
        });
        this.localSuccess = `${(data.staff_shifts || []).length}件のシフトを登録しました`;
        this.bulkText = '';
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || e.data?.error || '一括登録に失敗しました';
      }
      this.submitting = false;
    }
  }
});

app.component('shift-import-page', {
  template: `
    <div class="register-container">
      <h2>シフト管理(自動登録)</h2>
      <div v-if="localError" class="alert alert-error">{{ localError }}</div>
      <div v-if="localSuccess" class="alert alert-success">{{ localSuccess }}</div>
      <div class="shop-block" style="margin-bottom:16px">
        登録済みのキャストに紐づくX投稿だけを自動反映します。未解決の投稿や適用不能な変更がある場合はログに記録され、その回のカーソルは進みません。
      </div>

      <div class="form-actions" style="margin-bottom:16px">
        <button class="btn btn-primary" @click="runImport" :disabled="importing">
          {{ importing ? '取り込み中...' : 'Xから取り込む(手動)' }}
        </button>
      </div>

      <div class="shop-block">
        <h3 style="margin-bottom:12px">取り込みログ</h3>
        <div v-if="loadingLogs">読み込み中...</div>
        <div v-else-if="!posts.length">ログはまだありません。</div>
        <div v-else style="display:flex; flex-direction:column; gap:16px">
          <div v-for="post in posts" :key="post.source_post_id" class="shop-block">
            <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; margin-bottom:8px">
              <div>
                <div><strong>投稿ID:</strong> <a :href="post.source_post_url" target="_blank" rel="noopener">{{ post.source_post_id }}</a></div>
                <div v-if="post.source_username"><strong>発信者:</strong> @{{ post.source_username }}</div>
                <div v-if="post.source_posted_at"><strong>投稿日時:</strong> {{ formatDateTime(post.source_posted_at) }}</div>
              </div>
              <div><strong>{{ post.entries.length }}件</strong></div>
            </div>
            <div style="white-space:pre-wrap; background:#f7f7f7; color:#333; padding:10px; border-radius:8px; margin-bottom:12px">{{ post.raw_text }}</div>
            <div style="display:flex; flex-direction:column; gap:8px">
              <div v-for="entry in post.entries" :key="entry.id" style="border:1px solid #e5e5e5; border-radius:8px; padding:10px">
                <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start">
                  <div>
                    <div><strong>{{ entry.action }}</strong> / {{ formatRange(entry.start_at, entry.end_at) }}</div>
                    <div>
                      {{ entry.shop_name || entry.parsed_shop_name || '店舗未解決' }} / {{ entry.staff_name || entry.parsed_staff_name || 'キャスト未解決' }}
                    </div>
                  </div>
                  <div :style="{ color: entry.applied ? '#0a7a33' : '#b42318' }">
                    {{ entry.applied ? '反映済み' : '未反映' }}
                  </div>
                </div>
                <div v-if="entry.result_message" style="margin-top:6px; color:#666">{{ entry.result_message }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      importing: false,
      loadingLogs: false,
      posts: [],
      localError: '',
      localSuccess: ''
    };
  },
  async mounted() {
    if (!this.$root.isOperatorOrAdmin()) {
      this.$root.navigate('home');
      return;
    }
    await this.loadLogs();
  },
  methods: {
    async loadLogs() {
      this.loadingLogs = true;
      try {
        const data = await API.getShiftImportCandidates(1, 20);
        this.posts = data.shift_import_posts || [];
      } catch (e) {
        this.localError = e.data?.error || 'ログの取得に失敗しました';
      }
      this.loadingLogs = false;
    },
    formatDateTime(value) {
      const date = new Date(value);
      return date.toLocaleString('ja-JP');
    },
    formatRange(startAt, endAt) {
      const start = new Date(startAt);
      const startText = start.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      if (!endAt) return startText;
      const end = new Date(endAt);
      const endText = end.toLocaleString('ja-JP', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
      return `${startText} - ${endText}`;
    },
    async runImport() {
      this.importing = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        const data = await API.importShiftCandidatesFromX();
        const count = Number(data.imported_count || 0);
        this.localSuccess = data.bootstrapped
          ? '初回同期を実行し、最新投稿を基準点として記録しました'
          : `${count}件のシフト変更を自動反映しました`;
        await this.loadLogs();
      } catch (e) {
        this.localError = e.data?.error || 'Xからの取り込みに失敗しました';
      }
      this.importing = false;
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
          <div v-if="notifMsg" ref="notifMessage" class="alert" :class="notifMsgType === 'success' ? 'alert-success' : 'alert-error'">{{ notifMsg }}</div>

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
          <button v-if="$root.currentUser && $root.currentUser.role === 'admin'" class="btn btn-secondary btn-block" @click="sendTestNotification" :disabled="sendingTestNotification" style="margin-top:8px">
            {{ sendingTestNotification ? '送信中...' : 'テスト通知を送る' }}
          </button>
        </div>

        <!-- Local Storage -->
        <div class="mypage-card">
          <h3 class="mypage-card-title">ローカルストレージ</h3>
          <div v-if="storageMsg" class="alert" :class="storageMsgType === 'success' ? 'alert-success' : 'alert-error'">{{ storageMsg }}</div>
          <button class="btn btn-danger btn-block" @click="clearLocalStorageForCurrentUser" :disabled="clearingStorage">
            {{ clearingStorage ? '初期化中...' : '初期化' }}
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
      sendingTestNotification: false,
      notifMsg: '',
      notifMsgType: '',
      // Local storage
      clearingStorage: false,
      storageMsg: '',
      storageMsgType: ''
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
    async scrollToNotificationMessage() {
      await nextTick();
      const el = this.$refs.notifMessage;
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
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
          this.$root.currentUser = { id: Number(payload.sub), nickname: payload.nickname || '', email: payload.email || '', role: payload.role || 'user' };
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
          this.$root.currentUser = { id: Number(payload.sub), nickname: payload.nickname || '', email: payload.email || '', role: payload.role || 'user' };
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
        await this.scrollToNotificationMessage();
      } catch (e) {
        this.notifMsg = e.data?.error || '保存に失敗しました';
        this.notifMsgType = 'error';
        await this.scrollToNotificationMessage();
      }
      this.savingNotif = false;
    },
    async sendTestNotification() {
      this.sendingTestNotification = true;
      this.notifMsg = '';
      try {
        const data = await API.sendTestNotification();
        this.notifMsg = `${data.message} (${data.sent_count}/${data.total_count})`;
        this.notifMsgType = 'success';
        await this.scrollToNotificationMessage();
      } catch (e) {
        this.notifMsg = e.data?.error || 'テスト通知の送信に失敗しました';
        this.notifMsgType = 'error';
        await this.scrollToNotificationMessage();
      }
      this.sendingTestNotification = false;
    },
    clearLocalStorageForCurrentUser() {
      this.clearingStorage = true;
      this.storageMsg = '';

      try {
        const userId = Number(this.$root.currentUser?.id || 0);
        if (!userId) {
          this.storageMsg = 'ログイン中ユーザが見つかりません';
          this.storageMsgType = 'error';
          return;
        }

        const targetKeys = [];
        const userToken = `:user:${userId}`;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (!key) continue;
          if (key.includes(userToken) || key === `staff_preferences:user:${userId}`) {
            targetKeys.push(key);
          }
        }

        targetKeys.forEach((key) => localStorage.removeItem(key));
        this.storageMsg = targetKeys.length > 0
          ? `${targetKeys.length}件のローカルストレージを初期化しました`
          : '初期化対象のローカルストレージはありません';
        this.storageMsgType = 'success';
      } catch (e) {
        this.storageMsg = 'ローカルストレージの初期化に失敗しました';
        this.storageMsgType = 'error';
      } finally {
        this.clearingStorage = false;
      }
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

      <h3 style="margin-bottom:12px">イベント一括登録</h3>
      <div class="form-group">
        <label>店舗 *</label>
        <select v-model="bulkForm.shop_id">
          <option value="">選択してください</option>
          <option v-for="shop in $root.shops" :key="'bulk-' + shop.id" :value="shop.id">{{ shop.name }}</option>
        </select>
      </div>
      <div class="form-group">
        <label>URL *</label>
        <input v-model="bulkForm.url" type="url" placeholder="https://...">
      </div>
      <div class="form-actions" style="margin-bottom:16px">
        <button class="btn btn-secondary" @click="parseEventUrl" :disabled="parsingUrl">
          {{ parsingUrl ? '解析中...' : 'URLを解析' }}
        </button>
      </div>

      <div v-if="parsedEntries.length > 0" class="shop-block" style="margin-bottom:24px">
        <div style="margin-bottom:12px">
          <div v-if="parsedSourceTitle"><strong>取得タイトル:</strong> {{ parsedSourceTitle }}</div>
          <div><strong>{{ parsedEntries.length }}件</strong> の候補を作成しました</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:12px">
          <div v-for="(entry, index) in parsedEntries" :key="'parsed-' + index" class="shop-block" style="background:#1e1e38">
            <div class="form-group">
              <label>タイトル *</label>
              <input v-model="entry.title" type="text" placeholder="イベント名">
            </div>
            <div class="form-group">
              <label>URL</label>
              <input v-model="entry.url" type="url" placeholder="https://...">
            </div>
            <div class="form-group">
              <label>開始日時</label>
              <div class="shift-entry-fields">
                <div class="form-group" style="margin-bottom:0">
                  <input type="date" v-model="entry.startDate">
                </div>
                <div class="form-group" style="margin-bottom:0">
                  <input type="time" v-model="entry.startTime" step="3600">
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>終了日時</label>
              <div class="shift-entry-fields">
                <div class="form-group" style="margin-bottom:0">
                  <input type="date" v-model="entry.endDate">
                </div>
                <div class="form-group" style="margin-bottom:0">
                  <input type="time" v-model="entry.endTime" step="3600">
                </div>
              </div>
            </div>
            <div class="form-group">
              <label>登録</label>
              <select v-model="entry.shouldCreate">
                <option :value="true">登録する</option>
                <option :value="false">登録しない</option>
              </select>
            </div>
          </div>
        </div>
        <div class="form-actions" style="margin-top:16px">
          <button class="btn btn-primary" @click="createParsedEvents" :disabled="submittingParsed">
            {{ submittingParsed ? '登録中...' : '候補を一括登録' }}
          </button>
        </div>
      </div>

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
      <div class="form-group">
        <label>表示範囲</label>
        <select v-model="eventRangeFilter">
          <option value="future_only">未来のイベントのみ</option>
          <option value="all">全て</option>
        </select>
      </div>
      <div v-if="filteredEvents.length === 0" class="no-data">イベントがありません</div>
      <div v-for="event in filteredEvents" :key="event.id" class="shop-block" style="background:#1e1e38">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <div style="min-width:0;flex:1;overflow:hidden">
            <div class="shop-block-name">
              <a v-if="event.url" :href="event.url" target="_blank" rel="noopener noreferrer" style="color:#f3f3ff;text-decoration:none">{{ event.title }}</a>
              <template v-else>{{ event.title }}</template>
            </div>
            <div v-if="event.shop" class="cast-name-link" style="font-size:0.8rem;color:#a0a0b8" @click="$root.openShopHome(event.shop.id)">{{ event.shop.name }}</div>
            <div v-if="event.start_at" style="font-size:0.8rem;color:#a0a0b8">{{ formatEventListRange(event.start_at, event.end_at) }}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-primary btn-sm" @click="editExisting(event)">編集</button>
            <button class="btn btn-danger btn-sm" @click="deleteEvent(event)">削除</button>
          </div>
        </div>
      </div>
      <div v-if="showPrev || showNext" style="display:flex;justify-content:space-between;margin-top:16px">
        <button v-if="showPrev" class="btn btn-secondary btn-sm" @click="goPrev">prev</button>
        <div v-else></div>
        <button v-if="showNext" class="btn btn-secondary btn-sm" @click="goNext">next</button>
      </div>
    </div>
  `,
  data() {
    return {
      form: { title: '', shop_id: '', url: '', startDate: '', startTime: '17:00', endDate: '', endTime: '23:00' },
      bulkForm: { shop_id: '', url: '' },
      editMode: false,
      editEventId: null,
      submitting: false,
      parsingUrl: false,
      submittingParsed: false,
      localError: '',
      localSuccess: '',
      parsedSourceTitle: '',
      parsedEntries: [],
      filterShopId: '',
      eventRangeFilter: 'future_only',
      currentPage: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      events: []
    };
  },
  computed: {
    filteredEvents() {
      return this.events;
    },
    showPrev() {
      return this.currentPage > 1;
    },
    showNext() {
      return this.events.length === this.pageSize;
    }
  },
  watch: {
    'form.startDate'(value) {
      if (value && !this.form.endDate) {
        this.form.endDate = value;
      }
    },
    'form.endDate'(value) {
      if (value && !this.form.startDate) {
        this.form.startDate = value;
      }
    },
    filterShopId() {
      this.currentPage = 1;
      this.loadEvents();
    },
    eventRangeFilter() {
      this.currentPage = 1;
      this.loadEvents();
    }
  },
  async mounted() {
    await this.$root.loadShops();
    await this.loadEvents();
  },
  methods: {
    isoToFormParts(isoStr) {
      if (!isoStr) {
        return { date: '', time: '' };
      }
      const d = new Date(isoStr);
      return {
        date: this.toDateStr(d),
        time: this.toTimeStr(d)
      };
    },
    buildParsedEventPayload(entry) {
      return {
        event: {
          title: entry.title,
          shop_id: this.bulkForm.shop_id,
          url: entry.url || this.bulkForm.url || null,
          start_at: new Date(`${entry.startDate}T${entry.startTime}:00`).toISOString(),
          end_at: new Date(`${entry.endDate}T${entry.endTime}:00`).toISOString()
        }
      };
    },
    validateParsedEntry(entry, index) {
      if (!this.bulkForm.shop_id || !this.bulkForm.url) {
        this.localError = '店舗とURLを入力してください';
        return false;
      }
      if (!entry.title || !entry.startDate || !entry.startTime || !entry.endDate || !entry.endTime) {
        this.localError = `${index + 1}件目: タイトル・開始日時・終了日時を入力してください`;
        return false;
      }
      const startAt = new Date(`${entry.startDate}T${entry.startTime}:00`);
      const endAt = new Date(`${entry.endDate}T${entry.endTime}:00`);
      if (endAt < startAt) {
        this.localError = `${index + 1}件目: 終了日時は開始日時以降にしてください`;
        return false;
      }
      if (endAt.getTime() - startAt.getTime() >= 32 * 24 * 60 * 60 * 1000) {
        this.localError = `${index + 1}件目: 終了日時は開始日時から31日以内にしてください`;
        return false;
      }
      return true;
    },
    async parseEventUrl() {
      if (!this.bulkForm.shop_id || !this.bulkForm.url) {
        this.localError = '店舗とURLを入力してください';
        return;
      }
      this.parsingUrl = true;
      this.localError = '';
      this.localSuccess = '';
      this.parsedEntries = [];
      this.parsedSourceTitle = '';
      try {
        const data = await API.parseEventsFromUrl(this.bulkForm.url);
        this.parsedSourceTitle = data.source_title || '';
        this.parsedEntries = (data.events || []).map(event => {
          const start = this.isoToFormParts(event.start_at);
          const finish = this.isoToFormParts(event.end_at);
          return {
            title: event.title || '',
            url: event.url || this.bulkForm.url || '',
            startDate: start.date,
            startTime: start.time,
            endDate: finish.date,
            endTime: finish.time,
            shouldCreate: true
          };
        });
        this.localSuccess = this.parsedEntries.length > 0 ? `${this.parsedEntries.length}件の候補を作成しました` : '候補は見つかりませんでした';
      } catch (e) {
        this.localError = e.data?.error || e.data?.errors?.join(', ') || 'URL解析に失敗しました';
      }
      this.parsingUrl = false;
    },
    async createParsedEvents() {
      if (this.parsedEntries.length === 0) {
        this.localError = '登録候補がありません';
        return;
      }
      const targetEntries = this.parsedEntries.filter(entry => entry.shouldCreate !== false);
      if (targetEntries.length === 0) {
        this.localError = '登録対象の候補がありません';
        return;
      }
      for (let i = 0; i < targetEntries.length; i++) {
        if (!this.validateParsedEntry(targetEntries[i], i)) {
          return;
        }
      }
      this.submittingParsed = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        for (const entry of targetEntries) {
          await API.createEvent(this.buildParsedEventPayload(entry));
        }
        this.localSuccess = `${targetEntries.length}件のイベントを登録しました`;
        this.parsedEntries = [];
        this.parsedSourceTitle = '';
        this.bulkForm.url = '';
        await this.loadEvents();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || e.data?.error || '一括登録に失敗しました';
      }
      this.submittingParsed = false;
    },
    formatDatetime(isoStr) {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }) +
        ' ' + d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    },
    formatEventListRange(startAt, endAt) {
      if (!startAt) return '';
      const start = new Date(startAt);
      if (!endAt) return this.formatDatetime(startAt);

      const end = new Date(endAt);
      const durationMs = end.getTime() - start.getTime();
      if (durationMs > 24 * 60 * 60 * 1000) {
        return `${this.formatDatetime(startAt)} 〜 ${this.formatDatetime(endAt)}`;
      }

      return `${this.formatDatetime(startAt)} 〜 ${end.toLocaleTimeString('ja-JP', { hour: 'numeric', minute: '2-digit' })}`;
    },
    async loadEvents() {
      try {
        const data = await API.getEvents(
          this.filterShopId || null,
          this.eventRangeFilter === 'future_only',
          this.currentPage,
          this.pageSize
        );
        this.events = data.events || [];
      } catch (e) {
        // ignore
      }
    },
    async goPrev() {
      if (this.currentPage <= 1) return;
      this.currentPage -= 1;
      await this.loadEvents();
    },
    async goNext() {
      this.currentPage += 1;
      await this.loadEvents();
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
      this.form = { title: '', shop_id: '', url: '', startDate: '', startTime: '17:00', endDate: '', endTime: '23:00' };
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
    validateEventForm() {
      if (!this.form.title || !this.form.shop_id) {
        this.localError = 'イベント名と店舗は必須です';
        return false;
      }
      if (!this.form.startDate || !this.form.startTime || !this.form.endDate || !this.form.endTime) {
        this.localError = '開始日時と終了日時は必須です';
        return false;
      }

      const startAt = new Date(`${this.form.startDate}T${this.form.startTime}:00`);
      const endAt = new Date(`${this.form.endDate}T${this.form.endTime}:00`);

      if (endAt < startAt) {
        this.localError = '終了日時は開始日時以降にしてください';
        return false;
      }
      if (endAt.getTime() - startAt.getTime() >= 32 * 24 * 60 * 60 * 1000) {
        this.localError = '終了日時は開始日時から31日以内にしてください';
        return false;
      }

      return true;
    },
    async createEvent() {
      if (!this.validateEventForm()) {
        return;
      }
      this.submitting = true;
      this.localError = '';
      this.localSuccess = '';
      try {
        await API.createEvent(this.buildPayload());
        this.localSuccess = 'イベントを登録しました';
        this.form = { title: '', shop_id: '', url: '', startDate: '', startTime: '17:00', endDate: '', endTime: '23:00' };
        await this.loadEvents();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '登録に失敗しました';
      }
      this.submitting = false;
    },
    async updateEvent() {
      if (!this.validateEventForm()) {
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
      <div style="margin-top:20px">
        <div style="margin-bottom:12px;font-size:1rem;font-weight:700;color:#f3f3ff">マーカー</div>
        <div
          v-if="currentLocationMarker"
          class="shop-block"
          style="background:#1e1e38;margin-bottom:10px"
        >
          <div
            class="cast-name-link"
            style="font-size:1rem;font-weight:700;color:#f3f3ff"
            @click="focusCurrentLocation"
          >現在地</div>
        </div>
        <div v-if="!currentLocationMarker && shopsWithCoordinates.length === 0" class="no-data">表示できるマーカーはありません</div>
        <div v-for="shop in shopsWithCoordinates" :key="shop.shop_id" class="shop-block" style="background:#1e1e38;margin-bottom:10px">
          <div
            class="cast-name-link"
            style="font-size:1rem;font-weight:700;color:#f3f3ff"
            @click="focusShop(shop.shop_id)"
          >{{ shop.shop_name }}</div>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      map: null,
      locating: true,
      shopShifts: {},
      nowShops: [],
      shopMarkers: {},
      currentLocationMarker: null
    };
  },
  computed: {
    shopsWithCoordinates() {
      return (this.nowShops || [])
        .filter(shop => shop.latitude && shop.longitude)
        .slice()
        .sort((a, b) => a.shop_id - b.shop_id);
    }
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
      this.currentLocationMarker = null;
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
      this.shopMarkers = {};
      for (const shop of shops) {
        if (shop.latitude && shop.longitude) {
          const lat = parseFloat(shop.latitude);
          const lng = parseFloat(shop.longitude);
          if (!isNaN(lat) && !isNaN(lng)) {
            const score = this.$root.currentUser ? this.shopScore(shop.shop_id) : null;
            const icon = this.createMarkerIcon(score);
            const marker = L.marker([lat, lng], { icon: icon }).addTo(this.map);
            let popupHtml = '<strong><a href="#shop-' + shop.shop_id + '" style="color:#000;text-decoration:none">' + this.escapeHtml(shop.shop_name) + '</a></strong>';
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
            this.shopMarkers[shop.shop_id] = marker;
          }
        }
      }
    },
    focusShop(shopId) {
      if (!this.map) return;
      const marker = this.shopMarkers[shopId];
      if (!marker) return;
      const latLng = marker.getLatLng();
      this.map.setView(latLng, 16);
      marker.openPopup();
    },
    focusCurrentLocation() {
      if (!this.map || !this.currentLocationMarker) return;
      const latLng = this.currentLocationMarker.getLatLng();
      this.map.setView(latLng, 15);
      this.currentLocationMarker.openPopup();
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
          this.currentLocationMarker = L.marker([lat, lng], { icon: currentIcon, zIndexOffset: 1000 })
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

// カレンダーの日付が土日または日本の祝日か
app.config.globalProperties.$isHolidayOrWeekend = isHolidayOrWeekend;

// Mount the app
app.mount('#app');
