<template>
  <div class="remote-viewer" ref="remoteViewerEl" @click="onViewerClick">
    <!-- Collapse trigger (down-chevron floating handle) -->
    <div 
      v-if="isCollapsed" 
      class="toolbar-trigger" 
      @click="isCollapsed = false; _resetAutoHide()"
      title="Hiện thanh công cụ"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
        <path fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
      </svg>
    </div>

    <!-- Topbar (Toolbar) -->
    <div class="toolbar" :class="{ 'collapsed': isCollapsed, 'pinned': toolbarMode === 'pin' }">
      <!-- Left Group: Navigation & Connection Info -->
      <div class="toolbar-group left">
        <button class="icon-btn back-btn" @click="exitFullscreen(); $router.push('/')" title="Quay lại">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path fill-rule="evenodd" d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/>
          </svg>
        </button>

        <div class="info-badge" style="cursor:pointer" @click.stop="showInfoDialog = true" title="Thông tin kết nối">
          <svg class="badge-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path d="M1.5 2A1.5 1.5 0 0 0 0 3.5v7A1.5 1.5 0 0 0 1.5 12H6v2H4.5a.5.5 0 0 0 0 1h7a.5.5 0 0 0 0-1H10v-2h4.5a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 14.5 2h-13Zm0 1h13a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5Z"/>
          </svg>
          <span class="agent-id">{{ agentId }}</span>
          <span v-if="activeResolution" class="res-badge">{{ activeResolution }}</span>
        </div>
      </div>

      <!-- Right Group: Desktop buttons (hidden on mobile) -->
      <div class="toolbar-group right desktop-toolbar">
        <!-- Latency display -->
        <div class="latency-badge" v-if="latency !== null" :title="`Độ trễ: ${latency}ms`">
          <svg class="latency-icon" xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path d="M15.384 6.115a.485.485 0 0 0-.047-.736A12.444 12.444 0 0 0 8 3 12.44 12.44 0 0 0 .663 5.379a.485.485 0 0 0-.048.736.518.518 0 0 0 .668.05A11.448 11.448 0 0 1 8 4c2.507 0 4.827.802 6.716 2.164.205.148.49.13.668-.049z"/>
            <path d="M13.229 8.271a.482.482 0 0 0-.063-.745A9.455 9.455 0 0 0 8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065A8.46 8.46 0 0 1 8 7a8.46 8.46 0 0 1 4.577 1.336c.205.132.48.108.652-.065zm-2.183 2.183c.226-.226.185-.605-.1-.75A6.473 6.473 0 0 0 8 9c-1.187 0-2.302.318-3.266.874-.285.166-.328.544-.1.77l.007.008c.167.168.428.163.59-.013A5.485 5.485 0 0 1 8 10c1.22 0 2.342.4 3.268 1.07.162.176.423.18.59.013l.008-.007zm-2.02 2.02a.483.483 0 0 0-.097-.768A3.978 3.978 0 0 0 8 11c-.73 0-1.4.195-1.98.536a.483.483 0 0 0-.096.768l.812.812c.19.19.503.17.665-.045A2.986 2.986 0 0 1 8 12c.489 0 .943.117 1.343.325.162.215.475.236.665.045l.812-.812z"/>
          </svg>
          <span class="latency-val">{{ latency }}ms</span>
        </div>
        <button class="icon-btn fullscreen-btn" @click="toggleFullscreen" :title="isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'">
          <svg v-if="!isFullscreen" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10.5 0a.5.5 0 0 1 0 1h4a.5.5 0 0 0 .5.5v4a.5.5 0 0 1 1 0v-4A1.5 1.5 0 0 1 14.5 0h-4zM1 10.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1 10.5zm14.5 0a.5.5 0 0 1 1 0v4a1.5 1.5 0 0 1-1 1h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4z"/></svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M5.5 0a.5.5 0 0 1 .5.5v4A1.5 1.5 0 0 1 4.5 6h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4a.5.5 0 0 1 .5-.5zm5 0a.5.5 0 0 1 .5.5v4a.5.5 0 0 0 .5.5h4a.5.5 0 0 1 0 1h-4A1.5 1.5 0 0 1 10 5V.5a.5.5 0 0 1 .5-.5zM0 11.5a.5.5 0 0 1 .5-.5h4A1.5 1.5 0 0 1 6 12.5v4a.5.5 0 0 1-1 0v-4a.5.5 0 0 0-.5-.5h-4a.5.5 0 0 1-.5-.5zm10 1a1.5 1.5 0 0 1 1.5-1.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4z"/></svg>
        </button>
        <button class="icon-btn taskview-btn" @click="kbdCombo([0xFFEB], 0xFF09)" title="Task View (⊞+Tab)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
          </svg>
        </button>
        <button class="icon-btn special-keys-btn" :class="{ active: showSpecialKeys }" @click.stop="showSpecialKeys = !showSpecialKeys" title="Phím đặc biệt">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2z"/><path d="M13 10.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-4 0A.25.25 0 0 1 7.25 8h1.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-1.5A.25.25 0 0 1 7 8.75v-.5zm-2 0A.25.25 0 0 1 5.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 5 8.75v-.5zm6-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-8 0A.25.25 0 0 1 3.25 6h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5A.25.25 0 0 1 3 6.75v-.5z"/></svg>
        </button>
        <button v-if="isTouchDevice" class="icon-btn kbd-toggle-btn" :class="{ active: showLiveKbd }" @click="toggleLiveKbd" title="Bàn phím ảo (gửi ngay)">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2z"/><path d="M13 10.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm0-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5 0A.25.25 0 0 1 8.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 8 8.75v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-6 0A.25.25 0 0 1 6.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 6 8.75v-.5zm-2 0A.25.25 0 0 1 4.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 4 8.75v-.5zm-2 0A.25.25 0 0 1 2.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 2 8.75v-.5zm11-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2 0A.25.25 0 0 1 9.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 9 6.75v-.5zm-2 0A.25.25 0 0 1 7.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 7 6.75v-.5zm-2 0A.25.25 0 0 1 5.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 5 6.75v-.5zm-2 0A.25.25 0 0 1 3.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 3 6.75v-.5zm-2 0A.25.25 0 0 1 1.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 1 6.75v-.5zm10 4a.25.25 0 0 1 .25-.25h1.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-1.5a.25.25 0 0 1-.25-.25v-.5zm-8 0A.25.25 0 0 1 3.25 10h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25v-.5zm-2 0A.25.25 0 0 1 1.25 10h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 1 10.75v-.5z"/></svg>
        </button>
        <button class="icon-btn send-text-btn" :class="{ active: showSendText }" @click.stop="showSendText = !showSendText" title="Gửi văn bản">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76z"/></svg>
        </button>
        <button v-if="touchMode === 'touchpad'" class="icon-btn teleport-btn" @click="rdpCanvas?.teleportToLastTouch()" title="Nhảy chuột tới điểm chạm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/><path d="M7.5 3.5a.5.5 0 0 1 1 0v4a.5.5 0 0 1-1 0v-4zm0 5a.5.5 0 0 1 1 0v1a.5.5 0 0 1-1 0v-1z"/><path d="M7.5 8h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 1 0 1zm1 0h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1 0-1z"/></svg>
        </button>
        <button class="icon-btn windows-btn" :class="{ active: showWindowsPanel || !!selectedWindow }" @click="toggleWindowsPanel" title="Danh sách cửa sổ">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1.5A1.5 1.5 0 0 1 1.5 0h5A1.5 1.5 0 0 1 8 1.5v5A1.5 1.5 0 0 1 6.5 8h-5A1.5 1.5 0 0 1 0 6.5v-5zm8 0A1.5 1.5 0 0 1 9.5 0h5A1.5 1.5 0 0 1 16 1.5v5A1.5 1.5 0 0 1 14.5 8h-5A1.5 1.5 0 0 1 8 6.5v-5zm-8 8A1.5 1.5 0 0 1 1.5 8h5A1.5 1.5 0 0 1 8 9.5v5A1.5 1.5 0 0 1 6.5 16h-5A1.5 1.5 0 0 1 0 14.5v-5zm8 0A1.5 1.5 0 0 1 9.5 8h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 14.5v-5z"/></svg>
        </button>
        <div v-if="selectedWindow" class="window-crop-badge" :title="`Đang xem: ${selectedWindow.title}`">
          <span class="window-crop-name">{{ selectedWindow.title }}</span>
          <template v-if="selectedWindow.resizable">
            <button class="size-opt-btn" :class="{ active: windowSizePercent === 50 }"  @click.stop="resizeWindow(50)"  title="50%">½</button>
            <button class="size-opt-btn" :class="{ active: windowSizePercent === 100 }" @click.stop="resizeWindow(100)" title="100%">1×</button>
            <button class="size-opt-btn" :class="{ active: windowSizePercent === 200 }" @click.stop="resizeWindow(200)" title="200%">2×</button>
          </template>
          <button class="crop-exit-btn" @click.stop="exitWindowCrop" title="Thoát">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
          </button>
        </div>
        <button class="icon-btn settings-btn" :class="{ active: showSettingsPanel }" @click.stop="showSettingsPanel = !showSettingsPanel; showActionsPanel = false" title="Cài đặt">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/></svg>
        </button>
        <button class="icon-btn pin-btn" :class="{ active: toolbarMode === 'pin' }" @click="toolbarMode = toolbarMode === 'pin' ? 'autohide' : 'pin'" :title="toolbarMode === 'pin' ? 'Đang ghim' : 'Tự động ẩn'">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg>
        </button>
        <button class="icon-btn upload-btn" @click.stop="showUploadPanel = !showUploadPanel" title="Upload file lên Desktop\Shared">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
            <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
          </svg>
        </button>
        <button v-if="toolbarMode !== 'pin'" class="icon-btn collapse-btn" @click="isCollapsed = true" title="Thu gọn">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/></svg>
        </button>
      </div>

      <!-- Right Group: Mobile (2 icon-only dropdowns, flush right) -->
      <div class="toolbar-group right mobile-toolbar">
        <div class="latency-badge" v-if="latency !== null">
          <svg class="latency-icon" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M15.384 6.115a.485.485 0 0 0-.047-.736A12.444 12.444 0 0 0 8 3 12.44 12.44 0 0 0 .663 5.379a.485.485 0 0 0-.048.736.518.518 0 0 0 .668.05A11.448 11.448 0 0 1 8 4c2.507 0 4.827.802 6.716 2.164.205.148.49.13.668-.049z"/><path d="M13.229 8.271a.482.482 0 0 0-.063-.745A9.455 9.455 0 0 0 8 6c-1.905 0-3.68.56-5.166 1.526a.48.48 0 0 0-.063.745.525.525 0 0 0 .652.065A8.46 8.46 0 0 1 8 7a8.46 8.46 0 0 1 4.577 1.336c.205.132.48.108.652-.065zm-2.183 2.183c.226-.226.185-.605-.1-.75A6.473 6.473 0 0 0 8 9c-1.187 0-2.302.318-3.266.874-.285.166-.328.544-.1.77l.007.008c.167.168.428.163.59-.013A5.485 5.485 0 0 1 8 10c1.22 0 2.342.4 3.268 1.07.162.176.423.18.59.013l.008-.007zm-2.02 2.02a.483.483 0 0 0-.097-.768A3.978 3.978 0 0 0 8 11c-.73 0-1.4.195-1.98.536a.483.483 0 0 0-.096.768l.812.812c.19.19.503.17.665-.045A2.986 2.986 0 0 1 8 12c.489 0 .943.117 1.343.325.162.215.475.236.665.045l.812-.812z"/></svg>
          <span class="latency-val">{{ latency }}ms</span>
        </div>
        <!-- Spacer: push buttons to right -->
        <div style="flex:1"></div>
        <!-- Cài đặt (icon only) -->
        <button class="icon-btn settings-btn" :class="{ active: showSettingsPanel }" @click.stop="showSettingsPanel = !showSettingsPanel; showActionsPanel = false" title="Cài đặt">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492zM5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0z"/><path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52l-.094-.319zm-2.633.283c.246-.835 1.428-.835 1.674 0l.094.319a1.873 1.873 0 0 0 2.693 1.115l.291-.16c.764-.415 1.6.42 1.184 1.185l-.159.292a1.873 1.873 0 0 0 1.116 2.692l.318.094c.835.246.835 1.428 0 1.674l-.319.094a1.873 1.873 0 0 0-1.115 2.693l.16.291c.415.764-.42 1.6-1.185 1.184l-.291-.159a1.873 1.873 0 0 0-2.693 1.116l-.094.318c-.246.835-1.428.835-1.674 0l-.094-.319a1.873 1.873 0 0 0-2.692-1.115l-.292.16c-.764.415-1.6-.42-1.184-1.185l.159-.291A1.873 1.873 0 0 0 1.945 8.93l-.319-.094c-.835-.246-.835-1.428 0-1.674l.319-.094A1.873 1.873 0 0 0 3.06 4.474l-.16-.292c-.415-.764.42-1.6 1.185-1.184l.292.159a1.873 1.873 0 0 0 2.692-1.115l.094-.319z"/></svg>
        </button>
        <!-- Thao tác (icon only) -->
        <button class="icon-btn actions-btn" :class="{ active: showActionsPanel }" @click.stop="showActionsPanel = !showActionsPanel; showSettingsPanel = false" title="Thao tác">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
        </button>
      </div>
    </div>

    <!-- Settings dropdown panel -->
    <div v-if="showSettingsPanel" class="settings-panel" @click.stop>
      <div class="settings-header">
        <span class="settings-title">Cài đặt</span>
        <button class="settings-close" @click="showSettingsPanel = false" title="Đóng">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
          </svg>
        </button>
      </div>
      <div class="settings-row">
        <span class="settings-label">Độ phân giải</span>
        <select v-model="screenSize">
          <option value="auto">Tự động</option>
          <option value="viewport">Viewport</option>
          <option value="1280x720">1280×720</option>
          <option value="1920x1080">1920×1080</option>
          <option value="2560x1440">2560×1440</option>
        </select>
      </div>
      <div class="settings-row">
        <span class="settings-label">Chế độ hiển thị</span>
        <select v-model="displayMode">
          <option value="autofit">Tự khớp</option>
          <option value="scroll">Cuộn</option>
        </select>
      </div>
      <div class="settings-row">
        <span class="settings-label">Scale (độ phân giải host)</span>
        <select v-model="viewScale">
          <option value="auto">Tự động</option>
          <option value="50">50% (chữ nhỏ hơn)</option>
          <option value="75">75%</option>
          <option value="100">100% (1:1)</option>
          <option value="125">125%</option>
          <option value="150">150%</option>
          <option value="200">200% (chữ to hơn)</option>
        </select>
      </div>
      <div class="settings-row">
        <span class="settings-label">Chế độ chạm</span>
        <select v-model="touchMode">
          <option value="touchscreen">Cảm ứng đơn giản</option>
          <option value="touchscreen2">Cảm ứng 2 ngón (scroll/zoom)</option>
          <option value="touchpad">Touchpad</option>
          <option value="mouse">Chuột</option>
        </select>
      </div>
      <div class="settings-row">
        <span class="settings-label">Ẩn con trỏ</span>
        <label class="toggle-switch">
          <input type="checkbox" v-model="hideCursor" />
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="settings-row">
        <span class="settings-label">Cử chỉ zoom/pan</span>
        <label class="toggle-switch">
          <input type="checkbox" v-model="gestureEnabled" />
          <span class="toggle-track"></span>
        </label>
      </div>
      <div class="settings-row">
        <span class="settings-label">Độ trong suốt</span>
        <div class="settings-range-wrap">
          <input type="range" min="0" max="100" step="5" v-model.number="sidebarTransparency" class="settings-range" />
          <span class="settings-range-val">{{ sidebarTransparency }}%</span>
        </div>
      </div>
      <div class="settings-row build-info-row" @click="showBuildInfo = !showBuildInfo" style="cursor:pointer">
        <span class="settings-label">Phiên bản build</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" style="opacity:0.5">
          <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
          <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
        </svg>
      </div>
      <div v-if="showBuildInfo" class="build-info-detail">
        {{ buildTimeFormatted }}
      </div>
    </div>

    <!-- Actions panel (mobile dropdown) -->
    <div v-if="showActionsPanel" class="actions-panel" @click.stop>
      <div class="settings-header">
        <span class="settings-title">Thao tác</span>
        <button class="settings-close" @click="showActionsPanel = false" title="Đóng">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
        </button>
      </div>
      <div class="action-row" :class="{ 'action-row-active': isFullscreen }" @click="toggleFullscreen; showActionsPanel = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M1.5 1a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1.5 0h4a.5.5 0 0 1 0 1h-4zM10.5 0a.5.5 0 0 1 0 1h4a.5.5 0 0 0 .5.5v4a.5.5 0 0 1 1 0v-4A1.5 1.5 0 0 1 14.5 0h-4zM1 10.5a.5.5 0 0 1 .5-.5h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 0-.5.5v4a.5.5 0 0 1-1 0v-4A1.5 1.5 0 0 1 1 10.5zm14.5 0a.5.5 0 0 1 1 0v4a1.5 1.5 0 0 1-1 1h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 0 .5-.5v-4z"/></svg>
        <span>{{ isFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình' }}</span>
      </div>
      <div class="action-row" @click="kbdCombo([0xFFEB], 0xFF09); showActionsPanel = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
          <path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h3A1.5 1.5 0 0 1 7 2.5v3A1.5 1.5 0 0 1 5.5 7h-3A1.5 1.5 0 0 1 1 5.5v-3zm8 0A1.5 1.5 0 0 1 10.5 1h3A1.5 1.5 0 0 1 15 2.5v3A1.5 1.5 0 0 1 13.5 7h-3A1.5 1.5 0 0 1 9 5.5v-3zm-8 8A1.5 1.5 0 0 1 2.5 9h3A1.5 1.5 0 0 1 7 10.5v3A1.5 1.5 0 0 1 5.5 15h-3A1.5 1.5 0 0 1 1 13.5v-3zm8 0A1.5 1.5 0 0 1 10.5 9h3a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 13.5v-3z"/>
        </svg>
        <span>Task View (⊞+Tab)</span>
      </div>
      <div class="action-row" :class="{ 'action-row-active': showSpecialKeys }" @click="showSpecialKeys = !showSpecialKeys; showActionsPanel = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2z"/><path d="M13 10.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-4 0A.25.25 0 0 1 7.25 8h1.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-1.5A.25.25 0 0 1 7 8.75v-.5zm-2 0A.25.25 0 0 1 5.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 5 8.75v-.5zm6-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-8 0A.25.25 0 0 1 3.25 6h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5A.25.25 0 0 1 3 6.75v-.5z"/></svg>
        <span>Phím đặc biệt</span>
      </div>
      <div v-if="isTouchDevice" class="action-row" :class="{ 'action-row-active': showLiveKbd }" @click="toggleLiveKbd(); showActionsPanel = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M14 5a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h12zM2 4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H2z"/><path d="M13 10.25a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm0-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-5 0A.25.25 0 0 1 8.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 8 8.75v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-6 0A.25.25 0 0 1 6.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 6 8.75v-.5zm-2 0A.25.25 0 0 1 4.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 4 8.75v-.5zm-2 0A.25.25 0 0 1 2.25 8h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 2 8.75v-.5zm11-2a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2 0a.25.25 0 0 1 .25-.25h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5a.25.25 0 0 1-.25-.25v-.5zm-2 0A.25.25 0 0 1 9.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 9 6.75v-.5zm-2 0A.25.25 0 0 1 7.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 7 6.75v-.5zm-2 0A.25.25 0 0 1 5.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 5 6.75v-.5zm-2 0A.25.25 0 0 1 3.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 3 6.75v-.5zm-2 0A.25.25 0 0 1 1.25 6h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 1 6.75v-.5zm10 4a.25.25 0 0 1 .25-.25h1.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-1.5a.25.25 0 0 1-.25-.25v-.5zm-8 0A.25.25 0 0 1 3.25 10h6.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-6.5a.25.25 0 0 1-.25-.25v-.5zm-2 0A.25.25 0 0 1 1.25 10h.5a.25.25 0 0 1 .25.25v.5a.25.25 0 0 1-.25.25h-.5A.25.25 0 0 1 1 10.75v-.5z"/></svg>
        <span>Bàn phím ảo (gửi ngay)</span>
      </div>
      <div class="action-row" :class="{ 'action-row-active': showSendText }" @click="showSendText = !showSendText; showActionsPanel = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M15.854.146a.5.5 0 0 1 .11.54l-5.819 14.547a.75.75 0 0 1-1.329.124l-3.178-4.995L.643 7.184a.75.75 0 0 1 .124-1.33L15.314.037a.5.5 0 0 1 .54.11ZM6.636 10.07l2.761 4.338L14.13 2.576zm6.787-8.201L1.591 6.602l4.339 2.76z"/></svg>
        <span>Gửi văn bản</span>
      </div>
      <div v-if="touchMode === 'touchpad'" class="action-row" @click="rdpCanvas?.teleportToLastTouch(); showActionsPanel = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8z"/><path d="M7.5 3.5a.5.5 0 0 1 1 0v4a.5.5 0 0 1-1 0v-4zm0 5a.5.5 0 0 1 1 0v1a.5.5 0 0 1-1 0v-1z"/><path d="M7.5 8h-4a.5.5 0 0 1 0-1h4a.5.5 0 0 1 0 1zm1 0h4a.5.5 0 0 1 0 1h-4a.5.5 0 0 1 0-1z"/></svg>
        <span>Nhảy chuột tới điểm chạm</span>
      </div>
      <div class="action-row" :class="{ 'action-row-active': showWindowsPanel }" @click="toggleWindowsPanel(); showActionsPanel = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M0 1.5A1.5 1.5 0 0 1 1.5 0h5A1.5 1.5 0 0 1 8 1.5v5A1.5 1.5 0 0 1 6.5 8h-5A1.5 1.5 0 0 1 0 6.5v-5zm8 0A1.5 1.5 0 0 1 9.5 0h5A1.5 1.5 0 0 1 16 1.5v5A1.5 1.5 0 0 1 14.5 8h-5A1.5 1.5 0 0 1 8 6.5v-5zm-8 8A1.5 1.5 0 0 1 1.5 8h5A1.5 1.5 0 0 1 8 9.5v5A1.5 1.5 0 0 1 6.5 16h-5A1.5 1.5 0 0 1 0 14.5v-5zm8 0A1.5 1.5 0 0 1 9.5 8h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 14.5v-5z"/></svg>
        <span>Danh sách cửa sổ</span>
      </div>
      <div class="action-row" :class="{ 'action-row-active': toolbarMode === 'pin' }" @click="toolbarMode = toolbarMode === 'pin' ? 'autohide' : 'pin'">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg>
        <span>{{ toolbarMode === 'pin' ? 'Bỏ ghim toolbar' : 'Ghim toolbar' }}</span>
      </div>
      <div v-if="toolbarMode !== 'pin'" class="action-row" @click="isCollapsed = true; showActionsPanel = false">
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/></svg>
        <span>Thu gọn toolbar</span>
      </div>
    </div>

    <!-- Upload panel -->
    <div v-if="showUploadPanel" class="upload-panel settings-panel" @click.stop>
      <div class="settings-header">
        <span class="settings-title">Upload file → Desktop\Shared</span>
        <button class="settings-close" @click="showUploadPanel = false" title="Đóng">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/></svg>
        </button>
      </div>
      <div style="padding: 10px 14px 14px; display:flex; flex-direction:column; gap:10px">
        <label class="upload-drop-area" @dragover.prevent @drop.prevent="e => uploadFile(e.dataTransfer.files[0])">
          <input ref="uploadFileRef" type="file" style="display:none" @change="onUploadFileChange" />
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="currentColor" viewBox="0 0 16 16" style="opacity:0.5">
            <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
            <path d="M7.646 1.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 2.707V11.5a.5.5 0 0 1-1 0V2.707L5.354 4.854a.5.5 0 1 1-.708-.708l3-3z"/>
          </svg>
          <span style="font-size:12px; color:#888; margin-top:4px">Kéo thả hoặc nhấn để chọn file</span>
          <button class="kbd-act-btn primary" type="button" style="margin-top:6px" @click.prevent="uploadFileRef?.click()">Chọn file</button>
        </label>
        <div v-if="uploadMessage" class="upload-status" :class="uploadStatus">{{ uploadMessage }}</div>
      </div>
    </div>

    <!-- Info dialog -->
    <div v-if="showInfoDialog" class="info-dialog-overlay" @click.self="showInfoDialog = false">
      <div class="info-dialog" @click.stop>
        <div class="info-dialog-header">
          <span class="info-dialog-title">Thông tin kết nối</span>
          <button class="settings-close" @click="showInfoDialog = false" title="Đóng">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
            </svg>
          </button>
        </div>
        <div class="info-dialog-body">
          <div class="info-row"><span class="info-label">Tên máy</span><span class="info-value">{{ agentId }}</span></div>
          <div class="info-row"><span class="info-label">Độ phân giải</span><span class="info-value">{{ activeResolution || '—' }}</span></div>
          <div class="info-row"><span class="info-label">Scale</span><span class="info-value">{{ viewScale === 'auto' ? 'Tự động' : viewScale + '%' }}</span></div>
          <div class="info-row"><span class="info-label">Thời gian kết nối</span><span class="info-value">{{ connectionElapsedStr || '—' }}</span></div>
        </div>
      </div>
    </div>

    <!-- Windows List Panel -->
    <div v-if="showWindowsPanel" class="windows-panel">
      <div class="windows-panel-header">
        <span class="windows-panel-title">Cửa sổ đang mở</span>
        <button class="windows-panel-refresh icon-btn" @click="fetchWindows" :disabled="windowsLoading" title="Làm mới">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16" :class="{ spinning: windowsLoading }">
            <path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>
            <path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>
          </svg>
        </button>
        <button class="icon-btn" @click="showWindowsPanel = false" title="Đóng">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16">
            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
          </svg>
        </button>
      </div>
      <div v-if="windowsLoading" class="windows-state">Đang tải...</div>
      <div v-else-if="windowsError" class="windows-state error">{{ windowsError }}</div>
      <div v-else-if="windowsList.length === 0" class="windows-state">Không tìm thấy cửa sổ nào</div>
      <div v-else class="windows-list">
        <button
          v-for="win in windowsList"
          :key="win.hwnd"
          class="window-item"
          :class="{ active: selectedWindow?.hwnd === win.hwnd }"
          @click="selectWindow(win)"
        >
          <span class="window-process">{{ win.processName }}</span>
          <span class="window-title-text">{{ win.title }}</span>
        </button>
      </div>
    </div>

    <!-- [kbd-panel moved below canvas-viewport so it's in flex flow] -->

    <!-- RDP Canvas Window: always full height; in autohide mode toolbar overlays the top -->
    <div class="canvas-viewport" ref="canvasViewport">

      <!-- Special Keys floating popup (above canvas, won't be covered by Android keyboard) -->
      <div v-if="showSpecialKeys" ref="specialKeysPopupRef" class="special-keys-popup" :class="{ 'popup-dragged': specialKeysPos }" :style="specialKeysPos ? { left: specialKeysPos.x + 'px', top: specialKeysPos.y + 'px' } : {}" @click.stop>
        <div class="special-keys-header draggable-header" @mousedown="onDragSpecialKeys">
          <span class="special-keys-title">⠿ Phím đặc biệt</span>
          <button class="settings-close" @mousedown.stop @touchstart.stop @click="showSpecialKeys = false" title="Đóng">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
            </svg>
          </button>
        </div>
        <div class="special-keys-body">
          <div class="kbd-row">
            <button class="kbd-key" @click="kbdSendKey(0xFF1B)">Esc</button>
            <button class="kbd-key" @click="kbdSendKey(0xFF09)">Tab</button>
            <button class="kbd-key wide" @click="kbdSendKey(0xFF08)">⌫</button>
            <button class="kbd-key" @click="kbdSendKey(0xFFFF)">Del</button>
            <button class="kbd-key" @click="kbdSendKey(0xFF0D)">↵</button>
          </div>
          <div class="kbd-row">
            <div class="kbd-arrows">
              <button class="kbd-key arrow" @click="kbdSendKey(0xFF52)">↑</button>
              <button class="kbd-key arrow" @click="kbdSendKey(0xFF51)">←</button>
              <button class="kbd-key arrow" @click="kbdSendKey(0xFF54)">↓</button>
              <button class="kbd-key arrow" @click="kbdSendKey(0xFF53)">→</button>
            </div>
            <div class="kbd-nav">
              <button class="kbd-key small" @click="kbdSendKey(0xFF50)">Home</button>
              <button class="kbd-key small" @click="kbdSendKey(0xFF57)">End</button>
              <button class="kbd-key small" @click="kbdSendKey(0xFF55)">PgUp</button>
              <button class="kbd-key small" @click="kbdSendKey(0xFF56)">PgDn</button>
            </div>
          </div>
          <div class="kbd-row wrap">
            <button class="kbd-key combo mouse-right" @click="rdpCanvas?.rightClickAtLastTouch()" title="Chuột phải tại vị trí chạm cuối">🖱️R</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFE3], 0x61)">Ctrl+A</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFE3], 0x63)">Ctrl+C</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFE3], 0x78)">Ctrl+X</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFE3], 0x76)">Ctrl+V</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFE3], 0x7A)">Ctrl+Z</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFE3], 0x79)">Ctrl+Y</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFE9], 0xFFC1)">Alt+F4</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFEB], 0x76)">⊞+V</button>
            <button class="kbd-key combo" @click="kbdCombo([0xFFEB], 0x72)" title="Win+R (Run)">⊞+R</button>
            <button class="kbd-key combo" @click="kbdSendKey(0xFFEB)">⊞ Win</button>
          </div>
          <div class="kbd-row fkeys">
            <button v-for="n in 12" :key="n" class="kbd-key fkey" @click="kbdSendKey(0xFFBD + n)">F{{ n }}</button>
          </div>

          <!-- Custom combos -->
          <div class="custom-combos-section">
            <div class="custom-combos-title">Tổ hợp tùy chỉnh</div>
            <div class="kbd-row wrap custom-combos-row">
              <div v-for="cc in customCombos" :key="cc.id" class="custom-combo-wrap">
                <button class="kbd-key combo" @click="runCustomCombo(cc)">{{ cc.label }}</button>
                <button class="custom-combo-del" @click.stop="deleteCustomCombo(cc.id)" title="Xóa">×</button>
              </div>
              <button class="kbd-key combo" style="min-width:32px" @click.stop="showAddCombo = !showAddCombo" title="Thêm tổ hợp mới">＋</button>
            </div>
            <div v-if="showAddCombo" class="add-combo-form" @click.stop>
              <input v-model="newComboLabel" class="combo-input" placeholder="Tên hiển thị (vd: New Tab)" autocomplete="off" />
              <div class="combo-mods-row">
                <label v-for="m in ['Ctrl','Alt','Shift','Win']" :key="m" class="combo-mod-label">
                  <input type="checkbox" v-model="newComboMods" :value="m.toLowerCase()" />{{ m }}
                </label>
              </div>
              <input v-model="newComboKey" class="combo-input" placeholder="Phím: t, F5, Tab, Esc, Enter..." autocomplete="off" />
              <div class="combo-form-err" v-if="newComboErr">{{ newComboErr }}</div>
              <div class="combo-form-btns">
                <button class="kbd-act-btn" @click="showAddCombo = false; newComboErr = ''">Hủy</button>
                <button class="kbd-act-btn primary" @click="saveCustomCombo">Lưu</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <RdpCanvas
        ref="rdpCanvas"
        :key="agentId"
        :agentId="agentId"
        :screenSize="screenSize"
        :touchMode="touchMode"
        :displayMode="displayMode"
        :hideCursor="hideCursor"
        :gestureEnabled="gestureEnabled"
        :viewScale="viewScale"
        :pinnedToolbarHeight="toolbarMode === 'pin' ? 48 : 0"
        :windowCrop="selectedWindow ? selectedWindow.rect : null"
        @resolution="onResolutionChange"
      />

      <!-- Send Text popup: type freely, send all at once on click -->
      <div v-if="showSendText" ref="sendTextPopupRef" class="send-text-popup" :class="{ 'popup-dragged': sendTextPos }" :style="sendTextPos ? { left: sendTextPos.x + 'px', top: sendTextPos.y + 'px' } : {}" @click.stop>
        <div class="send-text-header draggable-header" @mousedown="onDragSendText">
          <span class="send-text-title">⠿ Gửi văn bản</span>
          <button class="settings-close" @mousedown.stop @touchstart.stop @click="showSendText = false" title="Đóng">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
              <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
            </svg>
          </button>
        </div>
        <div class="send-text-body">
          <textarea
            v-model="sendTextValue"
            class="send-text-area"
            placeholder="Nhập văn bản rồi nhấn Gửi..."
            rows="3"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
          ></textarea>
          <div class="send-text-actions">
            <button class="kbd-act-btn" @click="sendTextValue = ''">Xóa</button>
            <button class="kbd-act-btn primary" :disabled="sendTextBusy" @click="submitSendText">{{ sendTextBusy ? 'Đang gửi…' : 'Gửi →' }}</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Hidden live-keyboard textarea: focused when showLiveKbd=true, each char sent immediately -->
    <textarea
      ref="liveKbdRef"
      class="live-kbd-input"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      @keydown="onLiveKeydown"
      @compositionstart="onLiveCompositionStart"
      @compositionend="onLiveCompositionEnd"
      @input="onLiveInput"
      @blur="onLiveKbdBlur"
    ></textarea>

    <!-- ===== SIDEBAR ===== -->
    <div class="sidebar" :class="[`sidebar-${sidebarEdge}`, { 'sidebar-open': sidebarOpen }]"
         :style="{ top: sidebarOffsetPct + '%', '--sidebar-alpha': sidebarAlpha, '--sidebar-handle-alpha': sidebarHandleAlpha }"
         @click.stop>
      <!-- Action buttons (above handle, visible when open) -->
      <transition name="sidebar-slide">
        <div v-if="sidebarOpen" class="sidebar-actions">
          <!-- Close/hide button at top -->
          <button class="sidebar-btn sidebar-hide-btn" @click="sidebarOpen = false; if (showLiveKbd) nextTick(() => liveKbdRef?.focus())" title="Ẩn sidebar">
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16">
              <path v-if="sidebarEdge === 'right'" fill-rule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
              <path v-else fill-rule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
          <div class="sidebar-divider"></div>
          <!-- Action buttons -->
          <button v-for="item in sidebarItems" :key="item.id"
                  class="sidebar-btn"
                  :class="{ 'sidebar-btn-active': (item.actionId === 'touchmode' && touchMode !== 'touchscreen') || (item.actionId === 'livekbd' && showLiveKbd) || (item.type === 'customsize' && activeCustomSizeId === item.id) }"
                  @click="runSidebarItem(item)"
                  :title="item.actionId === 'touchmode' ? TOUCH_MODE_NAMES[touchMode] : (item.name || item.label)">
            <span class="sidebar-btn-label">{{ item.actionId === 'touchmode' ? TOUCH_MODE_LABELS[touchMode] : item.label }}</span>
          </button>
          <div class="sidebar-divider"></div>
          <!-- Settings button -->
          <button class="sidebar-btn sidebar-edit-btn"
                  @click.stop="showSidebarEditor = !showSidebarEditor"
                  title="Tùy chỉnh sidebar">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" fill="currentColor" viewBox="0 0 16 16">
              <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.858 2.929 2.929 0 0 1 0 5.858z"/>
            </svg>
          </button>
        </div>
      </transition>
      <!-- Drag handle (always visible, at bottom) -->
      <div class="sidebar-handle"
           @mousedown.prevent="onSidebarHandleDown"
           @touchstart.prevent="onSidebarHandleDown"
           :title="sidebarOpen ? 'Kéo dọc để di chuyển · Kéo ngang để đổi mép · Nhấn để đóng' : 'Kéo dọc để di chuyển · Kéo ngang để đổi mép · Nhấn để mở'">
        <svg class="sidebar-grip" xmlns="http://www.w3.org/2000/svg" width="10" height="14" fill="currentColor" viewBox="0 0 10 14">
          <circle cx="2.5" cy="2.5" r="1.3"/><circle cx="7.5" cy="2.5" r="1.3"/>
          <circle cx="2.5" cy="7"   r="1.3"/><circle cx="7.5" cy="7"   r="1.3"/>
          <circle cx="2.5" cy="11.5" r="1.3"/><circle cx="7.5" cy="11.5" r="1.3"/>
        </svg>
        <svg class="sidebar-arrow" xmlns="http://www.w3.org/2000/svg" width="8" height="8" fill="currentColor" viewBox="0 0 16 16">
          <path v-if="!sidebarOpen" fill-rule="evenodd" d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"/>
          <path v-else fill-rule="evenodd" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/>
        </svg>
      </div>
    </div>

    <!-- Sidebar Editor Panel -->
    <div v-if="showSidebarEditor" ref="sidebarEditorRef" class="sidebar-editor" :class="{ 'popup-dragged': sidebarEditorPos }" :style="sidebarEditorPos ? { left: sidebarEditorPos.x + 'px', top: sidebarEditorPos.y + 'px' } : {}" @click.stop>
      <div class="sidebar-editor-header draggable-header" @mousedown="onDragSidebarEditor">
        <span class="sidebar-editor-title">⚙ Tùy chỉnh Sidebar</span>
        <button class="settings-close" @mousedown.stop @touchstart.stop @click="showSidebarEditor = false">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16">
            <path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854z"/>
          </svg>
        </button>
      </div>
      <div class="sidebar-editor-body">
        <!-- Switch edge -->
        <div class="sb-edge-row">
          <span class="sb-section-label">Vị trí</span>
          <button class="kbd-act-btn" @click="sidebarEdge = sidebarEdge === 'right' ? 'left' : 'right'">
            Đổi sang mép {{ sidebarEdge === 'right' ? 'trái' : 'phải' }}
          </button>
        </div>
        <!-- Auto collapse toggle -->
        <div class="sb-edge-row">
          <span class="sb-section-label">Tự động thu lại khi chọn Action</span>
          <label class="toggle-switch">
            <input type="checkbox" v-model="sidebarAutoCollapse" />
            <span class="toggle-track"></span>
          </label>
        </div>
        <!-- Current items -->
        <div class="sb-section-label">Danh sách action</div>
        <div class="sb-items-list">
          <div v-for="item in sidebarItems" :key="item.id" class="sb-item-row">
            <span class="sb-item-preview">{{ item.label }}</span>
            <span class="sb-item-name">{{ item.name || item.label }}</span>
            <div class="sb-item-btns">
              <button @click="sbMoveItem(item.id, -1)" title="Lên" :disabled="sidebarItems.indexOf(item) === 0">↑</button>
              <button @click="sbMoveItem(item.id, 1)"  title="Xuống" :disabled="sidebarItems.indexOf(item) === sidebarItems.length - 1">↓</button>
              <button @click="sbRemoveItem(item.id)" title="Xóa" class="sb-del-btn">✕</button>
            </div>
          </div>
        </div>
        <!-- Add builtin -->
        <div class="sb-section-label">Thêm action có sẵn</div>
        <div class="sb-add-row">
          <select v-model="sbAddBuiltinId" class="combo-input sb-select">
            <option value="">-- Chọn action --</option>
            <option v-for="b in SIDEBAR_BUILTINS" :key="b.actionId" :value="b.actionId">{{ b.label }} {{ b.name }}</option>
          </select>
          <button class="kbd-act-btn primary" @click="sbDoAddBuiltin" :disabled="!sbAddBuiltinId">Thêm</button>
        </div>
        <!-- Add key/combo -->
        <div class="sb-section-label">Thêm tổ hợp phím</div>
        <div class="sb-combo-form">
          <input v-model="sbAddLabel" class="combo-input" placeholder="Tên (vd: Copy)" autocomplete="off" />
          <div class="combo-mods-row">
            <label v-for="m in ['Ctrl','Alt','Shift','Win']" :key="m" class="combo-mod-label">
              <input type="checkbox" v-model="sbAddMods" :value="m.toLowerCase()" />{{ m }}
            </label>
          </div>
          <input v-model="sbAddKey" class="combo-input" placeholder="Phím: c, F5, Tab, Esc..." autocomplete="off" />
          <div class="combo-form-err" v-if="sbAddErr">{{ sbAddErr }}</div>
          <button class="kbd-act-btn primary" @click="sbDoAddCombo">Thêm tổ hợp</button>
        </div>
        <!-- Add custom size -->
        <div class="sb-section-label">Thêm kích cỡ tùy chỉnh</div>
        <div class="sb-size-form">
          <div class="sb-size-row">
            <label class="sb-size-label">Ngang (%)</label>
            <input v-model.number="sbSizeW" type="number" min="10" max="100" class="combo-input sb-size-input" placeholder="100" />
          </div>
          <div class="sb-size-row">
            <label class="sb-size-label">Dọc (%)</label>
            <input v-model.number="sbSizeH" type="number" min="10" max="100" class="combo-input sb-size-input" placeholder="100" />
          </div>
          <div class="sb-size-row">
            <label class="sb-size-label">Vị trí dọc</label>
            <div class="sb-vpos-group">
              <button v-for="opt in [{v:'top',l:'Trên'},{v:'center',l:'Giữa'},{v:'bottom',l:'Dưới'}]" :key="opt.v"
                      class="sb-vpos-btn" :class="{ active: sbSizeVPos === opt.v }"
                      @click="sbSizeVPos = opt.v">{{ opt.l }}</button>
            </div>
          </div>
          <button class="kbd-act-btn primary" @click="sbDoAddCustomSize">Thêm kích cỡ</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { getToken } from '../auth';
import { ref, watch, computed, onMounted, onUnmounted, nextTick } from 'vue';
import axios from 'axios';
import RdpCanvas from '../components/RdpCanvas.vue';

const props = defineProps(['agentId']);
const remoteViewerEl = ref(null);

const screenSize = ref(localStorage.getItem(`rdpScreenSize:${props.agentId}`) || 'auto');
const _defaultTouchMode = () => {
  const saved = localStorage.getItem(`rdpTouchMode:${props.agentId}`);
  if (saved) return saved;
  // Desktop: no touch support → default to mouse mode
  return (window.matchMedia('(pointer: fine)').matches && !('ontouchstart' in window))
    ? 'mouse'
    : 'touchscreen';
};
const touchMode = ref(_defaultTouchMode());
const displayMode = ref(localStorage.getItem(`rdpDisplayMode:${props.agentId}`) || 'autofit');
const hideCursor = ref(localStorage.getItem(`rdpHideCursor:${props.agentId}`) === 'true');
const gestureEnabled = ref(localStorage.getItem('rdpGestureEnabled') !== 'false');
const viewScale = ref(localStorage.getItem(`rdpViewScale:${props.agentId}`) || 'auto');
const toolbarMode = ref(localStorage.getItem('rdpToolbarMode') || 'autohide');
const showSettingsPanel = ref(false);
const showActionsPanel = ref(false);
const latency = ref(null);
const activeResolution = ref('');
const isCollapsed = ref(toolbarMode.value !== 'pin');
let latencyInterval = null;

// Auto-hide timer: collapse toolbar after 10s. Only restarts countdown — never forces show.
let _autoHideTimer = null;
const _resetAutoHide = () => {
  if (toolbarMode.value !== 'autohide') return;
  if (_autoHideTimer) clearTimeout(_autoHideTimer);
  _autoHideTimer = setTimeout(() => {
    if (toolbarMode.value === 'autohide') isCollapsed.value = true;
  }, 10000);
};

// Detect touch-only device (no physical keyboard)
const isTouchDevice = !!(('ontouchstart' in window) || navigator.maxTouchPoints > 0);

// Upload state
const showUploadPanel = ref(false);
const uploadStatus = ref(''); // '', 'uploading', 'done', 'error'
const uploadMessage = ref('');
const uploadFileRef = ref(null);

const isFullscreen = ref(false);

// Info dialog
const showInfoDialog = ref(false);
const connectedAt = ref(null);
const connectionElapsedStr = ref('');
let _infoTimer = null;
const _updateElapsed = () => {
  if (!connectedAt.value) { connectionElapsedStr.value = ''; return; }
  const s = Math.floor((Date.now() - connectedAt.value) / 1000);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = n => String(n).padStart(2, '0');
  connectionElapsedStr.value = hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`;
};
const _isInFullscreen = () => !!(
  document.fullscreenElement || document.webkitFullscreenElement ||
  document.mozFullScreenElement || document.msFullscreenElement
);

const rdpCanvas = ref(null);
const canvasViewport = ref(null);

// Window size option for crop mode (50 / 100 / 200 %)
const windowSizePercent = ref(100);

// Virtual keyboard state
const showSpecialKeys = ref(false);
const showSendText = ref(false);

// ===== SIDEBAR =====
const SIDEBAR_BUILTINS = [
  { actionId: 'fullscreen',  label: '⛶',  name: 'Toàn màn hình' },
  { actionId: 'taskview',    label: '⊞',  name: 'Task View (⊞+Tab)' },
  { actionId: 'capture',     label: '✂',  name: 'Chụp màn hình (⊞+Shift+S)' },
  { actionId: 'specialkeys', label: '⌨',  name: 'Phím đặc biệt' },
  { actionId: 'sendtext',    label: '✎',  name: 'Gửi văn bản' },
  { actionId: 'livekbd',     label: '⌨️',  name: 'Bàn phím (gửi ngay)' },
  { actionId: 'rightclick',  label: '🖱',  name: 'Chuột phải' },
  { actionId: 'upload',      label: '⬆',  name: 'Upload file' },
  { actionId: 'touchmode',   label: '👆',  name: 'Chế độ chạm' },
  { actionId: 'win',         label: '⊞',  name: 'Phím Win' },
  { actionId: 'win-r',       label: '⊞R', name: 'Win+R (Run)' },
  { actionId: 'esc',         label: 'Esc', name: 'Escape' },
  { actionId: 'ctrl-c',      label: 'C',  name: 'Ctrl+C' },
  { actionId: 'ctrl-v',      label: 'V',  name: 'Ctrl+V' },
  { actionId: 'ctrl-a',      label: 'A',  name: 'Ctrl+A' },
  { actionId: 'ctrl-z',      label: 'Z',  name: 'Ctrl+Z' },
  { actionId: 'alt-f4',      label: 'F4', name: 'Alt+F4' },
  { actionId: 'enter',       label: '↵',  name: 'Enter' },
  { actionId: 'tab',         label: '⇥',  name: 'Tab' },
];

// Touch mode cycle: touchscreen → touchscreen2 → touchpad → mouse → touchscreen
const TOUCH_MODE_CYCLE = ['touchscreen', 'touchscreen2', 'touchpad', 'mouse'];
const TOUCH_MODE_LABELS = { touchscreen: '☝', touchscreen2: '✌', touchpad: '🖱', mouse: '🖥' };
const TOUCH_MODE_NAMES  = { touchscreen: 'Cảm ứng đơn', touchscreen2: 'Cảm ứng 2 ngón', touchpad: 'Touchpad', mouse: 'Chuột' };
const cycleTouchMode = () => {
  const idx = TOUCH_MODE_CYCLE.indexOf(touchMode.value);
  touchMode.value = TOUCH_MODE_CYCLE[(idx + 1) % TOUCH_MODE_CYCLE.length];
};

const CAPTURE_SIDEBAR_ITEM = {
  type: 'builtin', actionId: 'capture', label: '✂', name: 'Chụp màn hình (⊞+Shift+S)',
};
const _defaultSidebarItems = () => [
  { id: 'sd1', type: 'builtin', actionId: 'fullscreen',  label: '⛶',  name: 'Toàn màn hình' },
  { id: 'sd2', type: 'builtin', actionId: 'taskview',    label: '⊞',  name: 'Task View' },
  { id: 'sd3', type: 'builtin', actionId: 'specialkeys', label: '⌨',  name: 'Phím đặc biệt' },
  { ...CAPTURE_SIDEBAR_ITEM, id: 'sd3b' },
  { id: 'sd4', type: 'combo',   label: 'C', name: 'Ctrl+C', modifiers: [0xFFE3], key: 0x63 },
  { id: 'sd5', type: 'combo',   label: 'V', name: 'Ctrl+V', modifiers: [0xFFE3], key: 0x76 },
];
const _loadSidebarItems = () => {
  try {
    const s = localStorage.getItem('rdpSidebarItems');
    if (s) {
      const items = JSON.parse(s);
      if (Array.isArray(items)) {
        // One-time migration: add the Capture action to sidebars saved before it existed
        if (!localStorage.getItem('rdpSidebarCaptureMigrated')) {
          localStorage.setItem('rdpSidebarCaptureMigrated', '1');
          if (!items.some(i => i.actionId === 'capture')) {
            items.push({ ...CAPTURE_SIDEBAR_ITEM, id: 'sb_capture' });
            localStorage.setItem('rdpSidebarItems', JSON.stringify(items));
          }
        }
        return items;
      }
    }
  } catch {}
  return _defaultSidebarItems();
};

const sidebarEdge      = ref(localStorage.getItem('rdpSidebarEdge') || 'right');
const sidebarOffsetPct = ref(parseFloat(localStorage.getItem('rdpSidebarOffset') || '30'));
const sidebarOpen      = ref(false);
const sidebarAutoCollapse = ref(localStorage.getItem('rdpSidebarAutoCollapse') !== 'false');
const sidebarItems     = ref(_loadSidebarItems());
const showSidebarEditor = ref(false);
const sidebarTransparency = ref(Math.min(100, Math.max(0, Number(localStorage.getItem('rdpSidebarTransparency') ?? 5))));
const sidebarAlpha     = computed(() => 1 - sidebarTransparency.value / 100);
// Keep the drag handle slightly more visible than the panel so it can always be found.
const sidebarHandleAlpha = computed(() => Math.min(0.9, Math.max(0.15, sidebarAlpha.value * 0.75)));
// Editor form state
const sbAddBuiltinId = ref('');
const sbAddLabel     = ref('');
const sbAddMods      = ref([]);
const sbAddKey       = ref('');
const sbAddErr       = ref('');
const sbSizeW        = ref(100);
const sbSizeH        = ref(100);
const sbSizeVPos     = ref('top'); // top | center | bottom
let   activeCustomSizeId = null;

watch(sidebarEdge,      (v) => localStorage.setItem('rdpSidebarEdge', v));
watch(sidebarOffsetPct, (v) => localStorage.setItem('rdpSidebarOffset', String(v)));
watch(sidebarItems,     (v) => localStorage.setItem('rdpSidebarItems', JSON.stringify(v)), { deep: true });
watch(sidebarTransparency, (v) => localStorage.setItem('rdpSidebarTransparency', String(v)));
watch(sidebarAutoCollapse, (v) => localStorage.setItem('rdpSidebarAutoCollapse', String(v)));

const _applyCustomSize = (widthPct, heightPct, vpos = 'top') => {
  const el = remoteViewerEl.value;
  if (!el) return;
  const w = Math.min(100, Math.max(10, widthPct));
  const h = Math.min(100, Math.max(10, heightPct));
  el.style.width  = `${w}vw`;
  el.style.height = `${h}vh`;
  el.style.left   = `${(100 - w) / 2}vw`;
  el.style.right  = 'auto';
  if (vpos === 'top')    el.style.top = '0';
  else if (vpos === 'bottom') el.style.top = `${100 - h}vh`;
  else                   el.style.top = `${(100 - h) / 2}vh`; // center
};
const _resetCustomSize = () => {
  const el = remoteViewerEl.value;
  if (!el) return;
  el.style.width = el.style.right = '';
  el.style.left  = el.style.top = '';
  el.style.height = '';
  _syncViewportHeight();
};

const runSidebarItem = (item) => {
  if (item.type === 'builtin') {
    const a = item.actionId;
    if      (a === 'fullscreen')  toggleFullscreen();
    else if (a === 'taskview')    kbdCombo([0xFFEB], 0xFF09);
    else if (a === 'capture')     kbdCombo([0xFFEB, 0xFFE1], 0x53);
    else if (a === 'specialkeys') showSpecialKeys.value = !showSpecialKeys.value;
    else if (a === 'sendtext')    showSendText.value = !showSendText.value;
    else if (a === 'livekbd')     toggleLiveKbd();
    else if (a === 'rightclick')  rdpCanvas.value?.rightClickAtLastTouch();
    else if (a === 'upload')      showUploadPanel.value = !showUploadPanel.value;
    else if (a === 'touchmode')   cycleTouchMode();
    else if (a === 'win')         kbdSendKey(0xFFEB);
    else if (a === 'win-r')       kbdCombo([0xFFEB], 0x72);
    else if (a === 'esc')         kbdSendKey(0xFF1B);
    else if (a === 'enter')       kbdSendKey(0xFF0D);
    else if (a === 'tab')         kbdSendKey(0xFF09);
    else if (a === 'ctrl-c')      kbdCombo([0xFFE3], 0x63);
    else if (a === 'ctrl-v')      kbdCombo([0xFFE3], 0x76);
    else if (a === 'ctrl-a')      kbdCombo([0xFFE3], 0x61);
    else if (a === 'ctrl-z')      kbdCombo([0xFFE3], 0x7A);
    else if (a === 'alt-f4')      kbdCombo([0xFFE9], 0xFFC1);
  } else if (item.type === 'combo') {
    kbdCombo(item.modifiers || [], item.key);
  } else if (item.type === 'key') {
    kbdSendKey(item.keysym);
  } else if (item.type === 'customsize') {
    if (activeCustomSizeId === item.id) {
      activeCustomSizeId = null;
      _resetCustomSize();
    } else {
      activeCustomSizeId = item.id;
      _applyCustomSize(item.widthPct, item.heightPct, item.vpos);
    }
  }

  if (sidebarAutoCollapse.value) {
    sidebarOpen.value = false;
    if (showLiveKbd.value) nextTick(() => liveKbdRef.value?.focus());
  }
};

const sbDoAddCustomSize = () => {
  const w = Math.min(100, Math.max(10, Number(sbSizeW.value) || 100));
  const h = Math.min(100, Math.max(10, Number(sbSizeH.value) || 100));
  const vpos = sbSizeVPos.value || 'top';
  const label = '⊡';
  sidebarItems.value = [...sidebarItems.value, {
    id: 'sb' + Date.now(),
    type: 'customsize',
    widthPct: w,
    heightPct: h,
    vpos,
    label,
    name: `${w}% × ${h}% (${vpos === 'top' ? 'Trên' : vpos === 'bottom' ? 'Dưới' : 'Giữa'})`,
  }];
};

const sbRemoveItem = (id) => { sidebarItems.value = sidebarItems.value.filter(i => i.id !== id); };
const sbMoveItem = (id, dir) => {
  const arr = [...sidebarItems.value];
  const idx = arr.findIndex(i => i.id === id);
  if (idx < 0) return;
  const ni = idx + dir;
  if (ni < 0 || ni >= arr.length) return;
  [arr[idx], arr[ni]] = [arr[ni], arr[idx]];
  sidebarItems.value = arr;
};

const sbDoAddBuiltin = () => {
  if (!sbAddBuiltinId.value) return;
  const b = SIDEBAR_BUILTINS.find(x => x.actionId === sbAddBuiltinId.value);
  if (!b) return;
  sidebarItems.value = [...sidebarItems.value, { id: 'sb' + Date.now(), type: 'builtin', actionId: b.actionId, label: b.label, name: b.name }];
  sbAddBuiltinId.value = '';
};

const _parseSbKey = (keyStr) => {
  const k = keyStr.trim().toLowerCase();
  if (k.length === 1 && k >= 'a' && k <= 'z') return k.charCodeAt(0);
  if (k.length === 1 && k >= '0' && k <= '9') return k.charCodeAt(0);
  const map = { tab: 0xFF09, esc: 0xFF1B, escape: 0xFF1B, enter: 0xFF0D, backspace: 0xFF08,
                delete: 0xFFFF, home: 0xFF50, end: 0xFF57, pageup: 0xFF55, pagedown: 0xFF56,
                up: 0xFF52, down: 0xFF54, left: 0xFF51, right: 0xFF53, space: 0x20 };
  if (map[k]) return map[k];
  const fm = k.match(/^f(\d+)$/);
  if (fm) { const n = parseInt(fm[1]); if (n >= 1 && n <= 12) return 0xFFBD + n; }
  if (k.length === 1) return k.charCodeAt(0);
  return null;
};

const sbDoAddCombo = () => {
  sbAddErr.value = '';
  if (!sbAddLabel.value.trim()) { sbAddErr.value = 'Nhập tên hiển thị'; return; }
  if (!sbAddKey.value.trim())   { sbAddErr.value = 'Nhập phím chính'; return; }
  const keysym = _parseSbKey(sbAddKey.value);
  if (!keysym) { sbAddErr.value = 'Phím không hợp lệ'; return; }
  const modMap = { ctrl: 0xFFE3, alt: 0xFFE9, shift: 0xFFE1, win: 0xFFEB };
  const mods = sbAddMods.value.map(m => modMap[m]).filter(Boolean);
  const modNames = sbAddMods.value.map(m => m.charAt(0).toUpperCase() + m.slice(1));
  const label = sbAddLabel.value.trim();
  sidebarItems.value = [...sidebarItems.value, {
    id: 'sb' + Date.now(),
    type: mods.length ? 'combo' : 'key',
    label,
    name: [...modNames, sbAddKey.value.trim()].join('+'),
    modifiers: mods, key: keysym, keysym,
  }];
  sbAddLabel.value = ''; sbAddMods.value = []; sbAddKey.value = '';
};

// Sidebar handle drag: vertical = reposition, horizontal > 50px = switch edge, tiny movement = toggle open
const onSidebarHandleDown = (e) => {
  const isTouch = e.type === 'touchstart';
  const pt = isTouch ? e.touches[0] : e;
  e.preventDefault(); // prevent synthetic click from firing after touchend
  const startX = pt.clientX, startY = pt.clientY;
  const startOffset = sidebarOffsetPct.value;
  let movedV = false, movedH = false;

  const onMove = (me) => {
    const mpt = me.type === 'touchmove' ? me.touches[0] : me;
    const dx = mpt.clientX - startX, dy = mpt.clientY - startY;
    if (Math.abs(dy) > 6) {
      movedV = true;
      sidebarOffsetPct.value = Math.max(2, Math.min(95, Math.round(startOffset + (dy / window.innerHeight) * 100)));
      if (me.cancelable) me.preventDefault();
    }
    if (Math.abs(dx) > 50 && !movedV) movedH = true;
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    if (!movedV && !movedH) sidebarOpen.value = !sidebarOpen.value;
    else if (movedH) sidebarEdge.value = sidebarEdge.value === 'right' ? 'left' : 'right';
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
};

// Draggable dialog positions — null = use CSS default position
const specialKeysPos = ref(null); // { x, y } in px from viewport top-left (fixed)
const sendTextPos = ref(null);

// Reset position when dialog closes so next open starts at default
watch(showSpecialKeys, (v) => { if (!v) specialKeysPos.value = null; });
watch(showSendText,    (v) => { if (!v) sendTextPos.value = null; });

const _makeDragHandler = (posRef, popupRef) => (e) => {
  // Support both mouse and touch; ignore clicks on buttons inside header
  if (e.target.closest('button')) return;
  const isTouch = e.type === 'touchstart';
  if (!isTouch && e.button !== 0) return;
  e.preventDefault();
  const getXY = (ev) => isTouch
    ? { x: ev.touches[0].clientX, y: ev.touches[0].clientY }
    : { x: ev.clientX, y: ev.clientY };
  const pRect = popupRef.value.getBoundingClientRect();
  const startXY = getXY(e);
  // Start from current viewport-relative position
  const startPX = pRect.left;
  const startPY = pRect.top;
  const onMove = (me) => {
    me.preventDefault();
    const cur = getXY(me);
    // Clamp to full viewport (allows moving outside remote-viewer area)
    const nx = Math.max(0, Math.min(startPX + cur.x - startXY.x, window.innerWidth  - pRect.width));
    const ny = Math.max(0, Math.min(startPY + cur.y - startXY.y, window.innerHeight - pRect.height));
    posRef.value = { x: nx, y: ny };
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup',   onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend',  onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup',   onUp);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend',  onUp);
};

const specialKeysPopupRef = ref(null);
const sendTextPopupRef    = ref(null);
const sidebarEditorRef    = ref(null);
const sidebarEditorPos    = ref(null);
watch(showSidebarEditor, (v) => { if (!v) sidebarEditorPos.value = null; });
const onDragSpecialKeys   = _makeDragHandler(specialKeysPos,    specialKeysPopupRef);
const onDragSendText      = _makeDragHandler(sendTextPos,       sendTextPopupRef);
const onDragSidebarEditor = _makeDragHandler(sidebarEditorPos,  sidebarEditorRef);

// Register touchstart with passive:false so e.preventDefault() works during drag
// (Vue's @touchstart directive may use passive:true by default)
const _attachDragTouchListeners = () => {
  const attach = (elRef, handler) => {
    const el = elRef.value?.querySelector('.draggable-header');
    if (el) el.addEventListener('touchstart', handler, { passive: false });
  };
  if (specialKeysPopupRef.value) attach(specialKeysPopupRef, onDragSpecialKeys);
  if (sendTextPopupRef.value)    attach(sendTextPopupRef,    onDragSendText);
  if (sidebarEditorRef.value)    attach(sidebarEditorRef,    onDragSidebarEditor);
};
watch([showSpecialKeys, showSendText, showSidebarEditor], async () => {
  await nextTick();
  _attachDragTouchListeners();
});

// showLiveKbd: persisted; default true on desktop (no touchscreen), false on mobile
const _initLiveKbd = () => {
  const saved = localStorage.getItem('rdpShowLiveKbd');
  if (saved !== null) return saved === 'true';
  return !('ontouchstart' in window || navigator.maxTouchPoints > 0);
};
const showLiveKbd = ref(_initLiveKbd());
const liveKbdRef = ref(null);
const sendTextValue = ref('');
let _liveComposing = false;
let _liveJustComposed = false;
let _keydownHandledSpecial = false;
// An interrupted IME composition may never fire compositionend. Without resetting
// these flags, every later input event would be ignored (typing appears dead).
const _resetLiveComposition = () => {
  _liveComposing = false;
  _liveJustComposed = false;
  _keydownHandledSpecial = false;
};

// Build version info
const showBuildInfo = ref(false);
const buildTimeFormatted = computed(() => {
  try {
    const d = new Date(__BUILD_TIME__);
    const pad = (n) => String(n).padStart(2, '0');
    const time = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} `
      + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    return `${time}  #${__BUILD_COMMIT__}`;
  } catch {
    return __BUILD_TIME__;
  }
});

// Window management state
const showWindowsPanel = ref(false);
const windowsList = ref([]);
const windowsLoading = ref(false);
const windowsError = ref('');
const selectedWindow = ref(null); // { hwnd, title, processName, rect: { x, y, width, height } }

watch(screenSize, (value) => localStorage.setItem(`rdpScreenSize:${props.agentId}`, value));
watch(touchMode, (value) => localStorage.setItem(`rdpTouchMode:${props.agentId}`, value));
watch(displayMode, (value) => localStorage.setItem(`rdpDisplayMode:${props.agentId}`, value));
watch(hideCursor, (value) => localStorage.setItem(`rdpHideCursor:${props.agentId}`, String(value)));
watch(gestureEnabled, (value) => localStorage.setItem('rdpGestureEnabled', String(value)));
watch(toolbarMode, (value) => {
  localStorage.setItem('rdpToolbarMode', value);
  if (value === 'pin') {
    if (_autoHideTimer) clearTimeout(_autoHideTimer);
    isCollapsed.value = false;
  } else {
    _resetAutoHide();
  }
});
watch(showLiveKbd, (value) => localStorage.setItem('rdpShowLiveKbd', String(value)));
watch(viewScale, (value) => localStorage.setItem(`rdpViewScale:${props.agentId}`, value));

const onResolutionChange = (res) => {
  activeResolution.value = res;
  if (!connectedAt.value) {
    connectedAt.value = Date.now();
    _updateElapsed();
    _infoTimer = setInterval(_updateElapsed, 1000);
  }
};

const onViewerClick = () => {
  showSettingsPanel.value = false;
  showActionsPanel.value = false;
  showInfoDialog.value = false;
  if (showSidebarEditor.value) showSidebarEditor.value = false;
};

// Reset hide timer while toolbar is visible (keeps it visible during active use)
const onViewerActivity = () => {
  if (!isCollapsed.value) _resetAutoHide();
};

const uploadFile = async (file) => {
  if (!file) return;
  uploadStatus.value = 'uploading';
  uploadMessage.value = `Đang tải lên "${file.name}"…`;
  try {
    const buf = await file.arrayBuffer();
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
    const token = getToken();
    const res = await axios.post(`/api/hosts/${props.agentId}/upload`, {
      fileName: file.name,
      data: b64
    }, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    uploadStatus.value = 'done';
    uploadMessage.value = `✓ Đã lưu: Desktop\\Shared\\${file.name}`;
  } catch (err) {
    uploadStatus.value = 'error';
    uploadMessage.value = `Lỗi: ${err.response?.data?.message || err.message}`;
  }
};

const onUploadFileChange = (e) => {
  const file = e.target.files?.[0];
  if (file) uploadFile(file);
  e.target.value = '';
};

const checkLatency = async () => {
  const start = performance.now();
  try {
    const token = getToken();
    await axios.get('/api/ping', {
      headers: { Authorization: `Bearer ${token}` }
    });
    latency.value = Math.round(performance.now() - start);
  } catch (err) {
    console.error('Ping error:', err);
  }
};

const updateFullscreenState = () => {
  isFullscreen.value = _isInFullscreen();
};

const exitFullscreen = () => {
  if (_isInFullscreen()) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen ||
                 document.mozCancelFullScreen || document.msExitFullscreen;
    if (exit) { try { exit.call(document); } catch {} }
    try { screen.orientation?.unlock(); } catch {}
  }
};

const toggleFullscreen = () => {
  if (!_isInFullscreen()) {
    // Lock orientation SYNCHRONOUSLY within user gesture (async .then() may miss the gesture window)
    try { screen.orientation?.lock('landscape').catch(() => {}); } catch {}
    // Always use documentElement so remoteViewerEl (fixed child) can be freely resized
    const targets = [document.documentElement].filter(Boolean);
    for (const el of targets) {
      const req = el.requestFullscreen || el.webkitRequestFullscreen ||
                  el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req) { try { req.call(el); break; } catch {} }
    }
  } else {
    exitFullscreen();
  }
};

// Keysym map for named keys (X11 / Guacamole standard)
const NAMED_KEYSYMS = {
  Backspace: 0xFF08, Tab: 0xFF09, Enter: 0xFF0D, Escape: 0xFF1B,
  Delete: 0xFFFF, Home: 0xFF50, End: 0xFF57, PageUp: 0xFF55, PageDown: 0xFF56,
  ArrowLeft: 0xFF51, ArrowRight: 0xFF53, ArrowUp: 0xFF52, ArrowDown: 0xFF54,
  F1: 0xFFBE, F2: 0xFFBF, F3: 0xFFC0, F4: 0xFFC1, F5: 0xFFC2, F6: 0xFFC3,
  F7: 0xFFC4, F8: 0xFFC5, F9: 0xFFC6, F10: 0xFFC7, F11: 0xFFC8, F12: 0xFFC9,
};

const kbdSendKey = (keysym) => rdpCanvas.value?.sendKey(keysym);
const kbdCombo = (mods, keysym) => rdpCanvas.value?.sendKeyWithModifiers(mods, keysym);

// --- Custom key combos ---
const MOD_KEYSYMS = { ctrl: 0xFFE3, alt: 0xFFE9, shift: 0xFFE1, win: 0xFFEB };
const _NAMED_KEYS = {
  tab: 0xFF09, enter: 0xFF0D, 'return': 0xFF0D,
  escape: 0xFF1B, esc: 0xFF1B,
  backspace: 0xFF08, delete: 0xFFFF, del: 0xFFFF,
  home: 0xFF50, end: 0xFF57,
  pageup: 0xFF55, pgup: 0xFF55, pagedown: 0xFF56, pgdn: 0xFF56,
  up: 0xFF52, arrowup: 0xFF52, down: 0xFF54, arrowdown: 0xFF54,
  left: 0xFF51, arrowleft: 0xFF51, right: 0xFF53, arrowright: 0xFF53,
  space: 0x0020, insert: 0xFF63,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i + 1}`, 0xFFBE + i]))
};
const _parseKeyStr = (k) => {
  const lower = k.trim().toLowerCase();
  if (_NAMED_KEYS[lower] != null) return _NAMED_KEYS[lower];
  if (lower.length === 1) return lower.codePointAt(0);
  return null;
};

const customCombos = ref(JSON.parse(localStorage.getItem('rdpCustomCombos') || '[]'));
const showAddCombo = ref(false);
const newComboLabel = ref('');
const newComboMods = ref([]);
const newComboKey = ref('');
const newComboErr = ref('');

const runCustomCombo = (cc) => {
  const keysym = _parseKeyStr(cc.key);
  if (keysym == null) return;
  const mods = cc.modifiers.map(m => MOD_KEYSYMS[m]).filter(Boolean);
  rdpCanvas.value?.sendKeyWithModifiers(mods, keysym);
};

const saveCustomCombo = () => {
  newComboErr.value = '';
  if (!newComboLabel.value.trim()) { newComboErr.value = 'Cần nhập tên'; return; }
  const keysym = _parseKeyStr(newComboKey.value);
  if (keysym == null) { newComboErr.value = 'Phím không hợp lệ'; return; }
  const cc = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    label: newComboLabel.value.trim(),
    modifiers: [...newComboMods.value],
    key: newComboKey.value.trim()
  };
  customCombos.value.push(cc);
  localStorage.setItem('rdpCustomCombos', JSON.stringify(customCombos.value));
  newComboLabel.value = ''; newComboMods.value = []; newComboKey.value = '';
  showAddCombo.value = false;
};

const deleteCustomCombo = (id) => {
  customCombos.value = customCombos.value.filter(c => c.id !== id);
  localStorage.setItem('rdpCustomCombos', JSON.stringify(customCombos.value));
};

let _liveKbdBlurTimer = null;
let _liveKbdClosedAt = 0;
const onLiveKbdBlur = () => {
  _resetLiveComposition();
  _liveKbdBlurTimer = setTimeout(() => {
    _liveKbdBlurTimer = null;
    showLiveKbd.value = false;
    _liveKbdClosedAt = Date.now();
    _stopKbdHeightPoll();
  }, 150);
};

// Poll viewport height after live-kbd opens — needed for fullscreen on Android where
// visualViewport/window resize events don't reliably fire when keyboard appears.
let _kbdHeightPollTimer = null;
const _startKbdHeightPoll = () => {
  _stopKbdHeightPoll();
  const deadline = Date.now() + 1500;
  const poll = () => {
    _syncViewportHeight();
    if (Date.now() < deadline) _kbdHeightPollTimer = setTimeout(poll, 50);
    else _kbdHeightPollTimer = null;
  };
  _kbdHeightPollTimer = setTimeout(poll, 100);
};
const _stopKbdHeightPoll = () => {
  if (_kbdHeightPollTimer) { clearTimeout(_kbdHeightPollTimer); _kbdHeightPollTimer = null; }
  _syncViewportHeight(); // restore full height when keyboard closes
};
const toggleLiveKbd = () => {
  _resetLiveComposition();
  if (_liveKbdBlurTimer) {
    clearTimeout(_liveKbdBlurTimer);
    _liveKbdBlurTimer = null;
    showLiveKbd.value = false;
    _liveKbdClosedAt = Date.now();
    _stopKbdHeightPoll();
    return;
  }
  // If keyboard was just closed by blur within 350ms, don't re-open (handles late click events)
  if (!showLiveKbd.value && Date.now() - _liveKbdClosedAt < 350) return;
  showLiveKbd.value = !showLiveKbd.value;
  if (showLiveKbd.value) {
    showWindowsPanel.value = false;
    nextTick(() => liveKbdRef.value?.focus());
    _startKbdHeightPoll();
  } else {
    liveKbdRef.value?.blur();
    _stopKbdHeightPoll();
  }
};

const onLiveKeydown = (event) => {
  // Handle Backspace/Enter via keydown so they work on Android Edge where pressing
  // these keys on an empty textarea fires keydown but NOT the input event.
  // Also call preventDefault() so the input event doesn't fire on desktop (prevents double-send).
  if (event.key === 'Backspace') {
    rdpCanvas.value?.sendKey(0xFF08);
    _keydownHandledSpecial = true;
    event.preventDefault();
  } else if (event.key === 'Enter') {
    rdpCanvas.value?.sendKey(0xFF0D);
    _keydownHandledSpecial = true;
    event.preventDefault();
  }
};

const onLiveCompositionStart = () => {
  _liveComposing = true;
};

const onLiveCompositionEnd = (event) => {
  _liveComposing = false;
  _liveJustComposed = true;
  if (event.data) {
    rdpCanvas.value?.sendText(event.data);
  }
  // Clear textarea so next input starts fresh
  if (liveKbdRef.value) liveKbdRef.value.value = '';
};

const onLiveInput = (event) => {
  // Always skip intermediate IME composition events — compositionend handles the committed text.
  // This prevents Edge Android from double-sending (it fires insertCompositionText after compositionend).
  if (event.inputType === 'insertCompositionText') return;
  if (_liveComposing) return;
  if (_liveJustComposed) {
    _liveJustComposed = false;
    return;
  }
  const canvas = rdpCanvas.value;
  if (!canvas) return;

  const type = event.inputType;
  if (type === 'deleteContentBackward' || type === 'insertLineBreak' || type === 'insertParagraph') {
    // keydown handler already sent these; skip to avoid double-send
    if (_keydownHandledSpecial) { _keydownHandledSpecial = false; return; }
    if (type === 'deleteContentBackward') canvas.sendKey(0xFF08);
    else canvas.sendKey(0xFF0D);
  } else if (event.data) {
    canvas.sendText(event.data);
  }
  // Clear so textarea never accumulates content
  if (liveKbdRef.value) liveKbdRef.value.value = '';
};

// Keyboard capture must be enabled unless a UI field that needs raw typing is open.
// Centralizing this avoids one popup leaving the keyboard permanently disabled when
// another popup closes it (e.g. sidebar editor toggled by its gear button).
watch([showSendText, showAddCombo, showSidebarEditor], ([sendText, addCombo, editor]) => {
  rdpCanvas.value?.setKeyboardEnabled(!sendText && !addCombo && !editor);
  if (sendText && liveKbdRef.value) liveKbdRef.value.blur();
});

watch(showSpecialKeys, (val) => {
  // Only blur live-kbd; keyboard capture stays enabled so user can still type to host
  if (val && liveKbdRef.value) liveKbdRef.value.blur();
  // Close add-combo form when dialog closes
  if (!val) showAddCombo.value = false;
});

// Disable keyboard capture only when the custom combo input form is open
watch(showAddCombo, (val) => {
  rdpCanvas.value?.setKeyboardEnabled(!val && !showSendText.value);
});

const sendTextBusy = ref(false);
const submitSendText = async () => {
  if (!sendTextValue.value || sendTextBusy.value) return;
  const text = sendTextValue.value;
  sendTextBusy.value = true;
  sendTextValue.value = '';
  showSendText.value = false;
  try {
    await rdpCanvas.value?.sendText(text);
  } finally {
    sendTextBusy.value = false;
  }
};

const fetchWindows = async () => {
  windowsLoading.value = true;
  windowsError.value = '';
  try {
    const token = getToken();
    const res = await axios.get(`/api/hosts/${props.agentId}/windows`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    windowsList.value = res.data;
  } catch (err) {
    windowsError.value = err.response?.data?.message || 'Không thể lấy danh sách cửa sổ';
  } finally {
    windowsLoading.value = false;
  }
};

const toggleWindowsPanel = async () => {
  showWindowsPanel.value = !showWindowsPanel.value;
  if (showWindowsPanel.value) {
    showLiveKbd.value = false;
    showSendText.value = false;
    await fetchWindows();
  }
};

const selectWindow = async (win) => {
  showWindowsPanel.value = false;
  try {
    const token = getToken();
    const vp = canvasViewport.value;
    // Subtract toolbar height so the target window size matches the actual visible canvas area
    const clientWidth = vp?.clientWidth || window.innerWidth;
    const clientHeight = vp?.clientHeight || window.innerHeight;
    const res = await axios.post(
      `/api/hosts/${props.agentId}/focus-window`,
      { hwnd: win.hwnd, clientWidth, clientHeight, sizePercent: windowSizePercent.value },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const rect = (res.data.success && res.data.rect) ? res.data.rect : win.rect;
    selectedWindow.value = {
      hwnd: win.hwnd,
      title: win.title,
      processName: win.processName,
      rect,
      resizable: res.data.resizable ?? false
    };
  } catch {
    selectedWindow.value = { hwnd: win.hwnd, title: win.title, processName: win.processName, rect: win.rect, resizable: false };
  }
};

const resizeWindow = async (percent) => {
  windowSizePercent.value = percent;
  if (!selectedWindow.value) return;
  try {
    const token = getToken();
    const vp = canvasViewport.value;
    const clientWidth = vp?.clientWidth || window.innerWidth;
    const clientHeight = vp?.clientHeight || window.innerHeight;
    const res = await axios.post(
      `/api/hosts/${props.agentId}/focus-window`,
      { hwnd: selectedWindow.value.hwnd, clientWidth, clientHeight, sizePercent: percent },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.data.success && res.data.rect) {
      selectedWindow.value = { ...selectedWindow.value, rect: res.data.rect };
    }
  } catch (err) {
    console.error('Resize window error:', err);
  }
};

const exitWindowCrop = () => {
  selectedWindow.value = null;
};

// Adjust layout when Android soft keyboard opens (visualViewport shrinks)
let _vpResizeListener = null;
let _winResizeListener = null;
const _syncViewportHeight = () => {
  if (!remoteViewerEl.value) return;
  if (activeCustomSizeId) return; // custom size is managing dimensions
  const vp = window.visualViewport;
  if (!vp) return; // no visualViewport: let CSS 100dvh handle it natively
  // In fullscreen mode on some Android browsers, visualViewport.height doesn't shrink
  // when keyboard appears but window.innerHeight does — use the smaller of the two.
  // In normal mode, vp.height already correctly tracks the visual viewport.
  const h = _isInFullscreen()
    ? Math.min(vp.height, window.innerHeight)
    : vp.height;
  remoteViewerEl.value.style.height = `${h}px`;
  remoteViewerEl.value.style.top = `${vp.offsetTop}px`;
};

onMounted(() => {
  document.addEventListener('fullscreenchange', updateFullscreenState);
  document.addEventListener('webkitfullscreenchange', updateFullscreenState);
  document.addEventListener('mozfullscreenchange', updateFullscreenState);
  document.addEventListener('MSFullscreenChange', updateFullscreenState);
  checkLatency();
  latencyInterval = setInterval(checkLatency, 5000);

  if (window.visualViewport) {
    _vpResizeListener = _syncViewportHeight;
    window.visualViewport.addEventListener('resize', _vpResizeListener);
    window.visualViewport.addEventListener('scroll', _vpResizeListener);
    _syncViewportHeight();
  }
  // window.resize fallback: in fullscreen on some Android, visualViewport may not fire
  _winResizeListener = _syncViewportHeight;
  window.addEventListener('resize', _winResizeListener);

  if (showLiveKbd.value) {
    nextTick(() => liveKbdRef.value?.focus());
  }

  // Auto fullscreen on connect if setting is enabled
  if (localStorage.getItem('rdpAutoFullscreen') === 'true' && !_isInFullscreen()) {
    // Page rendered, request fullscreen if not already triggered by dashboard
    setTimeout(() => { if (!_isInFullscreen()) toggleFullscreen(); }, 50);
  }

  // Start auto-hide timer in autohide mode; add activity listeners
  _resetAutoHide();
  document.addEventListener('mousemove', onViewerActivity, { passive: true });
  document.addEventListener('touchstart', onViewerActivity, { passive: true });
});

onUnmounted(() => {
  exitFullscreen();
  document.removeEventListener('fullscreenchange', updateFullscreenState);
  document.removeEventListener('webkitfullscreenchange', updateFullscreenState);
  document.removeEventListener('mozfullscreenchange', updateFullscreenState);
  document.removeEventListener('MSFullscreenChange', updateFullscreenState);
  document.removeEventListener('mousemove', onViewerActivity);
  document.removeEventListener('touchstart', onViewerActivity);
  if (latencyInterval) clearInterval(latencyInterval);
  if (_infoTimer) clearInterval(_infoTimer);
  if (_autoHideTimer) clearTimeout(_autoHideTimer);
  if (_vpResizeListener && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', _vpResizeListener);
    window.visualViewport.removeEventListener('scroll', _vpResizeListener);
  }
  if (_winResizeListener) window.removeEventListener('resize', _winResizeListener);
  if (_kbdHeightPollTimer) clearTimeout(_kbdHeightPollTimer);
});
</script>

<style scoped>
.remote-viewer {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: black;
  overflow: hidden;
}

.canvas-viewport {
  flex: 1;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  transition: padding-top 0.2s ease;
}

/* Floating pull-down handle when topbar is collapsed */
.toolbar-trigger {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  z-index: 101;
  background: rgba(30, 30, 30, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-top: none;
  border-radius: 0 0 8px 8px;
  padding: 4px 16px;
  cursor: pointer;
  color: #ccc;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  opacity: 0.6;
}

.toolbar-trigger:hover {
  opacity: 1;
  color: white;
  background: rgba(40, 40, 40, 0.95);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  height: 48px;
  background: rgba(30, 30, 30, 0.5);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.toolbar.collapsed {
  transform: translateY(-100%);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-group.right {
  gap: 8px;
}

.icon-btn {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  touch-action: manipulation;
  cursor: pointer;
  transition: all 0.2s ease;
  padding: 0;
}

.icon-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.2);
}

.icon-btn.active {
  background: rgba(76, 175, 80, 0.25);
  color: #4caf50;
  border-color: rgba(76, 175, 80, 0.4);
}

.control-item {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  padding-left: 8px;
  gap: 4px;
  height: 32px;
  box-sizing: border-box;
}

.control-icon {
  color: #888888;
  display: flex;
  align-items: center;
}

select {
  background: transparent;
  color: #e0e0e0;
  color-scheme: dark;
  border: none;
  font-size: 13px;
  padding: 4px 24px 4px 4px;
  border-radius: 6px;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg fill='rgba(255,255,255,0.45)' height='24' viewBox='0 0 24 24' width='24' xmlns='http://www.w3.org/2000/svg'><path d='M7 10l5 5 5-5z'/><path d='M0 0h24v24H0z' fill='none'/></svg>");
  background-repeat: no-repeat;
  background-position: right 4px center;
  background-size: 16px;
  height: 100%;
}

select:focus {
  color: #ffffff;
}

/* Native dropdown list: keep it dark so light text stays readable
   (browsers default the popup to a light scheme unless told otherwise) */
select option {
  background-color: #1e1e1e;
  color: #e0e0e0;
}

.info-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.04);
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #c0c0c0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  height: 32px;
  box-sizing: border-box;
}

.badge-icon {
  color: #777;
}

.agent-id {
  font-weight: 500;
  color: #dcdcdc;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.res-badge {
  background: rgba(33, 150, 243, 0.15);
  color: #2196f3;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 11px;
  font-family: monospace;
  font-weight: bold;
  border: 1px solid rgba(33, 150, 243, 0.2);
}

.latency-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(76, 175, 80, 0.1);
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  color: #4caf50;
  border: 1px solid rgba(76, 175, 80, 0.25);
  height: 32px;
  box-sizing: border-box;
}

.latency-icon {
  animation: pulse-wifi 2s infinite;
  display: flex;
  align-items: center;
}

@keyframes pulse-wifi {
  0% { opacity: 0.5; }
  50% { opacity: 1; }
  100% { opacity: 0.5; }
}

/* Hidden live-keyboard textarea: off-screen, invisible, but focusable */
.live-kbd-input {
  position: fixed;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  opacity: 0;
  font-size: 16px; /* ≥16px prevents iOS zoom on focus */
  border: none;
  outline: none;
  padding: 0;
  resize: none;
  pointer-events: none;
}

/* Send Text popup — floating above canvas */
.send-text-popup {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 8px;
  z-index: 90;
  background: rgba(16, 16, 16, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  overflow: hidden;
  animation: kbd-slide-up 0.18s ease;
}

.send-text-popup.popup-dragged {
  position: fixed;
  left: unset;
  right: unset;
  bottom: unset;
  top: unset;
  width: min(420px, calc(100vw - 16px));
}

.send-text-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.draggable-header {
  cursor: grab;
  user-select: none;
}
.draggable-header:active {
  cursor: grabbing;
}

.send-text-title {
  font-size: 12px;
  font-weight: 600;
  color: #a0a0a0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.send-text-body {
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.send-text-area {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 16px;
  line-height: 1.5;
  padding: 8px 10px;
  resize: none;
  outline: none;
  font-family: inherit;
}

.send-text-area::placeholder { color: #555; }
.send-text-area:focus { border-color: rgba(33, 150, 243, 0.5); }

.send-text-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@keyframes kbd-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}

.kbd-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.kbd-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.kbd-row.wrap {
  flex-wrap: wrap;
}

.kbd-row.fkeys {
  overflow-x: auto;
  flex-wrap: nowrap;
  padding-bottom: 2px;
}

.kbd-row.fkeys::-webkit-scrollbar { height: 3px; }
.kbd-row.fkeys::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }

.kbd-key {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e0e0e0;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  min-width: 36px;
  text-align: center;
  transition: background 0.1s;
  user-select: none;
  -webkit-user-select: none;
  touch-action: manipulation;
}

.kbd-key:active {
  background: rgba(255, 255, 255, 0.3);
  border-color: rgba(255, 255, 255, 0.35);
}

.kbd-key.wide { min-width: 70px; }
.kbd-key.small { min-width: 42px; font-size: 11px; padding: 5px 6px; }
.kbd-key.combo { font-size: 11px; padding: 5px 8px; background: rgba(76, 175, 80, 0.12); border-color: rgba(76, 175, 80, 0.2); }
.kbd-key.combo:active { background: rgba(76, 175, 80, 0.3); }
.kbd-key.arrow { min-width: 36px; }
.kbd-key.fkey { min-width: 38px; flex-shrink: 0; font-size: 11px; padding: 5px 6px; }

.kbd-arrows {
  display: flex;
  gap: 4px;
  align-items: center;
}

.kbd-nav {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  flex: 1;
}

.kbd-mode-row {
  display: flex;
  gap: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding: 6px 0;
}

.kbd-mode-opt {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: #888;
  flex: 1;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.kbd-mode-opt input[type="radio"] { accent-color: #2196f3; }

.kbd-mode-opt.active {
  color: #90caf9;
  background: rgba(33, 150, 243, 0.1);
  border-color: rgba(33, 150, 243, 0.2);
}

.kbd-input-area {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kbd-textarea {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: #e0e0e0;
  font-size: 16px; /* ≥16px prevents iOS zoom on focus */
  line-height: 1.5;
  padding: 8px 10px;
  resize: none;
  outline: none;
  font-family: inherit;
}

.kbd-textarea::placeholder { color: #555; }
.kbd-textarea:focus { border-color: rgba(33, 150, 243, 0.5); }

.kbd-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.kbd-act-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #c0c0c0;
  border-radius: 6px;
  padding: 7px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.kbd-act-btn:active { background: rgba(255, 255, 255, 0.2); }

.kbd-act-btn.primary {
  background: rgba(33, 150, 243, 0.2);
  border-color: rgba(33, 150, 243, 0.35);
  color: #90caf9;
  font-weight: 600;
  flex: 1;
}

.kbd-act-btn.primary:active { background: rgba(33, 150, 243, 0.4); }

/* Windows panel */
.windows-panel {
  position: absolute;
  top: 54px;
  right: 16px;
  z-index: 200;
  width: 320px;
  max-height: 400px;
  background: rgba(22, 22, 22, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.windows-panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.windows-panel-title {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: #c0c0c0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.windows-panel-refresh {
  width: 26px;
  height: 26px;
}

.windows-panel-refresh svg.spinning {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.windows-state {
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: #888;
}

.windows-state.error {
  color: #e57373;
}

.windows-list {
  overflow-y: auto;
  flex: 1;
  padding: 4px;
}

.windows-list::-webkit-scrollbar {
  width: 4px;
}

.windows-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 2px;
}

.window-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
  transition: background 0.15s ease;
}

.window-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.window-item.active {
  background: rgba(33, 150, 243, 0.15);
  border: 1px solid rgba(33, 150, 243, 0.25);
}

.window-process {
  font-size: 10px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.window-title-text {
  font-size: 13px;
  color: #e0e0e0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}

/* Crop indicator badge */
.window-crop-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(33, 150, 243, 0.15);
  border: 1px solid rgba(33, 150, 243, 0.3);
  border-radius: 6px;
  padding: 0 4px 0 10px;
  height: 32px;
  max-width: 180px;
  box-sizing: border-box;
}

.window-crop-name {
  font-size: 12px;
  color: #90caf9;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}

.crop-exit-btn {
  background: rgba(255, 255, 255, 0.08);
  border: none;
  color: #aaa;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: all 0.15s ease;
}

.crop-exit-btn:hover {
  background: rgba(255, 80, 80, 0.25);
  color: #ff6b6b;
}

.size-opt-btn {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #aaa;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s;
  line-height: 1.4;
}

.size-opt-btn:hover {
  background: rgba(33, 150, 243, 0.2);
  border-color: rgba(33, 150, 243, 0.35);
  color: #90caf9;
}

.size-opt-btn.active {
  background: rgba(33, 150, 243, 0.25);
  border-color: rgba(33, 150, 243, 0.5);
  color: #90caf9;
}

/* Pinned toolbar: in normal flow so canvas-viewport shifts down */
.toolbar.pinned {
  position: relative;
  top: auto;
  left: auto;
  right: auto;
}

/* Settings panel header with X button */
.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  margin-bottom: 2px;
}

.settings-title {
  font-size: 12px;
  font-weight: 600;
  color: #a0a0a0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.settings-close {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #aaa;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.15s;
}

.settings-close:hover {
  background: rgba(255, 80, 80, 0.2);
  border-color: rgba(255, 80, 80, 0.3);
  color: #ff6b6b;
}

/* Special keys floating popup — above canvas, won't be covered by Android keyboard */
.canvas-viewport {
  position: relative;
}

.special-keys-popup {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  z-index: 90;
  background: rgba(16, 16, 16, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  animation: kbd-slide-up 0.18s ease;
  overflow: hidden;
}

.special-keys-popup.popup-dragged {
  position: fixed;
  left: unset;
  right: unset;
  top: unset;
  width: min(480px, calc(100vw - 16px));
}

.special-keys-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.special-keys-title {
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.special-keys-body {
  padding: 8px 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* Settings dropdown panel */
.settings-panel {
  position: absolute;
  top: 54px;
  right: 16px;
  z-index: 200;
  width: 260px;
  background: rgba(22, 22, 22, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  padding: 6px 0;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  gap: 12px;
}

.settings-row:not(:last-child) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.settings-label {
  font-size: 13px;
  color: #c0c0c0;
  white-space: nowrap;
}

.settings-row select {
  font-size: 12px;
  padding: 4px 20px 4px 6px;
  height: 28px;
  background-color: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 5px;
  max-width: 130px;
}

/* Sidebar opacity slider */
.settings-range-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.settings-range {
  width: 80px;
  accent-color: #2196f3;
  cursor: pointer;
}

.settings-range-val {
  font-size: 12px;
  color: #9a9a9a;
  width: 34px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.build-info-row:hover { background: rgba(255,255,255,0.04); border-radius: 4px; }
.build-info-detail {
  padding: 6px 14px 8px;
  font-size: 12px;
  font-family: monospace;
  color: #7cb3f5;
  background: rgba(33,150,243,0.06);
  border-top: 1px solid rgba(255,255,255,0.06);
}

/* Toggle switch */
.toggle-switch {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 22px;
  flex-shrink: 0;
}

.toggle-switch input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.toggle-track {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 22px;
  cursor: pointer;
  transition: background 0.2s;
}

.toggle-track::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  background: #ccc;
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}

.toggle-switch input:checked + .toggle-track {
  background: rgba(76, 175, 80, 0.5);
}

.toggle-switch input:checked + .toggle-track::after {
  transform: translateX(18px);
  background: #4caf50;
}

/* Desktop / Mobile toolbar visibility */
.desktop-toolbar { display: flex; align-items: center; gap: 8px; }
.mobile-toolbar  { display: none; flex: 1; align-items: center; gap: 6px; min-width: 0; }

/* Actions dropdown panel */
.actions-panel {
  position: absolute;
  top: 54px;
  right: 16px;
  z-index: 200;
  width: 240px;
  background: rgba(22, 22, 22, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 14px;
  cursor: pointer;
  font-size: 14px;
  color: #c0c0c0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  transition: background 0.12s;
  user-select: none;
  -webkit-user-select: none;
}

.action-row:last-child { border-bottom: none; }
.action-row:active { background: rgba(255, 255, 255, 0.1); }
.action-row svg { flex-shrink: 0; opacity: 0.7; }
.action-row-active { color: #4caf50 !important; }
.action-row-active svg { opacity: 1; }

/* Responsive / Mobile optimizations */
@media (max-width: 768px) {
  .toolbar {
    padding: 0 8px;
    gap: 6px;
  }
  .info-badge {
    padding: 4px 6px;
  }
  .agent-id {
    max-width: 80px;
  }
  .control-item select {
    padding-right: 18px;
    font-size: 12px;
  }
}

/* Portrait mobile layout: swap to 2-dropdown toolbar */
@media (max-width: 600px) {
  .desktop-toolbar { display: none; }
  .mobile-toolbar  { display: flex; }

  /* Left group must shrink so right icon buttons are always fully visible */
  .toolbar-group.left {
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
  }
  .toolbar-group.right {
    flex-shrink: 0;
  }
  .res-badge {
    display: none;
  }
  .agent-id {
    max-width: 60px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Actions panel anchors to left on narrow screens */
  .actions-panel, .settings-panel {
    left: 8px;
    right: 8px;
    width: auto;
    max-height: 80dvh;
    overflow-y: auto;
  }
}

/* Right-click button */
.mouse-right { background: rgba(244,67,54,0.12); border-color: rgba(244,67,54,0.25); }
.mouse-right:active { background: rgba(244,67,54,0.3); }

/* Custom combos section */
.custom-combos-section {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.07);
}
.custom-combos-title {
  font-size: 10px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.custom-combos-row { gap: 5px; }
.custom-combo-wrap {
  position: relative;
  display: inline-flex;
}
.custom-combo-del {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: rgba(220, 53, 69, 0.85);
  border: none;
  color: #fff;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  z-index: 1;
  transition: background 0.15s;
}
.custom-combo-del:hover { background: rgba(220,53,69,1); }

.add-combo-form {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 6px;
  padding: 8px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 7px;
}
.combo-input {
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 5px;
  color: #e0e0e0;
  font-size: 13px;
  padding: 5px 8px;
  outline: none;
  width: 100%;
  box-sizing: border-box;
  font-family: inherit;
}
.combo-input:focus { border-color: rgba(33,150,243,0.5); }
.combo-mods-row {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}
.combo-mod-label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
  user-select: none;
}
.combo-mod-label input { accent-color: #4caf50; cursor: pointer; }
.combo-form-err { font-size: 11px; color: #ef5350; }
.combo-form-btns { display: flex; gap: 6px; justify-content: flex-end; }

/* Landscape mobile layout: ultra-thin to save vertical screen space */
@media (max-height: 480px) {
  .toolbar {
    height: 36px;
    padding: 0 8px;
  }
  .toolbar-group {
    gap: 6px;
  }
  .icon-btn {
    width: 26px;
    height: 26px;
    border-radius: 4px;
  }
  .info-badge, .control-item, .latency-badge {
    padding: 0 6px;
    border-radius: 4px;
    font-size: 11px;
    gap: 4px;
    height: 26px;
  }
  .agent-id {
    max-width: 70px;
    font-size: 11px;
  }
  select {
    font-size: 11px;
    padding: 2px 16px 2px 2px;
    background-size: 12px;
  }
  .res-badge {
    font-size: 9px;
    padding: 1px 3px;
  }
  .toolbar-trigger {
    padding: 2px 12px;
    border-radius: 0 0 6px 6px;
  }
}

/* Info dialog */
.info-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 300;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}
.info-dialog {
  background: #1e1e1e;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  min-width: 260px;
  max-width: 340px;
  width: 90%;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
}
.info-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.info-dialog-title {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
}
.info-dialog-body {
  padding: 10px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.info-label {
  font-size: 12px;
  color: #888;
  white-space: nowrap;
}
.info-value {
  font-size: 12px;
  color: #e0e0e0;
  font-family: monospace;
  text-align: right;
  word-break: break-all;
}

/* Upload panel */
.upload-panel {
  top: 54px;
  right: 8px;
  width: 260px;
}
.upload-drop-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: 1.5px dashed rgba(255,255,255,0.2);
  border-radius: 8px;
  padding: 14px 10px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.upload-drop-area:hover { border-color: rgba(255,255,255,0.45); }
.upload-status { font-size: 12px; border-radius: 6px; padding: 6px 10px; }
.upload-status.uploading { background: rgba(33,150,243,0.15); color: #64b5f6; }
.upload-status.done      { background: rgba(76,175,80,0.15);  color: #81c784; }
.upload-status.error     { background: rgba(244,67,54,0.15);  color: #e57373; }

/* ===== SIDEBAR ===== */
.sidebar {
  position: fixed;
  z-index: 96;
  display: flex;
  flex-direction: column;   /* actions above, handle below */
  align-items: stretch;
  width: 42px;
  transform: translateY(-50%);
  pointer-events: auto;
  border-radius: 10px 0 0 10px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0,0,0,0.45);
}
.sidebar-right { right: 0; border-radius: 10px 0 0 10px; }
.sidebar-left  { left: 0;  border-radius: 0 10px 10px 0; }

.sidebar-handle {
  height: 40px;
  flex-shrink: 0;
  background: rgba(33, 150, 243, var(--sidebar-handle-alpha, 0.7));
  cursor: grab;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  user-select: none;
  touch-action: none;
  backdrop-filter: blur(8px);
}
.sidebar-handle:active { cursor: grabbing; background: rgba(33,150,243,0.9); }
.sidebar-arrow { opacity: 0.85; flex-shrink: 0; }
.sidebar-grip  { opacity: 0.55; flex-shrink: 0; }

.sidebar-actions {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0;
  background: rgba(18, 18, 18, var(--sidebar-alpha, 0.95));
  border-bottom: 1px solid rgba(255,255,255,0.08);
  backdrop-filter: blur(10px);
}

.sidebar-slide-enter-active, .sidebar-slide-leave-active { transition: opacity 0.15s, transform 0.15s; }
.sidebar-slide-enter-from, .sidebar-slide-leave-to { opacity: 0; transform: translateY(8px); }

.sidebar-divider { height: 1px; background: rgba(255,255,255,0.08); margin: 2px 4px; }

.sidebar-btn {
  width: 42px;
  height: 40px;
  border: none;
  background: transparent;
  color: #ccc;
  border-radius: 0;
  cursor: pointer;
  font-size: 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;
}
.sidebar-btn:hover, .sidebar-btn:active { background: rgba(33,150,243,0.25); color: #fff; }
.sidebar-btn-active { background: rgba(33,150,243,0.2); color: #64b5f6; }
.sidebar-btn-label { line-height: 1; pointer-events: none; }
.sidebar-hide-btn { color: rgba(255,255,255,0.5); }
.sidebar-hide-btn:hover { background: rgba(255,255,255,0.08) !important; color: #fff !important; }
.sidebar-edit-btn { color: rgba(255,255,255,0.45); }

/* Sidebar editor panel */
.sidebar-editor {
  position: fixed;
  right: 8px;
  bottom: 8px;
  width: min(300px, calc(100vw - 16px));
  max-height: min(70vh, calc(100dvh - 16px));
  overflow-y: auto;
  z-index: 98;
  background: rgba(16, 16, 16, 0.97);
  border: 1px solid rgba(255,255,255,0.14);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.6);
  backdrop-filter: blur(8px);
}
.sidebar-editor.popup-dragged {
  right: unset;
  bottom: unset;
}
.sidebar-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  position: sticky;
  top: 0;
  background: rgba(16,16,16,0.97);
}
.sidebar-editor-title { font-size: 12px; font-weight: 600; color: #a0a0a0; text-transform: uppercase; letter-spacing: 0.05em; }
.sidebar-editor-body  { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 8px; }

.sb-edge-row { display: flex; align-items: center; justify-content: space-between; }
.sb-section-label { font-size: 11px; color: #777; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; margin-top: 4px; }
.sb-items-list { display: flex; flex-direction: column; gap: 4px; }
.sb-item-row { display: flex; align-items: center; gap: 6px; padding: 4px 6px; background: rgba(255,255,255,0.04); border-radius: 6px; }
.sb-item-preview { font-size: 16px; width: 24px; text-align: center; flex-shrink: 0; }
.sb-item-name { flex: 1; font-size: 12px; color: #bbb; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb-item-btns { display: flex; gap: 2px; flex-shrink: 0; }
.sb-item-btns button { background: rgba(255,255,255,0.07); border: none; color: #aaa; width: 24px; height: 24px; border-radius: 4px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.sb-item-btns button:hover { background: rgba(255,255,255,0.15); color: #fff; }
.sb-item-btns button:disabled { opacity: 0.3; cursor: default; }
.sb-del-btn:hover { background: rgba(244,67,54,0.3) !important; color: #ff8a80 !important; }
.sb-add-row { display: flex; gap: 6px; align-items: center; }
.sb-select { flex: 1; min-width: 0; }
.sb-combo-form { display: flex; flex-direction: column; gap: 6px; }
.sb-size-form { display: flex; flex-direction: column; gap: 6px; }
.sb-size-row { display: flex; align-items: center; gap: 6px; }
.sb-size-label { font-size: 12px; color: #aaa; width: 70px; flex-shrink: 0; }
.sb-size-input { width: 70px; }
.sb-vpos-group { display: flex; gap: 4px; }
.sb-vpos-btn { padding: 3px 10px; font-size: 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; color: #ccc; cursor: pointer; }
.sb-vpos-btn.active { background: rgba(76,175,80,0.35); border-color: #4caf50; color: #fff; }
</style>
