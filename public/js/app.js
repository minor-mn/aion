const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

const app = createApp({
  setup() {
    // ========== State ==========
    const currentUser = ref(null);
    const currentView = ref('home'); // home, login, register, shopForm, staffForm
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
      if (view === 'shopForm') loadShops();
      if (view === 'staffForm') { loadShops(); loadStaffs(); }
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
      handleLogin, handleRegister, handleLogout,
      prevMonth, nextMonth, calendarTitle, calendarDays,
      openDayModal, selectedDayData, selectedDayShopGroups, closeModal,
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

      <h3 style="margin-bottom:12px">新規キャスト登録</h3>
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
      <div class="form-actions" style="margin-bottom:32px">
        <button class="btn btn-primary" @click="createStaff" :disabled="submitting">
          {{ submitting ? '登録中...' : 'キャストを登録' }}
        </button>
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

// Mount the app
app.mount('#app');
