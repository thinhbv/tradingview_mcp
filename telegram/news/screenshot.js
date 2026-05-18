/**
 * Screenshot via CDP — Mở tab mới, load URL, chụp màn hình, đóng tab
 * Tái sử dụng Chrome instance đang chạy TradingView (port 9222)
 */

import CDP from 'chrome-remote-interface';

const CDP_PORT = 9222;
const CDP_HOST = 'localhost';

/**
 * Chụp màn hình 1 URL bằng Chrome đang chạy
 * @param {string} url - URL cần chụp
 * @param {object} options
 * @param {number} options.waitMs      - Thời gian chờ sau khi load (ms)
 * @param {number} options.scrollY     - Scroll xuống trước khi chụp (px)
 * @param {string} options.quality     - 'jpeg' hoặc 'png'
 * @param {object} options.viewport    - { width, height }
 * @returns {Promise<string>} - Base64 image data
 */
export async function screenshotUrl(url, {
  waitMs   = 4000,
  scrollY  = 0,
  quality  = 'jpeg',
  viewport = { width: 1280, height: 900 },
} = {}) {
  let client = null;

  try {
    // Tạo tab mới trong Chrome đang chạy
    const newTarget = await CDP.New({ host: CDP_HOST, port: CDP_PORT });
    const targetId  = newTarget.id;

    // Kết nối CDP vào tab mới
    client = await CDP({ host: CDP_HOST, port: CDP_PORT, target: targetId });
    const { Page, Emulation, Runtime } = client;

    // Set viewport
    await Emulation.setDeviceMetricsOverride({
      width:             viewport.width,
      height:            viewport.height,
      deviceScaleFactor: 1,
      mobile:            false,
    });

    // Giả user-agent thật để tránh bị chặn
    await Emulation.setUserAgentOverride({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    });

    await Page.enable();

    // Navigate và chờ load
    await Promise.race([
      new Promise(resolve => {
        Page.loadEventFired(resolve);
        Page.navigate({ url });
      }),
      new Promise(resolve => setTimeout(resolve, 10000)), // timeout 10s
    ]);

    // Chờ thêm để JS render xong
    await new Promise(r => setTimeout(r, waitMs));

    // Scroll nếu cần
    if (scrollY > 0) {
      await Runtime.evaluate({ expression: `window.scrollTo(0, ${scrollY})` });
      await new Promise(r => setTimeout(r, 500));
    }

    // Chụp màn hình toàn trang
    const { data } = await Page.captureScreenshot({
      format:  quality,
      quality: quality === 'jpeg' ? 85 : undefined,
    });

    return data; // base64

  } finally {
    if (client) {
      // Đóng tab và kết nối
      const targetId = client.target;
      await client.close();
      // Đóng tab trong Chrome
      try {
        await CDP.Close({ host: CDP_HOST, port: CDP_PORT, id: targetId });
      } catch {}
    }
  }
}

/**
 * Chụp nhiều URL liên tiếp
 * @returns {Promise<{url, data}[]>}
 */
export async function screenshotUrls(urls, options = {}) {
  const results = [];
  for (const url of urls) {
    try {
      console.log(`[Screenshot] 📸 ${url}`);
      const data = await screenshotUrl(url, options);
      results.push({ url, data, success: true });
    } catch (err) {
      console.error(`[Screenshot] ❌ ${url}:`, err.message);
      results.push({ url, data: null, success: false, error: err.message });
    }
    // Delay giữa các tab
    await new Promise(r => setTimeout(r, 1000));
  }
  return results;
}
