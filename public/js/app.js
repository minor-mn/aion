const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

const app = createApp({
  setup() {
    // ========== State ==========
    const currentUser = ref(null);
    const currentView = ref('home'); // home, login, register, shopForm, staffForm, shiftForm, shiftEdit
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

    // ========== Auth ==========
    async function checkAuth() {
      if (!API.isLoggedIn()) {
        loading.value = false;
        return;
      }
      try {
        const data = await API.me();
        currentUser.value = data.user;
      } catch (e) {
        API.setToken(null);
        currentUser.value = null;
      }
      loading.value = false;
    }

    async function handleLogin(email, password) {
      error.value = '';
      try {
        const data = await API.login(email, password);
        currentUser.value = data.user;
        currentView.value = 'home';
        success.value = 'ログインしました';
        await loadHomeData();
      } catch (e) {
        error.value = e.data?.error || 'ログインに失敗しました';
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
      await loadTodayData();
    }

    // ========== Data Loading ==========
    async function loadTodayData() {
      try {
        const shopData = await API.getShops();
        todayShops.value = shopData.shops || [];

        // Load shifts for each shop for today
        const today = new Date();
        const shifts = {};
        for (const shop of todayShops.value) {
          try {
            const shiftData = await API.getStaffShifts(shop.id);
            const todayShifts = (shiftData.staff_shifts || []).filter(s => {
              const shiftDate = new Date(s.start_at);
              return shiftDate.toDateString() === today.toDateString();
            });
            if (todayShifts.length > 0) {
              shifts[shop.id] = todayShifts;
            }
          } catch (e) {
            // skip
          }
        }
        todayShifts.value = shifts;

        // Load all staffs for name resolution
        const staffData = await API.getStaffs();
        staffs.value = staffData.staffs || [];
      } catch (e) {
        // ignore
      }
    }

    async function loadScheduleData() {
      if (!currentUser.value) return;
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
      if (currentUser.value) {
        await loadScheduleData();
      }
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

        cells.push({
          day: d,
          dateStr,
          empty: false,
          isToday,
          totalScore,
          hasData: !!scheduleDay,
          gradient: totalScore !== null ? scoreToGradient(totalScore) : '#fff'
        });
      }
      return cells;
    });

    function openDayModal(cell) {
      if (cell.empty) return;
      selectedDate.value = cell.dateStr;
      modalOpen.value = true;
    }

    const selectedDayData = computed(() => {
      if (!selectedDate.value) return null;
      return scheduleData.value.find(s => s.date === selectedDate.value) || null;
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
      return Object.values(groups);
    });

    function closeModal() {
      modalOpen.value = false;
      selectedDate.value = null;
    }

    // ========== Staff Schedule Modal ==========
    async function openStaffSchedule(staffId, staffName, shopId) {
      staffScheduleStaff.value = { id: staffId, name: staffName, shop_id: shopId };
      staffScheduleShifts.value = [];
      staffScheduleOpen.value = true;
      staffScheduleLoading.value = true;
      try {
        const allShifts = [];
        for (const shop of (shops.value.length > 0 ? shops.value : todayShops.value)) {
          try {
            const data = await API.getStaffShifts(shop.id);
            const shifts = (data.staff_shifts || []).filter(s => s.staff_id === staffId);
            for (const s of shifts) {
              s._shop_id = shop.id;
              s._shop_name = shop.name;
            }
            allShifts.push(...shifts);
          } catch (e) { /* skip */ }
        }
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        staffScheduleShifts.value = allShifts
          .filter(s => new Date(s.start_at) >= now)
          .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
          .slice(0, 30);
      } catch (e) { /* ignore */ }
      staffScheduleLoading.value = false;
    }

    function closeStaffSchedule() {
      staffScheduleOpen.value = false;
      staffScheduleStaff.value = null;
      staffScheduleShifts.value = [];
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
      currentView.value = 'shiftEdit';
    }

    function editStaff(staffInfo) {
      // Look up full staff data from already-loaded staffs array
      const full = staffs.value.find(st => st.id === staffInfo.id || st.id == staffInfo.id);
      editingStaff.value = full || staffInfo;
      staffScheduleOpen.value = false;
      modalOpen.value = false;
      currentView.value = 'staffForm';
    }

    async function confirmDeleteStaff(staffInfo) {
      if (!confirm(`「${staffInfo.name}」を削除しますか？`)) return;
      try {
        await API.deleteStaff(staffInfo.id);
        staffScheduleOpen.value = false;
        modalOpen.value = false;
        await loadStaffs();
        await loadHomeData();
      } catch (e) { /* ignore */ }
    }

    // ========== Staff name helper ==========
    function getStaffName(staffId) {
      const staff = staffs.value.find(s => s.id === staffId);
      return staff ? staff.name : `Staff #${staffId}`;
    }

    // ========== Navigation ==========
    function navigate(view) {
      currentView.value = view;
      menuOpen.value = false;
      error.value = '';
      success.value = '';
      if (view === 'home') loadHomeData();
      if (view === 'shopForm') loadShops();
      if (view === 'staffForm') { loadShops(); loadStaffs(); }
      if (view === 'shiftForm') { loadShops(); loadStaffs(); }
      if (view === 'shiftEdit') { loadShops(); }
    }

    // ========== Init ==========
    onMounted(async () => {
      // Handle email confirmation redirect
      const params = new URLSearchParams(window.location.search);
      if (params.get('confirmed') === 'true') {
        success.value = 'メールアドレスが確認されました。ログインしてください。';
        currentView.value = 'login';
        window.history.replaceState({}, '', '/');
      } else if (params.get('confirmation_error')) {
        error.value = params.get('confirmation_error');
        currentView.value = 'login';
        window.history.replaceState({}, '', '/');
      }

      await checkAuth();
      await loadHomeData();
    });

    return {
      currentUser, currentView, menuOpen, loading, error, success,
      calendarYear, calendarMonth, scheduleData, selectedDate, modalOpen,
      todayShops, todayShifts, shops, staffs,
      staffScheduleOpen, staffScheduleStaff, staffScheduleShifts, staffScheduleLoading,
      editingShift, editingStaff,
      handleLogin, handleRegister, handleLogout,
      prevMonth, nextMonth, calendarTitle, calendarDays,
      openDayModal, selectedDayData, selectedDayShopGroups, closeModal,
      openStaffSchedule, closeStaffSchedule, confirmDeleteShift, editShift,
      editStaff, confirmDeleteStaff,
      getStaffName, navigate, loadShops, loadStaffs, loadHomeData,
      loadScheduleData, loadTodayData,
      scoreToGradient
    };
  }
});

// ========== Login Component ==========
app.component('login-page', {
  template: `
    <div class="auth-container">
      <h2>ログイン</h2>
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
          {{ submitting ? 'ログイン中...' : 'ログイン' }}
        </button>
      </div>
      <div class="auth-link">
        アカウントをお持ちでない方は <a @click="$root.navigate('register')">新規登録</a>
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
        すでにアカウントをお持ちの方は <a @click="$root.navigate('login')">ログイン</a>
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

      <h3 style="margin-bottom:12px">新規店舗登録</h3>
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
      <div class="form-actions" style="margin-bottom:32px">
        <button class="btn btn-primary" @click="createShop" :disabled="submitting">
          {{ submitting ? '登録中...' : '店舗を登録' }}
        </button>
      </div>

      <h3 style="margin-bottom:12px">登録済み店舗</h3>
      <div v-if="$root.shops.length === 0" class="no-data">店舗がありません</div>
      <div v-for="shop in $root.shops" :key="shop.id" class="shop-block" style="background:#f8f9fa">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="shop-block-name">{{ shop.name }}</div>
            <div v-if="shop.site_url" style="font-size:0.8rem;color:#666">{{ shop.site_url }}</div>
          </div>
          <button class="btn btn-danger btn-sm" @click="deleteShop(shop)">削除</button>
        </div>
      </div>
    </div>
  `,
  data() {
    return {
      form: { name: '', site_url: '', image_url: '' },
      submitting: false,
      localError: '',
      localSuccess: ''
    };
  },
  async mounted() {
    await this.$root.loadShops();
  },
  methods: {
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
        this.form = { name: '', site_url: '', image_url: '' };
        await this.$root.loadShops();
      } catch (e) {
        this.localError = e.data?.errors?.join(', ') || '登録に失敗しました';
      }
      this.submitting = false;
    },
    async deleteShop(shop) {
      if (!confirm(`「${shop.name}」を削除しますか？`)) return;
      try {
        await API.deleteShop(shop.id);
        this.localSuccess = '削除しました';
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
      <div v-for="staff in filteredStaffs" :key="staff.id" class="shop-block" style="background:#f8f9fa">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div class="shop-block-name">{{ staff.name }}</div>
            <div style="font-size:0.8rem;color:#666">{{ getShopName(staff.shop_id) }}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <div v-if="$root.currentUser" class="pref-slider-container">
              <span style="font-size:0.75rem;color:#00f">-10</span>
              <input type="range" class="pref-slider" min="-10" max="10" step="1"
                :value="getPreference(staff.id)"
                @change="setPreference(staff.id, $event.target.value)">
              <span style="font-size:0.75rem;color:#f00">+10</span>
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
      preferences: {}
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
    async setPreference(staffId, score) {
      try {
        await API.setPreference(staffId, parseInt(score));
        this.preferences[staffId] = parseInt(score);
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
      <h2>出勤登録</h2>
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
        <h3 style="margin-top:16px;margin-bottom:12px">出勤日時</h3>
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
            {{ submitting ? '登録中...' : '出勤を登録' }}
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
      entries: [{ date: dateStr, startTime: '21:00', endTime: '05:00' }],
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
        entry.date = last.date;
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
          ? `${successCount}件の出勤を登録しました（${skipped}件は時間重複のためスキップ）`
          : `${successCount}件の出勤を登録しました`;
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

// Mount the app
app.mount('#app');
