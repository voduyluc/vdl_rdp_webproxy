<template>
  <div class="dashboard">
    <div class="header">
      <h1>Dashboard</h1>
      <div style="display:flex;align-items:center;gap:10px">
        <button class="fs-btn" @click="toggleFullscreen" :title="isFs ? 'Thoát toàn màn hình' : 'Toàn màn hình'">
          <svg v-if="!isFs" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
            <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10.5 0a.5.5 0 0 1 0 1h4a.5.5 0 0 0 .5.5v4a.5.5 0 0 1 1 0v-4A1.5 1.5 0 0 1 14.5 0h-4zM1 10.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1 10.5zm14.5 0a.5.5 0 0 1 1 0v4a1.5 1.5 0 0 1-1 1h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4z"/>
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
            <path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 5V.5a.5.5 0 0 1 .5-.5zM0 11.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 12.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z"/>
          </svg>
        </button>
        <button class="logout-btn" @click="logout">Logout</button>
      </div>
    </div>
    <div class="host-list">
      <div v-for="host in hosts" :key="host.id" class="host-card">
        <h3>{{ host.name }}</h3>
        <p>Status: <span :class="host.status">{{ host.status }}</span></p>
        <button @click="openConnectDialog(host.id)">Connect</button>
      </div>
      <div v-if="hosts.length === 0">No hosts online.</div>
    </div>

    <form v-if="selectedAgentId" class="modal-backdrop" @submit.prevent="connect">
      <div class="modal">
        <h2>Login</h2>
        <p class="target-host">{{ selectedAgentId }}</p>

        <!-- Group 1: Thông tin đăng nhập -->
        <div class="collapsible-group">
          <div class="group-header" @click="loginCollapsed = !loginCollapsed">
            <span class="group-title">Thông tin đăng nhập</span>
            <span class="chevron" :style="{ transform: loginCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }">▼</span>
          </div>
          <div v-show="!loginCollapsed">
            <label>
              Username
              <input v-model="rdpUsername" autocomplete="username" required autofocus />
            </label>
            <label>
              Password
              <input v-model="rdpPassword" type="password" autocomplete="current-password" required />
            </label>
            <label>
              Domain
              <input v-model="rdpDomain" autocomplete="organization" placeholder="Optional" />
            </label>
          </div>
        </div>

        <!-- Group 2: Kết nối -->
        <div class="collapsible-group">
          <div class="group-header" @click="connCollapsed = !connCollapsed">
            <span class="group-title">Kết nối</span>
            <span class="chevron" :style="{ transform: connCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }">▼</span>
          </div>
          <div v-show="!connCollapsed">
            <label>
              Security
              <select v-model="rdpSecurity">
                <option value="auto">Automatic</option>
                <option value="nla">NLA</option>
                <option value="tls">TLS</option>
                <option value="rdp">Classic</option>
                <option value="nla-ext">NLA Extended</option>
                <option value="any">Any</option>
              </select>
            </label>
            <label>
              Agent Passcode
              <input v-model="passcode" type="password" placeholder="Passcode set on Host Agent" required />
            </label>
          </div>
        </div>

        <!-- Group 3: Hiệu năng -->
        <div class="collapsible-group">
          <div class="group-header" @click="perfCollapsed = !perfCollapsed">
            <span class="group-title">Hiệu năng</span>
            <span class="chevron" :style="{ transform: perfCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }">▼</span>
          </div>
          <div v-show="!perfCollapsed">
            <div class="preset-section">
              <label>Chế độ hiệu năng</label>
              <div class="preset-options">
                <label class="preset-option-radio">
                  <input type="radio" v-model="preset" value="default" @change="applyPreset" />
                  <span>Mặc định (GFX, nén dữ liệu, ảnh WebP, tắt hiệu ứng &amp; âm thanh)</span>
                </label>
                <label class="preset-option-radio">
                  <input type="radio" v-model="preset" value="speed" @change="applyPreset" />
                  <span>Ưu tiên Tốc độ (GFX, nén dữ liệu, tắt hiệu ứng &amp; âm thanh)</span>
                </label>
                <label class="preset-option-radio">
                  <input type="radio" v-model="preset" value="quality" @change="applyPreset" />
                  <span>Ưu tiên Hình ảnh (32-bit, đầy đủ hiệu ứng, có âm thanh)</span>
                </label>
                <label class="preset-option-radio">
                  <input type="radio" v-model="preset" value="custom" @change="applyPreset" />
                  <span>Tùy chỉnh</span>
                </label>
              </div>
              <button v-if="preset === 'custom'" type="button" class="configure-btn" @click="showConfigModal = true">
                ⚙️ Thiết lập chi tiết
              </button>
            </div>
          </div>
        </div>

        <div class="auto-fs-row">
          <label class="checkbox-option">
            <input type="checkbox" v-model="autoFullscreen" />
            <span>Tự động toàn màn hình khi kết nối</span>
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" class="secondary-btn" @click="closeConnectDialog">Cancel</button>
          <button type="submit">Connect</button>
        </div>
      </div>
    </form>

    <!-- Tùy chỉnh Modal -->
    <div v-if="showConfigModal" class="modal-backdrop custom-config-backdrop">
      <div class="modal custom-config-modal">
        <h2>Thiết lập Tùy chỉnh</h2>
        <p class="target-host">Cấu hình các tham số đồ họa & hiệu năng</p>

        <label>
          Độ sâu màu (Color Depth)
          <select v-model="colorDepth" @change="saveSettings">
            <option value="32">32-bit (Màu sắc tốt nhất)</option>
            <option value="24">24-bit (Màu sắc trung thực)</option>
            <option value="16">16-bit (Tối ưu băng thông/Nhanh nhất)</option>
          </select>
        </label>

        <div class="custom-options-grid">
          <label class="checkbox-option">
            <input type="checkbox" v-model="enableWallpaper" @change="saveSettings" />
            <span>Hiển thị hình nền (Wallpaper)</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" v-model="enableTheming" @change="saveSettings" />
            <span>Chủ đề giao diện (Theming)</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" v-model="enableFontSmoothing" @change="saveSettings" />
            <span>Làm mịn chữ (Font Smoothing)</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" v-model="enableFullWindowDrag" @change="saveSettings" />
            <span>Kéo toàn bộ cửa sổ (Full Window Drag)</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" v-model="enableDesktopComposition" @change="saveSettings" />
            <span>Composite Desktop (Aero Glass)</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" v-model="enableMenuAnimations" @change="saveSettings" />
            <span>Hiệu ứng chuyển cảnh (Animations)</span>
          </label>
        </div>

        <p class="config-section-title">Âm thanh &amp; truyền tải</p>
        <div class="custom-options-grid">
          <label class="checkbox-option">
            <input type="checkbox" v-model="enableAudio" @change="saveSettings" />
            <span>Âm thanh từ máy remote (~1,9 Mbps khi có tiếng)</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" v-model="enableGfx" @change="saveSettings" />
            <span>Đồ họa RDP 8 / GFX (giảm băng thông từ máy remote, luôn 32-bit)</span>
          </label>

          <label class="checkbox-option">
            <input type="checkbox" v-model="wsCompression" @change="saveSettings" />
            <span>Nén dữ liệu tới trình duyệt (hợp mạng yếu, tốn CPU server)</span>
          </label>

          <label v-if="webpSupported" class="checkbox-option">
            <input type="checkbox" v-model="imageWebp" @change="saveSettings" />
            <span>Ảnh WebP (nhẹ hơn JPEG, guacd tốn CPU hơn)</span>
          </label>
        </div>

        <div class="modal-actions" style="margin-top: 20px;">
          <button type="button" @click="showConfigModal = false">Xong</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { getToken, clearToken } from '../auth';
import { ref, onMounted, onUnmounted, watch } from 'vue';

// Fullscreen
const isFs = ref(false);
const _isInFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
const _onFsChange = () => { isFs.value = _isInFs(); };
const enterFullscreen = () => {
  if (!_isInFs()) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (req) {
      try {
        const p = req.call(el);
        if (p?.catch) p.catch(() => {});
        return p;
      } catch {}
    }
  }
  return null;
};
const toggleFullscreen = () => {
  if (!_isInFs()) {
    enterFullscreen();
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (exit) try { exit.call(document); } catch {}
  }
};
import { useRouter } from 'vue-router';
import axios from 'axios';

const hosts = ref([]);
const router = useRouter();
let fetchInterval = null;
const selectedAgentId = ref('');
const rdpUsername = ref('');
const rdpPassword = ref('');
const rdpDomain = ref('');
const rdpSecurity = ref('auto');
const passcode = ref('');

const preset = ref(localStorage.getItem('rdpPreset') || 'default');
const colorDepth = ref(localStorage.getItem('rdpColorDepth') || '16');
const enableWallpaper = ref(localStorage.getItem('rdpEnableWallpaper') === 'true');
const enableTheming = ref(localStorage.getItem('rdpEnableTheming') === 'true');
const enableFontSmoothing = ref(localStorage.getItem('rdpEnableFontSmoothing') === 'true');
const enableFullWindowDrag = ref(localStorage.getItem('rdpEnableFullWindowDrag') === 'true');
const enableDesktopComposition = ref(localStorage.getItem('rdpEnableDesktopComposition') === 'true');
const enableMenuAnimations = ref(localStorage.getItem('rdpEnableMenuAnimations') === 'true');
const enableAudio = ref(localStorage.getItem('rdpEnableAudio') === 'true');
const enableGfx = ref(localStorage.getItem('rdpEnableGfx') === 'true');
const wsCompression = ref(localStorage.getItem('rdpWsCompression') === 'true');
const imageWebp = ref(localStorage.getItem('rdpImageWebp') === 'true');
// Only offer WebP when this browser can decode it
const webpSupported = (() => {
  try { return document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp'); }
  catch { return false; }
})();
const autoFullscreen = ref(localStorage.getItem('rdpAutoFullscreen') === 'true');
const showConfigModal = ref(false);

const loginCollapsed = ref(localStorage.getItem('dashLoginCollapsed') === 'true');
const connCollapsed = ref(localStorage.getItem('dashConnCollapsed') === 'true');
const perfCollapsed = ref(localStorage.getItem('dashPerfCollapsed') === 'true');

watch(loginCollapsed, v => localStorage.setItem('dashLoginCollapsed', String(v)));
watch(connCollapsed, v => localStorage.setItem('dashConnCollapsed', String(v)));
watch(perfCollapsed, v => localStorage.setItem('dashPerfCollapsed', String(v)));
watch(autoFullscreen, v => localStorage.setItem('rdpAutoFullscreen', String(v)));

const saveSettings = () => {
  localStorage.setItem('rdpPreset', preset.value);
  localStorage.setItem('rdpColorDepth', colorDepth.value);
  localStorage.setItem('rdpEnableWallpaper', String(enableWallpaper.value));
  localStorage.setItem('rdpEnableTheming', String(enableTheming.value));
  localStorage.setItem('rdpEnableFontSmoothing', String(enableFontSmoothing.value));
  localStorage.setItem('rdpEnableFullWindowDrag', String(enableFullWindowDrag.value));
  localStorage.setItem('rdpEnableDesktopComposition', String(enableDesktopComposition.value));
  localStorage.setItem('rdpEnableMenuAnimations', String(enableMenuAnimations.value));
  localStorage.setItem('rdpEnableAudio', String(enableAudio.value));
  localStorage.setItem('rdpEnableGfx', String(enableGfx.value));
  localStorage.setItem('rdpWsCompression', String(wsCompression.value));
  localStorage.setItem('rdpImageWebp', String(imageWebp.value));
};

// Values each preset enforces. GFX always runs at 32-bit colour (the server forces it).
const NO_EFFECTS = {
  enableWallpaper: false, enableTheming: false, enableFontSmoothing: false,
  enableFullWindowDrag: false, enableDesktopComposition: false, enableMenuAnimations: false,
};
const ALL_EFFECTS = {
  enableWallpaper: true, enableTheming: true, enableFontSmoothing: true,
  enableFullWindowDrag: true, enableDesktopComposition: true, enableMenuAnimations: true,
};
const PRESETS = {
  default: { colorDepth: '32', ...NO_EFFECTS, enableAudio: false, enableGfx: true, wsCompression: true, imageWebp: true },
  speed: { colorDepth: '32', ...NO_EFFECTS, enableAudio: false, enableGfx: true, wsCompression: true, imageWebp: false },
  quality: { colorDepth: '32', ...ALL_EFFECTS, enableAudio: true, enableGfx: false, wsCompression: false, imageWebp: false },
};
const presetRefs = {
  colorDepth, enableWallpaper, enableTheming, enableFontSmoothing, enableFullWindowDrag,
  enableDesktopComposition, enableMenuAnimations, enableAudio, enableGfx, wsCompression, imageWebp,
};

const applyPreset = () => {
  const values = PRESETS[preset.value];
  if (values) {
    for (const [key, value] of Object.entries(values)) presetRefs[key].value = value;
  } else if (preset.value === 'custom') {
    showConfigModal.value = true;
  }
  saveSettings();
};

const fetchHosts = async () => {
  try {
    const token = getToken();
    const response = await axios.get('/api/hosts', {
      headers: { Authorization: `Bearer ${token}` }
    });
    hosts.value = response.data;
  } catch (error) {
    if (error.response && [401, 403].includes(error.response.status)) logout();
    console.error('Error fetching hosts:', error);
  }
};

const openConnectDialog = (id) => {
  selectedAgentId.value = id;
  rdpUsername.value = localStorage.getItem('lastRdpUsername') || '';
  rdpPassword.value = '';
  rdpDomain.value = localStorage.getItem('lastRdpDomain') || '';
  rdpSecurity.value = localStorage.getItem(`rdpSecurityMode:${id}`) || 'auto';
};

const closeConnectDialog = () => {
  selectedAgentId.value = '';
  rdpPassword.value = '';
  passcode.value = '';
};

const connect = async () => {
  const id = selectedAgentId.value;
  if (!id) return;

  localStorage.setItem('lastRdpUsername', rdpUsername.value);
  localStorage.setItem('lastRdpDomain', rdpDomain.value);
  localStorage.setItem(`rdpSecurityMode:${id}`, rdpSecurity.value);

  saveSettings();

  sessionStorage.setItem(`rdpCredentials:${id}`, JSON.stringify({
    username: rdpUsername.value,
    password: rdpPassword.value,
    domain: rdpDomain.value,
    security: rdpSecurity.value,
    passcode: passcode.value,
    colorDepth: colorDepth.value,
    enableWallpaper: enableWallpaper.value,
    enableTheming: enableTheming.value,
    enableFontSmoothing: enableFontSmoothing.value,
    enableFullWindowDrag: enableFullWindowDrag.value,
    enableDesktopComposition: enableDesktopComposition.value,
    enableMenuAnimations: enableMenuAnimations.value,
    enableAudio: enableAudio.value,
    enableGfx: enableGfx.value,
    wsCompression: wsCompression.value,
    imageWebp: imageWebp.value && webpSupported
  }));

  if (autoFullscreen.value && !_isInFs()) {
    const p = enterFullscreen();
    if (p && p.then) {
      await p.catch(() => {});
    }
    await new Promise(r => setTimeout(r, 150));
  }

  router.push(`/remote/${id}`);
};

const logout = () => {
  clearToken();
  router.push('/login');
};

onMounted(() => {
  fetchHosts();
  fetchInterval = setInterval(fetchHosts, 5000);
  // Non-custom presets are re-applied on every visit so changes to their definition take effect
  if (preset.value !== 'custom') {
    if (!PRESETS[preset.value]) preset.value = 'default';
    applyPreset();
  }
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(e => document.addEventListener(e, _onFsChange));
});

onUnmounted(() => {
  if (fetchInterval) clearInterval(fetchInterval);
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(e => document.removeEventListener(e, _onFsChange));
});
</script>

<style scoped>
.dashboard { padding: 20px; }
.header { display: flex; justify-content: space-between; align-items: center; }
.logout-btn { background: #dc3545; width: auto; padding: 10px 20px; }
.logout-btn:hover { background: #c82333; }
.fs-btn { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #ccc; width: 38px; height: 38px; border-radius: 6px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background 0.15s; padding: 0; }
.fs-btn:hover { background: rgba(255,255,255,0.18); color: #fff; }
.host-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 20px; margin-top: 20px; }
.host-card { border: 1px solid #444; padding: 15px; border-radius: 8px; background: #2a2a2a; }
.online { color: #4caf50; }
button { background: #007bff; color: white; border: none; padding: 10px; border-radius: 4px; cursor: pointer; width: 100%; }
button:hover { background: #0056b3; }
.modal-backdrop {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.62);
  z-index: 5;
}
.modal {
  width: min(420px, calc(100vw - 32px));
  background: #242424;
  border: 1px solid #444;
  border-radius: 8px;
  padding: 20px;
}
.modal h2 { margin: 0 0 4px; }
.target-host { margin: 0 0 18px; color: #bbb; }
label { display: grid; gap: 6px; margin-bottom: 14px; }
input,
select {
  box-sizing: border-box;
  width: 100%;
  padding: 10px 12px;
  color: white;
  background: #181818;
  border: 1px solid #555;
  border-radius: 4px;
}
.auto-fs-row { padding: 8px 0 4px; border-top: 1px solid rgba(255,255,255,0.07); margin-top: 4px; }
.modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
.modal-actions button { width: auto; min-width: 104px; }
.secondary-btn { background: #555; }
.secondary-btn:hover { background: #666; }

/* Collapsible groups */
.collapsible-group {
  margin-bottom: 10px;
}
.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  padding: 6px 0;
  border-bottom: 1px solid #333;
  margin-bottom: 10px;
  user-select: none;
}
.group-title {
  font-size: 12px;
  font-weight: 600;
  color: #aaa;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.chevron {
  font-size: 11px;
  color: #aaa;
  display: inline-block;
}

/* Preset optimization UI */
.config-section-title {
  margin: 16px 0 6px;
  font-weight: 600;
}

.preset-section {
  margin-bottom: 18px;
  background: #1a1a1a;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid #333;
}
.preset-section label {
  font-size: 13px;
  font-weight: bold;
  color: #bbb;
  margin-bottom: 6px;
}
.preset-options {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}
.preset-option-radio {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
}
.preset-option-radio input {
  width: auto;
  margin: 0;
}
.configure-btn {
  margin-top: 10px;
  background: #444;
  color: white;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
  width: auto;
}
.configure-btn:hover {
  background: #555;
}
.custom-options-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-top: 14px;
  max-height: 250px;
  overflow-y: auto;
  padding-right: 6px;
}
.checkbox-option {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  margin-bottom: 0;
}
.checkbox-option input {
  width: auto;
  margin: 0;
}
.custom-config-backdrop {
  z-index: 10;
}
.custom-config-modal {
  border: 1px solid #007bff;
}
</style>
