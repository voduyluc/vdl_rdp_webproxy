<template>
  <div class="canvas-container" :class="{ 'mode-scroll': displayMode === 'scroll' && !windowCrop, 'mode-crop-scroll': displayMode === 'scroll' && !!windowCrop }" ref="container">
    <div class="display-container" :class="{ 'hide-cursor': hideCursor }" ref="displayContainer"></div>
    <div v-if="statusText" class="status">{{ statusText }}</div>
    <div v-if="gestureZoom !== 1" class="zoom-badge" @click="resetGesture" title="Nhấn để reset zoom">
      {{ Math.round(gestureZoom * 100) }}%&nbsp;✕
    </div>
    <!-- Fullscreen overlay for touchpad mode: captures touches outside the canvas area -->
    <div v-if="touchMode === 'touchpad'" ref="touchpadOverlayRef" class="touchpad-fullscreen-overlay" />
  </div>
</template>

<script setup>
import { getToken } from '../auth';
import { ref, onMounted, onUnmounted, watch } from 'vue';
import axios from 'axios';
import Guacamole from 'guacamole-common-js';

const props = defineProps({
  agentId: { type: String, required: true },
  screenSize: { type: String, default: 'auto' },
  touchMode: { type: String, default: 'touchscreen' },
  displayMode: { type: String, default: 'autofit' },
  hideCursor: { type: Boolean, default: false },
  windowCrop: { type: Object, default: null }, // { x, y, width, height } in RDP coords
  gestureEnabled: { type: Boolean, default: true },
  viewScale: { type: String, default: 'auto' },
  pinnedToolbarHeight: { type: Number, default: 0 }
});

const emit = defineEmits(['resolution']);

const container = ref(null);
const displayContainer = ref(null);
const touchpadOverlayRef = ref(null);
const statusText = ref('Connecting...');
let client = null;
let mouse = null;
let keyboard = null;
let _wheelHandler = null;
let _wheelShiftActive = false;
let _wheelShiftTimer = null;
let _wheelDeltaXAccum = 0;
let _wheelDeltaYAccum = 0;
let _wheelResetTimer = null;
let _touch2StartHandler = null;
let _touch2MoveHandler = null;
let _touch2EndHandler = null;
let _touch2El = null; // element that _touch2 handlers are attached to

const _isUIElement = (target) => {
  if (!target || !(target instanceof Element)) return false;
  return !!target.closest(
    '.toolbar, .toolbar-trigger, .sidebar, .sidebar-editor-overlay, ' +
    '.settings-panel, .actions-panel, .windows-panel, .special-keys-popup, ' +
    '.send-text-popup, .info-dialog, .info-dialog-overlay, .upload-panel, ' +
    '.window-crop-badge, .zoom-badge, .status'
  );
};
const _isTypingInInput = () => {
  const el = document.activeElement;
  return el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.tagName === 'SELECT');
};
let retrying = false;
let resizeObserver = null;
let fullscreenListener = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let cachedCredentials = null; // persists across reconnects
let fitDisplayTimer = null;

// Two-finger pinch-zoom and pan gesture state
const gestureZoom = ref(1);
let _gestureZoom = 1;
let _gesturePanX = 0;
let _gesturePanY = 0;
let _gestureActive = false;
let _gesturePrevDist = 0;
let _gesturePrevCX = 0;
let _gesturePrevCY = 0;

// Last single-finger touch position (screen coords) — used for teleport feature
let _lastTouchClientX = -1;
let _lastTouchClientY = -1;

// Clamp pan so the canvas never exposes empty space beyond container edges.
const _clampGesturePan = () => {
  if (!client || !container.value) return;
  const cW = container.value.offsetWidth;
  const cH = container.value.offsetHeight;
  const canvas = client.getDisplay().getElement();
  if (!canvas) return;
  const cvsW = canvas.offsetWidth;
  const cvsH = canvas.offsetHeight;
  const ox = (cW - cvsW) / 2;  // canvas layout offset in displayContainer (≥ 0 after fitDisplay)
  const oy = (cH - cvsH) / 2;
  const scaledW = cvsW * _gestureZoom;
  const scaledH = cvsH * _gestureZoom;

  // With transform-origin:0 0 and transform:translate(panX,panY) scale(zoom),
  // a point at layout position x maps to visual position: zoom*x + panX.
  // Canvas left edge  → zoom * ox + panX  (must be ≤ 0, no black on left)
  // Canvas right edge → zoom * ox + scaledW + panX  (must be ≥ cW, no black on right)

  if (scaledW <= cW) {
    // Canvas fits horizontally — center it (compensate for scale-from-origin shift)
    _gesturePanX = (cW - scaledW) / 2 - _gestureZoom * ox;
  } else {
    const pxMax = -_gestureZoom * ox;           // left edge flush with container left (≤ 0)
    const pxMin = pxMax - (scaledW - cW);       // right edge flush with container right
    _gesturePanX = Math.max(pxMin, Math.min(pxMax, _gesturePanX));
  }

  if (scaledH <= cH) {
    _gesturePanY = (cH - scaledH) / 2 - _gestureZoom * oy;
  } else {
    // Allow free upward pan (no lower bound) so user can reach content behind Android keyboard.
    // Only prevent panning the top of the canvas below the container top.
    const pyMax = -_gestureZoom * oy;
    _gesturePanY = Math.min(pyMax, _gesturePanY);
  }
};

const _applyGestureTransform = () => {
  if (!displayContainer.value) return;
  if (_gestureZoom === 1 && _gesturePanX === 0 && _gesturePanY === 0) {
    displayContainer.value.style.transform = '';
    displayContainer.value.style.transformOrigin = '';
  } else {
    displayContainer.value.style.transformOrigin = '0 0';
    displayContainer.value.style.transform = `translate(${_gesturePanX}px, ${_gesturePanY}px) scale(${_gestureZoom})`;
  }
  gestureZoom.value = _gestureZoom;
};

const resetGesture = () => {
  _gestureZoom = 1;
  _gesturePanX = 0;
  _gesturePanY = 0;
  _clampGesturePan();
  _applyGestureTransform();
};

const _touchDist = (t1, t2) => {
  const dx = t1.clientX - t2.clientX, dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
};

const _onGestureTouchStart = (e) => {
  if (_isUIElement(e.target)) return;
  // touchpad/touchscreen2 modes use _touch2 handlers for 2-finger → no visual CSS zoom
  if (props.touchMode === 'touchpad' || props.touchMode === 'touchscreen2') return;
  if (e.touches.length === 2) {
    _gestureActive = true;
    _gesturePrevDist = _touchDist(e.touches[0], e.touches[1]);
    _gesturePrevCX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    _gesturePrevCY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    e.preventDefault();
    e.stopPropagation();
  }
};

const _onGestureTouchMove = (e) => {
  if (_isUIElement(e.target)) return;
  if (!_gestureActive || e.touches.length !== 2) return;
  e.preventDefault();
  e.stopPropagation();

  const dist = _touchDist(e.touches[0], e.touches[1]);
  const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
  const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;

  const distRatio = dist / _gesturePrevDist;
  if (Math.abs(distRatio - 1) > 0.02) {
    _gestureZoom = Math.max(0.5, Math.min(5, _gestureZoom * distRatio));
  }
  _gesturePanX += cx - _gesturePrevCX;
  _gesturePanY += cy - _gesturePrevCY;

  _gesturePrevDist = dist;
  _gesturePrevCX = cx;
  _gesturePrevCY = cy;

  _clampGesturePan();
  _applyGestureTransform();
};

const _onGestureTouchEnd = (e) => {
  if (_isUIElement(e.target)) return;
  if (e.touches.length < 2) _gestureActive = false;
};

const _onTrackTouch = (e) => {
  if (_isUIElement(e.target)) return;
  if (e.touches.length === 1 && !_gestureActive) {
    _lastTouchClientX = e.touches[0].clientX;
    _lastTouchClientY = e.touches[0].clientY;
  }
};

const SECURITY_TYPES = ['nla', 'tls', 'rdp', 'nla-ext', 'any'];
const RECONNECT_BASE_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;

// Only reconnect for transient network/timeout failures.
// Server-initiated closes (user logged in at host, session conflict, etc.) must NOT trigger reconnect.
const RECONNECTABLE_CODES = new Set([
  0x0202, // UPSTREAM_TIMEOUT – guacd couldn't reach RDP server temporarily
  0x0308, // CLIENT_TIMEOUT   – keep-alive timeout (network glitch)
]);

const getSecurityAttempts = (credentials) => {
  const securityMode = credentials.security || 'auto';
  if (securityMode !== 'auto') return [securityMode];

  const preferred = localStorage.getItem(`rdpPreferredSecurity:${props.agentId}`);
  return [
    preferred,
    ...SECURITY_TYPES
  ].filter((value, index, values) => value && values.indexOf(value) === index);
};

const clearInputHandlers = () => {
  if (keyboard) {
    keyboard.onkeydown = null;
    keyboard.onkeyup = null;
    keyboard = null;
  }
  if (mouse) {
    mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = null;
    mouse = null;
  }
  if (container.value) {
    container.value.removeEventListener('touchstart', _onGestureTouchStart, { capture: true });
    container.value.removeEventListener('touchmove',  _onGestureTouchMove,  { capture: true });
    container.value.removeEventListener('touchend',   _onGestureTouchEnd,   { capture: true });
    container.value.removeEventListener('touchstart', _onTrackTouch);
    container.value.removeEventListener('touchmove',  _onTrackTouch);
    if (_wheelHandler) {
      container.value.removeEventListener('wheel', _wheelHandler, { capture: true });
      _wheelHandler = null;
    }
    if (_wheelShiftTimer) {
      clearTimeout(_wheelShiftTimer);
      _wheelShiftTimer = null;
    }
    if (_wheelShiftActive && client) {
      try { client.sendKeyEvent(0, 0xFFE1); } catch {}
      _wheelShiftActive = false;
    }
    if (_wheelResetTimer) {
      clearTimeout(_wheelResetTimer);
      _wheelResetTimer = null;
    }
    _wheelDeltaXAccum = 0;
    _wheelDeltaYAccum = 0;
    if (_touch2StartHandler) {
      const t2el = _touch2El || container.value;
      t2el?.removeEventListener('touchstart', _touch2StartHandler, { capture: true });
      t2el?.removeEventListener('touchmove',  _touch2MoveHandler,  { capture: true });
      t2el?.removeEventListener('touchend',   _touch2EndHandler,   { capture: true });
      _touch2StartHandler = _touch2MoveHandler = _touch2EndHandler = _touch2El = null;
    }
  }
};

const getConnectionSize = () => {
  const isAutoFs = localStorage.getItem('rdpAutoFullscreen') === 'true';
  const isCurrentlyFullscreen = !!(
    document.fullscreenElement || document.webkitFullscreenElement ||
    document.mozFullScreenElement || document.msFullscreenElement
  );

  const bounds = container.value?.getBoundingClientRect() || {};
  let viewportWidth = Math.floor(bounds.width || window.innerWidth);
  let viewportHeight = Math.floor(bounds.height || window.innerHeight);

  if (isAutoFs || isCurrentlyFullscreen) {
    // If auto-fullscreen or already fullscreen, ensure we take full screen dimensions
    // rather than inner window bounds from before fullscreen.
    const isSmallTouch = window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
    let sW = window.screen?.width || viewportWidth;
    let sH = window.screen?.height || viewportHeight;

    if (isSmallTouch && sH > sW) {
      // Mobile device locking to landscape
      const tmp = sW;
      sW = sH;
      sH = tmp;
    }

    viewportWidth = Math.max(viewportWidth, Math.floor(sW));
    viewportHeight = Math.max(viewportHeight, Math.floor(sH - props.pinnedToolbarHeight));
  } else if (window.visualViewport) {
    // In fullscreen on Android the layout viewport may not shrink when the soft keyboard
    // appears (keyboard overlays). Cap to visualViewport to get the true visible height.
    // Subtract the pinned toolbar height (passed as prop) since it consumes space above the canvas.
    const vp = window.visualViewport;
    viewportWidth  = Math.min(viewportWidth,  Math.floor(vp.width));
    viewportHeight = Math.min(viewportHeight, Math.floor(vp.height) - props.pinnedToolbarHeight);
  }

  // viewScale divides the resolution: 200% → half resolution → larger UI on host
  const scaleFactor = (props.viewScale && props.viewScale !== 'auto')
    ? (100 / parseFloat(props.viewScale))
    : 1;

  const _scale = (v) => Math.max(1, Math.round(v * scaleFactor));

  if (props.screenSize && props.screenSize.includes('x')) {
    const [width, height] = props.screenSize.split('x').map((value) => Number.parseInt(value, 10));
    if (Number.isFinite(width) && Number.isFinite(height)) return { width: _scale(width), height: _scale(height) };
  }

  if (props.screenSize === 'viewport') {
    return {
      width:  Math.max(640, _scale(viewportWidth)),
      height: Math.max(480, _scale(viewportHeight))
    };
  }

  const isSmallTouchScreen = window.matchMedia('(pointer: coarse) and (max-width: 900px)').matches;
  if (isSmallTouchScreen) {
    const isPortrait = viewportHeight > viewportWidth;
    if (isPortrait) {
      return {
        width:  Math.max(540, _scale(viewportWidth  * 2)),
        height: Math.max(960, _scale(viewportHeight * 2))
      };
    }
    return {
      width:  Math.max(960, _scale(viewportWidth  * 2)),
      height: Math.max(540, _scale(viewportHeight * 2))
    };
  }

  return {
    width:  Math.max(1024, _scale(viewportWidth)),
    height: Math.max(768,  _scale(viewportHeight))
  };
};

const setupInputHandlers = () => {
  if (!client) return;
  clearInputHandlers();

  const display = client.getDisplay().getElement();
  const sendMouse = (mouseState) => {
    // Correct coordinates when gesture zoom is active — Guacamole's Mouse handler
    // measures position relative to the display element, but the CSS gestureZoom
    // transform makes the element appear larger; we divide to undo that scaling.
    if (_gestureZoom !== 1) {
      client.sendMouseState(
        new Guacamole.Mouse.State(
          mouseState.x / _gestureZoom,
          mouseState.y / _gestureZoom,
          mouseState.left, mouseState.middle, mouseState.right,
          mouseState.up, mouseState.down
        ),
        true
      );
    } else {
      client.sendMouseState(mouseState, true);
    }
  };

  if (props.touchMode === 'touchpad') {
    // Use fullscreen overlay so touchpad works outside the canvas/remote area
    const touchpadEl = touchpadOverlayRef.value || display;
    mouse = new Guacamole.Mouse.Touchpad(touchpadEl);
  } else if (props.touchMode === 'touchscreen' || props.touchMode === 'touchscreen2') {
    mouse = new Guacamole.Mouse.Touchscreen(display);
  } else {
    mouse = new Guacamole.Mouse(display);
  }

  mouse.onmousedown = mouse.onmouseup = mouse.onmousemove = sendMouse;

  // Forward wheel events (laptop touchpad two-finger scroll + regular mouse wheel)
  // Guacamole.Mouse only fires onmousescroll for the 'mouse' mode; touchpad/touchscreen
  // modes don't get wheel events. We wire it manually for all modes.
  // Note: We attach in the capture phase so we intercept before Guacamole.Mouse's
  // internal listener on display element, preventing unwanted vertical scrolling on horizontal trackpad swipes.
  _wheelHandler = (e) => {
    if (!client) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();

    const canvas = client.getDisplay().getElement();
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    const x = _gestureZoom !== 1 ? rawX / _gestureZoom : rawX;
    const y = _gestureZoom !== 1 ? rawY / _gestureZoom : rawY;

    const _sendScroll = (scrollUp, lines) => {
      for (let i = 0; i < lines; i++) {
        client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, false, scrollUp, !scrollUp), true);
        client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, false, false,    false),      true);
      }
    };

    // Normalize deltas across deltaMode (0: pixels, 1: lines, 2: pages)
    const PIXELS_PER_LINE = 40;
    const PIXELS_PER_PAGE = 800;
    let dx = e.deltaX || 0;
    let dy = e.deltaY || 0;
    if (e.deltaMode === 1) {
      dx *= PIXELS_PER_LINE;
      dy *= PIXELS_PER_LINE;
    } else if (e.deltaMode === 2) {
      dx *= PIXELS_PER_PAGE;
      dy *= PIXELS_PER_PAGE;
    }

    // Ctrl+scroll = zoom (pinch gesture on touchpad, or Ctrl+mousewheel)
    if (e.ctrlKey) {
      if (_wheelShiftActive) {
        clearTimeout(_wheelShiftTimer);
        _wheelShiftTimer = null;
        client.sendKeyEvent(0, 0xFFE1);
        _wheelShiftActive = false;
      }
      client.sendKeyEvent(1, 0xFFE3); // Ctrl down
      const lines = Math.round(Math.abs(dy) / 100) || 1;
      _sendScroll(dy < 0, lines);
      client.sendKeyEvent(0, 0xFFE3); // Ctrl up
      return;
    }

    // Accumulate deltas to smoothly support laptop trackpad gestures
    _wheelDeltaXAccum += dx;
    _wheelDeltaYAccum += dy;

    if (_wheelResetTimer) clearTimeout(_wheelResetTimer);
    _wheelResetTimer = setTimeout(() => {
      _wheelDeltaXAccum = 0;
      _wheelDeltaYAccum = 0;
      _wheelResetTimer = null;
    }, 250);

    const SCROLL_THRESHOLD = 30; // Threshold per scroll line/notch

    // Determine primary scroll direction based on accumulated magnitude
    if (Math.abs(_wheelDeltaXAccum) > Math.abs(_wheelDeltaYAccum)) {
      if (Math.abs(_wheelDeltaXAccum) >= SCROLL_THRESHOLD) {
        const lines = Math.floor(Math.abs(_wheelDeltaXAccum) / SCROLL_THRESHOLD);
        const scrollLeft = _wheelDeltaXAccum < 0;
        _wheelDeltaXAccum = _wheelDeltaXAccum % SCROLL_THRESHOLD;
        _wheelDeltaYAccum = 0; // Clear cross-axis drift

        // Hold Shift continuously during horizontal scroll gesture
        if (!_wheelShiftActive) {
          client.sendKeyEvent(1, 0xFFE1); // Shift down
          _wheelShiftActive = true;
        }

        // In Windows with Shift held: WheelUp = scroll left, WheelDown = scroll right
        _sendScroll(scrollLeft, lines);

        // Keep Shift held until horizontal scroll gesture ends (debounced 150ms)
        if (_wheelShiftTimer) clearTimeout(_wheelShiftTimer);
        _wheelShiftTimer = setTimeout(() => {
          if (_wheelShiftActive && client) {
            client.sendKeyEvent(0, 0xFFE1); // Shift up
            _wheelShiftActive = false;
          }
          _wheelShiftTimer = null;
        }, 150);
      }
      return;
    }

    // Vertical scroll
    if (_wheelShiftActive) {
      clearTimeout(_wheelShiftTimer);
      _wheelShiftTimer = null;
      client.sendKeyEvent(0, 0xFFE1); // Shift up
      _wheelShiftActive = false;
    }

    if (Math.abs(_wheelDeltaYAccum) >= SCROLL_THRESHOLD) {
      const lines = Math.floor(Math.abs(_wheelDeltaYAccum) / SCROLL_THRESHOLD);
      const scrollUp = _wheelDeltaYAccum < 0;
      _wheelDeltaYAccum = _wheelDeltaYAccum % SCROLL_THRESHOLD;
      _wheelDeltaXAccum = 0; // Clear cross-axis drift
      _sendScroll(scrollUp, lines);
    }
  };
  container.value?.addEventListener('wheel', _wheelHandler, { passive: false, capture: true });

  // touchscreen2 / touchpad: intercept 2-finger gestures, forward as scroll/zoom to host
  // For touchpad mode this also enables horizontal 2-finger swipe (Shift+scroll)
  if (props.touchMode === 'touchscreen2' || props.touchMode === 'touchpad') {
    let _t2Prev = null;      // { dist, cx, cy }
    let _t2Active = false;   // true while a 2-finger gesture is in progress
    let _t2StartTime = 0;
    let _t2Moved = false;
    let _t2ShiftActive = false;
    const _t2Dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    const _t2SendScroll = (scrollUp, lines, mx, my) => {
      const canvas = client?.getDisplay()?.getElement();
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = (mx - rect.left) / (_gestureZoom || 1);
      const y = (my - rect.top)  / (_gestureZoom || 1);
      for (let i = 0; i < lines; i++) {
        client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, false, scrollUp, !scrollUp), true);
        client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, false, false, false), true);
      }
    };
    _touch2StartHandler = (e) => {
      if (_isUIElement(e.target)) return;
      if (e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();
        _t2Active = true;
        _t2StartTime = Date.now();
        _t2Moved = false;
        _t2ShiftActive = false;
        _t2Prev = {
          dist: _t2Dist(e.touches[0], e.touches[1]),
          cx: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          cy: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        };
      }
    };
    _touch2MoveHandler = (e) => {
      if (_isUIElement(e.target)) return;
      if (!_t2Prev || e.touches.length !== 2) return;
      e.preventDefault();
      e.stopPropagation();
      const dist = _t2Dist(e.touches[0], e.touches[1]);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const dDist = dist - _t2Prev.dist;
      const dx = cx - _t2Prev.cx;
      const dy = cy - _t2Prev.cy;

      if (Math.abs(dDist) > 3 || Math.abs(dx) > 4 || Math.abs(dy) > 4) _t2Moved = true;

      // Pinch (significant distance change) → Ctrl+scroll (zoom)
      if (Math.abs(dDist) > 3) {
        if (_t2ShiftActive) {
          client?.sendKeyEvent(0, 0xFFE1);
          _t2ShiftActive = false;
        }
        const lines = Math.max(1, Math.round(Math.abs(dDist) / 15));
        client?.sendKeyEvent(1, 0xFFE3);
        _t2SendScroll(dDist > 0, lines, cx, cy);
        client?.sendKeyEvent(0, 0xFFE3);
      } else if (Math.abs(dy) > 2 || Math.abs(dx) > 2) {
        // Pan: vertical scroll or horizontal scroll (Shift+scroll)
        if (Math.abs(dy) >= Math.abs(dx)) {
          if (_t2ShiftActive) {
            client?.sendKeyEvent(0, 0xFFE1);
            _t2ShiftActive = false;
          }
          const lines = Math.max(1, Math.round(Math.abs(dy) / 12));
          _t2SendScroll(dy < 0, lines, cx, cy);
        } else {
          if (!_t2ShiftActive) {
            client?.sendKeyEvent(1, 0xFFE1); // Hold Shift down during horizontal swipe
            _t2ShiftActive = true;
          }
          const lines = Math.max(1, Math.round(Math.abs(dx) / 12));
          _t2SendScroll(dx < 0, lines, cx, cy);
        }
      }
      _t2Prev = { dist, cx, cy };
    };
    _touch2EndHandler = (e) => {
      if (_isUIElement(e.target)) return;
      if (!_t2Active) return;
      // Stop propagation so Guacamole.Mouse.Touchpad (on child display element) never
      // receives this touchend and doesn't fire a spurious click / pointer jump.
      e.stopPropagation();
      if (_t2ShiftActive) {
        client?.sendKeyEvent(0, 0xFFE1); // Release Shift
        _t2ShiftActive = false;
      }
      if (e.touches.length === 0) {
        // Both fingers lifted — check for 2-finger tap → right-click (touchpad mode only)
        if (props.touchMode === 'touchpad' && !_t2Moved &&
            Date.now() - _t2StartTime < 300 && client) {
          // Right-click at current cursor position (no pointer jump)
          const cs = mouse?.currentState;
          const gz = _gestureZoom || 1;
          const x = cs ? cs.x / gz : 0;
          const y = cs ? cs.y / gz : 0;
          client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, true,  false, false), true);
          client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, false, false, false), true);
        }
        _t2Active = false;
        _t2Prev = null;
      }
      // When first finger lifts (one remains), keep _t2Prev so the right-click
      // position is still available when the second finger lifts.
    };
    // In touchpad mode, attach to fullscreen overlay so 2-finger gestures work everywhere
    _touch2El = (props.touchMode === 'touchpad' ? touchpadOverlayRef.value : null) || container.value;
    _touch2El?.addEventListener('touchstart', _touch2StartHandler, { passive: false, capture: true });
    _touch2El?.addEventListener('touchmove',  _touch2MoveHandler,  { passive: false, capture: true });
    _touch2El?.addEventListener('touchend',   _touch2EndHandler,   { capture: true });
  }

  keyboard = new Guacamole.Keyboard(document);
  keyboard.onkeydown = (keysym) => {
    if (!_kbdEnabled || _isTypingInInput()) return;
    client.sendKeyEvent(1, keysym);
  };
  keyboard.onkeyup = (keysym) => {
    if (!_kbdEnabled || _isTypingInInput()) return;
    client.sendKeyEvent(0, keysym);
  };

  // Two-finger pinch-zoom + pan — capture phase so we intercept before Guacamole
  if (container.value && props.gestureEnabled) {
    container.value.addEventListener('touchstart', _onGestureTouchStart, { passive: false, capture: true });
    container.value.addEventListener('touchmove',  _onGestureTouchMove,  { passive: false, capture: true });
    container.value.addEventListener('touchend',   _onGestureTouchEnd,   { capture: true });
  }
  // Track single-touch position for teleport feature (passive — no preventDefault needed)
  if (container.value) {
    container.value.addEventListener('touchstart', _onTrackTouch, { passive: true });
    container.value.addEventListener('touchmove',  _onTrackTouch, { passive: true });
  }
};

const disconnectClient = () => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (fitDisplayTimer) {
    cancelAnimationFrame(fitDisplayTimer);
    fitDisplayTimer = null;
  }
  if (client) {
    client.disconnect();
    client = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (fullscreenListener) {
    document.removeEventListener('fullscreenchange', fullscreenListener);
    document.removeEventListener('webkitfullscreenchange', fullscreenListener);
    document.removeEventListener('mozfullscreenchange', fullscreenListener);
    document.removeEventListener('MSFullscreenChange', fullscreenListener);
    fullscreenListener = null;
  }
  clearInputHandlers();
  _gestureActive = false;
  _gestureZoom = 1;
  _gesturePanX = 0;
  _gesturePanY = 0;
  gestureZoom.value = 1;
  if (displayContainer.value) {
    displayContainer.value.style.transform = '';
    displayContainer.value.style.transformOrigin = '';
  }
};

const scheduleReconnect = () => {
  if (reconnectTimer) return; // already scheduled
  const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(1.5, reconnectAttempts), MAX_RECONNECT_DELAY_MS);
  reconnectAttempts++;
  const secs = Math.round(delay / 1000);
  statusText.value = `Connection lost. Reconnecting in ${secs}s… (attempt ${reconnectAttempts})`;
  console.log(`[Reconnect] Scheduling attempt ${reconnectAttempts} in ${secs}s`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    disconnectClient();
    initGuacamole();
  }, delay);
};

const clearCropStyles = (guacEl) => {
  guacEl.style.position = '';
  guacEl.style.left = '';
  guacEl.style.top = '';
  if (displayContainer.value) {
    displayContainer.value.style.width = '';
    displayContainer.value.style.height = '';
  }
};

const applyCropTransform = (display) => {
  const crop = props.windowCrop;
  if (!crop || !crop.width || !crop.height || !container.value) return;

  const rdpW = display.getWidth();
  const rdpH = display.getHeight();
  if (!rdpW || !rdpH) return;

  const guacEl = display.getElement();

  if (props.displayMode === 'scroll') {
    // Scroll mode: 1:1 pixel, offset guacEl so crop origin sits at display-container origin.
    // canvas-container becomes scrollable (via .mode-crop-scroll class).
    display.scale(1);
    guacEl.style.position = 'absolute';
    guacEl.style.left = -crop.x + 'px';
    guacEl.style.top = -crop.y + 'px';
    if (displayContainer.value) {
      displayContainer.value.style.width = crop.width + 'px';
      displayContainer.value.style.height = crop.height + 'px';
    }
  } else {
    // Fit mode: scale the crop region so it fills the container.
    // Use the PARENT element (canvas-viewport) for stable dimensions — container.offsetHeight
    // is driven by Guacamole's display scale and changes whenever display.scale() is called,
    // causing ResizeObserver to re-enter and oscillate. The parent's clientHeight minus its
    // paddingTop gives the stable visible canvas area that doesn't change with scale changes.
    const parent = container.value.parentElement;
    const cW = parent ? parent.clientWidth : container.value.offsetWidth;
    const parentPT = parent ? (parseFloat(getComputedStyle(parent).paddingTop) || 0) : 0;
    const cH = parent ? (parent.clientHeight - parentPT) : container.value.offsetHeight;
    const s = Math.min(cW / crop.width, cH / crop.height);
    display.scale(s);
    guacEl.style.position = 'absolute';
    guacEl.style.left = Math.round((cW - crop.width * s) / 2 - crop.x * s) + 'px';
    guacEl.style.top = Math.round((cH - crop.height * s) / 2 - crop.y * s) + 'px';
    if (displayContainer.value) {
      displayContainer.value.style.width = '';
      displayContainer.value.style.height = '';
    }
  }
};

const fitDisplayNow = () => {
  if (!client || !container.value) return;

  const display = client.getDisplay();
  const width = display.getWidth();
  const height = display.getHeight();
  if (!width || !height) return;

  if (props.windowCrop) {
    applyCropTransform(display);
    return;
  }

  // Reset any previous crop positioning
  clearCropStyles(display.getElement());

  if (props.displayMode === 'scroll') {
    display.scale(1.0);
    return;
  }

  const bounds = container.value.getBoundingClientRect();
  // Always auto-fit display to viewport — viewScale affects host resolution (via sendSize), not CSS scale
  const scale = Math.min(bounds.width / width, bounds.height / height, 1);
  display.scale(scale);
};

const fitDisplay = () => {
  if (fitDisplayTimer) return;
  fitDisplayTimer = requestAnimationFrame(() => {
    fitDisplayTimer = null;
    fitDisplayNow();
  });
};

// Encrypt credentials locally via Web Crypto API (AES-GCM)
const encryptCredentials = async (credentials, passcode) => {
  const encoder = new TextEncoder();
  const keyHash = await window.crypto.subtle.digest('SHA-256', encoder.encode(passcode));
  const key = await window.crypto.subtle.importKey(
    'raw',
    keyHash,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = JSON.stringify({
    username: credentials.username || '',
    password: credentials.password || '',
    domain: credentials.domain || ''
  });

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(plaintext)
  );

  const bufferToHex = (buf) => {
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  return {
    iv: bufferToHex(iv),
    ciphertext: bufferToHex(ciphertextBuffer)
  };
};

const connectWithSecurity = async (jwt, credentials, security, onPostStableDisconnect = null) => {
  let requestBody = {
    agentId: props.agentId,
    rdpSecurity: security,
    colorDepth: credentials.colorDepth || '16',
    enableWallpaper: credentials.enableWallpaper ?? false,
    enableTheming: credentials.enableTheming ?? false,
    enableFontSmoothing: credentials.enableFontSmoothing ?? false,
    enableFullWindowDrag: credentials.enableFullWindowDrag ?? false,
    enableDesktopComposition: credentials.enableDesktopComposition ?? false,
    enableMenuAnimations: credentials.enableMenuAnimations ?? false,
    enableAudio: credentials.enableAudio ?? false,
    enableGfx: credentials.enableGfx ?? false,
    wsCompression: credentials.wsCompression ?? false,
    imageWebp: credentials.imageWebp ?? false
  };

  if (credentials.passcode) {
    try {
      const encrypted = await encryptCredentials(credentials, credentials.passcode);
      requestBody.encryptedCredentials = encrypted.ciphertext;
      requestBody.iv = encrypted.iv;
      requestBody.passcode = credentials.passcode;
    } catch (err) {
      console.error('Encryption failed:', err);
      throw new Error('Failed to encrypt credentials');
    }
  } else {
    requestBody.rdpUsername = credentials.username || '';
    requestBody.rdpPassword = credentials.password || '';
    requestBody.rdpDomain = credentials.domain || '';
  }

  const res = await axios.post('/api/session', requestBody, {
    headers: { Authorization: `Bearer ${jwt}` }
  });

  const guacToken = res.data.token;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/guac`;

  const tunnel = new Guacamole.WebSocketTunnel(wsUrl);
  client = new Guacamole.Client(tunnel);
 
  if (fullscreenListener) {
    document.removeEventListener('fullscreenchange', fullscreenListener);
    document.removeEventListener('webkitfullscreenchange', fullscreenListener);
    document.removeEventListener('mozfullscreenchange', fullscreenListener);
    document.removeEventListener('MSFullscreenChange', fullscreenListener);
  }
  fullscreenListener = () => {
    if (!client || !container.value) return;
    const isCurrentlyFullscreen = !!(
      document.fullscreenElement || document.webkitFullscreenElement ||
      document.mozFullScreenElement || document.msFullscreenElement
    );
    const isDynamicSize = props.screenSize === 'auto' || props.screenSize === 'viewport';
    if (!isDynamicSize) return;
 
    setTimeout(() => {
      if (!client || !container.value) return;
      const size = getConnectionSize();
      console.log(`[FullscreenChange] Dynamic resizing to ${size.width}x${size.height}`);
      try {
        client.sendSize(size.width, size.height);
      } catch (err) {
        console.warn('Failed to send dynamic size update:', err);
      }
      fitDisplay();
    }, 300);
  };
  document.addEventListener('fullscreenchange', fullscreenListener);
  document.addEventListener('webkitfullscreenchange', fullscreenListener);
  document.addEventListener('mozfullscreenchange', fullscreenListener);
  document.addEventListener('MSFullscreenChange', fullscreenListener);
 
  displayContainer.value.replaceChildren(client.getDisplay().getElement());
  let _firstResizeDone = false;
  client.getDisplay().onresize = (width, height) => {
    console.log('Guacamole Display Resize:', width, height, 'security:', security);
    emit('resolution', `${width}x${height}`);
    fitDisplay();
    // One-time correction: if container has settled to a different size, correct it
    if (!_firstResizeDone && (props.screenSize === 'auto' || props.screenSize === 'viewport')) {
      _firstResizeDone = true;
      setTimeout(() => {
        if (!client) return;
        const sz = getConnectionSize();
        if (Math.abs(sz.width - width) > 10 || Math.abs(sz.height - height) > 10) {
          try { client.sendSize(sz.width, sz.height); } catch {}
        }
      }, 600);
    }
  };

  let _rszAutoTimer = null;
  resizeObserver = new ResizeObserver(() => {
    fitDisplay();
    if (props.screenSize === 'auto' || props.screenSize === 'viewport') {
      if (_rszAutoTimer) clearTimeout(_rszAutoTimer);
      _rszAutoTimer = setTimeout(() => {
        _rszAutoTimer = null;
        _sendCurrentSize();
      }, 400);
    }
  });
  resizeObserver.observe(container.value);

  const size = getConnectionSize();
  const connectParams = new URLSearchParams({
    token: guacToken,
    width: String(size.width),
    height: String(size.height),
    dpi: '96'
  });

  console.log('Trying RDP security:', security);
  statusText.value = `Connecting... (${size.width}x${size.height})`;
  client.connect(connectParams.toString());

  setupInputHandlers();

  return await new Promise((resolve, reject) => {
    let settled = false;
    let stableTimer = null;

    const settle = (handler, value) => {
      if (settled) return;
      settled = true;
      if (stableTimer) clearTimeout(stableTimer);
      handler(value);
    };

    client.onerror = (error) => {
      console.error('Guacamole Client Error:', error);
      statusText.value = `Guacamole error ${error.code || ''}: ${error.message || 'unknown'}`;
      settle(reject, error);
    };

    tunnel.onerror = (error) => {
      console.error('Guacamole Tunnel Error (pre-stable):', error);
      statusText.value = `Tunnel error ${error.code || ''}: ${error.message || 'unknown'}`;
    };

    tunnel.onstatechange = (state) => {
      console.log('Guacamole Tunnel State:', state, 'security:', security);
    };

    client.onsync = null;

    client.onstatechange = (state) => {
      console.log('Guacamole Client State:', state, 'security:', security);

      if (state === Guacamole.Client.State.CONNECTED && !stableTimer) {
        statusText.value = `Connected with ${security}, verifying...`;
        stableTimer = setTimeout(() => {
          if (onPostStableDisconnect) {
            // Track the last client-level error to decide whether to reconnect.
            let lastClientErrorCode = null;

            client.onerror = (error) => {
              lastClientErrorCode = error?.code ?? null;
              console.warn('[Post-stable] Client error code:', lastClientErrorCode, error?.message);
            };

            // tunnel.onerror = WebSocket/proxy dropped → always reconnect
            tunnel.onerror = (error) => {
              console.warn('[Reconnect] Tunnel error (network/proxy):', error?.message || error);
              lastClientErrorCode = null; // tunnel error supersedes client error
              onPostStableDisconnect();
            };

            client.onstatechange = (newState) => {
              if (newState !== Guacamole.Client.State.DISCONNECTED) return;

              if (lastClientErrorCode === null) {
                // Clean server-initiated disconnect (user logged in at host, admin disconnect, etc.)
                console.warn('[No-Reconnect] Clean disconnect from server');
                statusText.value = 'Disconnected by remote host.';
                return;
              }

              if (RECONNECTABLE_CODES.has(lastClientErrorCode)) {
                // Transient network/timeout failure → reconnect
                console.warn('[Reconnect] Reconnectable error code:', lastClientErrorCode.toString(16));
                onPostStableDisconnect();
              } else {
                // Session conflict, upstream error, session closed, etc. → do not reconnect
                console.warn('[No-Reconnect] Server-side termination, code:', lastClientErrorCode.toString(16));
                statusText.value = 'Session ended by remote host.';
              }
            };
          }
          statusText.value = '';
          const connectedClient = client;
          settle(resolve, security);
          // Post-connect keyboard sanity check. The pipeline can be lost if a
          // previous attempt/reconnect left handlers or focus in a bad state.
          setTimeout(() => {
            if (client !== connectedClient) return;
            if (!ensureKeyboardReady()) {
              console.warn('[Keyboard] Capture unavailable after connect; reconnecting');
              if (onPostStableDisconnect) onPostStableDisconnect();
            }
          }, 600);
        }, 4000);
      }

      if (state === Guacamole.Client.State.DISCONNECTED && !settled) {
        settle(reject, new Error('Disconnected before session became stable'));
      }
    };
  });
};

const initGuacamole = async () => {
  try {
    emit('resolution', '');
    const jwt = getToken();

    // On first connect, read credentials from sessionStorage then cache them.
    // On reconnect, sessionStorage is already cleared so use the cached copy.
    const savedCredentials = sessionStorage.getItem(`rdpCredentials:${props.agentId}`);
    if (savedCredentials) {
      cachedCredentials = JSON.parse(savedCredentials);
      sessionStorage.removeItem(`rdpCredentials:${props.agentId}`);
    }
    const credentials = cachedCredentials || {};
    const securityMode = credentials.security || 'auto';
    const attempts = getSecurityAttempts(credentials);

    for (const security of attempts) {
      try {
        retrying = false;
        const stableSecurity = await connectWithSecurity(jwt, credentials, security, scheduleReconnect);
        reconnectAttempts = 0; // reset backoff counter on clean stable connection
        statusText.value = '';
        localStorage.setItem(`rdpPreferredSecurity:${props.agentId}`, stableSecurity);
        localStorage.setItem(`rdpSecurityMode:${props.agentId}`, securityMode);
        return;
      } catch (error) {
        console.warn(`RDP security ${security} failed`, error);
        statusText.value = `Retrying connection...`;
        retrying = attempts.indexOf(security) < attempts.length - 1;
        disconnectClient();

        if (!retrying || securityMode !== 'auto') {
          throw error;
        }
      }
    }

  } catch (error) {
    statusText.value = 'Connection failed. Check credentials and try again.';
    console.error('Failed to initialize session:', error);
  }
};

const _onVisibilityChange = () => {
  if (!document.hidden && client) {
    // Skip all buffered frames and jump to the latest state
    try { client.getDisplay().sync(Date.now()); } catch (_) { /* noop */ }
    // Keyup events can be missed while the tab is hidden, leaving a modifier
    // stuck remotely (typing then produces shortcuts instead of text).
    resyncKeyboard();
  }
};

// Alt-Tabbing away can also swallow keyup events without hiding the tab.
const _onWindowFocus = () => {
  if (client) resyncKeyboard();
};

onMounted(() => {
  initGuacamole();
  document.addEventListener('visibilitychange', _onVisibilityChange);
  window.addEventListener('focus', _onWindowFocus);
});

onUnmounted(() => {
  document.removeEventListener('visibilitychange', _onVisibilityChange);
  window.removeEventListener('focus', _onWindowFocus);
  disconnectClient();
  cachedCredentials = null;
});

watch(() => props.touchMode, () => {
  setupInputHandlers();
});

watch(() => props.gestureEnabled, (enabled) => {
  if (!container.value) return;
  if (enabled) {
    container.value.addEventListener('touchstart', _onGestureTouchStart, { passive: false, capture: true });
    container.value.addEventListener('touchmove',  _onGestureTouchMove,  { passive: false, capture: true });
    container.value.addEventListener('touchend',   _onGestureTouchEnd,   { capture: true });
  } else {
    resetGesture();
    container.value.removeEventListener('touchstart', _onGestureTouchStart, { capture: true });
    container.value.removeEventListener('touchmove',  _onGestureTouchMove,  { capture: true });
    container.value.removeEventListener('touchend',   _onGestureTouchEnd,   { capture: true });
  }
});

watch(() => props.displayMode, () => {
  fitDisplay();
});

watch(() => props.viewScale, () => {
  // viewScale changes host resolution → send new size, then refit display
  if (client) {
    const sz = getConnectionSize();
    try { client.sendSize(sz.width, sz.height); } catch {}
  }
  fitDisplay();
});

watch(() => props.windowCrop, () => {
  fitDisplay();
});

let _autoResizeTimer = null;
const _sendCurrentSize = () => {
  if (!client) return;
  const size = getConnectionSize();
  try { client.sendSize(size.width, size.height); } catch {}
};

watch(() => props.screenSize, () => {
  if (!client) return;
  // Debounce slightly so container layout settles before reading dimensions
  if (_autoResizeTimer) clearTimeout(_autoResizeTimer);
  _autoResizeTimer = setTimeout(() => {
    _autoResizeTimer = null;
    _sendCurrentSize();
  }, 150);
});

// --- External keyboard input (for mobile soft keyboard panel) ---

const sendKey = (keysym) => {
  if (!client) return;
  client.sendKeyEvent(1, keysym);
  client.sendKeyEvent(0, keysym);
};

// Sends each character as a Unicode keysym. Safe for accented / CJK / Vietnamese chars.
// Returns a Promise so callers can await completion when sending multi-line text.
const sendText = async (text) => {
  if (!client || !text) return;
  // Normalize line endings so \r\n counts as one newline
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const chars = [...normalized]; // iterate by Unicode code point, not UTF-16 unit
  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];
    const cp = char.codePointAt(0);
    if (cp === undefined) continue;
    let keysym;
    if (cp === 0x0A || cp === 0x0D) {
      keysym = 0xFF0D; // Enter / Return — never send raw 0x0A or 0x0D
    } else if (cp > 0xFF) {
      keysym = 0x01000000 | cp; // Unicode keysym for non-Latin chars
    } else {
      keysym = cp;
    }
    client.sendKeyEvent(1, keysym);
    client.sendKeyEvent(0, keysym);
    // Small inter-keystroke delay prevents Guacamole/RDP from dropping events
    // when sending long multi-line or non-ASCII text bursts.
    if (i < chars.length - 1) await new Promise(r => setTimeout(r, 20));
  }
};

// guacd maps a keysym to the character it produces. Sending a lowercase keysym
// (e.g. "s") while Shift is held makes guacd release Shift so it can type the
// unshifted character - Win+Shift+S would arrive as Win+S. Use the shifted
// keysym (uppercase) whenever Shift is part of the combination.
const _applyShiftToKeysym = (modifiers, keysym) => {
  const shiftHeld = modifiers.includes(0xFFE1) || modifiers.includes(0xFFE2);
  if (shiftHeld && keysym >= 0x61 && keysym <= 0x7A)
    return keysym - 0x20;
  return keysym;
};

// Sends modifier keys (Ctrl/Alt/Shift) then a regular keysym, then releases modifiers.
const sendKeyWithModifiers = (modifiers, keysym) => {
  if (!client) return;
  keysym = _applyShiftToKeysym(modifiers, keysym);
  for (const mod of modifiers) client.sendKeyEvent(1, mod);
  client.sendKeyEvent(1, keysym);
  client.sendKeyEvent(0, keysym);
  for (const mod of [...modifiers].reverse()) client.sendKeyEvent(0, mod);
};

// Teleport mouse cursor to the last recorded single-touch position on the canvas.
// Sends a left-button click (press + release) at that position in RDP display coordinates.
const teleportToLastTouch = () => {
  if (!client || _lastTouchClientX < 0) return;
  const canvas = client.getDisplay().getElement();
  const rect = canvas.getBoundingClientRect();
  const x = (_lastTouchClientX - rect.left) / _gestureZoom;
  const y = (_lastTouchClientY - rect.top) / _gestureZoom;
  client.sendMouseState(new Guacamole.Mouse.State(x, y, true,  false, false, false, false), true);
  client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, false, false, false), true);
  if (mouse && mouse.currentState) {
    mouse.currentState.x = x;
    mouse.currentState.y = y;
  }
};

const rightClickAtLastTouch = () => {
  if (!client) return;
  // Use current cursor position from Guacamole's mouse state — avoids pointer jump.
  // mouse.currentState.x/y is in scaled-element coords; divide by _gestureZoom for host coords.
  const cs = mouse?.currentState;
  const gz = _gestureZoom || 1;
  const x = cs ? cs.x / gz : (_lastTouchClientX >= 0 ? (() => {
    const rect = client.getDisplay().getElement().getBoundingClientRect();
    return (_lastTouchClientX - rect.left) / gz;
  })() : 0);
  const y = cs ? cs.y / gz : (_lastTouchClientY >= 0 ? (() => {
    const rect = client.getDisplay().getElement().getBoundingClientRect();
    return (_lastTouchClientY - rect.top) / gz;
  })() : 0);
  client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, true,  false, false), true);
  client.sendMouseState(new Guacamole.Mouse.State(x, y, false, false, false, false, false), true);
};

let _kbdEnabled = true;
const setKeyboardEnabled = (enabled) => {
  _kbdEnabled = enabled;
  if (keyboard) {
    if (!enabled) {
      keyboard.onkeydown = null;
      keyboard.onkeyup = null;
    } else {
      keyboard.onkeydown = (keysym) => {
        if (!_kbdEnabled || _isTypingInInput()) return;
        if (client) client.sendKeyEvent(1, keysym);
      };
      keyboard.onkeyup = (keysym) => {
        if (!_kbdEnabled || _isTypingInInput()) return;
        if (client) client.sendKeyEvent(0, keysym);
      };
    }
  }
};

// Release modifiers that may still be held remotely after a missed keyup
// (tab switch, reconnect, focus loss). Releasing an already-released modifier
// is harmless.
const _MODIFIER_KEYSYMS = [0xFFE1, 0xFFE2, 0xFFE3, 0xFFE4, 0xFFE9, 0xFFEA, 0xFFEB, 0xFFEC];
const _releaseRemoteModifiers = () => {
  if (!client) return;
  for (const keysym of _MODIFIER_KEYSYMS) {
    try { client.sendKeyEvent(0, keysym); } catch {}
  }
};

// Clear local pressed-key state and resynchronize remote modifiers.
const resyncKeyboard = () => {
  if (keyboard) {
    try { keyboard.reset(); } catch {}
  }
  _releaseRemoteModifiers();
};

// RDP has no keystroke acknowledgement, so verify the parts we control after
// connecting: the client exists, the Guacamole keyboard is attached, and its
// handlers are active when capture is supposed to be enabled. Repair what can
// be repaired; return false so the caller can reconnect otherwise.
const ensureKeyboardReady = () => {
  if (!client) return false;
  if (!keyboard) setupInputHandlers();
  if (!keyboard) return false;
  if (_kbdEnabled && typeof keyboard.onkeydown !== 'function') setKeyboardEnabled(true);
  if (_kbdEnabled && (typeof keyboard.onkeydown !== 'function' || typeof keyboard.onkeyup !== 'function')) {
    return false;
  }
  resyncKeyboard();
  return true;
};

defineExpose({ sendKey, sendText, sendKeyWithModifiers, resetGesture, teleportToLastTouch, rightClickAtLastTouch, setKeyboardEnabled, resyncKeyboard });
</script>

<style scoped>
.canvas-container {
  position: relative;
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: black;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.canvas-container.mode-scroll {
  overflow: auto !important;
  display: block;
}
.canvas-container.mode-scroll .display-container {
  width: max-content;
  height: max-content;
  display: block;
}
/* Crop + scroll: canvas-container scrolls; display-container is sized to crop dimensions via JS */
.canvas-container.mode-crop-scroll {
  overflow: auto !important;
  display: block;
}
.canvas-container.mode-crop-scroll .display-container {
  overflow: hidden;
  position: relative;
}
.display-container {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
  height: 100%;
  touch-action: none;
  overflow: hidden;
}
.hide-cursor :deep(canvas) {
  cursor: none !important;
}
.status {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 32px);
  padding: 8px 12px;
  color: white;
  background: rgba(32, 32, 32, 0.88);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 6px;
  font-size: 14px;
  z-index: 2;
}
:deep(canvas) {
  cursor: crosshair;
  touch-action: none;
}

.zoom-badge {
  position: absolute;
  bottom: 12px;
  right: 12px;
  z-index: 10;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  user-select: none;
  backdrop-filter: blur(4px);
  transition: background 0.15s;
}

.zoom-badge:active {
  background: rgba(255, 255, 255, 0.25);
}

/* Touchpad mode: transparent fullscreen overlay to capture touch from anywhere on screen */
.touchpad-fullscreen-overlay {
  position: fixed;
  inset: 0;
  z-index: 1; /* behind sidebar (96) and toolbar (100) */
  touch-action: none;
}
</style>
