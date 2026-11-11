/**
 *  update screen slots.
 * @param {object} sessions sessions.
 * @return {void} Kết quả xử lý  update screen slots.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _updateScreenSlots(sessions) {
      _screenSlots = sessions.filter(s => s.slot).map(s => ({
        slot: s.slot,
        ip: s.exitIp || '',
        leadCheckStatus: s.leadCheckStatus || null,
        leadCheckMessage: s.leadCheckMessage || null,
        leadObserveStatus: s.leadObserveStatus || null,
        leadObserveMessage: s.leadObserveMessage || null,
        badgeText: s.badgeText || null,
        offerNumber: s.offerNumber || 1,
        completedScreens: s.completedScreens || 0,
        pageJumps: s.pageJumps || 0,
        currentAction: s.currentAction || s.status || '',
        version: s.version || 'Chrome',
        deviceProfile: s.deviceProfile || 'Windows 10',
        deviceVersion: s.deviceVersion || (s.deviceSummary ? s.deviceSummary.split(' · ')[0] : s.deviceProfile) || 'Windows 10',
        deviceSummary: s.deviceSummary || '',
        isWindowVisible: Boolean(s.isWindowVisible),
        bandwidthBytes: s.bandwidthBytes || 0,
        bandwidthFormatted: s.bandwidthFormatted || '0 B',
        bytesSent: s.bytesSent || 0,
        bytesReceived: s.bytesReceived || 0,
        tabs: s.tabs || [],
        websiteUrl: s.websiteUrl || (s.tabs && s.tabs[0] ? s.tabs[0].url : '') || '',
        assignedEmail: s.assignedEmail || '',
      }));
    }
