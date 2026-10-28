import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { execSync } from 'child_process'

const getGitCommit = () => {
  // update.sh passes the source (git hash or zip name) when building outside a git checkout
  if (process.env.BUILD_COMMIT) return process.env.BUILD_COMMIT;
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname }).toString().trim();
  } catch {
    return 'unknown';
  }
};

export default defineConfig({
  base: '/client/',
  plugins: [vue()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(getGitCommit())
  },
  build: {
    outDir: path.resolve(__dirname, '../rdp-proxy-server/public/client'),
    emptyOutDir: true
  }
})
