(() => {
  const $ = (id) => document.getElementById(id);

  const CONFIG_STORAGE_KEY = "minimal-webrtc-sip-phone.config.v1";
  const DEFAULT_DIAL_METHOD = "sip";
  const SUPPORTED_DIAL_METHODS = new Set(["sip", "mobile", "shop"]);
  const CALL_HISTORY_STORAGE_KEY = "minimal-webrtc-sip-phone.call-history.v1";
  const CONTACTS_STORAGE_KEY = "minimal-webrtc-sip-phone.contacts.v1";
  const DEVICE_CONTACT_META_STORAGE_KEY = "minimal-webrtc-sip-phone.device-contact-meta.v1";
  const CONTACT_PREFS_STORAGE_KEY = "minimal-webrtc-sip-phone.contact-prefs.v1";
  const DIAGNOSTIC_LOG_STORAGE_KEY = "minimal-webrtc-sip-phone.diagnostic-log.v1";
  const SETUP_GUIDE_SEEN_STORAGE_KEY = "minimal-webrtc-sip-phone.setup-guide-seen.v1";
  const INSTALLATION_ID_STORAGE_KEY = "minimal-webrtc-sip-phone.installation-id.v1";
  const LAST_USER_ACTION_STORAGE_KEY = "minimal-webrtc-sip-phone.last-user-action.v1";
  const MAX_CALL_HISTORY_ITEMS = 20;
  const MAX_DIAGNOSTIC_LOG_LINES = 1000;
  const CONTACT_VIRTUALIZATION_THRESHOLD = 60;
  const CONTACT_VIRTUAL_ROW_HEIGHT = 70;
  const CONTACT_VIRTUAL_OVERSCAN = 8;
  const NETWORK_STATS_INTERVAL_MILLIS = 5000;
  const TEST_AGENT_POLL_MILLIS = 1000;
  const TEST_AGENT_HEARTBEAT_MILLIS = 5000;
  const TEST_AGENT_REQUEST_TIMEOUT_MILLIS = 5000;
  const DEV_SUPPORT_EMAIL = "dev.knowledgeflow@gmail.com";
  const LOG_SEND_API_URL = "https://dental-apo.jp/ajax/api/sptest";
  const LOG_SEND_PART_CHARS = 7000;
  const LOG_SEND_TIMEOUT_MS = 15000;
  const AGI_API_BASE_URL = "https://test202606.mimio.jp/agi-api";
  const AGI_API_TIMEOUT_MS = 10000;
  const PROVISIONING_FETCH_TIMEOUT_MS = 15000;
  const PUSH_INVITE_WAIT_TIMEOUT_MS = 60000;
  const SIP_WS_KEEPALIVE_INTERVAL_MS = 30000;
  const REGISTRATION_RECOVERY_GRACE_MS = 8000;
  const REGISTERED_STATUS_LABEL_VISIBLE_MS = 2500;
  const MICROPHONE_NOT_FOUND_MESSAGE = "マイクが検出されません。端末の接続と権限を確認してください。";
  const DEFAULT_CONTACT_SORT_MODE = "name";

  const CALL_OPTIONS = {
    mediaConstraints: { audio: true, video: false },
    rtcOfferConstraints: {
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    },
  };

  let ui = null;
  let ua = null;
  let sipSocket = null;
  let sipKeepAliveTimerId = null;
  let activeSession = null;
  let callHistory = [];
  let registrationState = "UNREGISTERED";
  let registrationStatusDetail = "";
  let registrationEstablished = false;
  let navigateToDialerAfterRegistration = false;
  let registrationRecoveryTimerId = null;
  let registrationRecoveryStartedAt = 0;
  let registrationRecoveryErrorMessage = "";
  let accountStatusLabelTimerId = null;
  let accountStatusLabelState = "";
  let callState = "IDLE";
  let isHeld = false;
  let isMuted = false;
  let isSpeakerEnabled = false;
  let callStartedAt = null;
  let callTimerId = null;
  let dialpadMode = "dial";
  let holdOperationPending = false;
  let pendingIncomingDecision = null;
  let pendingIncomingFrom = "";
  let pendingIncomingCtiName = "";
  let pendingPushAnswer = null;
  let autoAnswerNextInvite = false;
  let pushInviteWaitTimeoutId = null;
  let pushInviteReadyNotified = false;
  let localMediaStream = null;
  let nativeBridge = null;
  let diagnosticLogLines = [];
  let networkStatsTimerId = null;
  let monitoredPeerConnection = null;
  let previousNetworkStats = null;
  let currentSetupChecklist = { platform: "web", items: [], hasBlockingItems: false };
  let nativeSupportInfo = {};
  let installId = "";
  let lastUserActionAt = "";
  let testAgent = null;
  let testAgentSettings = { enabled: false, deviceId: "", baseUrl: "" };
  let testAgentCurrentCommandId = null;
  const testAgentSessionCommandIds = new WeakMap();
  const testAgentCommandResults = new Map();
  let agiDeviceRegistrationKey = "";
  const agiDialRequestCallIds = new Set();
  let configuredStores = [];
  let deviceContacts = [];
  let deviceContactsAvailable = false;
  let deviceContactsPermissionPending = false;
  let deviceContactsSignature = "";
  let contactsRevision = 0;
  let lastContactsRenderKey = "";
  const virtualContactListStates = new Map();
  let virtualContactRenderFrameId = null;
  let virtualContactLoadingTimerId = null;
  let currentHomeTab = "dialer";
  let setupGuidePinned = false;
  let setupGuideReturnState = null;
  let settingsPageMode = "menu";
  let lastSettingsRenderKey = "";
  let navigationStack = [];
  let restoringNavigationState = false;
  let mainReturnAnimationTimerId = null;
  let contactOverlayMode = "closed";
  let activeContactId = "";
  let activeContactSource = "contacts";
  let contactSearchQuery = "";
  let pendingContactAvatar = "";
  let userErrorDismissTimerId = null;
  let userErrorHideTimerId = null;
  let nativeContactRequestSequence = 0;
  const pendingNativeContactRequests = new Map();
  const japaneseCollator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });

  function createNativeBridge() {
    const android = window.AndroidPhone || null;
    const iosAudio = window.webkit?.messageHandlers?.iosNativeAudio || null;
    const iosCall = window.webkit?.messageHandlers?.iosNativeCall || null;
    const iosSupport = window.webkit?.messageHandlers?.iosNativeSupport || null;
    const iosContacts = window.webkit?.messageHandlers?.iosNativeContacts || null;

    return {
      usesNativeLogStore: Boolean(android?.getMailLogText),

      notifyReady() {
        android?.notifyReady?.();
      },

      postAudio(message) {
        const action = message?.action || "";
        const speaker = Boolean(message?.speaker);

        if (action === "start") {
          android?.prepareAudioForCall?.();
          android?.setSpeakerphoneEnabled?.(speaker);
        } else if (action === "route") {
          android?.setSpeakerphoneEnabled?.(speaker);
        } else if (action === "stop") {
          android?.clearAudioForCall?.();
        }

        iosAudio?.postMessage(message);
      },

      cancelIncomingCallNotification() {
        android?.cancelIncomingCallNotification?.();
        iosCall?.postMessage({ action: "stopIncomingCallControl" });
      },

      notifyPushInviteReady(payload) {
        try {
          android?.notifyPushInviteReady?.(
            String(payload?.callId || ""),
            String(payload?.caller || payload?.fromUri || ""),
            String(payload?.sipUri || ""),
            String(payload?.receivedAt || ""),
          );
        } catch (error) {
          warn(`Push INVITE ready notification failed: ${error.message || "unknown"}`);
        }

        iosCall?.postMessage({
          action: "inviteReady",
          callId: String(payload?.callId || ""),
          caller: String(payload?.caller || payload?.fromUri || ""),
          sipUri: String(payload?.sipUri || ""),
          receivedAt: String(payload?.receivedAt || ""),
        });
      },

      confirmPushInviteAccepted(payload) {
        iosCall?.postMessage({
          action: "inviteAccepted",
          callId: String(payload?.callId || ""),
        });
      },

      requestSupportInfo() {
        iosSupport?.postMessage({ action: "refreshSupportInfo" });
      },

      lookupContactName(phoneNumber) {
        const phone = String(phoneNumber || "").trim();
        if (!phone) return Promise.resolve("");

        try {
          const androidName = android?.lookupContactName?.(phone);
          if (androidName === "__permission_requested__") {
            return new Promise((resolve) => {
              let attempts = 0;
              const timerId = window.setInterval(() => {
                attempts += 1;
                const retryName = android?.lookupContactName?.(phone);
                if (retryName && retryName !== "__permission_requested__") {
                  window.clearInterval(timerId);
                  resolve(String(retryName));
                } else if (attempts >= 15) {
                  window.clearInterval(timerId);
                  resolve("");
                }
              }, 1000);
            });
          }
          if (androidName) return Promise.resolve(String(androidName));
        } catch (error) {
          warn(`Android contact lookup failed: ${error.message || "unknown"}`);
        }

        if (!iosContacts) return Promise.resolve("");

        const requestId = `contact-${Date.now()}-${nativeContactRequestSequence += 1}`;
        return new Promise((resolve) => {
          const timerId = window.setTimeout(() => {
            pendingNativeContactRequests.delete(requestId);
            resolve("");
          }, 5000);
          pendingNativeContactRequests.set(requestId, { resolve, timerId });
          iosContacts.postMessage({ action: "lookup", requestId, phone });
        });
      },

      readDeviceContacts() {
        if (!android?.getDeviceContacts) return null;
        try {
          const raw = android.getDeviceContacts();
          if (raw === "__permission_requested__") return null;
          const contacts = JSON.parse(String(raw || "[]"));
          return Array.isArray(contacts) ? contacts : [];
        } catch (error) {
          warn(`Android contact list read failed: ${error.message || "unknown"}`);
          return [];
        }
      },

      openCreateContact() {
        try {
          return Boolean(android?.openCreateContact?.());
        } catch (error) {
          warn(`Android contact create screen failed: ${error.message || "unknown"}`);
          return false;
        }
      },

      openEditContact(contactId) {
        try {
          return Boolean(android?.openEditContact?.(String(contactId || "")));
        } catch (error) {
          warn(`Android contact edit screen failed: ${error.message || "unknown"}`);
          return false;
        }
      },

      readSupportInfo() {
        try {
          const raw = android?.getSupportInfo?.();
          if (raw) return JSON.parse(raw);
          return window.__nativeSupportInfo && typeof window.__nativeSupportInfo === "object"
            ? window.__nativeSupportInfo
            : {};
        } catch (error) {
          warn(`Native support info parse failed: ${error.message || "unknown"}`);
          return {};
        }
      },

      readMailLog() {
        try {
          return String(android?.getMailLogText?.() || window.__nativeMailLog || "");
        } catch (_error) {
          return "";
        }
      },

      readLongLog() {
        try {
          return String(android?.getLongLogText?.() || window.__nativeLongLog || "");
        } catch (_error) {
          return "";
        }
      },

      sendLog(reason, text) {
        try {
          if (android?.sendLog) {
            return Boolean(android.sendLog(String(reason || ""), String(text || "")));
          }
          if (iosSupport && window.__nativeCanSendLog === true) {
            iosSupport.postMessage({
              action: "sendLog",
              reason: String(reason || ""),
              text: String(text || ""),
            });
            return true;
          }
          return false;
        } catch (error) {
          warn(`Native log upload request failed: ${describeError(error)}`);
          return false;
        }
      },

      emailLog(subject, text) {
        try {
          if (android?.emailLog) {
            return Boolean(android.emailLog(
              DEV_SUPPORT_EMAIL,
              String(subject || ""),
              String(text || ""),
            ));
          }
          if (iosSupport) {
            iosSupport.postMessage({
              action: "emailLog",
              recipient: DEV_SUPPORT_EMAIL,
              subject: String(subject || ""),
              text: String(text || ""),
            });
            return true;
          }
          const body = String(text || "").slice(-12000);
          window.location.href = `mailto:${encodeURIComponent(DEV_SUPPORT_EMAIL)}?subject=${encodeURIComponent(String(subject || ""))}&body=${encodeURIComponent(body)}`;
          return true;
        } catch (_error) {
          return false;
        }
      },

      writeLog(level, message) {
        const normalizedLevel = String(level || "info").toLowerCase();
        const normalizedMessage = String(message || "");

        if (normalizedLevel === "debug") {
          android?.logDebug?.(normalizedMessage);
          return;
        }
        if (normalizedLevel === "warn") {
          android?.logWarn?.(normalizedMessage);
          return;
        }
        if (normalizedLevel === "error") {
          android?.logError?.(normalizedMessage);
          return;
        }
        android?.logInfo?.(normalizedMessage);
      },

      openSupportTarget(target) {
        if (android?.openSupportTarget) {
          android.openSupportTarget(String(target || ""));
          return true;
        }
        if (iosSupport) {
          iosSupport.postMessage({ action: "openSettings", target: String(target || "") });
          return true;
        }
        return false;
      },

      shareText(subject, text) {
        if (android?.shareText) {
          android.shareText(String(subject || ""), String(text || ""));
          return true;
        }
        if (iosSupport) {
          iosSupport.postMessage({
            action: "shareText",
            subject: String(subject || ""),
            text: String(text || ""),
          });
          return true;
        }
        return false;
      },
    };
  }

  function readDiagnosticLogs() {
    if (nativeBridge?.usesNativeLogStore) {
      const nativeLog = nativeBridge.readMailLog();
      diagnosticLogLines = nativeLog
        ? nativeLog.split(/\r?\n/).filter(Boolean).slice(-MAX_DIAGNOSTIC_LOG_LINES)
        : [];
      return diagnosticLogLines;
    }

    try {
      const raw = window.localStorage.getItem(DIAGNOSTIC_LOG_STORAGE_KEY);
      const lines = raw ? JSON.parse(raw) : [];
      diagnosticLogLines = Array.isArray(lines)
        ? lines.slice(-MAX_DIAGNOSTIC_LOG_LINES)
        : [];
    } catch (_error) {
      diagnosticLogLines = [];
    }
    return diagnosticLogLines;
  }

  function resolvePlatform() {
    const nativePlatform = String(nativeSupportInfo.platform || "").trim().toLowerCase();
    if (nativePlatform) return nativePlatform;
    if (window.webkit?.messageHandlers?.iosNativeSupport) return "ios";
    if (window.AndroidPhone) return "android";
    return getPlatform();
  }

  function applyPlatformTheme() {
    const platform = resolvePlatform();
    document.body.classList.toggle("platform-ios", platform === "ios");
    document.body.classList.toggle("platform-android", platform === "android");
  }

  function hasConfiguredAccount() {
    return Boolean(ui.wsUrl?.value.trim() && ui.sipUri?.value.trim() && ui.password?.value);
  }

  function getDefaultHomeTab() {
    return hasConfiguredAccount() ? "dialer" : "settings";
  }

  function shouldAutoRegisterOnStartup() {
    return hasSeenSetupGuide() && hasConfiguredAccount();
  }

  function canAccessPrimaryHomeTabs() {
    return registrationState === "REGISTERED"
      || (hasConfiguredAccount() && ["REGISTERING", "FAILED"].includes(registrationState));
  }

  function resolveHomeMode() {
    if (setupGuidePinned || !hasSeenSetupGuide()) return "setup";
    if (canAccessPrimaryHomeTabs()) return "main";
    return "account";
  }

  function renderDiagnosticLogs() {
    if (!ui?.logOutput) return;
    ui.logOutput.textContent = diagnosticLogLines
      .slice()
      .reverse()
      .map((line) => String(line || "").trimStart())
      .join("\n\n");
  }

  function persistDiagnosticLog(line) {
    diagnosticLogLines.push(line);
    if (diagnosticLogLines.length > MAX_DIAGNOSTIC_LOG_LINES) {
      diagnosticLogLines.splice(
        0,
        diagnosticLogLines.length - MAX_DIAGNOSTIC_LOG_LINES,
      );
    }

    if (nativeBridge?.usesNativeLogStore) {
      return;
    }

    try {
      window.localStorage.setItem(
        DIAGNOSTIC_LOG_STORAGE_KEY,
        JSON.stringify(diagnosticLogLines),
      );
    } catch (error) {
      diagnosticLogLines = diagnosticLogLines.slice(-Math.floor(MAX_DIAGNOSTIC_LOG_LINES / 2));
      try {
        window.localStorage.setItem(
          DIAGNOSTIC_LOG_STORAGE_KEY,
          JSON.stringify(diagnosticLogLines),
        );
      } catch (_ignored) {
        // Keep runtime logging available even when persistent storage is unavailable.
      }
      console.warn("Diagnostic log persistence failed", error);
    }
  }

  function log(message, level = "info") {
    const normalizedLevel = String(level || "info").toUpperCase();
    const normalizedMessage = String(message || "");
    const line = `[${new Date().toISOString()}] [${normalizedLevel}] ${normalizedMessage}`;
    persistDiagnosticLog(line);
    renderDiagnosticLogs();
    if (level === "error") {
      console.error(normalizedMessage);
    } else if (level === "warn") {
      console.warn(normalizedMessage);
    } else if (level === "debug") {
      console.debug(normalizedMessage);
    } else {
      console.log(normalizedMessage);
    }
    nativeBridge?.writeLog?.(level, normalizedMessage);
  }

  function warn(message) {
    log(message, "warn");
  }

  function errorLog(message) {
    log(message, "error");
  }

  function describeError(error) {
    if (!error) return "unknown";
    const code = String(error.code || "").trim();
    const name = String(error.name || "").trim();
    const message = String(error.message || error).trim();
    return [code, name, message].filter(Boolean).join(" | ") || "unknown";
  }

  function createTaggedError(code, message, cause = null) {
    const error = new Error(message);
    error.code = code;
    if (cause) {
      error.cause = cause;
    }
    return error;
  }

  function getPlatform() {
    if (nativeSupportInfo.platform) return nativeSupportInfo.platform;
    if (window.AndroidPhone) return "android";
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) return "ios";
    return "web";
  }

  function ensureInstallId() {
    if (installId) return installId;

    try {
      const saved = window.localStorage.getItem(INSTALLATION_ID_STORAGE_KEY);
      if (saved) {
        installId = saved;
        return installId;
      }
    } catch (_error) {
      // Ignore localStorage read failures and fall back to runtime generation.
    }

    const generated = window.crypto?.randomUUID?.()
      || `install-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    installId = generated;

    try {
      window.localStorage.setItem(INSTALLATION_ID_STORAGE_KEY, installId);
    } catch (_error) {
      // Keep the runtime ID even when persistent storage is unavailable.
    }
    return installId;
  }

  function loadLastUserAction() {
    try {
      lastUserActionAt = window.localStorage.getItem(LAST_USER_ACTION_STORAGE_KEY) || "";
    } catch (_error) {
      lastUserActionAt = "";
    }
  }

  function rememberUserAction() {
    lastUserActionAt = new Date().toISOString();
    try {
      window.localStorage.setItem(LAST_USER_ACTION_STORAGE_KEY, lastUserActionAt);
    } catch (_error) {
      // Ignore persistence failures; runtime value is still useful for diagnostics.
    }
  }

  function installUserActivityTracking() {
    const handler = () => rememberUserAction();
    document.addEventListener("click", handler, true);
    document.addEventListener("input", handler, true);
    document.addEventListener("change", handler, true);
  }

  function installSelectBehavior() {
    const blurActiveSelect = () => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLSelectElement) activeElement.blur();
    };

    document.addEventListener("change", (event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement)) return;
      window.requestAnimationFrame(() => select.blur());
    });
    window.addEventListener("focus", () => {
      window.requestAnimationFrame(blurActiveSelect);
    });
  }

  function markSetupGuideSeen() {
    try {
      window.localStorage.setItem(SETUP_GUIDE_SEEN_STORAGE_KEY, "1");
    } catch (_error) {
      // Ignore persistent storage failures.
    }
  }

  function hasSeenSetupGuide() {
    try {
      return window.localStorage.getItem(SETUP_GUIDE_SEEN_STORAGE_KEY) === "1";
    } catch (_error) {
      return false;
    }
  }

  function readNativeSupportInfo() {
    const injected = window.__nativeSupportInfo
      && typeof window.__nativeSupportInfo === "object"
      ? window.__nativeSupportInfo
      : {};
    nativeSupportInfo = {
      ...injected,
      ...nativeBridge?.readSupportInfo?.(),
    };
    return nativeSupportInfo;
  }

  function normalizePermissionState(value) {
    const state = String(value || "").toLowerCase();
    if (state === "granted" || state === "authorized") return "granted";
    if (state === "denied" || state === "restricted") return "denied";
    if (state === "prompt" || state === "default" || state === "not_determined") return "prompt";
    return "unknown";
  }

  function getPermissionBadge(status) {
    if (status === "done") return { className: "setup-status-done", label: "設定済み" };
    if (status === "action") return { className: "setup-status-action", label: "未設定" };
    if (status === "manual") return { className: "setup-status-manual", label: "要確認" };
    return { className: "setup-status-info", label: "案内" };
  }

  async function queryBrowserMicrophonePermission() {
    try {
      if (!navigator.permissions?.query) return "unknown";
      const result = await navigator.permissions.query({ name: "microphone" });
      return normalizePermissionState(result.state);
    } catch (_error) {
      return "unknown";
    }
  }

  function readBrowserNotificationPermission() {
    if (!("Notification" in window)) return "unknown";
    return normalizePermissionState(window.Notification?.permission);
  }

  function getBrowserNetworkInfo() {
    const nativeInfo = window.__nativeNetworkInfo
      && typeof window.__nativeNetworkInfo === "object"
      ? window.__nativeNetworkInfo
      : {};
    const connection = navigator.connection
      || navigator.mozConnection
      || navigator.webkitConnection;
    if (!connection) return { ...nativeInfo };

    return {
      ...nativeInfo,
      networkType: connection.type || "",
      effectiveType: connection.effectiveType || "",
      downlinkMbps: Number.isFinite(connection.downlink) ? connection.downlink : null,
      browserRttMs: Number.isFinite(connection.rtt) ? connection.rtt : null,
      saveData: Boolean(connection.saveData),
    };
  }

  function classifyNetworkQuality(metrics) {
    const loss = metrics.packetLossPercent;
    const jitter = metrics.jitterMs;
    const rtt = metrics.rttMs;
    const concealment = metrics.concealmentPercent;

    if ((loss !== null && loss >= 5)
      || (jitter !== null && jitter >= 30)
      || (rtt !== null && rtt >= 300)
      || (concealment !== null && concealment >= 5)) {
      return "POOR";
    }

    if ((loss !== null && loss >= 2)
      || (jitter !== null && jitter >= 20)
      || (rtt !== null && rtt >= 150)
      || (concealment !== null && concealment >= 2)) {
      return "WARNING";
    }

    return "GOOD";
  }

  function safePercent(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }
    return Math.round((numerator / denominator) * 10000) / 100;
  }

  async function collectNetworkStats(peerConnection) {
    if (!peerConnection || peerConnection.connectionState === "closed") return;

    try {
      const reports = await peerConnection.getStats();
      let inboundAudio = null;
      let selectedPair = null;
      let localCandidate = null;
      let remoteCandidate = null;

      reports.forEach((report) => {
        if (report.type === "inbound-rtp"
          && report.kind === "audio"
          && !report.isRemote) {
          inboundAudio = report;
        }
        if (report.type === "candidate-pair"
          && report.state === "succeeded"
          && (report.nominated || report.selected)) {
          selectedPair = report;
        }
      });

      if (selectedPair) {
        localCandidate = reports.get(selectedPair.localCandidateId) || null;
        remoteCandidate = reports.get(selectedPair.remoteCandidateId) || null;
      }

      const now = Date.now();
      const current = inboundAudio ? {
        timestamp: now,
        packetsReceived: Number(inboundAudio.packetsReceived || 0),
        packetsLost: Number(inboundAudio.packetsLost || 0),
        bytesReceived: Number(inboundAudio.bytesReceived || 0),
        concealedSamples: Number(inboundAudio.concealedSamples || 0),
        totalSamplesReceived: Number(inboundAudio.totalSamplesReceived || 0),
      } : null;
      const previous = previousNetworkStats;
      const elapsedSeconds = previous && current
        ? Math.max(0.001, (current.timestamp - previous.timestamp) / 1000)
        : null;
      const receivedDelta = previous && current
        ? Math.max(0, current.packetsReceived - previous.packetsReceived)
        : null;
      const lostDelta = previous && current
        ? Math.max(0, current.packetsLost - previous.packetsLost)
        : null;
      const bytesDelta = previous && current
        ? Math.max(0, current.bytesReceived - previous.bytesReceived)
        : null;
      const concealedDelta = previous && current
        ? Math.max(0, current.concealedSamples - previous.concealedSamples)
        : null;
      const samplesDelta = previous && current
        ? Math.max(0, current.totalSamplesReceived - previous.totalSamplesReceived)
        : null;

      const metrics = {
        quality: "",
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        signalingState: peerConnection.signalingState,
        ...getBrowserNetworkInfo(),
        packetLossPercent: safePercent(lostDelta, (receivedDelta || 0) + (lostDelta || 0)),
        jitterMs: Number.isFinite(inboundAudio?.jitter)
          ? Math.round(inboundAudio.jitter * 1000)
          : null,
        rttMs: Number.isFinite(selectedPair?.currentRoundTripTime)
          ? Math.round(selectedPair.currentRoundTripTime * 1000)
          : null,
        inboundKbps: elapsedSeconds && bytesDelta !== null
          ? Math.round((bytesDelta * 8) / elapsedSeconds / 1000)
          : null,
        concealmentPercent: safePercent(concealedDelta, samplesDelta),
        packetsReceived: current?.packetsReceived ?? null,
        packetsLost: current?.packetsLost ?? null,
        localCandidateType: localCandidate?.candidateType || "",
        localProtocol: localCandidate?.protocol || "",
        localNetworkType: localCandidate?.networkType || "",
        remoteCandidateType: remoteCandidate?.candidateType || "",
      };
      metrics.quality = classifyNetworkQuality(metrics);

      log(`[NETWORK] ${JSON.stringify(metrics)}`);
      previousNetworkStats = current;
    } catch (error) {
      warn(`[NETWORK] stats_error=${error.message || "unknown"}`);
    }
  }

  function stopNetworkStatsMonitor() {
    if (networkStatsTimerId) {
      window.clearInterval(networkStatsTimerId);
      networkStatsTimerId = null;
    }
    monitoredPeerConnection = null;
    previousNetworkStats = null;
  }

  function startNetworkStatsMonitor(peerConnection) {
    stopNetworkStatsMonitor();
    monitoredPeerConnection = peerConnection;
    log(`[NETWORK] monitor_started ${JSON.stringify(getBrowserNetworkInfo())}`);
    collectNetworkStats(peerConnection);
    networkStatsTimerId = window.setInterval(() => {
      collectNetworkStats(monitoredPeerConnection);
    }, NETWORK_STATS_INTERVAL_MILLIS);
  }

  function installNetworkStateLogging() {
    const logNetworkState = (eventName) => {
      log(`[NETWORK] ${eventName} ${JSON.stringify({
        online: navigator.onLine,
        ...getBrowserNetworkInfo(),
      })}`);
    };

    window.addEventListener("online", () => logNetworkState("online"));
    window.addEventListener("offline", () => logNetworkState("offline"));

    const connection = navigator.connection
      || navigator.mozConnection
      || navigator.webkitConnection;
    connection?.addEventListener?.("change", () => logNetworkState("connection_changed"));
    window.addEventListener("native-network-change", () => logNetworkState("native_connection_changed"));
    logNetworkState("initial_state");
  }

  function installGlobalErrorLogging() {
    window.addEventListener("error", (event) => {
      const details = [
        `message=${event.message || "unknown"}`,
        `file=${event.filename || "unknown"}`,
        `line=${event.lineno || 0}`,
        `column=${event.colno || 0}`,
        event.error?.stack ? `stack=${event.error.stack}` : "",
      ].filter(Boolean).join(" | ");
      errorLog(`JavaScript error: ${details}`);
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const details = [
        `message=${reason?.message || String(reason || "unknown")}`,
        reason?.code ? `code=${reason.code}` : "",
        reason?.name ? `name=${reason.name}` : "",
        reason?.stack ? `stack=${reason.stack}` : "",
      ].filter(Boolean).join(" | ");
      errorLog(`JavaScript promise error: ${details}`);
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message, type = "success") {
    const text = String(message || "").trim();
    if (!text) return;

    let toast = document.getElementById("appToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "appToast";
      toast.className = "app-toast";
      document.body.appendChild(toast);
    }

    toast.textContent = text;
    toast.dataset.type = type;
    toast.classList.add("is-visible");

    window.clearTimeout(showToast.timerId);
    showToast.timerId = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2200);
  }

  function formatDateLabel(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "-";

    const today = new Date();
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOf(today) - startOf(date)) / 86400000);

    if (diffDays === 0) return "今日";
    if (diffDays === 1) return "昨日";

    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }

  function formatTimeLabel(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "-";

    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  function formatDuration(seconds) {
    const value = Number(seconds || 0);
    if (!Number.isFinite(value) || value <= 0) return "";

    const minutes = Math.floor(value / 60);
    const restSeconds = Math.floor(value % 60);

    return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
  }

  function normalizeHistoryRecord(item) {
    if (item && item.timestamp && item.direction && item.status) {
      return {
        ...item,
        target: item.target || "不明",
        timestamp: item.timestamp || new Date().toISOString(),
        direction: normalizeHistoryDirection(item.direction),
        status: normalizeHistoryStatus(item.status),
        dialMethod: item.dialMethod || inferDialMethod(item),
        durationSec: Number(item.durationSec || item.duration || 0),
        storeId: item.storeId || "",
        storeName: item.storeName || "",
        displayName: item.displayName || "",
        ctiName: item.ctiName || "",
        contactName: item.contactName || "",
        addressBookName: item.addressBookName || "",
      };
    }

    return {
      target: item?.target || "不明",
      timestamp: item?.timestamp || item?.time || new Date().toISOString(),
      direction: normalizeHistoryDirection(item?.direction || item?.kind || "通話"),
      status: normalizeHistoryStatus(item?.status || "成功"),
      dialMethod: inferDialMethod(item),
      durationSec: Number(item?.durationSec || item?.duration || 0),
      storeId: item?.storeId || "",
      storeName: item?.storeName || "",
      displayName: item?.displayName || "",
      ctiName: item?.ctiName || "",
      contactName: item?.contactName || "",
      addressBookName: item?.addressBookName || "",
    };
  }

  function inferDialMethod(item) {
    const text = `${item?.direction || ""} ${item?.dialMethod || ""} ${item?.target || ""}`.toLowerCase();

    if (text.includes("shop") || text.includes("store") || text.includes("店舗")) return "shop";
    if (text.includes("mobile") || text.includes("tel:")) return "mobile";
    return "sip";
  }

  function readCallHistory() {
    try {
      const raw = window.localStorage.getItem(CALL_HISTORY_STORAGE_KEY);
      const items = raw ? JSON.parse(raw) : [];
      callHistory = Array.isArray(items) ? items.map(normalizeHistoryRecord) : [];
      return callHistory;
    } catch (_error) {
      callHistory = [];
      return [];
    }
  }

  function saveCallHistory(items) {
    callHistory = Array.isArray(items) ? items.map(normalizeHistoryRecord) : [];
    window.localStorage.setItem(CALL_HISTORY_STORAGE_KEY, JSON.stringify(callHistory));
  }

  function getHistoryRecordByOriginalIndex(originalIndex) {
    const items = readCallHistory();
    const numericIndex = Number(originalIndex);
    if (!Number.isInteger(numericIndex) || numericIndex < 0 || numericIndex >= items.length) {
      return null;
    }

    return {
      ...normalizeHistoryRecord(items[numericIndex]),
      originalIndex: numericIndex,
    };
  }

  function getCallHistoryEntries() {
    return readCallHistory()
      .map((item, originalIndex) => ({
        ...normalizeHistoryRecord(item),
        originalIndex,
      }))
      .reverse();
  }

  function extractPhoneNumber(value) {
    const text = String(value || "");
    const sipUser = text.replace(/^.*?sip:/i, "").split("@")[0];

    return (sipUser || text)
      .replace(/[^\d+]/g, "")
      .replace(/(?!^)\+/g, "");
  }

  function formatHistoryPhone(item) {
    const target = String(item?.target || "").trim();
    const phone = extractPhoneNumber(target);
    return phone || target || "\u4e0d\u660e";
  }

  function normalizeHistoryDirection(direction) {
    const text = String(direction || "").trim();

    if (/missed|\u4e0d\u5728|\u672a\u5fdc\u7b54|\u672a\u63a5\u7d9a/i.test(text)) return "\u4e0d\u5728\u7740\u4fe1";
    if (/incoming|inbound|\u7740\u4fe1/i.test(text)) return "\u7740\u4fe1";
    if (/outgoing|\u767a\u4fe1|mobile|shop|store/i.test(text)) return "\u767a\u4fe1";

    return text && text.length <= 8 ? text : "\u901a\u8a71";
  }

  function normalizeHistoryStatus(status) {
    const text = String(status || "").trim();

    if (/fail|failed|missed|\u4e0d\u5728|\u5931\u6557/i.test(text)) return "\u5931\u6557";
    if (/cancel|cancelled|\u30ad\u30e3\u30f3\u30bb\u30eb|\u62d2\u5426/i.test(text)) return "\u30ad\u30e3\u30f3\u30bb\u30eb";

    return "\u6210\u529f";
  }

  function buildCallHistoryViewModel(item) {
    const normalized = normalizeHistoryRecord(item);
    const target = String(normalized.target || "").trim();
    const phone = formatHistoryPhone(normalized);
    const contact = findContactByTarget(target);
    const addressBookName = firstNonEmptyValue(
      contact?.name,
      normalized.contactName,
      normalized.addressBookName,
    );
    const ctiDisplayName = String(normalized.ctiName || "").trim();
    const displayName = resolvePreferredDisplayName({
      ctiName: ctiDisplayName,
      contactName: addressBookName,
      legacyDisplayName: normalized.displayName,
      phone,
      sipUri: target,
    });
    const phoneOrSip = compactText(firstNonEmptyValue(target, phone, "\u4e0d\u660e"), 40);
    const isSipTarget = /^sip:/i.test(target) || target.includes("@");
    const listSubText = isSipTarget && phone !== target ? phone : phoneOrSip;
    const subText = displayName === listSubText ? "" : listSubText;
    const directionLabel = normalizeHistoryDirection(normalized.direction);
    const statusLabel = normalizeHistoryStatus(normalized.status);
    const dateLabel = formatDateLabel(normalized.timestamp);
    const timeLabel = formatTimeLabel(normalized.timestamp);
    const durationLabel = formatDuration(normalized.durationSec) || "00:00";

    return {
      ...normalized,
      originalIndex: Number.isInteger(Number(normalized.originalIndex)) ? Number(normalized.originalIndex) : undefined,
      displayName,
      subText,
      phoneOrSip,
      directionLabel,
      statusLabel,
      dateLabel,
      timeLabel,
      dateTimeLabel: `${dateLabel} ${timeLabel}`,
      durationLabel,
      storeName: String(normalized.storeName || "").trim(),
      ctiDisplayName: ctiDisplayName || "",
      addressBookName: addressBookName || "",
    };
  }

  function getHistoryFilterType(item) {
    if (item.directionLabel === "\u4e0d\u5728\u7740\u4fe1") return "missed";
    if (item.directionLabel === "\u7740\u4fe1") return "incoming";
    if (item.directionLabel === "\u767a\u4fe1") return "outgoing";
    return "all";
  }

  function filterHistoryItems(items) {
    if (!ui?.historyFilterValue || ui.historyFilterValue === "all") {
      return items;
    }

    return items.filter((item) => getHistoryFilterType(item) === ui.historyFilterValue);
  }

  function setHistoryFilter(filter) {
    ui.historyFilterValue = filter || "all";
    renderCallHistory();
  }

  function updateStaticHistoryFilterButtons() {
    [
      ["all", ui.historyFilterAll],
      ["incoming", ui.historyFilterIncoming],
      ["outgoing", ui.historyFilterOutgoing],
      ["missed", ui.historyFilterMissed],
    ].forEach(([value, button]) => {
      if (!button) return;
      const active = (ui.historyFilterValue || "all") === value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function renderHistoryList(targetNode, items, options = {}) {
    if (!targetNode) return;

    const {
      emptyText = "\u5c65\u6b74\u306f\u3042\u308a\u307e\u305b\u3093",
      sourceTab = "history",
      itemClassName = "history-item",
    } = options;

    targetNode.innerHTML = items.length
      ? items.map((item) => `
        <li class="${itemClassName}">
            <button
              type="button"
              class="history-open-button history-detail-trigger"
              data-history-detail-index="${item.originalIndex}"
              data-history-source="${escapeHtml(sourceTab)}"
              aria-label="${escapeHtml(item.displayName)}の詳細"
            >
              <span class="contact-avatar default-avatar history-avatar" aria-hidden="true"></span>
              <span class="history-main contact-main">
                <span class="history-party">${escapeHtml(item.displayName)}</span>
                <span class="history-meta">
                  ${escapeHtml(item.directionLabel)} \u30fb ${escapeHtml(item.statusLabel)} \u30fb ${escapeHtml(item.dateTimeLabel)}
                </span>
                ${item.subText ? `<span class="history-sub">${escapeHtml(item.subText)}</span>` : ""}
                <span class="history-sub">${escapeHtml(item.durationLabel)}</span>
              </span>
            </button>
            <button
              type="button"
              class="history-redial-button"
              data-history-index="${item.originalIndex}"
              aria-label="\u518d\u767a\u4fe1"
              title="\u518d\u767a\u4fe1"
            >
              <svg class="call-start-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7.2 3.5 10 8l-2 2c1.4 2.8 3.6 5 6.4 6.4l2-2 4.5 2.8-.6 3.3c-.2.9-1 1.5-1.9 1.5C9.3 22 2 14.7 2 5.6c0-.9.6-1.7 1.5-1.9z"/>
              </svg>
              <span class="sr-only">\u518d\u767a\u4fe1</span>
            </button>
          </li>
        `).join("")
      : `<li class="empty-history">${escapeHtml(emptyText)}</li>`;
  }

  function renderFullCallHistoryList(items) {
    renderHistoryList(ui.historyList, items, {
      emptyText: "\u5c65\u6b74\u306f\u3042\u308a\u307e\u305b\u3093",
      sourceTab: "history",
      itemClassName: "history-item",
    });
  }

  function renderRecentCallHistoryList(items) {
    renderHistoryList(ui.callHistoryList, items.slice(0, 3), {
      emptyText: "\u5c65\u6b74\u306f\u3042\u308a\u307e\u305b\u3093",
      sourceTab: "dialer",
      itemClassName: "call-history-item",
    });
  }

  function renderCallHistory() {
    if (!ui?.historyList && !ui?.callHistoryList) return;

    updateStaticHistoryFilterButtons();

    const allItems = getCallHistoryEntries().map((item) => buildCallHistoryViewModel(item));
    const filteredItems = filterHistoryItems(allItems);

    renderFullCallHistoryList(filteredItems);
    renderRecentCallHistoryList(allItems);
  }

  function showHistoryDetails(originalIndex, sourceTab = "history") {
    const record = getHistoryRecordByOriginalIndex(originalIndex);
    if (!record) {
      showUserError("\u5c65\u6b74\u8a73\u7d30\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002");
      return;
    }

    const item = buildCallHistoryViewModel(record);

    const rows = [
      ["\u7a2e\u5225", item.directionLabel],
      ["\u72b6\u614b", item.statusLabel],
      ["\u65e5\u6642", item.dateTimeLabel],
      ["\u901a\u8a71\u6642\u9593", item.durationLabel],
      ["\u5e97\u8217\u540d", item.storeName],
      ["CTI\u540d", item.ctiDisplayName],
      ["\u30a2\u30c9\u30ec\u30b9\u5e33\u540d", item.addressBookName],
    ].filter(([, value]) => String(value || "").trim());

    openDetailSheet("history", "通話履歴詳細");
    ui.historyDetailView.innerHTML = `
      <div class="detail-hero">
        <div class="contact-avatar default-avatar" aria-hidden="true"></div>
        <h3>${escapeHtml(item.displayName)}</h3>
        <p>${escapeHtml(item.phoneOrSip)}</p>
      </div>

      <div class="button-row action-grid">
        <button
          type="button"
          class="primary-button full-width-action history-redial-button-large"
          data-history-index="${item.originalIndex}"
        >☎ 再発信</button>
      </div>

      <div class="settings-section compact-section">
        ${rows.map(([label, value]) => `
          <div class="detail-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>
    `;

    ui.historyDetailView
      .querySelector(".history-redial-button-large")
      ?.addEventListener("click", () => redialHistoryItem(item.originalIndex));
  }

  async function redialHistoryItem(originalIndex) {
    const record = getHistoryRecordByOriginalIndex(originalIndex);
    if (!record) {
      showUserError("\u5c65\u6b74\u3092\u8aad\u307f\u8fbc\u3081\u307e\u305b\u3093\u3067\u3057\u305f\u3002");
      return;
    }

    if (activeSession) {
      showUserError("\u901a\u8a71\u4e2d\u306f\u5c65\u6b74\u304b\u3089\u518d\u767a\u4fe1\u3067\u304d\u307e\u305b\u3093\u3002");
      return;
    }

    const dialMethod = record.dialMethod || inferDialMethod(record);
    const target = dialMethod === "mobile"
      ? extractPhoneNumber(record.target)
      : record.target;

    if (!target) {
      showUserError("\u767a\u4fe1\u5148\u3092\u7279\u5b9a\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002");
      return;
    }

    if (ui.defaultDialMethod) {
      ui.defaultDialMethod.value = dialMethod;
    }

    if (ui.targetUri) {
      ui.targetUri.value = target;
    }

    showView("view-home");
    showHomeTab("dialer");

    log(`Redial from history: target=${target}, method=${dialMethod}`);
    showToast("\u518d\u767a\u4fe1\u3057\u307e\u3059\u3002");

    await call();
  }
  function inferHistoryStatus(kind) {
    const text = String(kind || "");

    if (text.includes("失敗") || text.includes("拒否") || text.includes("不在")) {
      return "失敗";
    }

    return "成功";
  }

  function addCallHistory(kind, target, status = inferHistoryStatus(kind), meta = {}) {
    const items = readCallHistory();
    const timestamp = new Date().toISOString();
    const store = meta.storeName || meta.storeId
      ? { id: meta.storeId || "", name: meta.storeName || "" }
      : null;

    const record = normalizeHistoryRecord({
      target: target || "不明",
      timestamp,
      direction: kind || "通話",
      status,
      dialMethod: meta.dialMethod || inferDialMethod({ direction: kind, target }),
      durationSec: meta.durationSec || 0,
      storeId: store?.id || "",
      storeName: store?.name || "",
      displayName: meta.displayName || "",
      ctiName: meta.ctiName || "",
      contactName: meta.contactName || "",
      addressBookName: meta.addressBookName || "",
    });

    items.push(record);
    saveCallHistory(items.slice(-MAX_CALL_HISTORY_ITEMS));
    renderCallHistory();

    if (callState === "INCOMING") {
      resolveIncomingParty(target, meta.ctiName || pendingIncomingCtiName).then((party) => {
        const updatedItems = readCallHistory();
        const targetRecord = updatedItems.find((item) => item.timestamp === timestamp);

        if (!targetRecord) return;

        Object.assign(targetRecord, party);
        saveCallHistory(updatedItems);
        renderCallHistory();
        applyResolvedIncomingParty(party);
      });
    }
  }

  function normalizeContactSortMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "frequent" || mode === "used") return "used";
    if (mode === "recent" || mode === "updated") return "updated";
    return DEFAULT_CONTACT_SORT_MODE;
  }

  function readContactPrefs() {
    try {
      const raw = window.localStorage.getItem(CONTACT_PREFS_STORAGE_KEY);
      const prefs = raw ? JSON.parse(raw) : {};
      return {
        sortMode: normalizeContactSortMode(prefs.sortMode),
      };
    } catch (_error) {
      return { sortMode: DEFAULT_CONTACT_SORT_MODE };
    }
  }

  function saveContactPrefs(nextPrefs) {
    const payload = {
      sortMode: normalizeContactSortMode(nextPrefs?.sortMode),
    };
    window.localStorage.setItem(CONTACT_PREFS_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }

  function makeContactId() {
    return `contact-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }

  function normalizeContact(record) {
    const phones = Array.isArray(record?.phones)
      ? record.phones.map((phone) => ({
        number: String(phone?.number || "").trim(),
        label: String(phone?.label || "").trim(),
      })).filter((phone) => phone.number)
      : [];
    return {
      id: String(record?.id || makeContactId()),
      nativeContactId: String(record?.nativeContactId || ""),
      name: String(record?.name || "").trim(),
      target: String(record?.target || phones[0]?.number || "").trim(),
      phones,
      note: String(record?.note || "").trim(),
      avatar: String(record?.avatar || ""),
      favorite: Boolean(record?.favorite),
      callCount: Number(record?.callCount || 0),
      updatedAt: String(record?.updatedAt || new Date().toISOString()),
    };
  }

  function readDeviceContactMetadata() {
    try {
      const raw = window.localStorage.getItem(DEVICE_CONTACT_META_STORAGE_KEY);
      const metadata = raw ? JSON.parse(raw) : {};
      return metadata && typeof metadata === "object" ? metadata : {};
    } catch (_error) {
      return {};
    }
  }

  function saveDeviceContactMetadata(items) {
    const metadata = {};
    items.forEach((item) => {
      if (!item.nativeContactId) return;
      metadata[item.nativeContactId] = {
        favorite: Boolean(item.favorite),
        callCount: Number(item.callCount || 0),
        updatedAt: String(item.updatedAt || ""),
      };
    });
    window.localStorage.setItem(DEVICE_CONTACT_META_STORAGE_KEY, JSON.stringify(metadata));
    return metadata;
  }

  function buildDeviceContactsSignature(records) {
    return records.map((record) => [
      String(record?.id || ""),
      String(record?.name || ""),
      ...(record?.phones || []).map((phone) => `${phone?.number || ""}:${phone?.label || ""}`),
    ].join("|")).join("\n");
  }

  function markContactsChanged() {
    contactsRevision += 1;
    lastContactsRenderKey = "";
  }

  function refreshDeviceContacts() {
    if (!window.AndroidPhone?.getDeviceContacts) return false;

    deviceContactsAvailable = true;
    const records = nativeBridge?.readDeviceContacts?.();
    if (records === null) {
      const stateChanged = !deviceContactsPermissionPending || deviceContacts.length > 0;
      deviceContactsPermissionPending = true;
      deviceContacts = [];
      deviceContactsSignature = "";
      if (stateChanged) {
        markContactsChanged();
        renderContactsAndFavorites();
      }
      return false;
    }

    const nextSignature = buildDeviceContactsSignature(records);
    if (!deviceContactsPermissionPending && nextSignature === deviceContactsSignature) {
      return true;
    }

    const metadata = readDeviceContactMetadata();
    deviceContactsPermissionPending = false;
    deviceContactsSignature = nextSignature;
    deviceContacts = records.map((record) => {
      const nativeContactId = String(record?.id || "");
      const saved = metadata[nativeContactId] || {};
      return normalizeContact({
        id: `device-contact-${nativeContactId}`,
        nativeContactId,
        name: record?.name,
        phones: record?.phones,
        avatar: "",
        favorite: saved.favorite,
        callCount: saved.callCount,
        updatedAt: saved.updatedAt || "",
      });
    }).filter((contact) => contact.nativeContactId && contact.phones.length);
    markContactsChanged();
    renderContactsAndFavorites();
    return true;
  }

  function readContacts() {
    if (deviceContactsAvailable) return deviceContacts;
    try {
      const raw = window.localStorage.getItem(CONTACTS_STORAGE_KEY);
      const items = raw ? JSON.parse(raw) : [];
      return Array.isArray(items) ? items.map(normalizeContact) : [];
    } catch (_error) {
      return [];
    }
  }

  function saveContacts(items) {
    const normalized = Array.isArray(items) ? items.map(normalizeContact) : [];
    if (deviceContactsAvailable) {
      saveDeviceContactMetadata(normalized);
      deviceContacts = normalized;
      markContactsChanged();
      return normalized;
    }
    window.localStorage.setItem(CONTACTS_STORAGE_KEY, JSON.stringify(normalized));
    markContactsChanged();
    return normalized;
  }

  function renderContactAvatar(element, contact) {
    if (!element) return;

    const avatar = String(contact?.avatar || "");
    element.textContent = "";
    element.classList.toggle("default-avatar", !avatar);
    element.classList.toggle("has-image", Boolean(avatar));
    element.dataset.initial = (contact?.name || contact?.target || "?").slice(0, 1).toUpperCase();

    if (!avatar) return;

    const image = document.createElement("img");
    image.src = avatar;
    image.alt = "";
    element.append(image);
  }

  async function createContactAvatarDataUrl(file) {
    if (!file?.type?.startsWith("image/")) {
      throw new Error("画像ファイルを選択してください。");
    }

    const sourceUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("画像を読み込めませんでした。"));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const preview = new Image();
      preview.onload = () => resolve(preview);
      preview.onerror = () => reject(new Error("画像を表示できませんでした。"));
      preview.src = sourceUrl;
    });
    const longestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height, 1);
    const scale = Math.min(1, 160 / longestSide);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }

  function normalizeLookupTarget(value) {
    const text = String(value || "").trim().toLowerCase().replace(/^sip:/, "");
    const phone = extractPhoneNumber(text);
    return {
      text,
      phone,
      user: text.split("@")[0] || "",
    };
  }

  function getActiveContactSortMode() {
    const explicit = ui?.contactSortMode?.value || "";
    if (explicit) return normalizeContactSortMode(explicit);

    const prefs = readContactPrefs();
    return prefs.sortMode;
  }

  function applyContactSortMode(mode) {
    const normalized = normalizeContactSortMode(mode);
    saveContactPrefs({ sortMode: normalized });

    if (ui?.contactSortMode) {
      ui.contactSortMode.value = normalized === "used"
        ? "used"
        : normalized === "updated"
          ? "updated"
          : "name";
    }
    ui?.contactSortMenu?.querySelectorAll("[data-contact-sort-mode]").forEach((item) => {
      const isActive = item.dataset.contactSortMode === normalized;
      item.classList.toggle("is-active", isActive);
      item.setAttribute("aria-checked", String(isActive));
    });
  }

  function getContactById(contactId) {
    return readContacts().find((item) => item.id === contactId) || null;
  }

  function findContactByTarget(target) {
    const needle = normalizeLookupTarget(target);
    return readContacts().find((item) => {
      const targets = item.phones?.length
        ? item.phones.map((phone) => phone.number)
        : [item.target];
      return targets.some((targetValue) => {
        const current = normalizeLookupTarget(targetValue);
        return Boolean(
          (needle.phone && current.phone && needle.phone === current.phone)
          || (needle.text && current.text && needle.text === current.text)
          || (needle.user && current.user && needle.user === current.user)
        );
      });
    }) || null;
  }

  function formatContactSecondary(item) {
    const target = String(item?.target || "").trim();
    const phoneCount = item?.phones?.length || 0;
    const parts = [phoneCount > 1 ? `${target}・ほか${phoneCount - 1}件` : target];
    if (item?.note) parts.push(item.note);
    return parts.filter(Boolean).join(" ・ ");
  }

  function getContacts({ favoritesOnly = false } = {}) {
    const query = String(contactSearchQuery || "").trim().toLowerCase();
    const sortMode = getActiveContactSortMode();
    const items = readContacts().filter((item) => item.name || item.target);
    const filtered = items.filter((item) => {
      if (favoritesOnly && !item.favorite) return false;
      if (!query) return true;

      const searchText = [
        item.name,
        item.target,
        ...(item.phones || []).map((phone) => `${phone.number} ${phone.label}`),
        item.note,
        normalizeLookupTarget(item.target).phone,
      ].join(" ").toLowerCase();

      return searchText.includes(query);
    });

    filtered.sort((a, b) => {
      if (sortMode === "used") {
        return (b.callCount || 0) - (a.callCount || 0)
          || Number(b.favorite) - Number(a.favorite)
          || japaneseCollator.compare(a.name || a.target, b.name || b.target);
      }

      if (sortMode === "updated") {
        return String(b.updatedAt).localeCompare(String(a.updatedAt))
          || Number(b.favorite) - Number(a.favorite)
          || japaneseCollator.compare(a.name || a.target, b.name || b.target);
      }

      return japaneseCollator.compare(a.name || a.target, b.name || b.target)
        || japaneseCollator.compare(a.target, b.target);
    });

    return filtered;
  }

  function renderContactRow(item) {
    return `
      <button type="button" class="contact-row" data-contact-id="${escapeHtml(item.id)}">
        <span class="contact-avatar${item.avatar ? " has-image" : " default-avatar"}" data-initial="${escapeHtml((item.name || item.target || "?").slice(0, 1).toUpperCase())}">${item.avatar ? `<img src="${escapeHtml(item.avatar)}" alt="" />` : ""}</span>
        <span class="contact-main">
          <span class="contact-name">${escapeHtml(item.name || item.target)}</span>
          <span class="contact-meta">${escapeHtml(formatContactSecondary(item))}</span>
        </span>
        <span
          class="contact-star${item.favorite ? " is-active" : ""}"
          data-contact-favorite="${escapeHtml(item.id)}"
          aria-label="お気に入り"
        >★</span>
        <span class="contact-call" data-contact-call="${escapeHtml(item.id)}" aria-label="発信">
          <svg class="call-start-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.2 3.5 10 8l-2 2c1.4 2.8 3.6 5 6.4 6.4l2-2 4.5 2.8-.6 3.3c-.2.9-1 1.5-1.9 1.5C9.3 22 2 14.7 2 5.6c0-.9.6-1.7 1.5-1.9z"/>
          </svg>
          <span class="sr-only">発信</span>
        </span>
      </button>
    `;
  }

  function renderVirtualContactWindow(targetNode, force = false) {
    const state = virtualContactListStates.get(targetNode);
    if (
      !state ||
      !state.items.length ||
      !targetNode.isConnected ||
      targetNode.closest("[hidden]")
    ) {
      return;
    }

    const listTop = targetNode.getBoundingClientRect().top + window.scrollY;
    const relativeScrollTop = Math.max(0, window.scrollY - listTop);
    const viewportRows = Math.ceil(window.innerHeight / CONTACT_VIRTUAL_ROW_HEIGHT);
    const firstVisibleIndex = Math.min(
      state.items.length - 1,
      Math.floor(relativeScrollTop / CONTACT_VIRTUAL_ROW_HEIGHT),
    );
    const startIndex = Math.max(0, firstVisibleIndex - CONTACT_VIRTUAL_OVERSCAN);
    const endIndex = Math.min(
      state.items.length,
      firstVisibleIndex + viewportRows + CONTACT_VIRTUAL_OVERSCAN,
    );

    if (!force && state.startIndex === startIndex && state.endIndex === endIndex) return;

    state.startIndex = startIndex;
    state.endIndex = endIndex;
    const visibleItems = state.items.slice(startIndex, endIndex);
    const topHeight = startIndex * CONTACT_VIRTUAL_ROW_HEIGHT;
    const bottomHeight = (state.items.length - endIndex) * CONTACT_VIRTUAL_ROW_HEIGHT;

    targetNode.innerHTML = `
      <div class="virtual-contact-spacer" style="height:${topHeight}px" aria-hidden="true"></div>
      ${visibleItems.map(renderContactRow).join("")}
      <div class="virtual-contact-spacer" style="height:${bottomHeight}px" aria-hidden="true"></div>
    `;
  }

  function scheduleVirtualContactRender() {
    if (!virtualContactListStates.size || virtualContactRenderFrameId !== null) return;

    window.clearTimeout(virtualContactLoadingTimerId);
    virtualContactLoadingTimerId = window.setTimeout(() => {
      virtualContactListStates.forEach((_state, targetNode) => {
        if (!targetNode.closest("[hidden]")) {
          targetNode.classList.add("is-virtual-loading");
          targetNode.setAttribute("aria-busy", "true");
        }
      });
    }, 80);

    virtualContactRenderFrameId = window.requestAnimationFrame(() => {
      virtualContactRenderFrameId = null;
      window.clearTimeout(virtualContactLoadingTimerId);
      virtualContactListStates.forEach((_state, targetNode) => {
        renderVirtualContactWindow(targetNode);
        targetNode.classList.remove("is-virtual-loading");
        targetNode.removeAttribute("aria-busy");
      });
    });
  }

  function renderContactList(targetNode, items, emptyText) {
    if (!targetNode) return;

    virtualContactListStates.delete(targetNode);
    targetNode.classList.remove("is-virtualized", "is-virtual-loading");
    targetNode.removeAttribute("aria-busy");

    if (!items.length) {
      targetNode.innerHTML = `<div class="empty-history">${escapeHtml(emptyText)}</div>`;
      return;
    }

    if (items.length <= CONTACT_VIRTUALIZATION_THRESHOLD) {
      targetNode.innerHTML = items.map(renderContactRow).join("");
      return;
    }

    targetNode.classList.add("is-virtualized");
    virtualContactListStates.set(targetNode, {
      items,
      startIndex: -1,
      endIndex: -1,
    });
    renderVirtualContactWindow(targetNode, true);
  }

  function renderContactsAndFavorites() {
    const renderKey = [
      contactsRevision,
      deviceContactsPermissionPending ? "permission" : "ready",
      String(contactSearchQuery || "").trim().toLowerCase(),
      getActiveContactSortMode(),
    ].join("|");
    if (renderKey === lastContactsRenderKey) return;
    lastContactsRenderKey = renderKey;

    const contacts = getContacts();
    const favorites = getContacts({ favoritesOnly: true });

    renderContactList(
      ui.contactsList,
      contacts,
      contactSearchQuery
        ? "該当する連絡先がありません。"
        : deviceContactsPermissionPending
          ? "端末の連絡先へのアクセスを許可してください。"
          : "端末の連絡先はありません。",
    );
    renderContactList(ui.favoritesList, favorites, "お気に入りはまだありません。");

    if (ui.contactLookupResult) {
      ui.contactLookupResult.hidden = !contactSearchQuery;
      ui.contactLookupResult.textContent = contactSearchQuery ? `${contacts.length} 件` : "";
    }

    applyContactSortMode(getActiveContactSortMode());
  }

  function openDetailSheet(mode, title) {
    contactOverlayMode = mode;
    if (ui.contactOverlay) {
      ui.contactOverlay.hidden = false;
      ui.contactOverlay.dataset.sheetMode = mode;
    }
    if (ui.contactOverlayTitle) ui.contactOverlayTitle.textContent = title;
    if (ui.btnSaveContact) ui.btnSaveContact.hidden = mode !== "editor";
    if (ui.contactDetailView) ui.contactDetailView.hidden = mode !== "detail";
    if (ui.contactEditorView) ui.contactEditorView.hidden = mode !== "editor";
    if (ui.historyDetailView) ui.historyDetailView.hidden = mode !== "history";
    updateHomeChrome();
  }

  function openContactOverlay(mode, contactId = "", source = currentHomeTab) {
    const contact = getContactById(contactId);
    activeContactId = contactId;
    activeContactSource = source;
    openDetailSheet(
      mode,
      mode === "editor" ? (contact ? "連絡先を編集" : "連絡先を追加") : "連絡先",
    );

    if (mode === "detail" && contact) {
      renderContactAvatar(ui.contactAvatar, contact);
      const phones = contact.phones?.length
        ? contact.phones
        : [{ number: contact.target, label: "" }].filter((phone) => phone.number);

      if (ui.contactDetailName) ui.contactDetailName.textContent = contact.name || contact.target;
      if (ui.contactDetailTarget) {
        ui.contactDetailTarget.textContent = phones.length > 1 ? `${phones.length}件の電話番号` : contact.target;
        ui.contactDetailTarget.title = contact.target;
      }
      if (ui.contactInfoName) ui.contactInfoName.textContent = contact.name || "-";
      if (ui.contactInfoTarget) {
        ui.contactInfoTarget.textContent = phones.map((phone) => (
          phone.label ? `${phone.label}: ${phone.number}` : phone.number
        )).join(" / ") || "-";
      }
      if (ui.contactInfoNote) ui.contactInfoNote.textContent = contact.note || "-";
      if (ui.contactPhoneChoices) {
        ui.contactPhoneChoices.hidden = phones.length <= 1;
        ui.contactPhoneChoices.innerHTML = phones.length > 1
          ? phones.map((phone) => `
            <button type="button" class="contact-phone-choice" data-contact-number="${escapeHtml(phone.number)}">
              <span><strong>${escapeHtml(phone.number)}</strong><small>${escapeHtml(phone.label || "電話")}</small></span>
              <b>発信</b>
            </button>
          `).join("")
          : "";
      }
      if (ui.btnCallContact) ui.btnCallContact.hidden = phones.length > 1;
      if (ui.btnToggleFavorite) {
        ui.btnToggleFavorite.textContent = contact.favorite ? "★ お気に入り解除" : "★ お気に入り";
      }
    }

    if (mode === "editor") {
      const targetContact = contact || normalizeContact({});
      const normalizedTarget = normalizeLookupTarget(targetContact.target);
      const isSipTarget = /^sip:/i.test(targetContact.target) || String(targetContact.target || "").includes("@");
      if (ui.contactNameInput) ui.contactNameInput.value = targetContact.name || "";
      if (ui.contactTargetInput) ui.contactTargetInput.value = targetContact.target || "";
      if (ui.contactPhoneInput) ui.contactPhoneInput.value = isSipTarget ? "" : normalizedTarget.phone || "";
      if (ui.contactSipInput) ui.contactSipInput.value = isSipTarget ? targetContact.target || "" : "";
      if (ui.contactNoteInput) ui.contactNoteInput.value = targetContact.note || "";
      if (ui.contactFavoriteInput) ui.contactFavoriteInput.checked = Boolean(contact?.favorite);
      if (ui.contactAvatarInput) ui.contactAvatarInput.value = "";
      pendingContactAvatar = targetContact.avatar || "";
      renderContactAvatar(ui.contactAvatarPreview, targetContact);
    }
  }

  function closeContactOverlay() {
    contactOverlayMode = "closed";
    activeContactId = "";
    if (ui.contactOverlay) {
      ui.contactOverlay.hidden = true;
      delete ui.contactOverlay.dataset.sheetMode;
    }
    updateHomeChrome();
  }

  function saveContactFromForm() {
    const name = String(ui.contactNameInput?.value || "").trim();
    const phone = String(ui.contactPhoneInput?.value || "").trim();
    const sip = String(ui.contactSipInput?.value || "").trim();
    const target = String(ui.contactTargetInput?.value || "").trim() || phone || sip;

    if (!name || !target) {
      showUserError("名前と番号 / SIP を入力してください。");
      return;
    }

    const nextItem = normalizeContact({
      id: activeContactId || "",
      name,
      target,
      note: String(ui.contactNoteInput?.value || "").trim(),
      avatar: pendingContactAvatar,
      favorite: Boolean(ui.contactFavoriteInput?.checked),
      callCount: getContactById(activeContactId)?.callCount || 0,
      updatedAt: new Date().toISOString(),
    });

    const items = readContacts();
    const index = items.findIndex((item) => item.id === nextItem.id);

    if (index >= 0) {
      items[index] = nextItem;
    } else {
      items.push(nextItem);
    }

    saveContacts(items);
    renderContactsAndFavorites();
    showToast(index >= 0 ? "連絡先を更新しました。" : "連絡先を追加しました。");
    openContactOverlay("detail", nextItem.id, activeContactSource);
  }

  function toggleFavorite(contactId) {
    const items = readContacts();
    const index = items.findIndex((item) => item.id === contactId);

    if (index < 0) return;

    items[index] = normalizeContact({
      ...items[index],
      favorite: !items[index].favorite,
      updatedAt: new Date().toISOString(),
    });

    saveContacts(items);
    renderContactsAndFavorites();

    if (activeContactId === contactId && contactOverlayMode === "detail") {
      openContactOverlay("detail", contactId, activeContactSource);
    }

    showToast(items[index].favorite ? "お気に入りに追加しました。" : "お気に入りを解除しました。");
  }

  function deleteContactById(contactId) {
    if (!contactId) return;

    const contact = getContactById(contactId);
    if (contact?.nativeContactId) {
      const opened = nativeBridge?.openEditContact?.(contact.nativeContactId);
      if (!opened) showUserError("端末の連絡帳を開けませんでした。");
      return;
    }

    const nextItems = readContacts().filter((item) => item.id !== contactId);
    saveContacts(nextItems);
    renderContactsAndFavorites();
    closeContactOverlay();
    showToast("連絡先を削除しました。");
  }

  function bumpContactUsage(contactId) {
    const items = readContacts();
    const index = items.findIndex((item) => item.id === contactId);
    if (index < 0) return;

    items[index] = normalizeContact({
      ...items[index],
      callCount: Number(items[index].callCount || 0) + 1,
      updatedAt: new Date().toISOString(),
    });

    saveContacts(items);
  }

  async function callContactById(contactId, selectedTarget = "") {
    const contact = getContactById(contactId);
    if (!contact) return;

    if (!selectedTarget && contact.phones?.length > 1) {
      openContactOverlay("detail", contactId, currentHomeTab);
      return;
    }

    bumpContactUsage(contactId);

    if (ui.targetUri) {
      ui.targetUri.value = selectedTarget || contact.target;
    }

    showHomeTab("dialer");
    await call();
  }

  function getPrimaryViewId() {
    if (callState === "OUTGOING" || callState === "INCOMING" || callState === "INCALL") {
      return "view-incall";
    }
    return "view-home";
  }

  async function refreshSetupChecklist(reason = "manual", options = {}) {
    const quiet = Boolean(options.quiet);
    nativeBridge?.requestSupportInfo?.();
    const nativeInfo = readNativeSupportInfo();
    const platform = nativeInfo.platform || getPlatform();
    const browserNotification = readBrowserNotificationPermission();
    const browserMicrophone = await queryBrowserMicrophonePermission();
    const notificationPermission = normalizePermissionState(
      nativeInfo.notificationPermission || browserNotification,
    );
    const microphonePermission = normalizePermissionState(
      nativeInfo.microphonePermission || browserMicrophone,
    );
    const contactsPermission = normalizePermissionState(nativeInfo.contactsPermission);
    const backgroundExecutionAllowed = nativeInfo.ignoringBatteryOptimizations === true
      || String(nativeInfo.ignoringBatteryOptimizations || "").toLowerCase() === "true";

    currentSetupChecklist = buildSetupChecklist(
      platform,
      notificationPermission,
      microphonePermission,
      contactsPermission,
      backgroundExecutionAllowed,
    );
    renderSetupChecklist(currentSetupChecklist);

    if (!quiet) {
      log(`[SETUP] ${reason} platform=${platform} blocking=${currentSetupChecklist.hasBlockingItems}`);
    }

    return currentSetupChecklist;
  }

  function openSupportTarget(target) {
    rememberUserAction();
    const opened = nativeBridge?.openSupportTarget?.(target);
    if (!opened) {
      showUserError("この端末では設定画面を開けませんでした。");
      return;
    }
    log(`[SETUP] open_target=${target}`);
  }

  function shouldShowSetupOnLaunch() {
    return !hasSeenSetupGuide();
  }

  function openSetupView() {
    setupGuideReturnState = resolveHomeMode() === "main" ? getNavigationState() : null;
    const animateEntry = setupGuideReturnState?.tab === "settings";
    setupGuidePinned = true;
    showView("view-home");
    showHomeTab("setup");
    ui.homePanels?.setup?.classList.toggle("opened-from-settings", animateEntry);
    updateHomeChrome();
    if (animateEntry && ui.homePanels?.setup) {
      ui.homePanels.setup.classList.remove("settings-view-enter");
      window.requestAnimationFrame(() => ui.homePanels.setup.classList.add("settings-view-enter"));
    }
  }

  function leaveSetupView() {
    const returnState = setupGuideReturnState;
    markSetupGuideSeen();
    setupGuidePinned = false;
    setupGuideReturnState = null;
    showView(getPrimaryViewId());
    if (returnState && canAccessPrimaryHomeTabs()) {
      restoreNavigationState(returnState);
    } else {
      showHomeTab(canAccessPrimaryHomeTabs() ? getDefaultHomeTab() : "settings");
    }
    updateHomeChrome();
  }

  function proceedFromSetupView() {
    markSetupGuideSeen();
    setupGuidePinned = false;
    setupGuideReturnState = null;
    showView(getPrimaryViewId());
    settingsPageMode = "account";
    showHomeTab("settings");
    updateHomeChrome();
  }
  function buildDiagnosticReport() {
    const config = getConfigFromForm();
    const nativeInfo = readNativeSupportInfo();
    const nativeMailLog = nativeBridge?.readMailLog?.() || "";
    const nativeLongLog = nativeBridge?.readLongLog?.() || "";
    const platform = nativeInfo.platform || getPlatform();
    const history = readCallHistory().slice(-10);
    const checklistLines = currentSetupChecklist.items.map((item) => {
      const badge = getPermissionBadge(item.status).label;
      return `- ${item.title}: ${badge} / ${item.summary}`;
    });

    return [
      "WebRTC SIP Phone Diagnostic Report",
      `GeneratedAt: ${new Date().toISOString()}` ,
      `InstallationId: ${ensureInstallId()}` ,
      `Platform: ${platform}` ,
      `AppVersion: ${nativeInfo.appVersion || "unknown"} (${nativeInfo.appBuild || "-"})` ,
      `OSVersion: ${nativeInfo.osVersion || navigator.userAgent}` ,
      `Device: ${[nativeInfo.manufacturer, nativeInfo.model, nativeInfo.deviceName].filter(Boolean).join(" / ") || "unknown"}` ,
      `User: ${config.authUser || config.sipUri || "unknown"}` ,
      `RegistrationState: ${registrationState}` ,
      `CallState: ${callState}` ,
      `LastUserActionAt: ${lastUserActionAt || "unknown"}` ,
      "",
      "[Setup Checklist]",
      ...checklistLines,
      "",
      "[Recent Call History]",
      ...(history.length > 0
        ? history.map((item) => `- ${item.timestamp} ${item.direction} ${item.target} ${item.status}`)
        : ["- no_history"]),
      "",
      "[JS Logs]",
      diagnosticLogLines.join("\n") || "(empty log)",
      "",
      "[Native Mail Log]",
      nativeMailLog || "(empty log)",
      "",
      "[Native Long Log]",
      nativeLongLog || "(empty log)",
    ].join("\n");
  }

  function hasProvisioningLikeConfig(config) {
    return Boolean(config?.wsUrl && config?.sipUri && config?.password);
  }

  function isEnabledProvisioningValue(value) {
    return value === true || value === 1 || String(value || "").toLowerCase() === "true" || String(value) === "1";
  }

  function classifyLogSendFailure(error) {
    const code = String(error?.code || "").trim();
    const message = String(error?.message || error || "").toLowerCase();

    if (code) return code;
    if (error?.name === "AbortError" || message.includes("timeout")) return "timeout";
    if (message.includes("failed to fetch") || message.includes("networkerror")) return "network_error";
    if (message.includes("http 5") || message.includes("server_error")) return "server_error";
    if (message.includes("http 4") || message.includes("auth")) return "auth_error";
    return "unexpected_exception";
  }

  async function sendSupportLogByApi(subject, text) {
    const body = String(text || "").trim();
    const currentConfig = getConfigFromForm();

    if (!body) {
      throw createTaggedError("log_file_missing", "Diagnostic report is empty.");
    }
    if (!subject) {
      throw createTaggedError("log_generation_failed", "Diagnostic subject is empty.");
    }
    if (!hasProvisioningLikeConfig(currentConfig)) {
      throw createTaggedError("provisioning_info_missing", "Provisioning related account settings are incomplete.");
    }

    const parts = [];
    for (let index = 0; index < body.length || index === 0; index += LOG_SEND_PART_CHARS) {
      parts.push(body.slice(index, index + LOG_SEND_PART_CHARS));
      if (body.length === 0) break;
    }

    const header = [
      `GeneratedAt: ${new Date().toISOString()}` ,
      `InstallationId: ${ensureInstallId()}` ,
      `Platform: ${getPlatform()}` ,
      `RegistrationState: ${registrationState}` ,
      `CallState: ${callState}` ,
    ].join("\n");

    for (let index = 0; index < parts.length; index += 1) {
      const params = new URLSearchParams();
      params.set("method", "sendMail");
      params.set("mail", "admin2@knowledge-flow.net");
      params.set("password", "egwasaeVNCoFkut3");
      params.set("to", DEV_SUPPORT_EMAIL);
      params.set("subject", String(subject || "WebRTC Phone Log"));
      params.set("text", `${index + 1}/${parts.length}\n${header}\n${parts[index]}`);

      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeoutId = controller
        ? window.setTimeout(() => controller.abort(), LOG_SEND_TIMEOUT_MS)
        : null;

      try {
        const response = await fetch(LOG_SEND_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          },
          body: params.toString(),
          signal: controller?.signal,
        });

        if (!response.ok) {
          const prefix = response.status >= 500 ? "server_error" : "auth_error";
          throw createTaggedError(prefix, `sendMail API failed: HTTP ${response.status}`);
        }

        const resultText = await response.text();
        if (/error|fail|ng/i.test(resultText)) {
          throw createTaggedError("server_error", `sendMail API returned error: ${resultText.slice(0, 200)}`);
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          throw createTaggedError("timeout", "sendMail API request timed out.", error);
        }
        if (!error?.code && /failed to fetch|networkerror/i.test(String(error?.message || ""))) {
          throw createTaggedError("network_error", `sendMail API network failure: ${error.message}`, error);
        }
        throw error;
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      }
    }

    return true;
  }

  async function shareDiagnostics() {
    rememberUserAction();

    try {
      await refreshSetupChecklist("share_diagnostics", { quiet: true });
      const subject = `WebRTC Phone Log ${new Date().toISOString()}`;
      const report = buildDiagnosticReport();

      if (!report.trim()) {
        throw createTaggedError("log_generation_failed", "Diagnostic report generation returned empty content.");
      }

      const nativeUploadStarted = nativeBridge?.sendLog?.("manual_log", report);
      if (nativeUploadStarted) {
        log(`Native log upload requested: ${DEV_SUPPORT_EMAIL}`);
        showToast("\u30ed\u30b0\u9001\u4fe1\u3092\u958b\u59cb\u3057\u307e\u3057\u305f\u3002", "success");
        return;
      }

      await sendSupportLogByApi(subject, report);
      log(`Diagnostic log uploaded via API: ${DEV_SUPPORT_EMAIL}`);
      showToast("\u30ed\u30b0\u3092\u9001\u4fe1\u3057\u307e\u3057\u305f\u3002", "success");
      return;
    } catch (error) {
      const failureCode = classifyLogSendFailure(error);
      errorLog(`Log send failed: code=${failureCode} detail=${describeError(error)}`);
    }

    try {
      const subject = `WebRTC Phone Log ${new Date().toISOString()}`;
      const report = buildDiagnosticReport();
      const emailOpened = nativeBridge?.emailLog?.(subject, report);
      if (emailOpened) {
        log(`Diagnostic email composer opened: ${DEV_SUPPORT_EMAIL}`);
        showToast("\u30ed\u30b0\u9001\u4fe1\u7528\u30e1\u30fc\u30eb\u3092\u958b\u304d\u307e\u3057\u305f\u3002", "success");
        return;
      }

      const shared = nativeBridge?.shareText?.(subject, report);
      if (shared) {
        log("Diagnostic share sheet opened.");
        showToast("\u5171\u6709\u753b\u9762\u3092\u958b\u304d\u307e\u3057\u305f\u3002", "success");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
        log("Diagnostic log copied to clipboard.");
        showToast("\u30ed\u30b0\u3092\u30b3\u30d4\u30fc\u3057\u307e\u3057\u305f\u3002", "success");
        return;
      }
    } catch (fallbackError) {
      errorLog(`Log send fallback failed: ${describeError(fallbackError)}`);
    }

    showUserError("\u30ed\u30b0\u304c\u9001\u308c\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u30b5\u30dd\u30fc\u30c8\u7528\u30ed\u30b0\u3092\u78ba\u8a8d\u3057\u3066\u304f\u3060\u3055\u3044\u3002");
  }
  function clearCallHistory() {
    if (!window.confirm("通話履歴をすべて削除しますか？\nこの操作は元に戻せません。")) return false;
    saveCallHistory([]);
    renderCallHistory();
    showToast("通話履歴を削除しました。", "success");
    return true;
  }

  function showUserError(message) {
    if (ui?.alertMessage) {
      window.clearTimeout(userErrorDismissTimerId);
      window.clearTimeout(userErrorHideTimerId);
      ui.alertMessage.classList.remove("is-dismissing", "is-swiping");
      ui.alertMessage.style.removeProperty("transform");
      ui.alertMessage.style.removeProperty("opacity");
      ui.alertMessage.textContent = message;
      ui.alertMessage.hidden = false;
      window.requestAnimationFrame(() => ui.alertMessage?.classList.add("is-visible"));
      userErrorDismissTimerId = window.setTimeout(() => clearUserError(true), 5000);
    }
    warn(`UI error: ${message}`);
  }

  function clearUserError(animate = false) {
    if (!ui?.alertMessage) return;
    window.clearTimeout(userErrorDismissTimerId);
    window.clearTimeout(userErrorHideTimerId);
    userErrorDismissTimerId = null;

    const finish = () => {
      if (ui.alertMessage.classList.contains("is-visible")) return;
      ui.alertMessage.hidden = true;
      ui.alertMessage.textContent = "";
      ui.alertMessage.classList.remove("is-dismissing", "is-swiping");
      ui.alertMessage.style.removeProperty("transform");
      ui.alertMessage.style.removeProperty("opacity");
    };

    ui.alertMessage.classList.remove("is-visible", "is-swiping");
    if (animate) {
      ui.alertMessage.classList.add("is-dismissing");
      ui.alertMessage.style.transform = "translate(-50%, -120%)";
      ui.alertMessage.style.opacity = "0";
      userErrorHideTimerId = window.setTimeout(finish, 220);
    } else {
      finish();
    }
  }

  function setupUserErrorDismissGesture() {
    if (!ui?.alertMessage || ui.alertMessage.dataset.dismissGestureReady === "true") return;
    ui.alertMessage.dataset.dismissGestureReady = "true";

    let pointerId = null;
    let startY = 0;

    ui.alertMessage.addEventListener("pointerdown", (event) => {
      pointerId = event.pointerId;
      startY = event.clientY;
      ui.alertMessage.classList.add("is-swiping");
      ui.alertMessage.setPointerCapture?.(pointerId);
    });

    ui.alertMessage.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId) return;
      const offsetY = Math.min(0, event.clientY - startY);
      ui.alertMessage.style.transform = `translate(-50%, ${offsetY}px)`;
      ui.alertMessage.style.opacity = String(Math.max(0.25, 1 + offsetY / 90));
    });

    const finishSwipe = (event) => {
      if (event.pointerId !== pointerId) return;
      const offsetY = event.clientY - startY;
      pointerId = null;
      ui.alertMessage.releasePointerCapture?.(event.pointerId);
      ui.alertMessage.classList.remove("is-swiping");

      if (offsetY <= -24) {
        clearUserError(true);
        return;
      }

      ui.alertMessage.style.removeProperty("transform");
      ui.alertMessage.style.removeProperty("opacity");
    };

    ui.alertMessage.addEventListener("pointerup", finishSwipe);
    ui.alertMessage.addEventListener("pointercancel", finishSwipe);
  }

  function getCallStateLabel() {
    if (callState === "OUTGOING") return "発信中";
    if (callState === "INCOMING") return "着信中";
    if (callState === "INCALL" && isHeld) return "保留中";
    if (callState === "INCALL") return "通話中";
    return "待機中";
  }

  function showView(viewId) {
    ui.views.home.style.display = viewId === "view-home" ? "block" : "none";
    ui.views.incall.style.display = viewId === "view-incall" ? "block" : "none";
    ui.views.home.classList.toggle("active", viewId === "view-home");
    ui.views.incall.classList.toggle("active", viewId === "view-incall");
  }

  function checkDevMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dev") === "1") {
      ui.logsView.style.display = "block";
      log("Dev mode enabled.");
    }
  }

  function showIncomingModal(from) {
    pendingIncomingFrom = from || "不明";
    ui.incomingNumber.textContent = pendingIncomingFrom;
    ui.incomingModal.style.display = "flex";
  }

  function firstNonEmptyValue(...values) {
    return values.map((value) => String(value || "").trim()).find(Boolean) || "";
  }

  function resolvePreferredDisplayName({
    ctiName = "",
    contactName = "",
    legacyDisplayName = "",
    phone = "",
    sipUri = "",
  } = {}) {
    return firstNonEmptyValue(
      ctiName,
      contactName,
      legacyDisplayName,
      phone,
      sipUri,
      "\u4e0d\u660e",
    );
  }

  function getSipCtiDisplayName(session) {
    const request = session?.request;
    return firstNonEmptyValue(
      request?.getHeader?.("X-CTI-Display-Name"),
      request?.getHeader?.("X-CSP-Display-Name"),
      request?.getHeader?.("X-Caller-Name"),
      session?.remote_identity?.display_name,
    );
  }

  function getPayloadCtiDisplayName(payload) {
    return firstNonEmptyValue(
      payload?.ctiDisplayName,
      payload?.cti_display_name,
      payload?.cspDisplayName,
      payload?.csp_display_name,
      payload?.callerName,
      payload?.caller_name,
      payload?.displayName,
      payload?.display_name,
    );
  }

  async function resolveIncomingParty(rawTarget, ctiName = "") {
    const target = String(rawTarget || "不明");
    const normalizedCtiName = String(ctiName || "").trim();
    const phone = extractPhoneNumber(target);
    const storedContactName = findContactByTarget(target)?.name || "";
    const nativeContactName = phone
      ? await nativeBridge?.lookupContactName?.(phone) || ""
      : "";
    const contactName = firstNonEmptyValue(storedContactName, nativeContactName);

    return {
      target,
      ctiName: normalizedCtiName,
      contactName,
      displayName: resolvePreferredDisplayName({
        ctiName: normalizedCtiName,
        contactName,
        phone,
        sipUri: target,
      }),
    };
  }

  function applyResolvedIncomingParty(party) {
    if (callState === "INCOMING" && pendingIncomingFrom === party.target) {
      ui.incomingNumber.textContent = party.displayName === party.target
        ? party.target
        : `${party.displayName} (${party.target})`;
    }
  }

  function completeNativeContactLookup(requestId, name) {
    const key = String(requestId || "");
    const pending = pendingNativeContactRequests.get(key);

    if (!pending) return false;

    window.clearTimeout(pending.timerId);
    pendingNativeContactRequests.delete(key);
    pending.resolve(String(name || ""));

    return true;
  }

  function hideIncomingModal() {
    ui.incomingModal.style.display = "none";
    pendingIncomingCtiName = "";
    ui.incomingNumber.textContent = "不明";
    pendingIncomingFrom = "";
  }

  function updateTimer() {
    if (!callStartedAt) {
      ui.callTimer.textContent = "00:00";
      return;
    }

    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000));
    const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
    const seconds = String(elapsedSeconds % 60).padStart(2, "0");

    ui.callTimer.textContent = `${minutes}:${seconds}`;
  }

  function startCallTimer() {
    if (!callStartedAt) {
      callStartedAt = Date.now();
    }

    updateTimer();

    if (!callTimerId) {
      callTimerId = window.setInterval(updateTimer, 1000);
    }
  }

  function stopCallTimer() {
    if (callTimerId) {
      window.clearInterval(callTimerId);
      callTimerId = null;
    }

    callStartedAt = null;
    updateTimer();
  }

  function setDialpadMode(nextMode) {
    dialpadMode = nextMode;

    const inCall = callState === "OUTGOING" || callState === "INCOMING" || callState === "INCALL";
    const transferMode = callState === "INCALL" && dialpadMode === "transfer";
    const keypadOpen = callState === "INCALL" && (dialpadMode === "keypad" || dialpadMode === "transfer");
    const keypadScreenMode = callState === "INCALL" && dialpadMode === "keypad";

    if (ui.transferArea) {
      ui.transferArea.hidden = !transferMode;
    }

    if (ui.incallKeypad) {
      ui.incallKeypad.hidden = !keypadOpen;
      ui.incallKeypad.classList.toggle("is-open", keypadOpen);
      ui.incallKeypad.setAttribute("aria-hidden", keypadOpen ? "false" : "true");
    }

    if (ui.incallSurface) {
      ui.incallSurface.classList.toggle("is-keypad-mode", keypadScreenMode);
    }

    document.body.classList.toggle("incall-keypad-open", keypadOpen);

    ui.btnTransfer?.classList.toggle("success", transferMode);
    ui.btnKeypad?.classList.toggle("success", inCall && dialpadMode === "keypad");

    ui.btnKeypad?.setAttribute("aria-pressed", keypadOpen ? "true" : "false");
    ui.btnTransfer?.setAttribute("aria-pressed", transferMode ? "true" : "false");
  }

  function compactText(value, maxLength = 40) {
    const text = String(value || "").trim();
    if (!text) return "";
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
  }

  function updateRemoteParty() {
    const remote = activeSession?.remote_identity?.uri?.toString() || pendingIncomingFrom || "不明";
    const hintedName = String(activeSession?.remote_identity?.display_name || pendingIncomingCtiName || "").trim();
    const contact = findContactByTarget(remote);
    const primaryName = contact?.name || hintedName || formatHistoryPhone({ target: remote }) || remote;
    const secondary = contact?.name || hintedName
      ? compactText(extractPhoneNumber(remote) || remote.replace(/^sip:/i, ""), 40)
      : "";

    if (ui.remoteParty) {
      ui.remoteParty.textContent = compactText(primaryName, 28);
      ui.remoteParty.title = primaryName;
    }

    if (ui.remotePartySub) {
      ui.remotePartySub.textContent = secondary;
      ui.remotePartySub.title = secondary;
      ui.remotePartySub.hidden = !secondary;
    }
  }

  function routeCallView() {
    if (callState === "IDLE") {
      showView("view-home");
      return;
    }

    showView("view-incall");
  }

  function setRegistrationState(nextState, detail = "") {
    registrationState = nextState;
    registrationStatusDetail = String(detail || "");
    refreshUi();
    routeCallView();
    const eventName = nextState === "REGISTERED"
      ? "sip.registered"
      : nextState === "UNREGISTERED"
        ? "sip.unregistered"
        : "sip.registration.state";
    testAgentPostEvent(eventName, { registrationState: nextState });
  }

  function clearRegistrationRecovery() {
    window.clearTimeout(registrationRecoveryTimerId);
    registrationRecoveryTimerId = null;
    registrationRecoveryStartedAt = 0;
    registrationRecoveryErrorMessage = "";
  }

  function beginRegistrationRecovery(detail, errorMessage) {
    if (!registrationRecoveryStartedAt) {
      registrationRecoveryStartedAt = Date.now();
    }
    registrationRecoveryErrorMessage = errorMessage || registrationRecoveryErrorMessage;
    setRegistrationState("REGISTERING", detail || "Reconnecting");

    if (registrationRecoveryTimerId !== null) return;

    const elapsed = Date.now() - registrationRecoveryStartedAt;
    const remaining = Math.max(0, REGISTRATION_RECOVERY_GRACE_MS - elapsed);
    registrationRecoveryTimerId = window.setTimeout(() => {
      registrationRecoveryTimerId = null;
      const message = registrationRecoveryErrorMessage
        || "接続を復旧できませんでした。通信環境と端末設定を確認してください。";
      registrationRecoveryStartedAt = 0;
      registrationRecoveryErrorMessage = "";

      if (registrationState === "REGISTERED" || registrationState === "UNREGISTERED") return;
      setRegistrationState("FAILED", detail || "Recovery timeout");
      navigateToDialerAfterRegistration = false;
      showUserError(message);
    }, remaining);
  }

  function getConnectionErrorCode(event) {
    const response = event?.response || event?.message;
    const candidates = [
      response?.status_code,
      response?.statusCode,
      event?.code,
    ];
    for (const candidate of candidates) {
      const code = String(candidate || "").trim();
      if (/^\d{3,4}$/.test(code)) return code;
    }
    return "";
  }

  function formatConnectionFailureMessage(event) {
    const errorCode = getConnectionErrorCode(event);
    return errorCode
      ? `接続に失敗しました。（エラーコード: ${errorCode}）`
      : "接続に失敗しました。";
  }

  function isPermanentRegistrationFailure(event) {
    const response = event?.response || event?.message;
    const statusCode = Number(response?.status_code || response?.statusCode || 0);
    const cause = String(event?.cause || "").toLowerCase();
    const reason = String(response?.reason_phrase || response?.reasonPhrase || "").toLowerCase();
    const failureText = `${cause} ${reason}`;

    return [400, 401, 403, 404, 407].includes(statusCode)
      || /authentication|unauthorized|forbidden|bad credentials|not found|rejected/.test(failureText);
  }

  function setCallState(nextState) {
    callState = nextState;
    refreshUi();
    routeCallView();
    testAgentPostEvent("call.state", { callState: nextState });
  }

  function notifyNativeAudioStart() {
    isSpeakerEnabled = false;

    try {
      nativeBridge?.postAudio({ action: "start", speaker: false });
    } catch (error) {
      log(`Native audio start failed: ${error.message || "unknown"}`);
    }
  }

  function notifyNativeAudioStop() {
    try {
      nativeBridge?.postAudio({ action: "stop" });
      isSpeakerEnabled = false;
    } catch (error) {
      log(`Native audio stop failed: ${error.message || "unknown"}`);
    }
  }

  function notifyNativeSpeakerRoute(enabled) {
    try {
      nativeBridge?.postAudio({ action: "route", speaker: enabled });
    } catch (error) {
      log(`Speaker route change failed: ${error.message || "unknown"}`);
    }
  }

  async function setupRemoteAudioElement() {
    if (!ui.remoteAudio) return;

    ui.remoteAudio.autoplay = true;
    ui.remoteAudio.playsInline = true;
    ui.remoteAudio.setAttribute("webkit-playsinline", "");
    ui.remoteAudio.muted = false;
    ui.remoteAudio.volume = 1;
    ui.remoteAudio.preload = "auto";

    ui.remoteAudio.onplay = () => {
      log("remoteAudio playback started.");
    };

    ui.remoteAudio.onpause = () => {
      log("remoteAudio playback paused.");
    };

    ui.remoteAudio.onended = () => {
      log("remoteAudio playback ended.");
    };

    ui.remoteAudio.onerror = (event) => {
      log(`remoteAudio error: ${event?.message || "unknown"}`);
    };
  }

  function parseAudioCodecsFromSdp(sdp) {
    if (!sdp || typeof sdp !== "string") return [];

    const lines = sdp.split(/\r?\n/);
    const audioLine = lines.find((line) => line.startsWith("m=audio"));

    if (!audioLine) return [];

    const payloadTypes = audioLine.split(" ").slice(3);

    return payloadTypes.map((pt) => {
      const rtpmap = lines.find((line) => line.startsWith(`a=rtpmap:${pt} `));
      if (!rtpmap) return `${pt}:unknown`;
      return `${pt}:${rtpmap.slice(9)}`;
    });
  }

  function parseAudioDirectionFromSdp(sdp) {
    const audioSection = String(sdp || "")
      .split(/\r?\nm=/)
      .find((section, index) => index > 0 && section.startsWith("audio "));

    const direction = audioSection
      ?.match(/(?:^|\r?\n)a=(sendrecv|sendonly|recvonly|inactive)(?:\r?\n|$)/)?.[1];

    return direction || "sendrecv";
  }

  function logPeerConnectionSdp(peerConnection, label) {
    if (!peerConnection) return;

    const localDesc = peerConnection.localDescription;
    const remoteDesc = peerConnection.remoteDescription;

    log(`${label} PeerConnection signalState=${peerConnection.signalingState}, local=${localDesc?.type || "none"}, remote=${remoteDesc?.type || "none"}`);

    if (localDesc?.sdp) {
      log(`${label} local audio codecs: ${parseAudioCodecsFromSdp(localDesc.sdp).join(", ") || "none"}`);
      log(`${label} local audio direction: ${parseAudioDirectionFromSdp(localDesc.sdp)}`);
    }

    if (remoteDesc?.sdp) {
      log(`${label} remote audio codecs: ${parseAudioCodecsFromSdp(remoteDesc.sdp).join(", ") || "none"}`);
      log(`${label} remote audio direction: ${parseAudioDirectionFromSdp(remoteDesc.sdp)}`);
    }
  }

  async function playRemoteAudio() {
    if (!ui.remoteAudio.srcObject) return;

    ui.remoteAudio.autoplay = true;
    ui.remoteAudio.playsInline = true;
    ui.remoteAudio.muted = false;
    ui.remoteAudio.volume = 1;

    try {
      await ui.remoteAudio.play();
      log("Remote audio output started.");
    } catch (error) {
      log(`リモート音声の自動再生に失敗しました: ${error.message || "不明"}`);
    }
  }

  function attachRemoteAudioTrack(track, stream, source) {
    if (!track || track.kind !== "audio") return false;

    const remoteStream = stream || new MediaStream();

    if (!remoteStream.getAudioTracks().includes(track)) {
      remoteStream.addTrack(track);
    }

    ui.remoteAudio.srcObject = remoteStream;
    ui.remoteAudio.autoplay = true;
    ui.remoteAudio.playsInline = true;
    ui.remoteAudio.setAttribute("webkit-playsinline", "");
    ui.remoteAudio.muted = false;
    ui.remoteAudio.volume = 1;

    track.enabled = true;

    track.onunmute = () => {
      log(`リモート音声トラックが有効になりました: ${source}`);
      playRemoteAudio();
    };

    ui.remoteAudio.onloadedmetadata = () => {
      log(`remoteAudio onloadedmetadata fired: ${source}`);
      playRemoteAudio();
    };

    log(`リモート音声ストリームを接続しました: ${source}, readyState=${track.readyState}, muted=${track.muted}`);

    playRemoteAudio();
    window.setTimeout(playRemoteAudio, 300);
    window.setTimeout(playRemoteAudio, 1000);

    return true;
  }

  function attachRemoteAudioFromPeerConnection(peerConnection, source) {
    if (!peerConnection || typeof peerConnection.getReceivers !== "function") return false;

    const receiver = peerConnection
      .getReceivers()
      .find((item) => item.track && item.track.kind === "audio");

    if (!receiver) {
      log(`リモート音声レシーバーがまだ見つかりません: ${source}`);
      return false;
    }

    return attachRemoteAudioTrack(receiver.track, new MediaStream([receiver.track]), source);
  }

  function clearRemoteAudio() {
    if (ui.remoteAudio.srcObject) {
      ui.remoteAudio.srcObject.getTracks().forEach((track) => track.stop());
    }

    ui.remoteAudio.pause();
    ui.remoteAudio.srcObject = null;
  }

  function resetCallState(reason = "reset") {
    const hadCallState = activeSession !== null
      || ui.remoteAudio.srcObject !== null
      || callState !== "IDLE";

    activeSession = null;
    pendingIncomingDecision = null;
    isHeld = false;
    holdOperationPending = false;
    isMuted = false;

    setDialpadMode("dial");

    if (ui.dtmfDisplay) {
      ui.dtmfDisplay.innerText = "";
    }

    hideIncomingModal();
    clearRemoteAudio();

    if (localMediaStream) {
      localMediaStream.getTracks().forEach((track) => track.stop());
      localMediaStream = null;
    }

    stopCallTimer();
    stopNetworkStatsMonitor();
    notifyNativeAudioStop();
    setCallState("IDLE");

    if (hadCallState) {
      log(`通話状態をリセットしました: ${reason}`);
    }
  }

  function clearPendingPushAnswer(reason) {
    if (pushInviteWaitTimeoutId !== null) {
      window.clearTimeout(pushInviteWaitTimeoutId);
      pushInviteWaitTimeoutId = null;
    }

    if (pendingPushAnswer || autoAnswerNextInvite) {
      log(`PUSH応答待機を解除しました: ${reason}`);
    }

    pendingPushAnswer = null;
    autoAnswerNextInvite = false;
    pushInviteReadyNotified = false;
  }

  function cancelAgiPushAnswer(reason = "native_cancel", callId = "") {
    const targetCallId = String(callId || "").trim();
    const pendingCallId = String(pendingPushAnswer?.callId || "").trim();
    if (targetCallId && pendingCallId && targetCallId !== pendingCallId) {
      log(`別の着信に対する終了通知を無視しました: callId=${targetCallId}`, "warn");
      return false;
    }

    clearPendingPushAnswer(reason);
    pendingIncomingDecision = null;
    if (callState !== "INCALL") {
      hideIncomingModal();
    }
    log(`PUSH着信を終了しました: callId=${targetCallId || pendingCallId || "unknown"}, reason=${reason}`);
    return true;
  }

  function getAgiIdentity() {
    const config = getConfigFromForm();
    const sipEndpoint = String(config.authUser || config.sipUri || "")
      .replace(/^sip:/i, "")
      .split("@")[0]
      .trim();
    const deviceId = String(testAgentSettings.deviceId || sipEndpoint).trim();
    return { deviceId, sipEndpoint };
  }

  async function postAgiJson(path, payload) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), AGI_API_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(`${AGI_API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller?.signal,
      });
      const text = await response.text();
      let result = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch (_error) {
        result = {};
      }
      if (!response.ok || result.ok === false) {
        throw new Error(`AGI API ${path} failed: HTTP ${response.status}${text ? ` ${text}` : ""}`);
      }
      return result;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`AGI API ${path} timed out after ${AGI_API_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    }
  }

  async function syncAgiDeviceRegistration(reason = "sync") {
    readNativeSupportInfo();
    const { deviceId, sipEndpoint } = getAgiIdentity();
    const pushToken = String(nativeSupportInfo.pushToken || "").trim();
    if (!deviceId || !sipEndpoint || !pushToken) return false;

    const registrationKey = `${deviceId}\n${sipEndpoint}\n${pushToken}`;
    if (agiDeviceRegistrationKey === registrationKey) return true;

    await postAgiJson("/devices/register", { deviceId, pushToken, sipEndpoint });
    agiDeviceRegistrationKey = registrationKey;
    log(`AGI device registration completed: reason=${reason}, deviceId=${deviceId}, sipEndpoint=${sipEndpoint}`);
    return true;
  }

  async function notifyAgiSipRegistered() {
    const { deviceId } = getAgiIdentity();
    if (!deviceId) return false;
    await postAgiJson("/devices/registered", { deviceId });
    log(`AGI SIP registration notification completed: deviceId=${deviceId}`);
    return true;
  }

  async function requestAgiDialForPushInvite(payload) {
    const callId = String(payload?.callId || "").trim();
    const { deviceId, sipEndpoint } = getAgiIdentity();
    if (!callId || !deviceId || !sipEndpoint || agiDialRequestCallIds.has(callId)) return false;

    agiDialRequestCallIds.add(callId);
    try {
      try {
        await notifyAgiSipRegistered();
      } catch (error) {
        warn(`AGI SIP registration notification failed; continuing DIAL request: ${describeError(error)}`);
      }
      await postAgiJson("/dial-request", { callId, deviceId, sipEndpoint });
      log(`AGI DIAL request accepted: callId=${callId}, deviceId=${deviceId}, sipEndpoint=${sipEndpoint}`);
      return true;
    } catch (error) {
      agiDialRequestCallIds.delete(callId);
      throw error;
    }
  }

  function beginPushInviteWait(payload) {
    clearPendingPushAnswer("new push answer");
    pendingPushAnswer = {
      callId: String(payload?.callId || payload?.call_id || "").trim(),
      caller: String(payload?.caller || payload?.fromUri || payload?.from || "").trim(),
      fromUri: String(payload?.fromUri || payload?.from_uri || payload?.from || "").trim(),
      sipUri: String(payload?.sipUri || payload?.sip_uri || "").trim(),
      receivedAt: String(payload?.receivedAt || payload?.received_at || Date.now()).trim(),
    };
    autoAnswerNextInvite = true;
    pushInviteWaitTimeoutId = window.setTimeout(() => {
      clearPendingPushAnswer(`INVITE timeout (${PUSH_INVITE_WAIT_TIMEOUT_MS}ms)`);
    }, PUSH_INVITE_WAIT_TIMEOUT_MS);
  }

  function notifyReadyForPushInvite() {
    if (!pendingPushAnswer || !autoAnswerNextInvite || pushInviteReadyNotified) return;

    pushInviteReadyNotified = true;
    requestAgiDialForPushInvite(pendingPushAnswer).catch((error) => {
      errorLog(`AGI DIAL request failed: ${describeError(error)}`);
    });
    nativeBridge?.notifyPushInviteReady?.(pendingPushAnswer);
    log(`SIP REGISTER完了、INVITE待機中: callId=${pendingPushAnswer.callId || "unknown"}`);
  }

  function isMatchingPendingPushInvite(session) {
    if (!pendingPushAnswer || !autoAnswerNextInvite) return false;

    const remote = String(session?.remote_identity?.uri?.toString?.() || "").trim().toLowerCase();
    const normalizeParty = (value) => String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^.*<sip:/, "")
      .replace(/^sip:/, "")
      .split("@")[0]
      .split(";")[0]
      .replace(/[<>]/g, "")
      .trim();
    const expected = [pendingPushAnswer.caller, pendingPushAnswer.fromUri, pendingPushAnswer.sipUri]
      .map(normalizeParty)
      .filter((value) => value !== "unknown" && value !== "不明")
      .filter(Boolean);
    const normalizedRemote = normalizeParty(remote);

    if (!expected.length || !normalizedRemote) return true;
    return expected.some((value) => value === normalizedRemote);
  }

  async function handlePushAnswerIntent(payload = {}) {
    if (activeSession || callState === "OUTGOING" || callState === "INCALL") {
      const callId = String(payload.callId || payload.call_id || "").trim();
      clearPendingPushAnswer("busy");
      nativeBridge?.cancelIncomingCallNotification?.();
      showToast("通話中のため、この着信には応答できません。", "warning");
      log(`通話中のためPUSH応答を中止しました: callId=${callId || "unknown"}`, "warn");
      return false;
    }

    beginPushInviteWait(payload);
    log(`PUSH応答を受信しました。SIP REGISTERを確認します: callId=${pendingPushAnswer.callId || "unknown"}`);

    if (registrationState === "REGISTERED") {
      notifyReadyForPushInvite();
      return;
    }

    try {
      await register();
    } catch (error) {
      clearPendingPushAnswer(`REGISTER start failed: ${error.message || "unknown"}`);
    }
  }

  function normalizeStores(stores) {
    if (!Array.isArray(stores)) return [];

    return stores.map((store) => ({
      id: String(store?.id || store?.storeId || store?.shopId || "").trim(),
      name: String(store?.name || store?.storeName || store?.shopName || "").trim(),
      phoneNumber: String(store?.phoneNumber || store?.phone || store?.tel || "").trim(),
      sipUri: String(store?.sipUri || store?.sip || "").trim(),
    })).filter((store) => store.id && store.name);
  }

  function parseStoresFromInput() {
    if (!ui.storesJson) return configuredStores;

    const text = ui.storesJson.value.trim();

    if (!text) return [];

    return normalizeStores(JSON.parse(text));
  }

  function renderStoresConfig() {
    if (!ui.storesJson) return;

    ui.storesJson.value = configuredStores.length
      ? JSON.stringify(configuredStores, null, 2)
      : "";
  }

  function getSelectedStoreId() {
    return String(ui.selectedStoreId?.value || "").trim();
  }

  function getSelectedStore() {
    const selectedId = getSelectedStoreId();

    return configuredStores.find((store) => store.id === selectedId) || null;
  }

  function renderStoreSelector(selectedStoreId = "") {
    if (!ui.storeSelectArea || !ui.selectedStoreId) return;

    ui.storeSelectArea.hidden = configuredStores.length === 0;

    ui.selectedStoreId.innerHTML = [
      '<option value="">なし</option>',
      ...configuredStores.map((store) => {
      const selected = store.id === selectedStoreId ? " selected" : "";

      return `<option value="${escapeHtml(store.id)}"${selected}>${escapeHtml(store.name)}</option>`;
      }),
    ].join("");

    ui.selectedStoreId.value = configuredStores.some((store) => store.id === selectedStoreId)
      ? selectedStoreId
      : "";
  }

  function sanitizeDialMethod(value) {
    const normalized = value === "store" ? "shop" : value;

    return SUPPORTED_DIAL_METHODS.has(normalized)
      ? normalized
      : DEFAULT_DIAL_METHOD;
  }

  function getSelectedDialMethod() {
    return sanitizeDialMethod(ui.defaultDialMethod?.value);
  }

  function normalizePhoneNumber(value) {
    const raw = String(value || "").trim();

    if (!raw || /^sip:/i.test(raw) || raw.includes("@")) {
      throw new Error("携帯電話番号を入力してください。");
    }

    const phone = raw.replace(/[^\d+]/g, "");

    if (!/^\+?\d{10,15}$/.test(phone)) {
      throw new Error("電話番号の形式が正しくありません。");
    }

    return phone;
  }

  function dialViaDevicePhone(phoneNumber, store = null) {
    const phone = normalizePhoneNumber(phoneNumber);
    const href = `tel:${encodeURIComponent(phone)}`;

    log(`mobile dial start: target=${phone}, storeId=${store?.id || ""}`);

    window.location.href = href;

    addCallHistory("発信", phone, "成功", {
      dialMethod: "mobile",
      storeId: store?.id || "",
      storeName: store?.name || "",
    });

    showToast("端末の電話アプリで発信します。");

    return true;
  }

  function getConfigFromForm() {
    configuredStores = parseStoresFromInput();

    return {
      wsUrl: ui.wsUrl.value.trim(),
      sipUri: ui.sipUri.value.trim(),
      authUser: ui.authUser.value.trim(),
      password: ui.password.value,
      defaultDialMethod: getSelectedDialMethod(),
      selectedStoreId: getSelectedStoreId(),
      stores: configuredStores,
      testAgent: testAgentSettings.enabled ? 1 : 0,
      deviceId: testAgentSettings.deviceId,
      testAgentBaseUrl: testAgentSettings.baseUrl,
    };
  }

  function fillConfigForm(config) {
    ui.wsUrl.value = config.wsUrl || "";
    ui.sipUri.value = config.sipUri || "";
    ui.authUser.value = config.authUser || "";
    ui.password.value = config.password || "";
    testAgentSettings = {
      enabled: isEnabledProvisioningValue(config.testAgent),
      deviceId: String(config.deviceId || "").trim(),
      baseUrl: String(config.testAgentBaseUrl || "").trim().replace(/\/$/, ""),
    };

    configuredStores = normalizeStores(config.stores);

    renderStoresConfig();

    if (ui.defaultDialMethod) {
      ui.defaultDialMethod.value = sanitizeDialMethod(config.defaultDialMethod);
    }

    renderStoreSelector(config.selectedStoreId || config.storeId || config.shopId || "");
  }

  function readStoredConfig() {
    try {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) {
        return { config: null, reason: "missing" };
      }

      const parsed = JSON.parse(raw);
      return {
        config: {
          ...parsed,
          stores: normalizeStores(parsed?.stores),
        },
        reason: "ok",
      };
    } catch (error) {
      warn(`Stored config load failed: ${describeError(error)}`);
      return { config: null, reason: "corrupt", error };
    }
  }

  function loadSavedConfig() {
    const stored = readStoredConfig();
    if (!stored.config) {
      if (stored.reason === "corrupt") {
        warn("Stored config is unavailable because it is corrupted.");
      }
      return null;
    }

    fillConfigForm(stored.config);
    log("Saved SIP configuration loaded.");
    return stored.config;
  }

  function persistConfig(config, options = {}) {
    const source = options.source || "unknown";
    const notify = options.notify === true;

    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
      log(`SIP configuration saved: source=${source}`);
      if (notify) {
        showToast("\u8a2d\u5b9a\u3092\u4fdd\u5b58\u3057\u307e\u3057\u305f\u3002", "success");
      }
      return true;
    } catch (error) {
      errorLog(`SIP configuration save failed: source=${source} detail=${describeError(error)}`);
      if (notify) {
        showUserError("\u8a2d\u5b9a\u306e\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002");
      }
      return false;
    }
  }

  function saveConfig() {
    return persistConfig(getConfigFromForm(), {
      source: "settings_form",
      notify: true,
    });
  }

  function decodeProvisioningPayload(raw) {
    const text = String(raw || "").trim();

    if (!text) return {};
    if (text.startsWith("{")) {
      return JSON.parse(text);
    }

    try {
      return JSON.parse(decodeURIComponent(text));
    } catch (_error) {
      // continue
    }

    try {
      return JSON.parse(decodeURIComponent(escape(window.atob(text))));
    } catch (error) {
      throw createTaggedError("json_invalid", "Provisioning payload is not valid JSON.", error);
    }
  }

  async function fetchProvisioningConfig(url) {
    if (!url) {
      throw createTaggedError("url_missing", "Provisioning URL is not configured.");
    }

    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), PROVISIONING_FETCH_TIMEOUT_MS)
      : null;

    try {
      const response = await fetch(url, { signal: controller?.signal });
      if (!response.ok) {
        const code = response.status === 401 || response.status === 403 ? "auth_failed" : "server_error";
        throw createTaggedError(code, `Provisioning fetch failed: HTTP ${response.status}`);
      }

      const text = (await response.text()).trim();
      if (!text) {
        throw createTaggedError("empty_response", "Provisioning response is empty.");
      }
      return decodeProvisioningPayload(text);
    } catch (error) {
      if (error?.name === "AbortError") {
        throw createTaggedError("timeout", "Provisioning request timed out.", error);
      }
      if (!error?.code && /failed to fetch|networkerror/i.test(String(error?.message || ""))) {
        throw createTaggedError("network_error", `Provisioning request failed: ${error.message}`, error);
      }
      throw error;
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  function normalizeProvisioningInput(payload) {
    const next = payload && typeof payload === "object" ? { ...payload } : {};
    const storesSource = next.storesJson || next.stores;

    try {
      if (typeof storesSource === "string" && storesSource.trim()) {
        next.stores = normalizeStores(JSON.parse(storesSource));
      } else if (storesSource) {
        next.stores = normalizeStores(storesSource);
      }
    } catch (error) {
      throw createTaggedError("json_invalid", "Provisioning stores payload is not valid JSON.", error);
    }

    if (next.defaultDialMethod) {
      next.defaultDialMethod = sanitizeDialMethod(next.defaultDialMethod);
    }

    if (!next.stores && next.storeName) {
      const storeId = String(next.selectedStoreId || next.storeId || next.shopId || "provisioned-store").trim();
      next.selectedStoreId = storeId;
      next.stores = normalizeStores([{
        id: storeId,
        name: next.storeName,
        phoneNumber: next.storePhone || next.phoneNumber || "",
        sipUri: next.storeSipUri || next.sipUri || "",
      }]);
    }

    if (next.ctiName) {
      log(`Provisioning CTI name received: ${String(next.ctiName).trim()}`);
    }

    if (Object.prototype.hasOwnProperty.call(next, "testAgent")) {
      next.testAgent = isEnabledProvisioningValue(next.testAgent) ? 1 : 0;
    }
    if (Object.prototype.hasOwnProperty.call(next, "deviceId")) {
      next.deviceId = String(next.deviceId || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(next, "testAgentBaseUrl")) {
      next.testAgentBaseUrl = String(next.testAgentBaseUrl || "").trim().replace(/\/$/, "");
    }

    return next;
  }

  function validateProvisioningConfig(config) {
    const missing = ["wsUrl", "sipUri", "password"].filter((key) => !String(config?.[key] || "").trim());
    return {
      valid: missing.length === 0,
      missing,
    };
  }

  function applyProvisioningConfig(config, options = {}) {
    const source = options.source || "unknown";
    const autoRegister = options.autoRegister === true;
    const stored = readStoredConfig();
    const baseConfig = stored.config || {};
    const merged = {
      ...baseConfig,
      ...normalizeProvisioningInput(config),
    };

    if (merged.stores) {
      merged.stores = normalizeStores(merged.stores);
    }

    const validation = validateProvisioningConfig(merged);
    if (!validation.valid) {
      if (hasProvisioningLikeConfig(baseConfig)) {
        warn(`Provisioning incomplete (${validation.missing.join(",")}); continuing with existing config.`);
        fillConfigForm(baseConfig);
        return { applied: false, fallback: true, reason: "missing_required_fields" };
      }
      throw createTaggedError(
        "missing_required_fields",
        `Provisioning is missing required fields: ${validation.missing.join(",")}`
      );
    }

    fillConfigForm(merged);
    if (!persistConfig(getConfigFromForm(), { source, notify: false })) {
      throw createTaggedError("save_failed", "Provisioning config could not be saved.");
    }
    markSetupGuideSeen();
    log(`Provisioning config applied: source=${source}`);
    showToast("\u30d7\u30ed\u30d3\u30b8\u30e7\u30cb\u30f3\u30b0\u8a2d\u5b9a\u3092\u9069\u7528\u3057\u307e\u3057\u305f\u3002", "success");

    if (autoRegister) {
      window.setTimeout(() => {
        register().catch((error) => {
          errorLog(`Auto register after provisioning failed: ${describeError(error)}`);
        });
      }, 300);
    }

    if (options.startTestAgent === true) {
      startTestAgent();
    }

    return { applied: true, fallback: false, reason: "ok" };
  }

  async function applyProvisioningFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const provisioningUrl = params.get("provisioningUrl") || params.get("configUrl") || "";
    const hasProvisioning = params.has("provisioning")
      || params.has("config")
      || params.has("wsUrl")
      || params.has("sipUri")
      || params.has("password")
      || params.has("testAgent")
      || params.has("deviceId")
      || params.has("testAgentBaseUrl")
      || Boolean(provisioningUrl);

    if (!hasProvisioning) return false;

    const provisioningConfig = {};
    try {
      if (provisioningUrl) {
        Object.assign(provisioningConfig, await fetchProvisioningConfig(provisioningUrl));
      }

      const embeddedPayload = params.get("provisioning") || params.get("config") || "";
      if (embeddedPayload) {
        Object.assign(provisioningConfig, decodeProvisioningPayload(embeddedPayload));
      }

      [
        "wsUrl",
        "sipUri",
        "authUser",
        "password",
        "defaultDialMethod",
        "selectedStoreId",
        "storesJson",
        "testAgent",
        "deviceId",
        "testAgentBaseUrl",
      ].forEach((key) => {
        const value = params.get(key);
        if (value) provisioningConfig[key] = value;
      });

      const storesText = params.get("stores");
      if (storesText) {
        try {
          provisioningConfig.stores = JSON.parse(storesText);
        } catch (error) {
          throw createTaggedError("json_invalid", "Provisioning stores query is not valid JSON.", error);
        }
      }

      const autoRegister = isEnabledProvisioningValue(params.get("autoRegister"))
        || isEnabledProvisioningValue(params.get("autoLogin"));
      const result = applyProvisioningConfig(provisioningConfig, {
        source: provisioningUrl ? "url_fetch" : "url_params",
        autoRegister,
      });
      return result.applied;
    } catch (error) {
      errorLog(`Provisioning apply failed: code=${String(error?.code || "unknown")} detail=${describeError(error)}`);
      const stored = readStoredConfig();
      if (hasProvisioningLikeConfig(stored.config)) {
        fillConfigForm(stored.config);
        warn("Provisioning failed; continued with existing stored config.");
        return false;
      }
      showUserError("\u30d7\u30ed\u30d3\u30b8\u30e7\u30cb\u30f3\u30b0\u306e\u53d6\u5f97\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002\u8a2d\u5b9a\u3092\u3054\u78ba\u8a8d\u304f\u3060\u3055\u3044\u3002");
      return false;
    }
  }
  function applyTestBootConfigFromUrl() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("test") !== "1") return;

    const bootConfig = {};

    ["wsUrl", "sipUri", "authUser", "password"].forEach((key) => {
      const value = params.get(key);

      if (value) bootConfig[key] = value;
    });

    if (!Object.keys(bootConfig).length) return;

    fillConfigForm({
      ...getConfigFromForm(),
      ...bootConfig,
      defaultDialMethod: DEFAULT_DIAL_METHOD,
    });

    saveConfig();
    log("Test boot config applied from URL.");
  }

  function getDomainFromSipUri(sipUri) {
    const normalized = String(sipUri || "").replace(/^sip:/i, "");
    const atIndex = normalized.indexOf("@");

    return atIndex >= 0 ? normalized.slice(atIndex + 1) : "";
  }

  function normalizeTargetUri(rawTarget) {
    const target = String(rawTarget || "").trim();

    if (!target) {
      throw new Error("発信先を入力してください。");
    }

    if (/^sip:/i.test(target)) {
      return target;
    }

    if (target.includes("@")) {
      return `sip:${target}`;
    }

    const domain = getDomainFromSipUri(ui.sipUri.value.trim());

    if (!domain) {
      throw new Error("SIP URI のドメインを取得できません。");
    }

    return `sip:${target}@${domain}`;
  }

  function buildUaConfig() {
    const { wsUrl, sipUri, authUser, password } = getConfigFromForm();

    if (!wsUrl || !sipUri || !password) {
      throw new Error("WebSocket URL、SIP URI、パスワードを入力してください。");
    }

    if (/^wss?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(wsUrl)) {
      throw new Error("iPhone では localhost / 127.0.0.1 の WebSocket URL は利用できません。");
    }

    const socket = new JsSIP.WebSocketInterface(wsUrl);
    sipSocket = socket;

    const config = {
      sockets: [socket],
      uri: sipUri,
      password,
      register: true,
      session_timers: false,
    };

    if (authUser) {
      config.authorization_user = authUser;
    }

    return config;
  }

  function stopSipKeepAlive() {
    if (sipKeepAliveTimerId !== null) {
      window.clearInterval(sipKeepAliveTimerId);
      sipKeepAliveTimerId = null;
    }
  }

  function startSipKeepAlive(socket, eventUa) {
    stopSipKeepAlive();
    sipKeepAliveTimerId = window.setInterval(() => {
      if (ua !== eventUa || sipSocket !== socket) {
        stopSipKeepAlive();
        return;
      }
      if (!socket.isConnected()) return;
      try {
        if (socket.send("\r\n\r\n")) {
          log("SIP WebSocket keepalive sent.");
        }
      } catch (error) {
        log(`SIP WebSocket keepalive failed: ${error.message || "unknown"}`, "warn");
      }
    }, SIP_WS_KEEPALIVE_INTERVAL_MS);
  }

  function destroyUa() {
    stopSipKeepAlive();
    clearRegistrationRecovery();
    sipSocket = null;
    if (!ua) return;

    const uaToStop = ua;
    ua = null;

    try {
      uaToStop.stop();
    } catch (error) {
      log(`UA 停止時にエラーが発生しました: ${error.message || "不明"}`, "warn");
    }
  }

  function isMicrophoneNotFoundError(error) {
    const name = String(error?.name || "");
    const cause = String(error?.cause || "");
    const message = String(error?.message || "");
    const text = `${name} ${cause} ${message}`.toLowerCase();

    return name === "NotFoundError"
      || text.includes("notfounderror")
      || text.includes("requested device not found")
      || text.includes("device not found")
      || text.includes("no audio input device");
  }

  function handlePotentialMediaError(error) {
    if (isMicrophoneNotFoundError(error)) {
      showUserError(MICROPHONE_NOT_FOUND_MESSAGE);
      return true;
    }

    return false;
  }

  async function acquireMicrophoneStream() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(`このページではマイクを利用できません。SecureContext=${window.isSecureContext}`);
    }

    log("マイク権限を確認しています。");

    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("マイク取得が 15 秒以内に完了しませんでした。"));
      }, 15000);
    });

    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      timeout,
    ]);

    const audioTracks = stream.getAudioTracks();

    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("マイクの音声トラックが見つかりませんでした。");
    }

    log(`マイクの準備が完了しました: tracks=${audioTracks.length}, state=${audioTracks[0].readyState}`);

    return stream;
  }

  function bindPeerConnection(session) {
    session.on("peerconnection", (event) => {
      const peerConnection = event.peerconnection;

      if (!peerConnection) return;

      startNetworkStatsMonitor(peerConnection);

      peerConnection.addEventListener("track", (trackEvent) => {
        if (trackEvent.track && trackEvent.track.kind !== "audio") return;

        const receiver = trackEvent.receiver;
        const parameters = receiver?.getParameters ? receiver.getParameters() : null;

        log(`track event received: kind=${trackEvent.track.kind}, id=${trackEvent.track.id}, readyState=${trackEvent.track.readyState}, muted=${trackEvent.track.muted}, params=${parameters ? JSON.stringify(parameters) : "none"}`);

        attachRemoteAudioTrack(trackEvent.track, trackEvent.streams?.[0], "track-event");
      });

      peerConnection.addEventListener("iceconnectionstatechange", () => {
        log(`ICE state: ${peerConnection.iceConnectionState}`);
      });

      peerConnection.addEventListener("icegatheringstatechange", () => {
        log(`ICE gathering state: ${peerConnection.iceGatheringState}`);
      });

      peerConnection.addEventListener("signalingstatechange", () => {
        log(`Signaling state: ${peerConnection.signalingState}`);
        logPeerConnectionSdp(peerConnection, "signaling");
      });

      peerConnection.addEventListener("connectionstatechange", () => {
        log(`PeerConnection state: ${peerConnection.connectionState}`);
      });

      logPeerConnectionSdp(peerConnection, "init");
    });
  }

  function getCallDurationSec() {
    if (!callStartedAt) return 0;

    return Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000));
  }

  function bindSessionEvents(session, originator) {
    if (session.__webrtcPhoneEventsBound) {
      log("Skipped duplicate session event binding.", "warn");
      return;
    }

    session.__webrtcPhoneEventsBound = true;
    let historyRecorded = false;

    function recordTerminalHistory(kind, target, status, meta) {
      if (historyRecorded) {
        log("Skipped duplicate call history write for completed session.", "warn");
        return;
      }

      historyRecorded = true;
      addCallHistory(kind, target, status, meta);
    }

    bindPeerConnection(session);

    session.on("connecting", () => {
      log(`通話接続中: originator=${originator}`);
    });

    session.on("sending", () => {
      log(`INVITE 送信中: originator=${originator}, target=${session.remote_identity?.uri?.toString() || "不明"}`);
    });

    session.on("progress", () => {
      setCallState(originator === "remote" ? "INCOMING" : "OUTGOING");
      updateRemoteParty();
      log("呼び出し中です。");
    });

    session.on("accepted", () => {
      hideIncomingModal();
      notifyNativeAudioStart();
      updateRemoteParty();
      startCallTimer();
      setCallState("INCALL");

      testAgentPostEvent("call.answered", {
        callId: getActiveCallId(session),
        originator,
      });

      logPeerConnectionSdp(session.connection, "accepted");
      attachRemoteAudioFromPeerConnection(session.connection, "accepted");
      playRemoteAudio();
      log("Call accepted.");
    });

    session.on("confirmed", () => {
      hideIncomingModal();
      notifyNativeAudioStart();
      updateRemoteParty();
      startCallTimer();
      setCallState("INCALL");

      testAgentPostEvent("call.connected", {
        callId: getActiveCallId(session),
        originator,
      });

      logPeerConnectionSdp(session.connection, "confirmed");
      attachRemoteAudioFromPeerConnection(session.connection, "confirmed");
      playRemoteAudio();
      log("Call confirmed.");
    });

    session.on("hold", (event) => {
      if (event?.originator !== "local") {
        log("相手側で保留されました。");
        return;
      }

      isHeld = true;
      refreshUi();
      showToast("保留にしました。");
      log("Call placed on hold.");
      testAgentPostEvent("call.hold", { isHeld: true });
    });

    session.on("unhold", (event) => {
      if (event?.originator !== "local") {
        log("相手側で保留が解除されました。");
        return;
      }

      isHeld = false;
      refreshUi();
      showToast("保留を解除しました。");
      log("Call resumed from hold.");
      testAgentPostEvent("call.resumed", { isHeld: false });
    });

    session.on("ended", () => {
      const target = session.remote_identity?.uri?.toString() || "不明";
      const durationSec = getCallDurationSec();

      testAgentPostEvent("call.ended", {
        callId: getActiveCallId(session),
        originator,
      });

      recordTerminalHistory(
        originator === "remote" ? "着信" : "発信",
        target,
        "成功",
        {
          durationSec,
          ctiName: pendingIncomingCtiName || "",
          dialMethod: originator === "remote" ? "sip" : getSelectedDialMethod(),
          storeId: getSelectedStore()?.id || "",
          storeName: getSelectedStore()?.name || "",
        },
      );

      resetCallState("ended");
      showToast("通話が終了しました。");
    });

    session.on("failed", (event) => {
      const response = event.message || event.response;
      const statusCode = response?.status_code || response?.statusCode || "";
      const reasonPhrase = response?.reason_phrase || response?.reasonPhrase || "";
      const method = response?.method || "";

      const extra = [
        statusCode ? `status=${statusCode}` : "",
        reasonPhrase ? `reason=${reasonPhrase}` : "",
        method ? `method=${method}` : "",
      ].filter(Boolean).join(", ");

      testAgentPostEvent("call.failed", {
        callId: getActiveCallId(session),
        originator,
        cause: event.cause || "",
        statusCode,
        reasonPhrase,
        method,
      });

      log(`通話失敗: cause=${event.cause || "不明"}, originator=${event.originator || "不明"}${extra ? `, ${extra}` : ""}`);

      if (originator === "local" && Number(statusCode) === 404) {
        showUserError("発信先が見つかりません。番号または接続先を確認してください。");
      } else {
        handlePotentialMediaError(event);
      }

      recordTerminalHistory(
        originator === "remote" ? "不在着信" : "発信",
        session.remote_identity?.uri?.toString() || "不明",
        "失敗",
        {
          ctiName: pendingIncomingCtiName || "",
          dialMethod: originator === "remote" ? "sip" : getSelectedDialMethod(),
          storeId: getSelectedStore()?.id || "",
          storeName: getSelectedStore()?.name || "",
        },
      );

      resetCallState(`failed: ${event.cause || "不明"}`);
    });
  }
  function setupUaEvents() {
    const eventUa = ua;
    const eventSocket = sipSocket;

    ua.on("connecting", () => {
      log(`WebSocket 接続中: ${ui.wsUrl.value.trim()}`);
    });

    ua.on("connected", () => {
      if (ua !== eventUa) return;

      startSipKeepAlive(eventSocket, eventUa);
      log(`WebSocket 接続完了: ${ui.wsUrl.value.trim()}`);
    });

    ua.on("disconnected", (event) => {
      if (ua !== eventUa) return;

      stopSipKeepAlive();

      const message = [
        "WebSocket disconnected.",
        `URL=${ui.wsUrl.value.trim()}`,
        event?.error ? `error=${event.error}` : "",
        event?.code ? `code=${event.code}` : "",
        event?.reason ? `reason=${event.reason}` : "",
      ].filter(Boolean).join(" ");

      log(message, "warn");
      beginRegistrationRecovery(
        "WebSocket reconnecting",
        formatConnectionFailureMessage(event),
      );
    });

    ua.on("registrationExpiring", () => {
      if (ua !== eventUa) return;

      log("SIP registration is expiring. Re-registering.");

      try {
        eventUa.register();
      } catch (error) {
        log(`SIP 再登録に失敗しました: ${error.message || "不明"}`, "error");
      }
    });

    ua.on("registered", () => {
      if (ua !== eventUa) return;

      const shouldNavigateToDialer = navigateToDialerAfterRegistration;
      navigateToDialerAfterRegistration = false;
      registrationEstablished = true;

      clearRegistrationRecovery();
      setRegistrationState("REGISTERED");
      clearUserError();
      persistConfig(getConfigFromForm(), {
        source: "sip_registered",
        notify: false,
      });

      testAgentPostEvent("sip.registered");
      syncAgiDeviceRegistration("sip_registered").catch((error) => {
        warn(`AGI device registration failed: ${describeError(error)}`);
      });
      notifyAgiSipRegistered().catch((error) => {
        warn(`AGI SIP registration notification failed: ${describeError(error)}`);
      });
      notifyReadyForPushInvite();
      log(`SIP 登録が完了しました: ${ui.sipUri.value.trim()}`);
      if (shouldNavigateToDialer) {
        navigationStack = [];
        settingsPageMode = "menu";
        showView("view-home");
        showHomeTab("dialer");
        animateMainReturn();
      }
    });

    ua.on("unregistered", () => {
      if (ua !== eventUa) return;

      beginRegistrationRecovery(
        "SIP re-registering",
        formatConnectionFailureMessage(),
      );
      log("SIP registration was cleared. Attempting re-registration.");

      window.setTimeout(() => {
        if (ua !== eventUa || registrationState !== "REGISTERING") return;

        try {
          eventUa.register();
        } catch (error) {
          log(`SIP 再登録に失敗しました: ${error.message || "不明"}`, "error");
        }
      }, 1000);
    });

    ua.on("registrationFailed", (event) => {
      if (ua !== eventUa) return;

      testAgentPostEvent("sip.registration.failed", {
        cause: event.cause || "",
      });

      const failureDetail = `SIP 登録に失敗しました: cause=${event.cause || "不明"}, URL=${ui.wsUrl.value.trim()}`;
      const failureMessage = formatConnectionFailureMessage(event);
      log(failureDetail, "warn");
      if (isPermanentRegistrationFailure(event)) {
        clearRegistrationRecovery();
        navigateToDialerAfterRegistration = false;
        setRegistrationState("FAILED", `cause=${event.cause || "unknown"}`);
        showUserError(failureMessage);
        return;
      }

      beginRegistrationRecovery(`cause=${event.cause || "unknown"}`, failureMessage);
      window.setTimeout(() => {
        if (ua !== eventUa || registrationState !== "REGISTERING") return;
        try {
          eventUa.register();
        } catch (error) {
          log(`SIP 再登録に失敗しました: ${error.message || "不明"}`, "warn");
        }
      }, 1200);
    });

    ua.on("newRTCSession", (event) => {
      if (ua !== eventUa) return;

      const originator = event?.originator;
      const session = event?.session;

      if (!session) {
        log("newRTCSession received without a valid session.");
        return;
      }

      log(`newRTCSession: originator=${originator}, callState=${callState}, hasActive=${activeSession ? "yes" : "no"}`);

      if (activeSession === session) {
        log("Ignoring duplicate newRTCSession event for the active session.");
        return;
      }

      if (activeSession && callState === "IDLE") {
        log("Ignoring stale active session.");
        activeSession = null;
      }

      if (activeSession) {
        session.terminate();
        log("An incoming call arrived while another session was active.");
        return;
      }

      activeSession = session;
      bindSessionEvents(session, originator);
      updateRemoteParty();

      if (originator === "remote") {
        const from = session.remote_identity?.uri?.toString() || "不明";
        pendingIncomingCtiName = getSipCtiDisplayName(session);

        setCallState("INCOMING");

        testAgentPostEvent("call.incoming", {
          callId: getActiveCallId(session),
          from,
        });

        resolveIncomingParty(from, pendingIncomingCtiName).then((party) => {
          if (callState !== "INCOMING") return;

          pendingIncomingFrom = party.target;
          applyResolvedIncomingParty(party);
        });

        const shouldAutoAnswerPushInvite = isMatchingPendingPushInvite(session);
        if (shouldAutoAnswerPushInvite) {
          nativeBridge?.confirmPushInviteAccepted?.(pendingPushAnswer);
          clearPendingPushAnswer("matching INVITE received");
          log(`PUSH応答待機中のINVITEを自動応答します: ${from}`);
          answerIncoming();
          return;
        }

        showIncomingModal(from);

        log(`着信しました: ${from}`);

        if (pendingIncomingDecision === "answer") {
          pendingIncomingDecision = null;
          answerIncoming();
        } else if (pendingIncomingDecision === "reject") {
          pendingIncomingDecision = null;
          rejectIncoming();
        }
      } else {
        setCallState("OUTGOING");

        testAgentPostEvent("call.outgoing", {
          callId: getActiveCallId(session),
          to: session.remote_identity?.uri?.toString() || "",
        });

        log("Outgoing call session started.");
      }
    });
  }
    function getActiveCallId(session = activeSession) {
    return String(
      session?.id
      || session?.request?.call_id
      || session?.request?.callId
      || session?.request?.getHeader?.("Call-ID")
      || session?.remote_identity?.uri?.toString?.()
      || "no-call-id",
    );
  }

  function testAgentDetails(extra = {}) {
    const sessionCallId = activeSession ? getActiveCallId(activeSession) : null;
    return {
      ...extra,
      sipUri: ui?.sipUri?.value?.trim?.() || "",
      wsUrl: ui?.wsUrl?.value?.trim?.() || "",
      registrationState,
      callState,
      isHeld,
      isMuted,
      callId: extra.callId || sessionCallId || null,
      remote: activeSession?.remote_identity?.uri?.toString?.() || "",
    };
  }

  async function testAgentRequest(path, options = {}) {
    if (!testAgent?.baseUrl) return null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), TEST_AGENT_REQUEST_TIMEOUT_MILLIS)
      : null;
    try {
      const response = await fetch(`${testAgent.baseUrl}${path}`, {
        ...options,
        signal: controller?.signal,
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {}),
        },
      });
      if (!response.ok) {
        throw new Error(`${options.method || "GET"} ${path} failed: ${response.status}`);
      }
      return response.json().catch(() => ({}));
    } catch (error) {
      if (error?.name === "AbortError") throw new Error(`${options.method || "GET"} ${path} timed out`);
      throw error;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
  }

  function testAgentPostEvent(event, data = {}) {
    if (!testAgent?.enabled) return;

    const sessionCommandId = activeSession ? testAgentSessionCommandIds.get(activeSession) : null;
    const callId = data.callId || (activeSession ? getActiveCallId(activeSession) : null);
    const commandId = data.commandId || sessionCommandId || testAgentCurrentCommandId || null;

    testAgentRequest("/events", {
      method: "POST",
      body: JSON.stringify({
        deviceId: testAgent.deviceId,
        event,
        timestamp: Date.now(),
        commandId,
        callId: callId === "no-call-id" ? null : callId,
        data: testAgentDetails({
          ...data,
          registrationState,
          callState,
          currentRemoteLabel: ui?.remoteParty?.textContent || ui?.incomingNumber?.textContent || "",
        }),
      }),
    }).catch((error) => {
      log(`test-agent event failed: ${error.message || "unknown"}`, "warn");
    });
  }

  async function register(options = {}) {
    rememberUserAction();
    clearUserError();

    if (registrationState === "REGISTERING") return;
    navigateToDialerAfterRegistration = options.navigateOnSuccess === true;

    try {
      persistConfig(getConfigFromForm(), {
        source: "register_start",
        notify: false,
      });
      destroyUa();
      resetCallState("register");

      setRegistrationState("REGISTERING", "Registering");

      ua = new JsSIP.UA(buildUaConfig());
      setupUaEvents();
      ua.start();

      log("SIP 登録を開始しました。");
    } catch (error) {
      navigateToDialerAfterRegistration = false;
      setRegistrationState("FAILED", `cause=${error.message || "unknown"}`);
      showUserError("接続に失敗しました。");
      errorLog(`register failed: ${error.message || "unknown"}`);
    }
  }

  function logout() {
    rememberUserAction();

    try {
      if (activeSession) {
        hangup();
      }

      destroyUa();

      navigateToDialerAfterRegistration = false;
      registrationEstablished = false;
      setRegistrationState("UNREGISTERED");
      showView("view-home");
      showHomeTab("settings");

      showToast("ログアウトしました。");
      log("Logged out.");
    } catch (error) {
      showUserError(`ログアウトに失敗しました: ${error.message || "不明"}`);
    }
  }

  function resolveDialTargetForCurrentMethod() {
    const rawTarget = String(ui.targetUri?.value || "").trim();
    const method = getSelectedDialMethod();
    const selectedStore = getSelectedStore();

    if (method === "mobile") {
      return {
        method,
        target: normalizePhoneNumber(rawTarget),
        store: selectedStore,
      };
    }

    if (method === "shop") {
      if (!selectedStore?.phoneNumber) {
        throw new Error("店舗番号が設定されていません。");
      }

      return {
        method,
        target: normalizePhoneNumber(rawTarget || selectedStore.phoneNumber),
        store: selectedStore,
      };
    }

    return {
      method: "sip",
      target: normalizeTargetUri(rawTarget),
      store: selectedStore,
    };
  }

  async function call() {
    rememberUserAction();
    clearUserError();

    if (activeSession) {
      showUserError("すでに通話中です。");
      return;
    }

    let dialInfo;

    try {
      dialInfo = resolveDialTargetForCurrentMethod();
    } catch (error) {
      showUserError(error.message || "発信先を確認してください。");
      return;
    }

    if (dialInfo.method === "mobile" || dialInfo.method === "shop") {
      try {
        dialViaDevicePhone(dialInfo.target, dialInfo.store);
      } catch (error) {
        showUserError(error.message || "端末電話での発信に失敗しました。");
      }
      return;
    }

    if (!ua || registrationState !== "REGISTERED") {
      showUserError("SIP が登録されていません。");
      return;
    }

    try {
      localMediaStream = await acquireMicrophoneStream();

      const options = {
        ...CALL_OPTIONS,
        mediaStream: localMediaStream,
      };

      log(`発信します: ${dialInfo.target}`);

      const session = ua.call(dialInfo.target, options);

      activeSession = session;
      if (testAgentCurrentCommandId) {
        testAgentSessionCommandIds.set(session, testAgentCurrentCommandId);
      }
      bindSessionEvents(session, "local");
      updateRemoteParty();
      setCallState("OUTGOING");

      showToast("発信中です。");
      return session;
    } catch (error) {
      if (!handlePotentialMediaError(error)) {
        showUserError(error.message || "発信に失敗しました。");
      }

      addCallHistory("発信", dialInfo.target, "失敗", {
        dialMethod: "sip",
        storeId: dialInfo.store?.id || "",
        storeName: dialInfo.store?.name || "",
      });

      resetCallState(`call failed: ${error.message || "unknown"}`);
      return null;
    }
  }

  function hangup() {
    rememberUserAction();

    if (!activeSession) {
      resetCallState("hangup without session");
      return;
    }

    try {
      activeSession.terminate();
      log("通話終了を実行しました。");
    } catch (error) {
      log(`通話終了時にエラーが発生しました: ${error.message || "不明"}`, "warn");
      resetCallState("hangup error");
    }
  }

  async function answerIncoming() {
    rememberUserAction();

    if (!activeSession || callState !== "INCOMING") {
      pendingIncomingDecision = "answer";
      log("着信セッション未準備のため、応答を保留しました。");
      return;
    }

    try {
      localMediaStream = await acquireMicrophoneStream();

      activeSession.answer({
        ...CALL_OPTIONS,
        mediaStream: localMediaStream,
      });

      hideIncomingModal();
      notifyNativeAudioStart();
      startCallTimer();
      setCallState("INCALL");

      nativeBridge?.cancelIncomingCallNotification?.();

      showToast("応答しました。");
      log("Incoming call answered.");
    } catch (error) {
      handlePotentialMediaError(error);
      showUserError(error.message || "応答に失敗しました。");
      resetCallState(`answer failed: ${error.message || "unknown"}`);
    }
  }

  function rejectIncoming() {
    rememberUserAction();

    if (!activeSession || callState !== "INCOMING") {
      pendingIncomingDecision = "reject";
      log("着信セッション未準備のため、拒否を保留しました。");
      return;
    }

    try {
      const rejectedCallId = getActiveCallId(activeSession);
      activeSession.terminate({
        status_code: 486,
        reason_phrase: "Busy Here",
      });

      nativeBridge?.cancelIncomingCallNotification?.();

      testAgentPostEvent("call.rejected", { callId: rejectedCallId });

      resetCallState("rejected");
      showToast("着信を拒否しました。");
      return true;
    } catch (error) {
      showUserError(`着信拒否に失敗しました: ${error.message || "不明"}`);
      return false;
    }
  }

  function toggleMute() {
    rememberUserAction();

    if (!activeSession || callState !== "INCALL") return;

    try {
      if (isMuted) {
        activeSession.unmute({ audio: true });
        isMuted = false;
        showToast("ミュートを解除しました。");
      } else {
        activeSession.mute({ audio: true });
        isMuted = true;
        showToast("ミュートしました。");
      }

      refreshUi();
      log(`Mute changed: ${isMuted}`);
    } catch (error) {
      showUserError(`ミュート操作に失敗しました: ${error.message || "不明"}`);
    }
  }

  function toggleHold() {
    rememberUserAction();

    if (!activeSession || callState !== "INCALL" || holdOperationPending) return;

    setHoldState(!isHeld);
  }

  function setHoldState(shouldHold) {
    if (!activeSession || callState !== "INCALL" || holdOperationPending) {
      return false;
    }
    if (Boolean(shouldHold) === isHeld) return true;

    holdOperationPending = true;
    refreshUi();

    try {
      if (shouldHold) {
        activeSession.hold();
      } else {
        activeSession.unhold();
      }

      window.setTimeout(() => {
        holdOperationPending = false;
        refreshUi();
      }, 1000);
      return true;
    } catch (error) {
      holdOperationPending = false;
      refreshUi();
      showUserError(`保留操作に失敗しました: ${error.message || "不明"}`);
      return false;
    }
  }

  function toggleSpeaker() {
    rememberUserAction();

    if (callState !== "INCALL") return;

    isSpeakerEnabled = !isSpeakerEnabled;
    notifyNativeSpeakerRoute(isSpeakerEnabled);
    refreshUi();

    showToast(isSpeakerEnabled ? "スピーカーをオンにしました。" : "スピーカーをオフにしました。");
  }

  function appendDigit(digit) {
    const value = String(digit || "");

    if (!value) return;

    if (callState === "INCALL" && dialpadMode === "transfer") {
      ui.transferTarget.value += value;
      return;
    }

    if (callState === "INCALL" && dialpadMode === "keypad") {
      sendDtmf(value);
      return;
    }

    ui.targetUri.value += value;
  }

  function sendDtmf(value) {
    if (!activeSession || callState !== "INCALL") return;

    try {
      activeSession.sendDTMF(value);

      if (ui.dtmfDisplay) {
        ui.dtmfDisplay.innerText += value;
      }

      log(`DTMF sent: ${value}`);
    } catch (error) {
      showUserError(`DTMF 送信に失敗しました: ${error.message || "不明"}`);
    }
  }

  function transferCall() {
    rememberUserAction();

    if (!activeSession || callState !== "INCALL") {
      showUserError("通話中のみ転送できます。");
      return;
    }

    const target = String(ui.transferTarget?.value || "").trim();

    if (!target) {
      showUserError("転送先を入力してください。");
      return;
    }

    try {
      transferToTarget(target);
    } catch (error) {
      showUserError(`転送に失敗しました: ${error.message || "不明"}`);
    }
  }

  function transferToTarget(target, callbacks = {}) {
    if (!activeSession || callState !== "INCALL") {
      throw new Error("通話中のみ転送できます。");
    }
    const referTarget = normalizeTargetUri(target);
    const transferredSession = activeSession;
    let transferCompleted = false;
    const completeTransfer = (event = {}) => {
      if (transferCompleted) return;
      transferCompleted = true;
      log(`Transfer accepted: ${referTarget}`);
      testAgentPostEvent("call.transfer.succeeded", {
        target: referTarget,
        statusCode: event?.status_line?.status_code || event?.response?.status_code || "",
      });
      callbacks.onAccepted?.({ target: referTarget, event });
      if (activeSession === transferredSession) {
        try {
          transferredSession.terminate();
        } catch (error) {
          warn(`Transferred session termination failed: ${describeError(error)}`);
        }
      }
    };
    const failTransfer = (event = {}) => {
      const detail = event?.cause || event?.status_line?.reason_phrase || "unknown";
      warn(`Transfer failed: target=${referTarget} detail=${detail}`);
      testAgentPostEvent("call.transfer.failed", { target: referTarget, detail });
      callbacks.onFailed?.(new Error(detail));
    };
    transferredSession.refer(referTarget, {
      eventHandlers: {
        accepted: completeTransfer,
        requestFailed: failTransfer,
        failed: failTransfer,
      },
    });
    testAgentPostEvent("call.transfer.started", { target: referTarget });
    setDialpadMode("dial");
    showToast("転送を開始しました。");
    log(`Transfer started: ${referTarget}`);
    return referTarget;
  }

  function transferToTargetAndWait(target) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("転送結果の待機がタイムアウトしました。"));
      }, 25000);
      const finish = (handler) => (value) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        handler(value);
      };
      try {
        transferToTarget(target, {
          onAccepted: finish(resolve),
          onFailed: finish(reject),
        });
      } catch (error) {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  function renderSettingsRoot() {
    if (!ui.settingsRoot) return;

    ui.settingsRoot.innerHTML = `
      <div class="settings-list android-settings-list">
        <button type="button" class="settings-row" data-settings-route="account">
          <span class="settings-row-copy"><span>アカウント設定</span><small>${escapeHtml(getRegistrationLabel())}</small></span>
          <span class="settings-chevron" aria-hidden="true">›</span>
        </button>

        <button type="button" class="settings-row" data-settings-route="calls">
          <span class="settings-row-copy"><span>通話設定</span><small>${escapeHtml(getSelectedDialMethod())}</small></span>
          <span class="settings-chevron" aria-hidden="true">›</span>
        </button>

        <button type="button" class="settings-row" data-settings-route="stores">
          <span class="settings-row-copy"><span>店舗</span><small>${configuredStores.length ? `${configuredStores.length}店舗` : "未登録"}</small></span>
          <span class="settings-chevron" aria-hidden="true">›</span>
        </button>

        <button type="button" class="settings-row" data-settings-route="environment">
          <span class="settings-row-copy"><span>権限と端末設定</span><small>${escapeHtml(resolvePlatform())}</small></span>
          <span class="settings-chevron" aria-hidden="true">›</span>
        </button>

        <button type="button" class="settings-row danger" data-settings-action="logout">
          <span class="settings-row-copy"><span>ログアウト</span></span>
        </button>
      </div>
    `;
  }

  function renderSettingsSubpage() {
    if (!ui.settingsSubpage) return;

    const route = settingsPageMode || "menu";

    if (route === "account") {
      ui.settingsSubpage.innerHTML = `
        <div class="settings-card">
          <label>
            <span>WebSocket URL</span>
            <input id="settingsWsUrl" type="text" value="${escapeHtml(ui.wsUrl?.value || "")}">
          </label>

          <label>
            <span>SIP URI</span>
            <input id="settingsSipUri" type="text" value="${escapeHtml(ui.sipUri?.value || "")}">
          </label>

          <label>
            <span>認証ユーザー</span>
            <input id="settingsAuthUser" type="text" value="${escapeHtml(ui.authUser?.value || "")}">
          </label>

          <label>
            <span>パスワード</span>
            <input id="settingsPassword" type="password" value="${escapeHtml(ui.password?.value || "")}">
          </label>

          <button type="button" class="primary-button" id="btnSaveAccountSettings">
            保存
          </button>
        </div>
      `;

      $("btnSaveAccountSettings")?.addEventListener("click", () => {
        ui.wsUrl.value = $("settingsWsUrl")?.value || "";
        ui.sipUri.value = $("settingsSipUri")?.value || "";
        ui.authUser.value = $("settingsAuthUser")?.value || "";
        ui.password.value = $("settingsPassword")?.value || "";
        saveConfig();
      });

      return;
    }

    if (route === "calls") {
      ui.settingsSubpage.innerHTML = `
        <div class="settings-card">
          <label>
            <span>デフォルト発信方法</span>
            <select id="settingsDefaultDialMethod" class="app-select">
              <option value="sip">SIP 発信</option>
              <option value="mobile">携帯電話番号へ発信</option>
              <option value="shop">店舗番号を使う</option>
            </select>
          </label>

          <button type="button" class="primary-button" id="btnSaveCallSettings">
            保存
          </button>
        </div>
      `;

      const methodSelect = $("settingsDefaultDialMethod");
      if (methodSelect) {
        methodSelect.value = getSelectedDialMethod();
      }

      $("btnSaveCallSettings")?.addEventListener("click", () => {
        if (ui.defaultDialMethod) {
          ui.defaultDialMethod.value = sanitizeDialMethod(methodSelect?.value || "sip");
        }

        saveConfig();
      });

      return;
    }

    if (route === "stores") {
      const storeItems = configuredStores.length
        ? configuredStores.map((store) => `
            <div class="store-settings-row">
              <span class="settings-row-copy">
                <span>${escapeHtml(store.name)}</span>
                <small>${escapeHtml(store.phoneNumber || store.sipUri || "発信先未設定")}</small>
              </span>
              <button type="button" class="store-delete-button" data-delete-store="${escapeHtml(store.id)}" aria-label="${escapeHtml(store.name)}を削除">削除</button>
            </div>
          `).join("")
        : '<p class="empty-settings-message">店舗はまだ登録されていません。</p>';

      ui.settingsSubpage.innerHTML = `
        <div class="settings-card store-settings-card">
          <div class="store-settings-list">${storeItems}</div>
        </div>
        <div class="settings-card store-add-card">
          <h3>店舗を追加</h3>
          <label>
            <span>店舗名</span>
            <input id="settingsStoreName" type="text" autocomplete="organization" placeholder="店舗A">
          </label>
          <label>
            <span>電話番号</span>
            <input id="settingsStorePhone" type="tel" inputmode="tel" placeholder="0312345678">
          </label>
          <label>
            <span>SIP URI（任意）</span>
            <input id="settingsStoreSipUri" type="text" autocomplete="off" placeholder="sip:store@example.com">
          </label>
          <button type="button" class="primary-button" id="btnAddStore">店舗を追加</button>
        </div>
      `;

      $("btnAddStore")?.addEventListener("click", () => {
        const name = String($("settingsStoreName")?.value || "").trim();
        const phoneNumber = String($("settingsStorePhone")?.value || "").trim();
        const sipUri = String($("settingsStoreSipUri")?.value || "").trim();
        if (!name) {
          showUserError("店舗名を入力してください。");
          return;
        }
        const id = `store-${Date.now().toString(36)}`;
        configuredStores = normalizeStores([...configuredStores, { id, name, phoneNumber, sipUri }]);
        renderStoresConfig();
        renderStoreSelector(getSelectedStoreId());
        saveConfig();
        renderSettingsSubpage();
      });

      ui.settingsSubpage.querySelectorAll("[data-delete-store]").forEach((button) => {
        button.addEventListener("click", () => {
          const storeId = button.dataset.deleteStore || "";
          const store = configuredStores.find((item) => item.id === storeId);
          if (!store || !window.confirm(`${store.name}を削除しますか？`)) return;
          const selectedStoreId = getSelectedStoreId() === storeId ? "" : getSelectedStoreId();
          configuredStores = configuredStores.filter((item) => item.id !== storeId);
          renderStoresConfig();
          renderStoreSelector(selectedStoreId);
          saveConfig();
          renderSettingsSubpage();
        });
      });

      return;
    }

    if (route === "environment") {
      ui.settingsSubpage.innerHTML = `
        <div class="settings-list android-settings-list">
          <button type="button" class="settings-row" id="btnEnvNotifications">
            <span class="settings-row-copy"><span>通知</span><small>Androidの通知設定を開く</small></span>
            <span class="settings-chevron" aria-hidden="true">›</span>
          </button>

          <button type="button" class="settings-row" id="btnEnvPermissions">
            <span class="settings-row-copy"><span>権限</span><small>マイクなどの権限を確認する</small></span>
            <span class="settings-chevron" aria-hidden="true">›</span>
          </button>

          <button type="button" class="settings-row" id="btnEnvSetupGuide">
            <span class="settings-row-copy"><span>初期設定ガイド</span><small>端末設定を再確認する</small></span>
            <span class="settings-chevron" aria-hidden="true">›</span>
          </button>
        </div>
      `;

      $("btnEnvNotifications")?.addEventListener("click", () => openSupportTarget("notifications"));
      $("btnEnvPermissions")?.addEventListener("click", () => {
        openSupportTarget(resolvePlatform() === "android" ? "permissions" : "app-settings");
      });
      $("btnEnvSetupGuide")?.addEventListener("click", openSetupView);
      return;
    }

    ui.settingsSubpage.innerHTML = "";
  }

  function renderSettingsPage() {
    if (!ui.settingsRoot || !ui.settingsSubpage) return;

    const isRoot = settingsPageMode === "menu" || settingsPageMode === "root";
    const route = settingsPageMode || "menu";
    const dataKey = isRoot
      ? `${registrationState}|${getSelectedDialMethod()}|${configuredStores.length}|${resolvePlatform()}`
      : route === "stores"
        ? JSON.stringify(configuredStores)
        : route;
    const renderKey = `${currentHomeTab}|${route}|${dataKey}`;

    ui.settingsRoot.hidden = !isRoot;
    ui.settingsSubpage.hidden = isRoot;

    if (lastSettingsRenderKey === renderKey) return;

    if (isRoot) {
      renderSettingsRoot();
    } else {
      renderSettingsSubpage();
    }

    lastSettingsRenderKey = renderKey;

    if (currentHomeTab === "settings") {
      const activeView = resolveHomeMode() === "account" && ui.accountSettingsCard
        ? ui.accountSettingsCard
        : isRoot
          ? ui.settingsRoot
          : ui.settingsSubpage;
      activeView.classList.remove("settings-view-enter");
      window.requestAnimationFrame(() => activeView.classList.add("settings-view-enter"));
    }
  }

  function getNavigationState() {
    return { tab: currentHomeTab, settingsPageMode };
  }

  function rememberNavigationState() {
    if (restoringNavigationState || resolveHomeMode() !== "main") return;
    const state = getNavigationState();
    const previous = navigationStack[navigationStack.length - 1];
    if (previous?.tab === state.tab && previous?.settingsPageMode === state.settingsPageMode) return;
    navigationStack.push(state);
    if (navigationStack.length > 32) navigationStack.shift();
  }

  function animateMainReturn() {
    const surface = ui.views?.home?.querySelector(".phone-surface");
    if (!surface) return;
    window.clearTimeout(mainReturnAnimationTimerId);
    surface.classList.remove("is-main-returning");
    window.requestAnimationFrame(() => {
      surface.classList.add("is-main-returning");
      mainReturnAnimationTimerId = window.setTimeout(() => {
        surface.classList.remove("is-main-returning");
        mainReturnAnimationTimerId = null;
      }, 240);
    });
  }

  function restoreNavigationState(state, options = {}) {
    if (!state) return false;
    restoringNavigationState = true;
    try {
      settingsPageMode = state.settingsPageMode || "menu";
      showHomeTab(state.tab || "dialer");
    } finally {
      restoringNavigationState = false;
    }
    if (options.animateMain && state.tab !== "settings") animateMainReturn();
    return true;
  }

  function navigateToHomeTab(tabName) {
    if (String(tabName || "") !== currentHomeTab) rememberNavigationState();
    showHomeTab(tabName);
  }

  function openSettingsRoute(route, options = {}) {
    const nextRoute = route || "menu";
    if (options.recordHistory && (currentHomeTab !== "settings" || settingsPageMode !== nextRoute)) {
      rememberNavigationState();
    }
    settingsPageMode = nextRoute;
    showHomeTab("settings");
  }

  function handleBackNavigation() {
    if (ui.homeOverflowMenu && !ui.homeOverflowMenu.hidden) {
      ui.homeOverflowMenu.hidden = true;
      return true;
    }
    if (callState === "INCALL" && dialpadMode !== "dial") {
      setDialpadMode("dial");
      return true;
    }
    if (callState === "OUTGOING" || callState === "INCOMING" || callState === "INCALL") return true;
    if (contactOverlayMode !== "closed") {
      closeContactOverlay();
      return true;
    }
    if (resolveHomeMode() === "setup") {
      leaveSetupView();
      return true;
    }
    if (resolveHomeMode() !== "main") return false;
    if (navigationStack.length > 0) return restoreNavigationState(navigationStack.pop(), { animateMain: true });
    if (currentHomeTab === "settings" && settingsPageMode !== "menu") {
      openSettingsRoute("menu");
      return true;
    }
    if (currentHomeTab !== "dialer") {
      showHomeTab("dialer");
      animateMainReturn();
      return true;
    }
    return false;
  }

  function getPanelTitle() {
    const mode = resolveHomeMode();

    if (contactOverlayMode !== "closed") {
      if (contactOverlayMode === "history") return "通話履歴詳細";
      return contactOverlayMode === "editor" ? "連絡先を編集" : "連絡先";
    }

    if (mode === "setup") return "初期設定";
    if (mode === "account") return "アカウント設定";

    if (currentHomeTab === "settings") {
      const labels = {
        menu: "設定",
        root: "設定",
        account: "アカウント設定",
        calls: "通話設定",
        stores: "店舗",
        environment: "権限と端末設定",
      };

      return labels[settingsPageMode] || "設定";
    }

    return {
      history: "履歴",
      dialer: "キーパッド",
      contacts: "連絡先",
      favorites: "お気に入り",
      setup: "初期設定",
      settings: "設定",
    }[currentHomeTab] || "WebRTC Phone";
  }

  function getAccountLabel() {
    return ui.authUser?.value.trim()
      || ui.sipUri?.value.trim()
      || "SIP";
  }

  function showHomeTab(tabName) {
    const homeMode = resolveHomeMode();
    const requestedTab = String(tabName || "").trim();

    if (homeMode === "setup") {
      currentHomeTab = "setup";
    } else if (homeMode === "account") {
      currentHomeTab = "settings";
      settingsPageMode = "account";
    } else {
      if (ui.homePanels[requestedTab]) {
        currentHomeTab = requestedTab;
      } else {
        warn(`Unknown home tab ignored: ${requestedTab || "(empty)"}`);
        currentHomeTab = ui.homePanels[currentHomeTab] ? currentHomeTab : getDefaultHomeTab();
      }

      if (currentHomeTab !== "settings") {
        settingsPageMode = "menu";
      }
    }

    Object.entries(ui.homePanels).forEach(([name, panel]) => {
      if (!panel) return;

      const active = name === currentHomeTab;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });

    [
      ["history", ui.tabHistory],
      ["dialer", ui.tabDialer],
      ["contacts", ui.tabContacts],
      ["favorites", ui.tabFavorites],
    ].forEach(([name, button]) => {
      if (!button) return;

      const active = name === currentHomeTab;

      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (ui.tabSettings) {
      ui.tabSettings.hidden = true;
    }

    renderContactsAndFavorites();
    scheduleVirtualContactRender();
    renderCallHistory();
    updateHomeChrome();
  }

  function renderSetupChecklist(checklist) {
    const { items, hasBlockingItems, platform } = checklist;
    const platformLabel = platform === "android"
      ? "Android"
      : platform === "ios"
        ? "iPhone"
        : "Web";

    if (ui.setupPlatformBadge) {
      ui.setupPlatformBadge.textContent = platformLabel;
    }

    if (ui.setupSummary) {
      ui.setupSummary.textContent = hasBlockingItems
        ? "必要な設定を確認してください。"
        : "通話に必要な確認は完了しています。";
    }

    if (ui.btnProceedFromSetup) {
      ui.btnProceedFromSetup.hidden = hasBlockingItems;
    }

    if (ui.btnSkipSetup) {
      ui.btnSkipSetup.hidden = !hasBlockingItems;
    }

    if (!ui.setupChecklist) return;

    ui.setupChecklist.innerHTML = items.map((item) => {
      const badge = getPermissionBadge(item.status);
      const action = item.target && item.buttonLabel
        ? `
          <button
            type="button"
            class="secondary-button setup-action-button"
            data-target="${escapeHtml(item.target)}"
          >
            ${escapeHtml(item.buttonLabel)}
          </button>
        `
        : "";
      const summary = item.summary
        ? `<p>${escapeHtml(item.summary)}</p>`
        : "";
      const details = Array.isArray(item.details) && item.details.length > 0
        ? `
          <div class="setup-permission-list">
            ${item.details.map((detail) => `
              <div class="setup-permission-row">
                <span>${escapeHtml(detail.label)}</span>
                <strong class="${detail.done ? "is-done" : "is-pending"}">
                  ${detail.done ? "✔" : "未設定"}
                </strong>
              </div>
            `).join("")}
          </div>
        `
        : "";

      return `
        <article class="setup-item">
          <div class="setup-item-header">
            <h3>${escapeHtml(item.title)}</h3>
            <span class="pill soft ${escapeHtml(badge.className)}">
              ${escapeHtml(badge.label)}
            </span>
          </div>
          ${summary}
          ${details}
          ${action}
        </article>
      `;
    }).join("");

    ui.setupChecklist.querySelectorAll(".setup-action-button").forEach((button) => {
      button.addEventListener("click", () => {
        openSupportTarget(button.dataset.target || "");
      });
    });
  }

  function buildSetupChecklist(
    platform,
    notificationPermission,
    microphonePermission,
    contactsPermission,
    backgroundExecutionAllowed,
  ) {
    const microphoneReady = microphonePermission === "granted";
    const contactsReady = platform !== "android" || contactsPermission === "granted";
    const requiredPermissionsReady = microphoneReady && contactsReady;
    const items = [
      {
        title: "必要な権限",
        status: requiredPermissionsReady ? "done" : "action",
        summary: "",
        details: [
          { label: "マイク", done: microphoneReady },
          ...(platform === "android" ? [{ label: "連絡帳", done: contactsReady }] : []),
        ],
        buttonLabel: platform === "android" ? "権限一覧" : "アプリ設定を開く",
        target: platform === "android" ? "permissions" : "app-settings",
        blocking: true,
      },
      {
        title: "通知",
        status: notificationPermission === "granted" ? "done" : "action",
        summary: notificationPermission === "granted"
          ? "着信通知を表示できます。"
          : "着信表示のために通知を許可してください。",
        buttonLabel: notificationPermission === "granted"
          ? ""
          : notificationPermission === "prompt"
            ? "通知を許可"
            : "通知設定を開く",
        target: notificationPermission === "prompt"
          ? "request-notifications"
          : "notifications",
        blocking: true,
      },
    ];

    if (platform === "android") {
      items.push({
        title: "バックグラウンドでの実行許可",
        status: backgroundExecutionAllowed ? "done" : "action",
        summary: backgroundExecutionAllowed
          ? "バックグラウンド着信を受け取れる設定です。"
          : "安定して着信を受け取るため、バッテリー最適化の対象外に設定してください。",
        buttonLabel: backgroundExecutionAllowed ? "" : "設定を開く",
        target: "battery-optimization",
        blocking: true,
      });
    }

    return {
      platform,
      items,
      hasBlockingItems: items.some((item) => item.blocking && item.status !== "done"),
    };
  }

  function getRegistrationLabel() {
    if (registrationState === "REGISTERED") return "接続済み";
    if (registrationState === "REGISTERING") return "接続中";
    if (registrationState === "FAILED") return "接続失敗";
    return "未登録";
  }

  function updateAccountStatusLabelVisibility(statusState) {
    if (!ui.accountStatusText || accountStatusLabelState === statusState) return;

    accountStatusLabelState = statusState;
    window.clearTimeout(accountStatusLabelTimerId);
    accountStatusLabelTimerId = null;
    ui.accountStatusText.classList.remove("is-auto-hidden");

    if (statusState !== "registered") return;

    accountStatusLabelTimerId = window.setTimeout(() => {
      accountStatusLabelTimerId = null;
      if (registrationState !== "REGISTERED") return;
      ui.accountStatusText?.classList.add("is-auto-hidden");
    }, REGISTERED_STATUS_LABEL_VISIBLE_MS);
  }

  function updateHomeChrome() {
    const homeMode = resolveHomeMode();
    const isMain = homeMode === "main";
    const isSettings = currentHomeTab === "settings";
    const isSubpage = isSettings && settingsPageMode !== "menu" && settingsPageMode !== "root";
    const isOverlay = contactOverlayMode !== "closed";
    const isAccountOnly = homeMode === "account";

    const accountLabel = getAccountLabel();
    const statusState = registrationState === "REGISTERED"
      ? "registered"
      : registrationState === "FAILED"
        ? "failed"
        : registrationState === "REGISTERING"
          ? "registering"
          : "unregistered";
    const statusLabel = getRegistrationLabel();

    if (ui.accountChipText) {
      ui.accountChipText.textContent = accountLabel;
    }

    if (ui.accountStatusDot) {
      ui.accountStatusDot.dataset.state = statusState;
    }

    if (ui.accountStatusText) {
      ui.accountStatusText.dataset.state = statusState;
      ui.accountStatusText.textContent = statusLabel;
      updateAccountStatusLabelVisibility(statusState);
    }

    if (ui.btnAccountSettings) {
      ui.btnAccountSettings.setAttribute("aria-label", `${accountLabel}、端末ステータス：${statusLabel}`);
    }

    if (ui.homeTitle) {
      ui.homeTitle.textContent = getPanelTitle();
    }

    if (ui.views?.home) {
      ui.views.home.dataset.homeMode = homeMode;
    }

    if (ui.btnBackNav) {
      ui.btnBackNav.hidden = !((isMain && isSettings) || isOverlay || homeMode === "setup");
    }

    if (ui.btnAccountSettings) {
      ui.btnAccountSettings.hidden = !isMain || isSettings || isOverlay;
    }

    if (ui.btnQuickSettings) {
      ui.btnQuickSettings.hidden = !isMain || isSettings || isOverlay;
    }

    if (ui.btnMenuClearHistory) {
      ui.btnMenuClearHistory.hidden = currentHomeTab !== "history";
    }

    if (ui.btnTopLogout) {
      ui.btnTopLogout.hidden = true;
    }

    if (ui.homeTabbar) {
      ui.homeTabbar.hidden = !isMain || isOverlay;
    }

    if (ui.tabSettings) {
      ui.tabSettings.hidden = true;
    }

    if (ui.btnOpenSetupGuide) {
      ui.btnOpenSetupGuide.hidden = !isAccountOnly || hasSeenSetupGuide();
    }

    document.querySelectorAll(".advanced-account-field").forEach((node) => {
      node.hidden = isAccountOnly;
    });

    if (ui.settingsConnectionPill) {
      ui.settingsConnectionPill.hidden = false;
      ui.settingsConnectionPill.dataset.state = registrationState.toLowerCase();
      ui.settingsConnectionPill.textContent = getRegistrationLabel();
    }

    if (ui.accountSettingsCard) {
      ui.accountSettingsCard.hidden = homeMode !== "account";
    }

    if (ui.settingsToolsCard) {
      ui.settingsToolsCard.hidden = !(isMain && isSettings);
    }

    renderSettingsPage();
  }
    function refreshUi() {
    const isRegistered = registrationState === "REGISTERED";
    const canDial = isRegistered;
    const hasSession = activeSession !== null;
    const inCall = callState === "INCALL";
    const callScreenActive = callState === "OUTGOING" || callState === "INCOMING" || callState === "INCALL";

    if (ui.btnLogin) ui.btnLogin.disabled = registrationState === "REGISTERING";
    if (ui.btnLogout) ui.btnLogout.disabled = !isRegistered && registrationState !== "REGISTERING";
    if (ui.btnTopLogout) ui.btnTopLogout.disabled = registrationState === "REGISTERING";

    if (ui.callButton) ui.callButton.disabled = !canDial || hasSession;
    if (ui.hangupButton) ui.hangupButton.disabled = !hasSession || callState === "INCOMING";

    if (ui.btnAnswerModal) ui.btnAnswerModal.disabled = callState !== "INCOMING";
    if (ui.btnRejectModal) ui.btnRejectModal.disabled = callState !== "INCOMING";

    if (ui.btnMute) ui.btnMute.disabled = !inCall;
    if (ui.btnHold) ui.btnHold.disabled = !inCall || holdOperationPending;
    if (ui.btnSpeaker) ui.btnSpeaker.disabled = !inCall;
    if (ui.btnTransfer) ui.btnTransfer.disabled = !inCall;
    if (ui.btnKeypad) ui.btnKeypad.disabled = !inCall;
    if (ui.btnHideKeypad) ui.btnHideKeypad.disabled = !inCall;
    if (ui.btnEndCall) ui.btnEndCall.disabled = !hasSession;
    if (ui.btnDoTransfer) ui.btnDoTransfer.disabled = !inCall;

    if (ui.regState) ui.regState.textContent = getRegistrationLabel();
    if (ui.callStateText) ui.callStateText.textContent = getCallStateLabel();

    ui.btnMute?.setAttribute("aria-pressed", isMuted ? "true" : "false");
    ui.btnSpeaker?.setAttribute("aria-pressed", isSpeakerEnabled ? "true" : "false");

    if (ui.btnSpeaker) {
      ui.btnSpeaker.innerHTML = '<span class="control-icon">◔</span><span>スピーカー</span>';
    }

    if (ui.btnHold) {
      ui.btnHold.innerHTML = `<span class="control-icon">Ⅱ</span><span>${isHeld ? "保留解除" : "保留"}</span>`;
    }

    if (!callScreenActive) {
      setDialpadMode("dial");
    }

    document.body.classList.toggle("is-registered", isRegistered);
    document.body.classList.toggle("is-incall", inCall);
    document.body.classList.toggle("is-incoming", callState === "INCOMING");
    document.body.classList.toggle("is-outgoing", callState === "OUTGOING");

    renderContactsAndFavorites();
    renderCallHistory();
    updateHomeChrome();
  }

  function bindNavigationEvents() {
    ui.btnLogin?.addEventListener("click", () => register({ navigateOnSuccess: true }));
    ui.btnLogout?.addEventListener("click", logout);
    ui.btnTopLogout?.addEventListener("click", logout);

    const swipeTabs = ["history", "dialer", "favorites", "contacts"];
    ui.tabHistory?.addEventListener("click", () => animateHomeTabTap("history"));
    ui.tabDialer?.addEventListener("click", () => animateHomeTabTap("dialer"));
    ui.tabContacts?.addEventListener("click", () => animateHomeTabTap("contacts"));
    ui.tabFavorites?.addEventListener("click", () => animateHomeTabTap("favorites"));

    ui.tabSettings?.addEventListener("click", () => openSettingsRoute("menu", { recordHistory: true }));
    ui.btnQuickSettings?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (ui.homeOverflowMenu) {
        ui.homeOverflowMenu.hidden = !ui.homeOverflowMenu.hidden;
      } else {
        openSettingsRoute("menu", { recordHistory: true });
      }
    });
    ui.btnMenuSettings?.addEventListener("click", () => {
      if (ui.homeOverflowMenu) ui.homeOverflowMenu.hidden = true;
      openSettingsRoute("menu", { recordHistory: true });
    });
    ui.btnMenuShareLog?.addEventListener("click", () => {
      if (ui.homeOverflowMenu) ui.homeOverflowMenu.hidden = true;
      shareDiagnostics();
    });
    ui.btnMenuLogout?.addEventListener("click", () => {
      if (ui.homeOverflowMenu) ui.homeOverflowMenu.hidden = true;
      logout();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!ui.homeOverflowMenu || ui.homeOverflowMenu.hidden) return;
      const target = event.target;
      if (
        target instanceof Element
        && (target.closest("#homeOverflowMenu") || target.closest("#btnQuickSettings"))
      ) return;
      event.preventDefault();
      event.stopPropagation();
      ui.homeOverflowMenu.hidden = true;
    }, true);
    ui.btnAccountSettings?.addEventListener("click", () => openSettingsRoute("account", { recordHistory: true }));

    ui.btnBackNav?.addEventListener("click", handleBackNavigation);

    let swipeGesture = null;
    let activeSwipeTransition = null;
    const resetSwipePanel = (panel, hide = false) => {
      if (!panel) return;
      panel.style.removeProperty("transform");
      panel.style.removeProperty("transition");
      panel.style.removeProperty("will-change");
      if (hide) panel.hidden = true;
    };
    const finalizeActiveSwipeTransition = () => {
      if (!activeSwipeTransition) return;
      const transition = activeSwipeTransition;
      activeSwipeTransition = null;
      window.cancelAnimationFrame(transition.frameId);
      window.clearTimeout(transition.timerId);
      ui.views.home?.classList.remove("is-swipe-transition");
      resetSwipePanel(transition.currentPanel);
      resetSwipePanel(transition.adjacentPanel, !transition.complete);
      if (transition.complete && transition.nextTab) navigateToHomeTab(transition.nextTab);
    };
    const finishSwipeGesture = (complete) => {
      if (!swipeGesture) return;
      const gesture = swipeGesture;
      swipeGesture = null;
      const { currentPanel, adjacentPanel, direction, width, nextTab } = gesture;
      const duration = complete ? 160 : 110;
      currentPanel.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      if (adjacentPanel) adjacentPanel.style.transition = currentPanel.style.transition;
      currentPanel.style.transform = `translate3d(${complete ? -direction * width : 0}px, 0, 0)`;
      if (adjacentPanel) {
        adjacentPanel.style.transform = `translate3d(${complete ? 0 : direction * width}px, 0, 0)`;
      }
      const transition = { currentPanel, adjacentPanel, complete, nextTab, timerId: 0 };
      activeSwipeTransition = transition;
      transition.timerId = window.setTimeout(finalizeActiveSwipeTransition, duration);
    };
    const animateHomeTabTap = (nextTab) => {
      finalizeActiveSwipeTransition();
      if (nextTab === currentHomeTab || !swipeTabs.includes(nextTab)) return;

      const currentIndex = swipeTabs.indexOf(currentHomeTab);
      const nextIndex = swipeTabs.indexOf(nextTab);
      const currentPanel = document.querySelector(`[data-home-panel="${currentHomeTab}"]`);
      const adjacentPanel = document.querySelector(`[data-home-panel="${nextTab}"]`);
      if (currentIndex < 0 || !currentPanel || !adjacentPanel) {
        navigateToHomeTab(nextTab);
        return;
      }

      const direction = nextIndex > currentIndex ? 1 : -1;
      const width = ui.views.home.clientWidth || window.innerWidth;
      const duration = 120;
      adjacentPanel.hidden = false;
      currentPanel.style.willChange = "transform";
      adjacentPanel.style.willChange = "transform";
      currentPanel.style.transform = "translate3d(0, 0, 0)";
      adjacentPanel.style.transform = `translate3d(${direction * width}px, 0, 0)`;
      ui.views.home.classList.add("is-swipe-transition");

      const transition = {
        currentPanel,
        adjacentPanel,
        complete: true,
        nextTab,
        frameId: 0,
        timerId: 0,
      };
      activeSwipeTransition = transition;
      transition.frameId = window.requestAnimationFrame(() => {
        if (activeSwipeTransition !== transition) return;
        const animation = `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
        currentPanel.style.transition = animation;
        adjacentPanel.style.transition = animation;
        currentPanel.style.transform = `translate3d(${-direction * width}px, 0, 0)`;
        adjacentPanel.style.transform = "translate3d(0, 0, 0)";
        transition.timerId = window.setTimeout(finalizeActiveSwipeTransition, duration);
      });
    };
    ui.views.home?.addEventListener("touchstart", (event) => {
      const touch = event.touches?.[0];
      const target = event.target;
      if (!touch || !swipeTabs.includes(currentHomeTab) || contactOverlayMode !== "closed") return;
      if (target?.closest?.("input, textarea, select, .overflow-menu, .sheet-overlay")) return;
      finalizeActiveSwipeTransition();
      const currentPanel = document.querySelector(`[data-home-panel="${currentHomeTab}"]`);
      if (!currentPanel) return;
      const startedAt = performance.now();
      swipeGesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        startedAt,
        lastTime: startedAt,
        velocityX: 0,
        width: ui.views.home.clientWidth || window.innerWidth,
        currentPanel,
        adjacentPanel: null,
        direction: 0,
        nextTab: "",
        dragging: false,
      };
    }, { passive: true });
    ui.views.home?.addEventListener("touchmove", (event) => {
      if (!swipeGesture) return;
      const touch = event.touches?.[0];
      if (!touch) return;
      const gesture = swipeGesture;
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (!gesture.dragging) {
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
          swipeGesture = null;
          return;
        }
        if (Math.abs(deltaX) < 8 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15) return;
        gesture.dragging = true;
      }
      event.preventDefault();
      const direction = deltaX < 0 ? 1 : -1;
      if (gesture.direction !== direction) {
        resetSwipePanel(gesture.adjacentPanel, true);
        const currentIndex = swipeTabs.indexOf(currentHomeTab);
        const nextIndex = currentIndex + direction;
        gesture.direction = direction;
        gesture.nextTab = swipeTabs[nextIndex] || "";
        gesture.adjacentPanel = gesture.nextTab
          ? document.querySelector(`[data-home-panel="${gesture.nextTab}"]`)
          : null;
        if (gesture.adjacentPanel) {
          gesture.adjacentPanel.hidden = false;
          gesture.adjacentPanel.style.willChange = "transform";
          ui.views.home.classList.add("is-swipe-transition");
        }
      }
      const now = performance.now();
      const elapsed = Math.max(1, now - gesture.lastTime);
      gesture.velocityX = (touch.clientX - gesture.lastX) / elapsed;
      gesture.lastX = touch.clientX;
      gesture.lastTime = now;
      const translatedX = gesture.adjacentPanel ? deltaX : deltaX * 0.22;
      gesture.currentPanel.style.willChange = "transform";
      gesture.currentPanel.style.transform = `translate3d(${translatedX}px, 0, 0)`;
      if (gesture.adjacentPanel) {
        gesture.adjacentPanel.style.transform = `translate3d(${translatedX + direction * gesture.width}px, 0, 0)`;
      }
    }, { passive: false });
    ui.views.home?.addEventListener("touchend", (event) => {
      if (!swipeGesture) return;
      const touch = event.changedTouches?.[0];
      const deltaX = touch ? touch.clientX - swipeGesture.startX : 0;
      const elapsed = Math.max(1, performance.now() - swipeGesture.startedAt);
      const averageVelocity = Math.abs(deltaX) / elapsed;
      const flickVelocity = Math.max(Math.abs(swipeGesture.velocityX), averageVelocity);
      const isShortFlick = Math.abs(deltaX) >= 16 && flickVelocity >= 0.28;
      const isDeliberateDrag = Math.abs(deltaX) >= swipeGesture.width * 0.34;
      const complete = Boolean(swipeGesture.adjacentPanel)
        && (isShortFlick || isDeliberateDrag);
      finishSwipeGesture(complete);
    }, { passive: true });
    ui.views.home?.addEventListener("touchcancel", () => {
      if (swipeGesture) finishSwipeGesture(false);
    }, { passive: true });

  }

  function bindHistoryEvents() {
    ui.btnMenuClearHistory?.addEventListener("click", () => {
      if (ui.homeOverflowMenu) ui.homeOverflowMenu.hidden = true;
      clearCallHistory();
    });

    ui.historyFilterAll?.addEventListener("click", () => {
      setHistoryFilter("all");
    });

    ui.historyFilterMissed?.addEventListener("click", () => {
      setHistoryFilter("missed");
    });

    ui.historyFilterOutgoing?.addEventListener("click", () => {
      setHistoryFilter("outgoing");
    });

    ui.historyFilterIncoming?.addEventListener("click", () => {
      setHistoryFilter("incoming");
    });

    const handleHistoryListClick = (event) => {
      const redialButton = event.target.closest(".history-redial-button");
      const detailButton = event.target.closest(".history-detail-trigger");

      if (!redialButton && !detailButton) return;

      event.preventDefault();
      event.stopPropagation();

      if (redialButton) {
        redialHistoryItem(redialButton.dataset.historyIndex);
        return;
      }

      detailButton.blur();
      detailButton.classList.add("is-opening-detail");
      window.setTimeout(() => detailButton.classList.remove("is-opening-detail"), 180);
      showHistoryDetails(
        detailButton.dataset.historyDetailIndex,
        detailButton.dataset.historySource || currentHomeTab || "history",
      );
    };

    ui.historyList?.addEventListener("click", handleHistoryListClick);
    ui.callHistoryList?.addEventListener("click", handleHistoryListClick);
  }

  function bindContactEvents() {
    ui.contactLookupInput?.addEventListener("input", () => {
      contactSearchQuery = String(ui.contactLookupInput?.value || "").trim();
      renderContactsAndFavorites();
    });

    ui.contactAvatarInput?.addEventListener("change", async () => {
      const [file] = ui.contactAvatarInput.files || [];
      if (!file) return;

      try {
        pendingContactAvatar = await createContactAvatarDataUrl(file);
        renderContactAvatar(ui.contactAvatarPreview, { avatar: pendingContactAvatar });
      } catch (error) {
        pendingContactAvatar = getContactById(activeContactId)?.avatar || "";
        renderContactAvatar(ui.contactAvatarPreview, { avatar: pendingContactAvatar });
        showUserError(error.message || "画像を設定できませんでした。");
      }
    });

    ui.contactSortMode?.addEventListener("change", () => {
      applyContactSortMode(ui.contactSortMode.value);
      renderContactsAndFavorites();
      showToast("連絡先の並び順を変更しました。");
    });

    ui.btnContactSort?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!ui.contactSortMenu) return;
      ui.contactSortMenu.hidden = !ui.contactSortMenu.hidden;
      ui.btnContactSort.setAttribute("aria-expanded", String(!ui.contactSortMenu.hidden));
    });

    ui.contactSortMenu?.addEventListener("click", (event) => {
      const item = event.target.closest("[data-contact-sort-mode]");
      if (!item) return;
      applyContactSortMode(item.dataset.contactSortMode);
      ui.contactSortMenu.hidden = true;
      ui.btnContactSort?.setAttribute("aria-expanded", "false");
      renderContactsAndFavorites();
      showToast("連絡先の並び順を変更しました。");
    });

    document.addEventListener("click", (event) => {
      if (!ui.contactSortMenu || ui.contactSortMenu.hidden) return;
      if (event.target.closest("#contactSortMenu") || event.target.closest("#btnContactSort")) return;
      ui.contactSortMenu.hidden = true;
      ui.btnContactSort?.setAttribute("aria-expanded", "false");
    });

    ui.btnAddContact?.addEventListener("click", () => {
      if (deviceContactsAvailable) {
        const opened = nativeBridge?.openCreateContact?.();
        if (!opened) showUserError("端末の連絡帳を開けませんでした。");
        return;
      }
      openContactOverlay("editor", "", currentHomeTab);
    });

    const handleContactListAction = (event) => {
      const favorite = event.target.closest("[data-contact-favorite]");
      const callButton = event.target.closest("[data-contact-call]");
      const openButton = event.target.closest("[data-contact-open]");
      const row = event.target.closest(".contact-row");

      if (favorite) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(favorite.dataset.contactFavorite);
        return;
      }

      if (callButton) {
        event.preventDefault();
        event.stopPropagation();
        callContactById(callButton.dataset.contactCall);
        return;
      }

      const contactId = openButton?.dataset.contactOpen || row?.dataset.contactId;

      if (contactId) {
        event.preventDefault();
        if (row) {
          row.blur();
          row.classList.add("is-opening-detail");
          window.setTimeout(() => row.classList.remove("is-opening-detail"), 180);
        }
        openContactOverlay("detail", contactId, currentHomeTab);
      }
    };

    ui.contactsList?.addEventListener("click", handleContactListAction);
    ui.favoritesList?.addEventListener("click", handleContactListAction);

    ui.btnCloseContactOverlay?.addEventListener("click", closeContactOverlay);
    ui.contactOverlay?.addEventListener("click", (event) => {
      if (event.target === ui.contactOverlay && contactOverlayMode !== "closed") {
        closeContactOverlay();
      }
    });
    ui.btnSaveContact?.addEventListener("click", saveContactFromForm);

    ui.contactEditorView?.addEventListener("submit", (event) => {
      event.preventDefault();
      saveContactFromForm();
    });

    ui.btnEditContact?.addEventListener("click", () => {
      const contact = getContactById(activeContactId);
      if (contact?.nativeContactId) {
        const opened = nativeBridge?.openEditContact?.(contact.nativeContactId);
        if (!opened) showUserError("端末の連絡帳を開けませんでした。");
        return;
      }
      openContactOverlay("editor", activeContactId, activeContactSource);
    });

    ui.btnDeleteContact?.addEventListener("click", () => {
      deleteContactById(activeContactId);
    });

    ui.btnToggleFavorite?.addEventListener("click", () => {
      toggleFavorite(activeContactId);
    });

    ui.btnCallContact?.addEventListener("click", () => {
      callContactById(activeContactId);
    });

    ui.contactPhoneChoices?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-contact-number]");
      if (!button) return;
      callContactById(activeContactId, button.dataset.contactNumber);
    });

    window.addEventListener("scroll", scheduleVirtualContactRender, { passive: true });
    window.addEventListener("resize", scheduleVirtualContactRender, { passive: true });

  }

  function bindSettingsEvents() {
    const handleSettingsAction = (event) => {
      const routeButton = event.target.closest("[data-settings-route]");
      const actionButton = event.target.closest("[data-settings-action]");

      if (routeButton) {
        openSettingsRoute(routeButton.dataset.settingsRoute, { recordHistory: true });
        return;
      }

      if (!actionButton) return;

      if (actionButton.dataset.settingsAction === "logout") {
        logout();
      }

      if (actionButton.dataset.settingsAction === "share-log") {
        shareDiagnostics();
      }
    };

    ui.settingsToolsCard?.addEventListener("click", handleSettingsAction);
    ui.settingsRoot?.addEventListener("click", handleSettingsAction);

    ui.btnRefreshSetup?.addEventListener("click", () => {
      refreshSetupChecklist("user_refresh");
    });

    ui.btnProceedFromSetup?.addEventListener("click", proceedFromSetupView);
    ui.btnSkipSetup?.addEventListener("click", leaveSetupView);
    ui.btnOpenSetupGuide?.addEventListener("click", openSetupView);
  }

  function bindCallEvents() {
    ui.callButton?.addEventListener("click", call);

    ui.defaultDialMethod?.addEventListener("change", () => {
      saveConfig();
    });

    ui.storesJson?.addEventListener("change", () => {
      try {
        configuredStores = parseStoresFromInput();
        renderStoreSelector(getSelectedStoreId());
        saveConfig();
      } catch (error) {
        showUserError(`店舗設定の形式が正しくありません: ${error.message || "不明"}`);
      }
    });

    ui.selectedStoreId?.addEventListener("change", saveConfig);

    ui.hangupButton?.addEventListener("click", hangup);
    ui.btnEndCall?.addEventListener("click", hangup);

    ui.btnAnswerModal?.addEventListener("click", answerIncoming);
    ui.btnRejectModal?.addEventListener("click", rejectIncoming);

    ui.btnMute?.addEventListener("click", toggleMute);
    ui.btnHold?.addEventListener("click", toggleHold);
    ui.btnSpeaker?.addEventListener("click", toggleSpeaker);

    ui.btnTransfer?.addEventListener("click", () => {
      setDialpadMode(dialpadMode === "transfer" ? "dial" : "transfer");
    });

    ui.btnKeypad?.addEventListener("click", () => {
      setDialpadMode("keypad");
    });

    ui.btnHideKeypad?.addEventListener("click", () => {
      setDialpadMode("dial");
    });

    ui.btnDoTransfer?.addEventListener("click", transferCall);

    document.querySelectorAll(".digit").forEach((button) => {
      button.addEventListener("click", () => {
        appendDigit(button.dataset.digit || button.textContent || "");
      });
    });

    let backspaceHoldTimerId = null;
    let backspaceLongPressed = false;
    const getBackspaceInput = () => (
      callState === "INCALL" && dialpadMode === "transfer"
        ? ui.transferTarget
        : ui.targetUri
    );
    const cancelBackspaceHold = () => {
      window.clearTimeout(backspaceHoldTimerId);
      backspaceHoldTimerId = null;
      ui.backspaceButton?.classList.remove("is-long-press");
    };

    ui.backspaceButton?.addEventListener("pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      backspaceLongPressed = false;
      cancelBackspaceHold();
      backspaceHoldTimerId = window.setTimeout(() => {
        backspaceHoldTimerId = null;
        backspaceLongPressed = true;
        const input = getBackspaceInput();
        if (input) input.value = "";
        ui.backspaceButton?.classList.add("is-long-press");
      }, 500);
    });
    ui.backspaceButton?.addEventListener("pointerup", cancelBackspaceHold);
    ui.backspaceButton?.addEventListener("pointercancel", cancelBackspaceHold);
    ui.backspaceButton?.addEventListener("pointerleave", cancelBackspaceHold);
    ui.backspaceButton?.addEventListener("contextmenu", (event) => event.preventDefault());

    ui.backspaceButton?.addEventListener("click", (event) => {
      if (backspaceLongPressed) {
        event.preventDefault();
        backspaceLongPressed = false;
        return;
      }

      if (callState === "INCALL" && dialpadMode === "transfer") {
        ui.transferTarget.value = ui.transferTarget.value.slice(0, -1);
        return;
      }

      ui.targetUri.value = ui.targetUri.value.slice(0, -1);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dialpadMode !== "dial") {
        setDialpadMode("dial");
      }
    });
  }

  function bindUiEventsOnce() {
    bindNavigationEvents();
    bindHistoryEvents();
    bindContactEvents();
    bindSettingsEvents();
    bindCallEvents();
  }

  function ensureElement(id, tagName = "div", className = "") {
    let element = $(id);

    if (element) return element;

    element = document.createElement(tagName);
    element.id = id;

    if (className) {
      element.className = className;
    }

    document.body.appendChild(element);

    return element;
  }

  function initUiRefs() {
    document.body.classList.add("webrtc-phone-app");

    const homeView = $("view-home") || document.querySelector(".view-home") || ensureElement("view-home");
    const incallView = $("view-incall") || document.querySelector(".view-incall") || ensureElement("view-incall");

    const homePanels = {
      setup: $("panel-setup") || document.querySelector("[data-panel='setup']"),
      dialer: $("panel-dialer") || document.querySelector("[data-panel='dialer']"),
      history: $("panel-history") || document.querySelector("[data-panel='history']"),
      contacts: $("panel-contacts") || document.querySelector("[data-panel='contacts']"),
      favorites: $("panel-favorites") || document.querySelector("[data-panel='favorites']"),
      settings: $("panel-settings") || document.querySelector("[data-panel='settings']"),
    };

    ui = {
      views: {
        home: homeView,
        incall: incallView,
      },

      homePanels,

      homeTitle: $("homeTitle") || document.querySelector(".home-title"),
      homeTabbar: $("homeTabbar") || document.querySelector(".home-tabbar") || document.querySelector(".floating-tabbar"),
      accountChipText: $("accountChipText"),
      accountStatusDot: $("accountStatusDot"),
      accountStatusText: $("accountStatusText"),

      tabHistory: $("tabHistory") || document.querySelector("[data-tab='history']"),
      tabDialer: $("tabDialer") || document.querySelector("[data-tab='dialer']"),
      tabContacts: $("tabContacts") || document.querySelector("[data-tab='contacts']"),
      tabFavorites: $("tabFavorites") || document.querySelector("[data-tab='favorites']"),
      tabSettings: $("tabSettings") || document.querySelector("[data-tab='settings']"),

      btnBackNav: $("btnBackNav"),
      btnQuickSettings: $("btnQuickSettings"),
      btnAccountSettings: $("btnAccountSettings"),
      btnOpenSetupGuide: $("btnOpenSetupGuide"),
      homeOverflowMenu: $("homeOverflowMenu"),
      btnMenuSettings: $("btnMenuSettings"),
      btnMenuShareLog: $("btnMenuShareLog"),
      btnMenuClearHistory: $("btnMenuClearHistory"),
      btnMenuLogout: $("btnMenuLogout"),

      wsUrl: $("wsUrl") || ensureElement("wsUrl", "input"),
      sipUri: $("sipUri") || ensureElement("sipUri", "input"),
      authUser: $("authUser") || ensureElement("authUser", "input"),
      password: $("password") || ensureElement("password", "input"),

      defaultDialMethod: $("defaultDialMethod"),
      storesJson: $("storesJson"),
      storeSelectArea: $("storeSelectArea"),
      selectedStoreId: $("selectedStoreId"),

      btnLogin: $("btnLogin"),
      btnLogout: $("btnLogout"),
      btnTopLogout: $("btnTopLogout"),

      targetUri: $("targetUri") || $("dialInput"),
      callButton: $("callButton") || $("btnCall"),
      hangupButton: $("hangupButton") || $("btnHangup"),
      backspaceButton: $("backspaceButton") || $("btnBackspace"),

      regState: $("regState"),
      callStateText: $("callStateText"),
      alertMessage: $("alertMessage") || ensureElement("alertMessage", "div", "alert-message"),

      incomingModal: $("incomingModal") || $("modal-incoming") || $("incomingCallScreen") || ensureElement("incomingModal"),
      incomingNumber: $("incomingNumber") || $("incoming-number") || $("incomingCallerName") || ensureElement("incomingNumber"),
      btnAnswerModal: $("btnAnswerModal") || $("answerBtn"),
      btnRejectModal: $("btnRejectModal") || $("declineBtn"),

      remoteParty: $("remoteParty") || $("callerName") || ensureElement("remoteParty"),
      remotePartySub: $("remotePartySub"),
      callTimer: $("callTimer") || ensureElement("callTimer"),
      remoteAudio: $("remoteAudio") || ensureElement("remoteAudio", "audio"),

      incallSurface: $("incallSurface") || incallView,
      incallKeypad: $("incallKeypad"),
      incallKeypadScreen: $("incallKeypadScreen"),
      transferArea: $("transferArea"),
      transferTarget: $("transferTarget") || ensureElement("transferTarget", "input"),
      dtmfDisplay: $("dtmfDisplay") || $("dtmf-display"),

      btnMute: $("btnMute") || $("muteBtn"),
      btnHold: $("btnHold"),
      btnSpeaker: $("btnSpeaker"),
      btnTransfer: $("btnTransfer"),
      btnKeypad: $("btnKeypad"),
      btnHideKeypad: $("btnHideKeypad"),
      btnEndCall: $("btnEndCall") || $("endCallBtn"),
      btnDoTransfer: $("btnDoTransfer"),

      historyFilterAll: $("historyFilterAll"),
      historyFilterIncoming: $("historyFilterIncoming"),
      historyFilterOutgoing: $("historyFilterOutgoing"),
      historyFilterMissed: $("historyFilterMissed"),
      historyFilterValue: "all",

      historyList: $("historyList") || $("history-list"),
      callHistoryList: $("callHistoryList"),
      contactsList: $("contactsList"),
      favoritesList: $("favoritesList"),
      contactLookupInput: $("contactLookupInput"),
      contactSearchShell: $("contactSearchShell"),
      contactLookupResult: $("contactLookupResult"),
      btnAddContact: $("btnAddContact"),
      btnContactSort: $("btnContactSort"),
      contactSortMode: $("contactSortMode") || $("contactSortQuick"),
      contactSortMenu: $("contactSortMenu"),

      contactOverlay: $("contactOverlay"),
      contactOverlayTitle: $("contactOverlayTitle"),
      contactDetailView: $("contactDetailView"),
      historyDetailView: $("historyDetailView"),
      contactEditorView: $("contactEditorView"),
      btnCloseContactOverlay: $("btnCloseContactOverlay"),
      btnSaveContact: $("btnSaveContact"),
      btnEditContact: $("btnEditContact"),
      btnDeleteContact: $("btnDeleteContact"),
      btnToggleFavorite: $("btnToggleFavorite"),
      btnCallContact: $("btnCallContact"),
      contactAvatar: $("contactAvatar"),
      contactAvatarPreview: $("contactAvatarPreview"),
      contactDetailName: $("contactDetailName"),
      contactDetailTarget: $("contactDetailTarget"),
      contactInfoName: $("contactInfoName"),
      contactInfoTarget: $("contactInfoTarget"),
      contactInfoNote: $("contactInfoNote"),
      contactPhoneChoices: $("contactPhoneChoices"),

      contactNameInput: $("contactNameInput"),
      contactTargetInput: $("contactTargetInput"),
      contactPhoneInput: $("contactPhoneInput"),
      contactSipInput: $("contactSipInput"),
      contactNoteInput: $("contactNoteInput"),
      contactFavoriteInput: $("contactFavoriteInput"),
      contactAvatarInput: $("contactAvatarInput"),

      settingsRoot: $("settingsRoot"),
      settingsSubpage: $("settingsSubpage"),
      settingsToolsCard: $("settingsToolsCard"),
      settingsConnectionPill: $("settingsConnectionPill"),
      accountSettingsCard: $("accountSettingsCard"),

      setupPlatformBadge: $("setupPlatformBadge"),
      setupSummary: $("setupSummary"),
      setupChecklist: $("setupChecklist"),
      btnRefreshSetup: $("btnRefreshSetup"),
      btnProceedFromSetup: $("btnProceedFromSetup"),
      btnSkipSetup: $("btnSkipSetup"),

      logsView: $("view-logs") || $("logsView") || $("debugLogs"),
      logOutput: $("logOutput"),
    };

    if (ui.remoteAudio && ui.remoteAudio.tagName !== "AUDIO") {
      const audio = document.createElement("audio");
      audio.id = "remoteAudio";
      audio.autoplay = true;
      audio.playsInline = true;
      document.body.appendChild(audio);
      ui.remoteAudio = audio;
    }

    if (ui.defaultDialMethod && !ui.defaultDialMethod.value) {
      ui.defaultDialMethod.value = DEFAULT_DIAL_METHOD;
    }

    if (ui.alertMessage) {
      ui.alertMessage.hidden = true;
      setupUserErrorDismissGesture();
    }

    if (ui.tabSettings) {
      ui.tabSettings.hidden = true;
    }

    if (ui.btnTopLogout) {
      ui.btnTopLogout.hidden = true;
    }

  }

  function exposeNativeBridgeApi() {
    window.WebRTCPhone = {
      answerIncoming() {
        pendingIncomingDecision = "answer";
        answerIncoming();
      },

      handlePushAnswerIntent(payload = {}) {
        return handlePushAnswerIntent(payload);
      },

      cancelPushAnswer(reason = "native_cancel", callId = "") {
        return cancelAgiPushAnswer(reason, callId);
      },

      rejectIncoming() {
        pendingIncomingDecision = "reject";
        rejectIncoming();
      },

      hangup() {
        hangup();
      },

      handleBack() {
        return handleBackNavigation();
      },

      refreshDeviceContacts() {
        return refreshDeviceContacts();
      },

      refreshSupportInfo(payload) {
        if (payload && typeof payload === "object") {
          window.__nativeSupportInfo = payload;
        }

        readNativeSupportInfo();
        applyPlatformTheme();
        refreshSetupChecklist("native_refresh", { quiet: true });
      },

      updateNetworkInfo(payload) {
        if (payload && typeof payload === "object") {
          window.__nativeNetworkInfo = payload;
          window.dispatchEvent(new Event("native-network-change"));
        }
      },

      completeContactLookup(requestId, name) {
        return completeNativeContactLookup(requestId, name);
      },

      incomingCall(payload = {}) {
        const from = payload.from || payload.target || payload.phone || "不明";
        pendingIncomingCtiName = getPayloadCtiDisplayName(payload);

        if (callState === "IDLE") {
          showIncomingModal(from);
          setCallState("INCOMING");
        }

        resolveIncomingParty(from, pendingIncomingCtiName).then((party) => {
          pendingIncomingFrom = party.target;
          applyResolvedIncomingParty(party);
        });
      },

      sendDiagnostics(reason = "manual") {
        log(`Native requested diagnostics: ${reason}`);
        return shareDiagnostics();
      },

      onLogUploadResult(success, reason, detail = "") {
        if (success) {
          log(`Native log upload completed: reason=${reason}`);
          showToast("ログを送信しました。", "success");
          return;
        }

        const failureCode = classifyLogSendFailure({ message: detail });
        errorLog(`Native log upload failed: reason=${reason} code=${failureCode} detail=${detail}`);
        showUserError("ログ送信に失敗しました。ログを確認してください。");
      },

      applyProvisioning(payload = {}) {
        try {
          const sourcePayload = typeof payload === "string"
            ? decodeProvisioningPayload(payload)
            : normalizeProvisioningInput(payload);
          const autoRegister = isEnabledProvisioningValue(sourcePayload?.autoRegister)
            || isEnabledProvisioningValue(sourcePayload?.autoLogin);
          const result = applyProvisioningConfig(sourcePayload, {
            source: "native_bridge",
            autoRegister,
            startTestAgent: true,
          });
          refreshSetupChecklist("native_provisioning", { quiet: true });
          return result.applied || result.fallback;
        } catch (error) {
          errorLog(`Native provisioning apply failed: code=${String(error?.code || "unknown")} detail=${describeError(error)}`);
          const stored = readStoredConfig();
          if (hasProvisioningLikeConfig(stored.config)) {
            fillConfigForm(stored.config);
            warn("Native provisioning failed; continued with existing stored config.");
            return false;
          }
          showUserError("\u30d7\u30ed\u30d3\u30b8\u30e7\u30cb\u30f3\u30b0\u306e\u9069\u7528\u306b\u5931\u6557\u3057\u307e\u3057\u305f\u3002");
          return false;
        }
      },

      getState() {
        return {
          registrationState,
          callState,
          isHeld,
          isMuted,
          isSpeakerEnabled,
          currentHomeTab,
          dialpadMode,
        };
      },
    };

    window.onNativeSupportInfo = (payload) => {
      window.WebRTCPhone.refreshSupportInfo(payload);
    };

    window.onNativeNetworkInfo = (payload) => {
      window.WebRTCPhone.updateNetworkInfo(payload);
    };

    window.onNativeContactLookupResult = (requestId, name) => {
      window.WebRTCPhone.completeContactLookup(requestId, name);
    };
  }

  function getTestAgentStatus() {
    return {
      registrationState,
      callState,
      isHeld,
      isMuted,
      account: ui?.sipUri?.value?.trim?.() || "",
      currentRemoteLabel: ui?.remoteParty?.textContent || ui?.incomingNumber?.textContent || "",
      session: activeSession ? {
        callId: getActiveCallId(),
        direction: activeSession.direction || "",
        remote: activeSession.remote_identity?.uri?.toString?.() || "",
      } : null,
    };
  }

  function waitForOutgoingCommandResult(session) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const listeners = [];
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        for (const [name, listener] of listeners) session.removeListener?.(name, listener);
      };
      const finish = (handler) => (event = {}) => {
        if (settled) return;
        settled = true;
        cleanup();
        handler(event);
      };
      const succeeded = finish(() => resolve({ accepted: true }));
      const failed = finish((event) => {
        const response = event.message || event.response;
        const statusCode = response?.status_code || response?.statusCode || "";
        const reason = response?.reason_phrase || response?.reasonPhrase || event.cause || "不明";
        reject(new Error(`発信に失敗しました: ${statusCode ? `${statusCode} ` : ""}${reason}`));
      });
      for (const name of ["progress", "accepted", "confirmed"]) {
        session.on(name, succeeded);
        listeners.push([name, succeeded]);
      }
      session.on("failed", failed);
      listeners.push(["failed", failed]);
      const timeoutId = window.setTimeout(finish(() => reject(new Error("発信結果の待機がタイムアウトしました。"))), 25000);
    });
  }

  function createTestAgentApi() {
    return {
      ping: () => ({ ok: true, deviceId: testAgent?.deviceId || "" }),
      getStatus: getTestAgentStatus,
      getCurrentSession: () => getTestAgentStatus().session,
      getAccount: () => getTestAgentStatus().account,
      register: async () => { await register(); return { accepted: true, ...getTestAgentStatus() }; },
      call: async (target) => {
        if (!String(target || "").trim()) return { accepted: false, reason: "発信先は必須です。" };
        if (ui.targetUri) ui.targetUri.value = String(target).trim();
        if (ui.defaultDialMethod) ui.defaultDialMethod.value = "sip";
        const session = await call();
        if (!session) return { accepted: false, reason: "発信セッションを開始できませんでした。", ...getTestAgentStatus() };
        await waitForOutgoingCommandResult(session);
        return { accepted: true, ...getTestAgentStatus() };
      },
      answer: async () => {
        if (!activeSession || callState !== "INCOMING") {
          return { accepted: false, reason: "応答可能な着信がありません。", ...getTestAgentStatus() };
        }
        if (testAgentCurrentCommandId) testAgentSessionCommandIds.set(activeSession, testAgentCurrentCommandId);
        await answerIncoming();
        return { accepted: true, ...getTestAgentStatus() };
      },
      hangup: () => {
        if (!activeSession) return { accepted: false, reason: "切断可能な通話がありません。", ...getTestAgentStatus() };
        if (testAgentCurrentCommandId) testAgentSessionCommandIds.set(activeSession, testAgentCurrentCommandId);
        hangup();
        return { accepted: true, ...getTestAgentStatus() };
      },
      hold: () => ({ accepted: setHoldState(true), ...getTestAgentStatus() }),
      resume: () => ({ accepted: setHoldState(false), ...getTestAgentStatus() }),
      transfer: async (target) => {
        if (testAgentCurrentCommandId && activeSession) testAgentSessionCommandIds.set(activeSession, testAgentCurrentCommandId);
        const result = await transferToTargetAndWait(target);
        return { accepted: true, target: result.target, ...getTestAgentStatus() };
      },
    };
  }

  function stopTestAgent(reason = "disabled") {
    if (testAgent?.commandTimerId) window.clearInterval(testAgent.commandTimerId);
    if (testAgent?.heartbeatTimerId) window.clearInterval(testAgent.heartbeatTimerId);
    if (testAgent) log(`Test agent stopped: ${reason}`);
    testAgent = null;
    if (window.WebRTCPhone) delete window.WebRTCPhone.testAgent;
  }

  function startTestAgent() {
    const { enabled, baseUrl, deviceId } = testAgentSettings;
    if (!enabled) {
      stopTestAgent("not enabled");
      return false;
    }
    if (!baseUrl || !deviceId) {
      stopTestAgent("configuration incomplete");
      warn(`Test agent not started: ${!baseUrl ? "testAgentBaseUrl" : "deviceId"} is missing.`);
      return false;
    }
    try {
      const parsedBaseUrl = new URL(baseUrl);
      if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) throw new Error("unsupported protocol");
    } catch (_error) {
      stopTestAgent("invalid base URL");
      warn("Test agent not started: testAgentBaseUrl is invalid.");
      return false;
    }
    if (testAgent?.enabled && testAgent.baseUrl === baseUrl && testAgent.deviceId === deviceId) {
      return true;
    }
    stopTestAgent("configuration changed");
    const agent = {
      enabled: true,
      baseUrl,
      deviceId,
      commandTimerId: null,
      heartbeatTimerId: null,
      connectionState: "unknown",
      pollPending: false,
      heartbeatPending: false,
    };
    testAgent = agent;
    if (window.WebRTCPhone) window.WebRTCPhone.testAgent = createTestAgentApi();

    const reportConnection = (connected, detail = "") => {
      if (testAgent !== agent) return;
      const next = connected ? "connected" : "failed";
      if (agent.connectionState !== next) {
        log(`Test agent connection ${next}: ${baseUrl}${detail ? ` (${detail})` : ""}`, connected ? "info" : "warn");
        agent.connectionState = next;
      }
    };

    const pollCommands = async () => {
      if (testAgent !== agent || !agent.enabled || agent.pollPending) return;
      agent.pollPending = true;
      try {
        const result = await testAgentRequest(`/devices/${encodeURIComponent(deviceId)}/commands`);
        reportConnection(true);
        for (const command of result?.commands || []) {
          const commandId = String(command?.id || command?.commandId || "");
          let outcome = commandId ? testAgentCommandResults.get(commandId) : null;
          if (outcome) {
            log(`重複コマンドを再実行せず、保存済み結果を返します: commandId=${commandId}`, "warn");
          } else {
            outcome = { ok: true };
            testAgentCurrentCommandId = commandId || null;
            try {
              const commandResult = await handleTestAgentCommand(command);
              if (commandResult?.accepted === false) {
                outcome = { ok: false, error: commandResult.reason || "コマンドを受け付けられませんでした。" };
              }
            } catch (error) {
              outcome = { ok: false, error: error.message || "不明なエラー" };
              errorLog(`Test Agent コマンド失敗: type=${command?.type || "不明"} detail=${outcome.error}`);
            } finally {
              testAgentCurrentCommandId = null;
            }
            if (commandId) {
              testAgentCommandResults.set(commandId, outcome);
              if (testAgentCommandResults.size > 100) {
                testAgentCommandResults.delete(testAgentCommandResults.keys().next().value);
              }
            }
          }
          if (commandId) {
            await testAgentRequest(`/commands/${encodeURIComponent(commandId)}/done`, {
              method: "POST",
              body: JSON.stringify(outcome),
            });
          }
        }
      } catch (error) {
        reportConnection(false, error.message || "unknown");
      } finally {
        agent.pollPending = false;
      }
    };

    const heartbeat = async () => {
      if (testAgent !== agent || agent.heartbeatPending) return;
      agent.heartbeatPending = true;
      try {
        await testAgentRequest("/events", {
          method: "POST",
          body: JSON.stringify({
            deviceId,
            event: "agent.heartbeat",
            timestamp: Date.now(),
            commandId: null,
            callId: null,
            data: testAgentDetails({ online: navigator.onLine, platform: getPlatform(), registrationState, callState }),
          }),
        });
        reportConnection(true);
      } catch (error) {
        reportConnection(false, error.message || "unknown");
      } finally {
        agent.heartbeatPending = false;
      }
    };

    agent.commandTimerId = window.setInterval(pollCommands, TEST_AGENT_POLL_MILLIS);
    agent.heartbeatTimerId = window.setInterval(heartbeat, TEST_AGENT_HEARTBEAT_MILLIS);
    pollCommands();
    heartbeat();
    log(`Test agent started: ${baseUrl}, deviceId=${deviceId}`);
    return true;
  }

  async function handleTestAgentCommand(command) {
    const type = String(command?.type || "");
    const payload = { ...command, ...(command?.payload || {}) };
    const api = createTestAgentApi();
    log(`test-agent command: ${type}`);
    if (type === "register") return api.register();
    if (type === "logout" || type === "unregister") return logout();
    if (type === "call") return api.call(payload.target || payload.to);
    if (type === "hangup") return api.hangup();
    if (type === "answer") return api.answer();
    if (type === "hold") return api.hold();
    if (type === "resume") return api.resume();
    if (type === "transfer") return api.transfer(payload.target || payload.to);
    if (type === "reject") return rejectIncoming();
    if (type === "dtmf") return sendDtmf(payload.digit || "");
    if (type === "shareDiagnostics") return shareDiagnostics();
    throw new Error(`未対応の Test Agent コマンドです: ${type || "空"}`);
  }

  async function initialize() {
    initUiRefs();

    nativeBridge = createNativeBridge();

    ensureInstallId();
    loadLastUserAction();
    readDiagnosticLogs();
    renderDiagnosticLogs();

    installGlobalErrorLogging();
    installNetworkStateLogging();
    installUserActivityTracking();
    installSelectBehavior();

    loadSavedConfig();
    await applyProvisioningFromUrl();
    applyTestBootConfigFromUrl();

    refreshDeviceContacts();
    readContacts();
    renderContactsAndFavorites();
    renderCallHistory();

    bindUiEventsOnce();
    exposeNativeBridgeApi();

    await setupRemoteAudioElement();

    window.addEventListener("native-support-updated", () => {
      readNativeSupportInfo();
      applyPlatformTheme();
      refreshSetupChecklist("native_update", { quiet: true });
      syncAgiDeviceRegistration("native_update").catch((error) => {
        warn(`AGI device registration failed: ${describeError(error)}`);
      });
    });

    window.addEventListener("focus", () => {
      refreshDeviceContacts();
      refreshSetupChecklist("window_focus", { quiet: true });
    });

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        refreshDeviceContacts();
        refreshSetupChecklist("visible", { quiet: true });
      }
    });

    document.addEventListener("ios-audio-unlocked", () => {
      log("iOS audio unlocked event received.");
      playRemoteAudio();
    });

    applyPlatformTheme();

    if (shouldAutoRegisterOnStartup()) {
      log("Saved SIP configuration found. Starting automatic registration.");
      register().catch((error) => {
        errorLog(`Auto register on startup failed: ${describeError(error)}`);
      });
    }

    showView("view-home");
    showHomeTab(getDefaultHomeTab());
    hideIncomingModal();
    refreshUi();
    checkDevMode();

    log("Application initialized.");
    log(`WebRTC environment: isSecureContext=${window.isSecureContext}, mediaDevices=${Boolean(navigator.mediaDevices)}, getUserMedia=${Boolean(navigator.mediaDevices?.getUserMedia)}`);

    await refreshSetupChecklist("startup", { quiet: true });
    syncAgiDeviceRegistration("startup").catch((error) => {
      warn(`AGI device registration failed: ${describeError(error)}`);
    });

    if (shouldShowSetupOnLaunch()) {
      showHomeTab("setup");
    }

    nativeBridge?.notifyReady?.();
    startTestAgent();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initialize().catch((error) => {
        errorLog(`Application initialization failed: ${describeError(error)}`);
      });
    });
  } else {
    initialize().catch((error) => {
      errorLog(`Application initialization failed: ${describeError(error)}`);
    });
  }
})();
