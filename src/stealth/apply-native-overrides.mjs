import { buildClientHintHeaders } from './build-client-hint-headers.mjs';
import { mergeClientHintHeaders } from './merge-client-hint-headers.mjs';

/**
 * Apply native overrides.
 * @param {object} context context.
 * @param {object} page page.
 * @param {object} options3 options3.
 * @return {Promise<void>} Kết quả xử lý apply native overrides.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function applyNativeOverrides(context, page, {
  userAgentOverride,
  hardwareConcurrency,
  deviceProfile,
  timezoneId,
  clientHintHeaders
}) {
  const session = await context.newCDPSession(page);
  try {
    await session.send('Emulation.setUserAgentOverride', userAgentOverride);
  } catch (error) {
    // fullVersion đã deprecated: bản Chrome nào từ chối thì gửi lại không có trường này.
    const metadata = userAgentOverride.userAgentMetadata;
    if (!metadata?.fullVersion) throw error;
    const {
      fullVersion,
      ...rest
    } = metadata;
    await session.send('Emulation.setUserAgentOverride', {
      ...userAgentOverride,
      userAgentMetadata: rest
    });
  }

  // Đồng bộ qua Network domain để network stack áp dụng nhất quán cho toàn bộ HTTP request
  try {
    await session.send('Network.enable');
    await session.send('Network.setUserAgentOverride', userAgentOverride);
  } catch {}

  // Bù Client Hints cho request điều hướng, đặc biệt là các bước redirect (301/302/307).
  // Chromium mặc định không gửi Sec-CH-UA-Platform-Version trên redirect tới origin chưa xin Accept-CH,
  // khiến hệ thống tracking affiliate ghi nhận "Window 0, Version click = 0" thay vì "10.0".
  // Chỉ chặn Document qua https: Chrome thật không gửi hint giá trị cao cho ảnh/script/bên thứ ba hay http://,
  // chèn vào mọi request vừa là dấu hiệu bot vừa bắt mọi request đi vòng qua Node.
  const metadata = userAgentOverride?.userAgentMetadata;
  if (metadata && metadata.platform) {
    const hints = buildClientHintHeaders(metadata, clientHintHeaders);
    try {
      await session.send('Fetch.enable', {
        patterns: [{
          urlPattern: 'https://*',
          resourceType: 'Document',
          requestStage: 'Request'
        }]
      });
      session.on('Fetch.requestPaused', async ({
        requestId,
        request
      }) => {
        try {
          await session.send('Fetch.continueRequest', {
            requestId,
            headers: mergeClientHintHeaders(request?.headers, hints)
          });
        } catch {
          // Header bị từ chối thì vẫn cho request đi tiếp nguyên bản, không để trang treo ở trạng thái paused.
          await session.send('Fetch.continueRequest', {
            requestId
          }).catch(() => {});
        }
      });
    } catch {}
  }
  if (hardwareConcurrency) {
    await session.send('Emulation.setHardwareConcurrencyOverride', {
      hardwareConcurrency
    }).catch(() => {});
  }
  if (timezoneId) {
    await session.send('Emulation.setTimezoneOverride', {
      timezoneId
    });
  }
  if (deviceProfile?.isMobile && deviceProfile.viewport) {
    const {
      width,
      height
    } = deviceProfile.viewport;
    await session.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      screenWidth: width,
      screenHeight: height,
      deviceScaleFactor: deviceProfile.deviceScaleFactor,
      mobile: true
    });
    await session.send('Emulation.setTouchEmulationEnabled', {
      enabled: true,
      maxTouchPoints: deviceProfile.spoof.maxTouchPoints
    });
  }
}
export { applyNativeOverrides };
