<template>
  <div class="login-container">
    <button class="fs-btn" @click="toggleFullscreen" :title="isFs ? 'Thoát toàn màn hình' : 'Toàn màn hình'">
      <svg v-if="!isFs" xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
        <path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10.5 0a.5.5 0 0 1 0 1h4a.5.5 0 0 0 .5.5v4a.5.5 0 0 1 1 0v-4A1.5 1.5 0 0 1 14.5 0h-4zM1 10.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1 10.5zm14.5 0a.5.5 0 0 1 1 0v4a1.5 1.5 0 0 1-1 1h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4z"/>
      </svg>
      <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="currentColor" viewBox="0 0 16 16">
        <path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 5V.5a.5.5 0 0 1 .5-.5zM0 11.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 12.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z"/>
      </svg>
    </button>
    <div class="login-box">
      <h2>Login</h2>
      <form @submit.prevent="handleLogin">
        <div class="form-group">
          <label>Password</label>
          <input type="password" v-model="password" required autofocus />
        </div>
        <button type="submit" :disabled="locked">{{ locked ? `Thử lại sau ${countdown}s` : 'Login' }}</button>
        <p v-if="error" class="error">{{ error }}</p>
      </form>
    </div>
  </div>
</template>

<script setup>
import { setToken } from '../auth';
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';

const password = ref('');
const error = ref('');
const router = useRouter();

// Fullscreen
const isFs = ref(false);
const _isInFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
const _onFsChange = () => { isFs.value = _isInFs(); };
const toggleFullscreen = () => {
  if (!_isInFs()) {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
    if (req) try { const p = req.call(el); if (p && p.catch) p.catch(() => {}); } catch {}
    try { if (screen.orientation?.lock) screen.orientation.lock('any').catch(() => {}); } catch {}
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    if (exit) try { exit.call(document); } catch {}
    try { if (screen.orientation?.unlock) screen.orientation.unlock(); } catch {}
  }
};

onMounted(() => {
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(e => document.addEventListener(e, _onFsChange));
});
onUnmounted(() => {
  ['fullscreenchange','webkitfullscreenchange','mozfullscreenchange','MSFullscreenChange']
    .forEach(e => document.removeEventListener(e, _onFsChange));
});

// Client-side lockout feedback (mirrors server 429)
const locked = ref(false);
const countdown = ref(0);
let _lockTimer = null;
const _startLock = (secs) => {
  locked.value = true;
  countdown.value = secs;
  _lockTimer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      clearInterval(_lockTimer);
      locked.value = false;
    }
  }, 1000);
};

const handleLogin = async () => {
  if (locked.value) return;
  error.value = '';
  try {
    const res = await axios.post('/api/login', { password: password.value });
    setToken(res.data.token);
    router.push('/');
  } catch (err) {
    if (err.response?.status === 429) {
      error.value = 'Quá nhiều lần thử. Vui lòng đợi.';
      _startLock(30);
    } else {
      error.value = 'Sai mật khẩu';
    }
    password.value = '';
  }
};
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: #1a1a1a;
  position: relative;
}
.fs-btn {
  position: absolute;
  top: 16px;
  right: 16px;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  color: #ccc;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}
.fs-btn:hover { background: rgba(255,255,255,0.15); color: #fff; }
.login-box {
  background: #2a2a2a;
  padding: 30px;
  border-radius: 8px;
  width: 300px;
  text-align: center;
}
.form-group { margin-bottom: 15px; text-align: left; }
input { width: 100%; padding: 8px; margin-top: 5px; box-sizing: border-box; background: #1e1e1e; border: 1px solid #444; color: #eee; border-radius: 4px; }
button[type=submit] { width: 100%; padding: 10px; background: #007bff; color: white; border: none; cursor: pointer; border-radius: 4px; font-size: 14px; }
button[type=submit]:hover:not(:disabled) { background: #0056b3; }
button[type=submit]:disabled { background: #555; cursor: not-allowed; }
.error { color: #ff4d4d; margin-top: 10px; font-size: 13px; }
</style>
