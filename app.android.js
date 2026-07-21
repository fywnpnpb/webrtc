(() => {
  const $ = (id) => document.getElementById(id);
  const CONFIG_STORAGE_KEY = "minimal-webrtc-sip-phone.config.v1";
  const DEFAULT_DIAL_METHOD = "sip";
  const SUPPORTED_DIAL_METHODS = /* @__PURE__ */ new Set(["sip", "mobile", "shop"]);
  const CALL_HISTORY_STORAGE_KEY = "minimal-webrtc-sip-phone.call-history.v1";
  const CONTACTS_STORAGE_KEY = "minimal-webrtc-sip-phone.contacts.v1";
  const DEVICE_CONTACT_META_STORAGE_KEY = "minimal-webrtc-sip-phone.device-contact-meta.v1";
  const CONTACT_PREFS_STORAGE_KEY = "minimal-webrtc-sip-phone.contact-prefs.v1";
  const DIAGNOSTIC_LOG_STORAGE_KEY = "minimal-webrtc-sip-phone.diagnostic-log.v1";
  const SETUP_GUIDE_SEEN_STORAGE_KEY = "minimal-webrtc-sip-phone.setup-guide-seen.v1";
  const INSTALLATION_ID_STORAGE_KEY = "minimal-webrtc-sip-phone.installation-id.v1";
  const LAST_USER_ACTION_STORAGE_KEY = "minimal-webrtc-sip-phone.last-user-action.v1";
  const MAX_CALL_HISTORY_ITEMS = 20;
  const MAX_DIAGNOSTIC_LOG_LINES = 1e3;
  const CONTACT_VIRTUALIZATION_THRESHOLD = 60;
  const CONTACT_VIRTUAL_ROW_HEIGHT = 70;
  const CONTACT_VIRTUAL_OVERSCAN = 8;
  const NETWORK_STATS_INTERVAL_MILLIS = 5e3;
  const TEST_AGENT_POLL_MILLIS = 1e3;
  const TEST_AGENT_HEARTBEAT_MILLIS = 5e3;
  const TEST_AGENT_REQUEST_TIMEOUT_MILLIS = 5e3;
  const DEV_SUPPORT_EMAIL = "dev.knowledgeflow@gmail.com";
  const LOG_SEND_API_URL = "https://dental-apo.jp/ajax/api/sptest";
  const LOG_SEND_PART_CHARS = 7e3;
  const LOG_SEND_TIMEOUT_MS = 15e3;
  const AGI_API_BASE_URL = "https://test202606.mimio.jp/agi-api";
  const AGI_API_TIMEOUT_MS = 1e4;
  const PROVISIONING_FETCH_TIMEOUT_MS = 15e3;
  const PUSH_INVITE_WAIT_TIMEOUT_MS = 6e4;
  const SIP_WS_KEEPALIVE_INTERVAL_MS = 3e4;
  const REGISTRATION_RECOVERY_GRACE_MS = 8e3;
  const REGISTERED_STATUS_LABEL_VISIBLE_MS = 2500;
  const MICROPHONE_NOT_FOUND_MESSAGE = "\u30DE\u30A4\u30AF\u304C\u691C\u51FA\u3055\u308C\u307E\u305B\u3093\u3002\u7AEF\u672B\u306E\u63A5\u7D9A\u3068\u6A29\u9650\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
  const DEFAULT_CONTACT_SORT_MODE = "name";
  const CALL_OPTIONS = {
    mediaConstraints: { audio: true, video: false },
    rtcOfferConstraints: {
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    }
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
  const testAgentSessionCommandIds = /* @__PURE__ */ new WeakMap();
  const testAgentCommandResults = /* @__PURE__ */ new Map();
  let agiDeviceRegistrationKey = "";
  const agiDialRequestCallIds = /* @__PURE__ */ new Set();
  let configuredStores = [];
  let deviceContacts = [];
  let deviceContactsAvailable = false;
  let deviceContactsPermissionPending = false;
  let deviceContactsSignature = "";
  let contactsRevision = 0;
  let lastContactsRenderKey = "";
  const virtualContactListStates = /* @__PURE__ */ new Map();
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
  const pendingNativeContactRequests = /* @__PURE__ */ new Map();
  const japaneseCollator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });
  function createNativeBridge() {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const android = window.AndroidPhone || null;
    const iosAudio = ((_b = (_a = window.webkit) == null ? void 0 : _a.messageHandlers) == null ? void 0 : _b.iosNativeAudio) || null;
    const iosCall = ((_d = (_c = window.webkit) == null ? void 0 : _c.messageHandlers) == null ? void 0 : _d.iosNativeCall) || null;
    const iosSupport = ((_f = (_e = window.webkit) == null ? void 0 : _e.messageHandlers) == null ? void 0 : _f.iosNativeSupport) || null;
    const iosContacts = ((_h = (_g = window.webkit) == null ? void 0 : _g.messageHandlers) == null ? void 0 : _h.iosNativeContacts) || null;
    return {
      usesNativeLogStore: Boolean(android == null ? void 0 : android.getMailLogText),
      notifyReady() {
        var _a2;
        (_a2 = android == null ? void 0 : android.notifyReady) == null ? void 0 : _a2.call(android);
      },
      postAudio(message) {
        var _a2, _b2, _c2, _d2;
        const action = (message == null ? void 0 : message.action) || "";
        const speaker = Boolean(message == null ? void 0 : message.speaker);
        if (action === "start") {
          (_a2 = android == null ? void 0 : android.prepareAudioForCall) == null ? void 0 : _a2.call(android);
          (_b2 = android == null ? void 0 : android.setSpeakerphoneEnabled) == null ? void 0 : _b2.call(android, speaker);
        } else if (action === "route") {
          (_c2 = android == null ? void 0 : android.setSpeakerphoneEnabled) == null ? void 0 : _c2.call(android, speaker);
        } else if (action === "stop") {
          (_d2 = android == null ? void 0 : android.clearAudioForCall) == null ? void 0 : _d2.call(android);
        }
        iosAudio == null ? void 0 : iosAudio.postMessage(message);
      },
      cancelIncomingCallNotification() {
        var _a2;
        (_a2 = android == null ? void 0 : android.cancelIncomingCallNotification) == null ? void 0 : _a2.call(android);
        iosCall == null ? void 0 : iosCall.postMessage({ action: "stopIncomingCallControl" });
      },
      notifyPushInviteReady(payload) {
        var _a2;
        try {
          (_a2 = android == null ? void 0 : android.notifyPushInviteReady) == null ? void 0 : _a2.call(android, String((payload == null ? void 0 : payload.callId) || ""), String((payload == null ? void 0 : payload.caller) || (payload == null ? void 0 : payload.fromUri) || ""), String((payload == null ? void 0 : payload.sipUri) || ""), String((payload == null ? void 0 : payload.receivedAt) || ""));
        } catch (error) {
          warn(`Push INVITE ready notification failed: ${error.message || "unknown"}`);
        }
        iosCall == null ? void 0 : iosCall.postMessage({
          action: "inviteReady",
          callId: String((payload == null ? void 0 : payload.callId) || ""),
          caller: String((payload == null ? void 0 : payload.caller) || (payload == null ? void 0 : payload.fromUri) || ""),
          sipUri: String((payload == null ? void 0 : payload.sipUri) || ""),
          receivedAt: String((payload == null ? void 0 : payload.receivedAt) || "")
        });
      },
      confirmPushInviteAccepted(payload) {
        iosCall == null ? void 0 : iosCall.postMessage({
          action: "inviteAccepted",
          callId: String((payload == null ? void 0 : payload.callId) || "")
        });
      },
      requestSupportInfo() {
        iosSupport == null ? void 0 : iosSupport.postMessage({ action: "refreshSupportInfo" });
      },
      lookupContactName(phoneNumber) {
        var _a2;
        const phone = String(phoneNumber || "").trim();
        if (!phone)
          return Promise.resolve("");
        try {
          const androidName = (_a2 = android == null ? void 0 : android.lookupContactName) == null ? void 0 : _a2.call(android, phone);
          if (androidName === "__permission_requested__") {
            return new Promise((resolve) => {
              let attempts = 0;
              const timerId = window.setInterval(() => {
                var _a3;
                attempts += 1;
                const retryName = (_a3 = android == null ? void 0 : android.lookupContactName) == null ? void 0 : _a3.call(android, phone);
                if (retryName && retryName !== "__permission_requested__") {
                  window.clearInterval(timerId);
                  resolve(String(retryName));
                } else if (attempts >= 15) {
                  window.clearInterval(timerId);
                  resolve("");
                }
              }, 1e3);
            });
          }
          if (androidName)
            return Promise.resolve(String(androidName));
        } catch (error) {
          warn(`Android contact lookup failed: ${error.message || "unknown"}`);
        }
        if (!iosContacts)
          return Promise.resolve("");
        const requestId = `contact-${Date.now()}-${nativeContactRequestSequence += 1}`;
        return new Promise((resolve) => {
          const timerId = window.setTimeout(() => {
            pendingNativeContactRequests.delete(requestId);
            resolve("");
          }, 5e3);
          pendingNativeContactRequests.set(requestId, { resolve, timerId });
          iosContacts.postMessage({ action: "lookup", requestId, phone });
        });
      },
      readDeviceContacts() {
        if (!(android == null ? void 0 : android.getDeviceContacts))
          return null;
        try {
          const raw = android.getDeviceContacts();
          if (raw === "__permission_requested__")
            return null;
          const contacts = JSON.parse(String(raw || "[]"));
          return Array.isArray(contacts) ? contacts : [];
        } catch (error) {
          warn(`Android contact list read failed: ${error.message || "unknown"}`);
          return [];
        }
      },
      openCreateContact() {
        var _a2;
        try {
          return Boolean((_a2 = android == null ? void 0 : android.openCreateContact) == null ? void 0 : _a2.call(android));
        } catch (error) {
          warn(`Android contact create screen failed: ${error.message || "unknown"}`);
          return false;
        }
      },
      openEditContact(contactId) {
        var _a2;
        try {
          return Boolean((_a2 = android == null ? void 0 : android.openEditContact) == null ? void 0 : _a2.call(android, String(contactId || "")));
        } catch (error) {
          warn(`Android contact edit screen failed: ${error.message || "unknown"}`);
          return false;
        }
      },
      readSupportInfo() {
        var _a2;
        try {
          const raw = (_a2 = android == null ? void 0 : android.getSupportInfo) == null ? void 0 : _a2.call(android);
          if (raw)
            return JSON.parse(raw);
          return window.__nativeSupportInfo && typeof window.__nativeSupportInfo === "object" ? window.__nativeSupportInfo : {};
        } catch (error) {
          warn(`Native support info parse failed: ${error.message || "unknown"}`);
          return {};
        }
      },
      readMailLog() {
        var _a2;
        try {
          return String(((_a2 = android == null ? void 0 : android.getMailLogText) == null ? void 0 : _a2.call(android)) || window.__nativeMailLog || "");
        } catch (_error) {
          return "";
        }
      },
      readLongLog() {
        var _a2;
        try {
          return String(((_a2 = android == null ? void 0 : android.getLongLogText) == null ? void 0 : _a2.call(android)) || window.__nativeLongLog || "");
        } catch (_error) {
          return "";
        }
      },
      sendLog(reason, text) {
        try {
          if (android == null ? void 0 : android.sendLog) {
            return Boolean(android.sendLog(String(reason || ""), String(text || "")));
          }
          if (iosSupport && window.__nativeCanSendLog === true) {
            iosSupport.postMessage({
              action: "sendLog",
              reason: String(reason || ""),
              text: String(text || "")
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
          if (android == null ? void 0 : android.emailLog) {
            return Boolean(android.emailLog(DEV_SUPPORT_EMAIL, String(subject || ""), String(text || "")));
          }
          if (iosSupport) {
            iosSupport.postMessage({
              action: "emailLog",
              recipient: DEV_SUPPORT_EMAIL,
              subject: String(subject || ""),
              text: String(text || "")
            });
            return true;
          }
          const body = String(text || "").slice(-12e3);
          window.location.href = `mailto:${encodeURIComponent(DEV_SUPPORT_EMAIL)}?subject=${encodeURIComponent(String(subject || ""))}&body=${encodeURIComponent(body)}`;
          return true;
        } catch (_error) {
          return false;
        }
      },
      writeLog(level, message) {
        var _a2, _b2, _c2, _d2;
        const normalizedLevel = String(level || "info").toLowerCase();
        const normalizedMessage = String(message || "");
        if (normalizedLevel === "debug") {
          (_a2 = android == null ? void 0 : android.logDebug) == null ? void 0 : _a2.call(android, normalizedMessage);
          return;
        }
        if (normalizedLevel === "warn") {
          (_b2 = android == null ? void 0 : android.logWarn) == null ? void 0 : _b2.call(android, normalizedMessage);
          return;
        }
        if (normalizedLevel === "error") {
          (_c2 = android == null ? void 0 : android.logError) == null ? void 0 : _c2.call(android, normalizedMessage);
          return;
        }
        (_d2 = android == null ? void 0 : android.logInfo) == null ? void 0 : _d2.call(android, normalizedMessage);
      },
      openSupportTarget(target) {
        if (android == null ? void 0 : android.openSupportTarget) {
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
        if (android == null ? void 0 : android.shareText) {
          android.shareText(String(subject || ""), String(text || ""));
          return true;
        }
        if (iosSupport) {
          iosSupport.postMessage({
            action: "shareText",
            subject: String(subject || ""),
            text: String(text || "")
          });
          return true;
        }
        return false;
      }
    };
  }
  function readDiagnosticLogs() {
    if (nativeBridge == null ? void 0 : nativeBridge.usesNativeLogStore) {
      const nativeLog = nativeBridge.readMailLog();
      diagnosticLogLines = nativeLog ? nativeLog.split(/\r?\n/).filter(Boolean).slice(-MAX_DIAGNOSTIC_LOG_LINES) : [];
      return diagnosticLogLines;
    }
    try {
      const raw = window.localStorage.getItem(DIAGNOSTIC_LOG_STORAGE_KEY);
      const lines = raw ? JSON.parse(raw) : [];
      diagnosticLogLines = Array.isArray(lines) ? lines.slice(-MAX_DIAGNOSTIC_LOG_LINES) : [];
    } catch (_error) {
      diagnosticLogLines = [];
    }
    return diagnosticLogLines;
  }
  function resolvePlatform() {
    var _a, _b;
    const nativePlatform = String(nativeSupportInfo.platform || "").trim().toLowerCase();
    if (nativePlatform)
      return nativePlatform;
    if ((_b = (_a = window.webkit) == null ? void 0 : _a.messageHandlers) == null ? void 0 : _b.iosNativeSupport)
      return "ios";
    if (window.AndroidPhone)
      return "android";
    return getPlatform();
  }
  function applyPlatformTheme() {
    const platform = resolvePlatform();
    document.body.classList.toggle("platform-ios", platform === "ios");
    document.body.classList.toggle("platform-android", platform === "android");
  }
  function hasConfiguredAccount() {
    var _a, _b, _c;
    return Boolean(((_a = ui.wsUrl) == null ? void 0 : _a.value.trim()) && ((_b = ui.sipUri) == null ? void 0 : _b.value.trim()) && ((_c = ui.password) == null ? void 0 : _c.value));
  }
  function getDefaultHomeTab() {
    return hasConfiguredAccount() ? "dialer" : "settings";
  }
  function shouldAutoRegisterOnStartup() {
    return hasSeenSetupGuide() && hasConfiguredAccount();
  }
  function canAccessPrimaryHomeTabs() {
    return registrationState === "REGISTERED" || hasConfiguredAccount() && ["REGISTERING", "FAILED"].includes(registrationState);
  }
  function resolveHomeMode() {
    if (setupGuidePinned || !hasSeenSetupGuide())
      return "setup";
    if (canAccessPrimaryHomeTabs())
      return "main";
    return "account";
  }
  function renderDiagnosticLogs() {
    if (!(ui == null ? void 0 : ui.logOutput))
      return;
    ui.logOutput.textContent = diagnosticLogLines.slice().reverse().map((line) => String(line || "").trimStart()).join("\n\n");
  }
  function persistDiagnosticLog(line) {
    diagnosticLogLines.push(line);
    if (diagnosticLogLines.length > MAX_DIAGNOSTIC_LOG_LINES) {
      diagnosticLogLines.splice(0, diagnosticLogLines.length - MAX_DIAGNOSTIC_LOG_LINES);
    }
    if (nativeBridge == null ? void 0 : nativeBridge.usesNativeLogStore) {
      return;
    }
    try {
      window.localStorage.setItem(DIAGNOSTIC_LOG_STORAGE_KEY, JSON.stringify(diagnosticLogLines));
    } catch (error) {
      diagnosticLogLines = diagnosticLogLines.slice(-Math.floor(MAX_DIAGNOSTIC_LOG_LINES / 2));
      try {
        window.localStorage.setItem(DIAGNOSTIC_LOG_STORAGE_KEY, JSON.stringify(diagnosticLogLines));
      } catch (_ignored) {
      }
      console.warn("Diagnostic log persistence failed", error);
    }
  }
  function log(message, level = "info") {
    var _a;
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
    (_a = nativeBridge == null ? void 0 : nativeBridge.writeLog) == null ? void 0 : _a.call(nativeBridge, level, normalizedMessage);
  }
  function warn(message) {
    log(message, "warn");
  }
  function errorLog(message) {
    log(message, "error");
  }
  function describeError(error) {
    if (!error)
      return "unknown";
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
    if (nativeSupportInfo.platform)
      return nativeSupportInfo.platform;
    if (window.AndroidPhone)
      return "android";
    if (/iPhone|iPad|iPod/i.test(navigator.userAgent))
      return "ios";
    return "web";
  }
  function ensureInstallId() {
    var _a, _b;
    if (installId)
      return installId;
    try {
      const saved = window.localStorage.getItem(INSTALLATION_ID_STORAGE_KEY);
      if (saved) {
        installId = saved;
        return installId;
      }
    } catch (_error) {
    }
    const generated = ((_b = (_a = window.crypto) == null ? void 0 : _a.randomUUID) == null ? void 0 : _b.call(_a)) || `install-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    installId = generated;
    try {
      window.localStorage.setItem(INSTALLATION_ID_STORAGE_KEY, installId);
    } catch (_error) {
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
      if (activeElement instanceof HTMLSelectElement)
        activeElement.blur();
    };
    document.addEventListener("change", (event) => {
      const select = event.target;
      if (!(select instanceof HTMLSelectElement))
        return;
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
    var _a;
    const injected = window.__nativeSupportInfo && typeof window.__nativeSupportInfo === "object" ? window.__nativeSupportInfo : {};
    nativeSupportInfo = {
      ...injected,
      ...(_a = nativeBridge == null ? void 0 : nativeBridge.readSupportInfo) == null ? void 0 : _a.call(nativeBridge)
    };
    return nativeSupportInfo;
  }
  function normalizePermissionState(value) {
    const state = String(value || "").toLowerCase();
    if (state === "granted" || state === "authorized")
      return "granted";
    if (state === "denied" || state === "restricted")
      return "denied";
    if (state === "prompt" || state === "default" || state === "not_determined")
      return "prompt";
    return "unknown";
  }
  function getPermissionBadge(status) {
    if (status === "done")
      return { className: "setup-status-done", label: "\u8A2D\u5B9A\u6E08\u307F" };
    if (status === "action")
      return { className: "setup-status-action", label: "\u672A\u8A2D\u5B9A" };
    if (status === "manual")
      return { className: "setup-status-manual", label: "\u8981\u78BA\u8A8D" };
    return { className: "setup-status-info", label: "\u6848\u5185" };
  }
  async function queryBrowserMicrophonePermission() {
    var _a;
    try {
      if (!((_a = navigator.permissions) == null ? void 0 : _a.query))
        return "unknown";
      const result = await navigator.permissions.query({ name: "microphone" });
      return normalizePermissionState(result.state);
    } catch (_error) {
      return "unknown";
    }
  }
  function readBrowserNotificationPermission() {
    var _a;
    if (!("Notification" in window))
      return "unknown";
    return normalizePermissionState((_a = window.Notification) == null ? void 0 : _a.permission);
  }
  function getBrowserNetworkInfo() {
    const nativeInfo = window.__nativeNetworkInfo && typeof window.__nativeNetworkInfo === "object" ? window.__nativeNetworkInfo : {};
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection)
      return { ...nativeInfo };
    return {
      ...nativeInfo,
      networkType: connection.type || "",
      effectiveType: connection.effectiveType || "",
      downlinkMbps: Number.isFinite(connection.downlink) ? connection.downlink : null,
      browserRttMs: Number.isFinite(connection.rtt) ? connection.rtt : null,
      saveData: Boolean(connection.saveData)
    };
  }
  function classifyNetworkQuality(metrics) {
    const loss = metrics.packetLossPercent;
    const jitter = metrics.jitterMs;
    const rtt = metrics.rttMs;
    const concealment = metrics.concealmentPercent;
    if (loss !== null && loss >= 5 || jitter !== null && jitter >= 30 || rtt !== null && rtt >= 300 || concealment !== null && concealment >= 5) {
      return "POOR";
    }
    if (loss !== null && loss >= 2 || jitter !== null && jitter >= 20 || rtt !== null && rtt >= 150 || concealment !== null && concealment >= 2) {
      return "WARNING";
    }
    return "GOOD";
  }
  function safePercent(numerator, denominator) {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
      return null;
    }
    return Math.round(numerator / denominator * 1e4) / 100;
  }
  async function collectNetworkStats(peerConnection) {
    var _a, _b;
    if (!peerConnection || peerConnection.connectionState === "closed")
      return;
    try {
      const reports = await peerConnection.getStats();
      let inboundAudio = null;
      let selectedPair = null;
      let localCandidate = null;
      let remoteCandidate = null;
      reports.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "audio" && !report.isRemote) {
          inboundAudio = report;
        }
        if (report.type === "candidate-pair" && report.state === "succeeded" && (report.nominated || report.selected)) {
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
        totalSamplesReceived: Number(inboundAudio.totalSamplesReceived || 0)
      } : null;
      const previous = previousNetworkStats;
      const elapsedSeconds = previous && current ? Math.max(1e-3, (current.timestamp - previous.timestamp) / 1e3) : null;
      const receivedDelta = previous && current ? Math.max(0, current.packetsReceived - previous.packetsReceived) : null;
      const lostDelta = previous && current ? Math.max(0, current.packetsLost - previous.packetsLost) : null;
      const bytesDelta = previous && current ? Math.max(0, current.bytesReceived - previous.bytesReceived) : null;
      const concealedDelta = previous && current ? Math.max(0, current.concealedSamples - previous.concealedSamples) : null;
      const samplesDelta = previous && current ? Math.max(0, current.totalSamplesReceived - previous.totalSamplesReceived) : null;
      const metrics = {
        quality: "",
        connectionState: peerConnection.connectionState,
        iceConnectionState: peerConnection.iceConnectionState,
        signalingState: peerConnection.signalingState,
        ...getBrowserNetworkInfo(),
        packetLossPercent: safePercent(lostDelta, (receivedDelta || 0) + (lostDelta || 0)),
        jitterMs: Number.isFinite(inboundAudio == null ? void 0 : inboundAudio.jitter) ? Math.round(inboundAudio.jitter * 1e3) : null,
        rttMs: Number.isFinite(selectedPair == null ? void 0 : selectedPair.currentRoundTripTime) ? Math.round(selectedPair.currentRoundTripTime * 1e3) : null,
        inboundKbps: elapsedSeconds && bytesDelta !== null ? Math.round(bytesDelta * 8 / elapsedSeconds / 1e3) : null,
        concealmentPercent: safePercent(concealedDelta, samplesDelta),
        packetsReceived: (_a = current == null ? void 0 : current.packetsReceived) != null ? _a : null,
        packetsLost: (_b = current == null ? void 0 : current.packetsLost) != null ? _b : null,
        localCandidateType: (localCandidate == null ? void 0 : localCandidate.candidateType) || "",
        localProtocol: (localCandidate == null ? void 0 : localCandidate.protocol) || "",
        localNetworkType: (localCandidate == null ? void 0 : localCandidate.networkType) || "",
        remoteCandidateType: (remoteCandidate == null ? void 0 : remoteCandidate.candidateType) || ""
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
    var _a;
    const logNetworkState = (eventName) => {
      log(`[NETWORK] ${eventName} ${JSON.stringify({
        online: navigator.onLine,
        ...getBrowserNetworkInfo()
      })}`);
    };
    window.addEventListener("online", () => logNetworkState("online"));
    window.addEventListener("offline", () => logNetworkState("offline"));
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    (_a = connection == null ? void 0 : connection.addEventListener) == null ? void 0 : _a.call(connection, "change", () => logNetworkState("connection_changed"));
    window.addEventListener("native-network-change", () => logNetworkState("native_connection_changed"));
    logNetworkState("initial_state");
  }
  function installGlobalErrorLogging() {
    window.addEventListener("error", (event) => {
      var _a;
      const details = [
        `message=${event.message || "unknown"}`,
        `file=${event.filename || "unknown"}`,
        `line=${event.lineno || 0}`,
        `column=${event.colno || 0}`,
        ((_a = event.error) == null ? void 0 : _a.stack) ? `stack=${event.error.stack}` : ""
      ].filter(Boolean).join(" | ");
      errorLog(`JavaScript error: ${details}`);
    });
    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const details = [
        `message=${(reason == null ? void 0 : reason.message) || String(reason || "unknown")}`,
        (reason == null ? void 0 : reason.code) ? `code=${reason.code}` : "",
        (reason == null ? void 0 : reason.name) ? `name=${reason.name}` : "",
        (reason == null ? void 0 : reason.stack) ? `stack=${reason.stack}` : ""
      ].filter(Boolean).join(" | ");
      errorLog(`JavaScript promise error: ${details}`);
    });
  }
  function escapeHtml(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function showToast(message, type = "success") {
    const text = String(message || "").trim();
    if (!text)
      return;
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
    if (Number.isNaN(date.getTime()))
      return "-";
    const today = new Date();
    const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diffDays = Math.round((startOf(today) - startOf(date)) / 864e5);
    if (diffDays === 0)
      return "\u4ECA\u65E5";
    if (diffDays === 1)
      return "\u6628\u65E5";
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
  }
  function formatTimeLabel(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime()))
      return "-";
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }
  function formatDuration(seconds) {
    const value = Number(seconds || 0);
    if (!Number.isFinite(value) || value <= 0)
      return "";
    const minutes = Math.floor(value / 60);
    const restSeconds = Math.floor(value % 60);
    return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
  }
  function normalizeHistoryRecord(item) {
    if (item && item.timestamp && item.direction && item.status) {
      return {
        ...item,
        target: item.target || "\u4E0D\u660E",
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
        addressBookName: item.addressBookName || ""
      };
    }
    return {
      target: (item == null ? void 0 : item.target) || "\u4E0D\u660E",
      timestamp: (item == null ? void 0 : item.timestamp) || (item == null ? void 0 : item.time) || new Date().toISOString(),
      direction: normalizeHistoryDirection((item == null ? void 0 : item.direction) || (item == null ? void 0 : item.kind) || "\u901A\u8A71"),
      status: normalizeHistoryStatus((item == null ? void 0 : item.status) || "\u6210\u529F"),
      dialMethod: inferDialMethod(item),
      durationSec: Number((item == null ? void 0 : item.durationSec) || (item == null ? void 0 : item.duration) || 0),
      storeId: (item == null ? void 0 : item.storeId) || "",
      storeName: (item == null ? void 0 : item.storeName) || "",
      displayName: (item == null ? void 0 : item.displayName) || "",
      ctiName: (item == null ? void 0 : item.ctiName) || "",
      contactName: (item == null ? void 0 : item.contactName) || "",
      addressBookName: (item == null ? void 0 : item.addressBookName) || ""
    };
  }
  function inferDialMethod(item) {
    const text = `${(item == null ? void 0 : item.direction) || ""} ${(item == null ? void 0 : item.dialMethod) || ""} ${(item == null ? void 0 : item.target) || ""}`.toLowerCase();
    if (text.includes("shop") || text.includes("store") || text.includes("\u5E97\u8217"))
      return "shop";
    if (text.includes("mobile") || text.includes("tel:"))
      return "mobile";
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
      originalIndex: numericIndex
    };
  }
  function getCallHistoryEntries() {
    return readCallHistory().map((item, originalIndex) => ({
      ...normalizeHistoryRecord(item),
      originalIndex
    })).reverse();
  }
  function extractPhoneNumber(value) {
    const text = String(value || "");
    const sipUser = text.replace(/^.*?sip:/i, "").split("@")[0];
    return (sipUser || text).replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
  }
  function formatHistoryPhone(item) {
    const target = String((item == null ? void 0 : item.target) || "").trim();
    const phone = extractPhoneNumber(target);
    return phone || target || "\u4E0D\u660E";
  }
  function normalizeHistoryDirection(direction) {
    const text = String(direction || "").trim();
    if (/missed|\u4e0d\u5728|\u672a\u5fdc\u7b54|\u672a\u63a5\u7d9a/i.test(text))
      return "\u4E0D\u5728\u7740\u4FE1";
    if (/incoming|inbound|\u7740\u4fe1/i.test(text))
      return "\u7740\u4FE1";
    if (/outgoing|\u767a\u4fe1|mobile|shop|store/i.test(text))
      return "\u767A\u4FE1";
    return text && text.length <= 8 ? text : "\u901A\u8A71";
  }
  function normalizeHistoryStatus(status) {
    const text = String(status || "").trim();
    if (/fail|failed|missed|\u4e0d\u5728|\u5931\u6557/i.test(text))
      return "\u5931\u6557";
    if (/cancel|cancelled|\u30ad\u30e3\u30f3\u30bb\u30eb|\u62d2\u5426/i.test(text))
      return "\u30AD\u30E3\u30F3\u30BB\u30EB";
    return "\u6210\u529F";
  }
  function buildCallHistoryViewModel(item) {
    const normalized = normalizeHistoryRecord(item);
    const target = String(normalized.target || "").trim();
    const phone = formatHistoryPhone(normalized);
    const contact = findContactByTarget(target);
    const addressBookName = firstNonEmptyValue(contact == null ? void 0 : contact.name, normalized.contactName, normalized.addressBookName);
    const ctiDisplayName = String(normalized.ctiName || "").trim();
    const displayName = resolvePreferredDisplayName({
      ctiName: ctiDisplayName,
      contactName: addressBookName,
      legacyDisplayName: normalized.displayName,
      phone,
      sipUri: target
    });
    const phoneOrSip = compactText(firstNonEmptyValue(target, phone, "\u4E0D\u660E"), 40);
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
      originalIndex: Number.isInteger(Number(normalized.originalIndex)) ? Number(normalized.originalIndex) : void 0,
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
      addressBookName: addressBookName || ""
    };
  }
  function getHistoryFilterType(item) {
    if (item.directionLabel === "\u4E0D\u5728\u7740\u4FE1")
      return "missed";
    if (item.directionLabel === "\u7740\u4FE1")
      return "incoming";
    if (item.directionLabel === "\u767A\u4FE1")
      return "outgoing";
    return "all";
  }
  function filterHistoryItems(items) {
    if (!(ui == null ? void 0 : ui.historyFilterValue) || ui.historyFilterValue === "all") {
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
      ["missed", ui.historyFilterMissed]
    ].forEach(([value, button]) => {
      if (!button)
        return;
      const active = (ui.historyFilterValue || "all") === value;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
  }
  function renderHistoryList(targetNode, items, options = {}) {
    if (!targetNode)
      return;
    const {
      emptyText = "\u5C65\u6B74\u306F\u3042\u308A\u307E\u305B\u3093",
      sourceTab = "history",
      itemClassName = "history-item"
    } = options;
    targetNode.innerHTML = items.length ? items.map((item) => `
        <li class="${itemClassName}">
            <button
              type="button"
              class="history-open-button history-detail-trigger"
              data-history-detail-index="${item.originalIndex}"
              data-history-source="${escapeHtml(sourceTab)}"
              aria-label="${escapeHtml(item.displayName)}\u306E\u8A73\u7D30"
            >
              <span class="contact-avatar default-avatar history-avatar" aria-hidden="true"></span>
              <span class="history-main contact-main">
                <span class="history-party">${escapeHtml(item.displayName)}</span>
                <span class="history-meta">
                  ${escapeHtml(item.directionLabel)} \u30FB ${escapeHtml(item.statusLabel)} \u30FB ${escapeHtml(item.dateTimeLabel)}
                </span>
                ${item.subText ? `<span class="history-sub">${escapeHtml(item.subText)}</span>` : ""}
                <span class="history-sub">${escapeHtml(item.durationLabel)}</span>
              </span>
            </button>
            <button
              type="button"
              class="history-redial-button"
              data-history-index="${item.originalIndex}"
              aria-label="\u518D\u767A\u4FE1"
              title="\u518D\u767A\u4FE1"
            >
              <svg class="call-start-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7.2 3.5 10 8l-2 2c1.4 2.8 3.6 5 6.4 6.4l2-2 4.5 2.8-.6 3.3c-.2.9-1 1.5-1.9 1.5C9.3 22 2 14.7 2 5.6c0-.9.6-1.7 1.5-1.9z"/>
              </svg>
              <span class="sr-only">\u518D\u767A\u4FE1</span>
            </button>
          </li>
        `).join("") : `<li class="empty-history">${escapeHtml(emptyText)}</li>`;
  }
  function renderFullCallHistoryList(items) {
    renderHistoryList(ui.historyList, items, {
      emptyText: "\u5C65\u6B74\u306F\u3042\u308A\u307E\u305B\u3093",
      sourceTab: "history",
      itemClassName: "history-item"
    });
  }
  function renderRecentCallHistoryList(items) {
    renderHistoryList(ui.callHistoryList, items.slice(0, 3), {
      emptyText: "\u5C65\u6B74\u306F\u3042\u308A\u307E\u305B\u3093",
      sourceTab: "dialer",
      itemClassName: "call-history-item"
    });
  }
  function renderCallHistory() {
    if (!(ui == null ? void 0 : ui.historyList) && !(ui == null ? void 0 : ui.callHistoryList))
      return;
    updateStaticHistoryFilterButtons();
    const allItems = getCallHistoryEntries().map((item) => buildCallHistoryViewModel(item));
    const filteredItems = filterHistoryItems(allItems);
    renderFullCallHistoryList(filteredItems);
    renderRecentCallHistoryList(allItems);
  }
  function showHistoryDetails(originalIndex, sourceTab = "history") {
    var _a;
    const record = getHistoryRecordByOriginalIndex(originalIndex);
    if (!record) {
      showUserError("\u5C65\u6B74\u8A73\u7D30\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      return;
    }
    const item = buildCallHistoryViewModel(record);
    const rows = [
      ["\u7A2E\u5225", item.directionLabel],
      ["\u72B6\u614B", item.statusLabel],
      ["\u65E5\u6642", item.dateTimeLabel],
      ["\u901A\u8A71\u6642\u9593", item.durationLabel],
      ["\u5E97\u8217\u540D", item.storeName],
      ["CTI\u540D", item.ctiDisplayName],
      ["\u30A2\u30C9\u30EC\u30B9\u5E33\u540D", item.addressBookName]
    ].filter(([, value]) => String(value || "").trim());
    openDetailSheet("history", "\u901A\u8A71\u5C65\u6B74\u8A73\u7D30");
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
        >\u260E \u518D\u767A\u4FE1</button>
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
    (_a = ui.historyDetailView.querySelector(".history-redial-button-large")) == null ? void 0 : _a.addEventListener("click", () => redialHistoryItem(item.originalIndex));
  }
  async function redialHistoryItem(originalIndex) {
    const record = getHistoryRecordByOriginalIndex(originalIndex);
    if (!record) {
      showUserError("\u5C65\u6B74\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      return;
    }
    if (activeSession) {
      showUserError("\u901A\u8A71\u4E2D\u306F\u5C65\u6B74\u304B\u3089\u518D\u767A\u4FE1\u3067\u304D\u307E\u305B\u3093\u3002");
      return;
    }
    const dialMethod = record.dialMethod || inferDialMethod(record);
    const target = dialMethod === "mobile" ? extractPhoneNumber(record.target) : record.target;
    if (!target) {
      showUserError("\u767A\u4FE1\u5148\u3092\u7279\u5B9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
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
    showToast("\u518D\u767A\u4FE1\u3057\u307E\u3059\u3002");
    await call();
  }
  function inferHistoryStatus(kind) {
    const text = String(kind || "");
    if (text.includes("\u5931\u6557") || text.includes("\u62D2\u5426") || text.includes("\u4E0D\u5728")) {
      return "\u5931\u6557";
    }
    return "\u6210\u529F";
  }
  function addCallHistory(kind, target, status = inferHistoryStatus(kind), meta = {}) {
    const items = readCallHistory();
    const timestamp = new Date().toISOString();
    const store = meta.storeName || meta.storeId ? { id: meta.storeId || "", name: meta.storeName || "" } : null;
    const record = normalizeHistoryRecord({
      target: target || "\u4E0D\u660E",
      timestamp,
      direction: kind || "\u901A\u8A71",
      status,
      dialMethod: meta.dialMethod || inferDialMethod({ direction: kind, target }),
      durationSec: meta.durationSec || 0,
      storeId: (store == null ? void 0 : store.id) || "",
      storeName: (store == null ? void 0 : store.name) || "",
      displayName: meta.displayName || "",
      ctiName: meta.ctiName || "",
      contactName: meta.contactName || "",
      addressBookName: meta.addressBookName || ""
    });
    items.push(record);
    saveCallHistory(items.slice(-MAX_CALL_HISTORY_ITEMS));
    renderCallHistory();
    if (callState === "INCOMING") {
      resolveIncomingParty(target, meta.ctiName || pendingIncomingCtiName).then((party) => {
        const updatedItems = readCallHistory();
        const targetRecord = updatedItems.find((item) => item.timestamp === timestamp);
        if (!targetRecord)
          return;
        Object.assign(targetRecord, party);
        saveCallHistory(updatedItems);
        renderCallHistory();
        applyResolvedIncomingParty(party);
      });
    }
  }
  function normalizeContactSortMode(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "frequent" || mode === "used")
      return "used";
    if (mode === "recent" || mode === "updated")
      return "updated";
    return DEFAULT_CONTACT_SORT_MODE;
  }
  function readContactPrefs() {
    try {
      const raw = window.localStorage.getItem(CONTACT_PREFS_STORAGE_KEY);
      const prefs = raw ? JSON.parse(raw) : {};
      return {
        sortMode: normalizeContactSortMode(prefs.sortMode)
      };
    } catch (_error) {
      return { sortMode: DEFAULT_CONTACT_SORT_MODE };
    }
  }
  function saveContactPrefs(nextPrefs) {
    const payload = {
      sortMode: normalizeContactSortMode(nextPrefs == null ? void 0 : nextPrefs.sortMode)
    };
    window.localStorage.setItem(CONTACT_PREFS_STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }
  function makeContactId() {
    return `contact-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
  function normalizeContact(record) {
    var _a;
    const phones = Array.isArray(record == null ? void 0 : record.phones) ? record.phones.map((phone) => ({
      number: String((phone == null ? void 0 : phone.number) || "").trim(),
      label: String((phone == null ? void 0 : phone.label) || "").trim()
    })).filter((phone) => phone.number) : [];
    return {
      id: String((record == null ? void 0 : record.id) || makeContactId()),
      nativeContactId: String((record == null ? void 0 : record.nativeContactId) || ""),
      name: String((record == null ? void 0 : record.name) || "").trim(),
      target: String((record == null ? void 0 : record.target) || ((_a = phones[0]) == null ? void 0 : _a.number) || "").trim(),
      phones,
      note: String((record == null ? void 0 : record.note) || "").trim(),
      avatar: String((record == null ? void 0 : record.avatar) || ""),
      favorite: Boolean(record == null ? void 0 : record.favorite),
      callCount: Number((record == null ? void 0 : record.callCount) || 0),
      updatedAt: String((record == null ? void 0 : record.updatedAt) || new Date().toISOString())
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
      if (!item.nativeContactId)
        return;
      metadata[item.nativeContactId] = {
        favorite: Boolean(item.favorite),
        callCount: Number(item.callCount || 0),
        updatedAt: String(item.updatedAt || "")
      };
    });
    window.localStorage.setItem(DEVICE_CONTACT_META_STORAGE_KEY, JSON.stringify(metadata));
    return metadata;
  }
  function buildDeviceContactsSignature(records) {
    return records.map((record) => [
      String((record == null ? void 0 : record.id) || ""),
      String((record == null ? void 0 : record.name) || ""),
      ...((record == null ? void 0 : record.phones) || []).map((phone) => `${(phone == null ? void 0 : phone.number) || ""}:${(phone == null ? void 0 : phone.label) || ""}`)
    ].join("|")).join("\n");
  }
  function markContactsChanged() {
    contactsRevision += 1;
    lastContactsRenderKey = "";
  }
  function refreshDeviceContacts() {
    var _a, _b;
    if (!((_a = window.AndroidPhone) == null ? void 0 : _a.getDeviceContacts))
      return false;
    deviceContactsAvailable = true;
    const records = (_b = nativeBridge == null ? void 0 : nativeBridge.readDeviceContacts) == null ? void 0 : _b.call(nativeBridge);
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
      const nativeContactId = String((record == null ? void 0 : record.id) || "");
      const saved = metadata[nativeContactId] || {};
      return normalizeContact({
        id: `device-contact-${nativeContactId}`,
        nativeContactId,
        name: record == null ? void 0 : record.name,
        phones: record == null ? void 0 : record.phones,
        avatar: "",
        favorite: saved.favorite,
        callCount: saved.callCount,
        updatedAt: saved.updatedAt || ""
      });
    }).filter((contact) => contact.nativeContactId && contact.phones.length);
    markContactsChanged();
    renderContactsAndFavorites();
    return true;
  }
  function readContacts() {
    if (deviceContactsAvailable)
      return deviceContacts;
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
    if (!element)
      return;
    const avatar = String((contact == null ? void 0 : contact.avatar) || "");
    element.textContent = "";
    element.classList.toggle("default-avatar", !avatar);
    element.classList.toggle("has-image", Boolean(avatar));
    element.dataset.initial = ((contact == null ? void 0 : contact.name) || (contact == null ? void 0 : contact.target) || "?").slice(0, 1).toUpperCase();
    if (!avatar)
      return;
    const image = document.createElement("img");
    image.src = avatar;
    image.alt = "";
    element.append(image);
  }
  async function createContactAvatarDataUrl(file) {
    var _a;
    if (!((_a = file == null ? void 0 : file.type) == null ? void 0 : _a.startsWith("image/"))) {
      throw new Error("\u753B\u50CF\u30D5\u30A1\u30A4\u30EB\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    }
    const sourceUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("\u753B\u50CF\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002"));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const preview = new Image();
      preview.onload = () => resolve(preview);
      preview.onerror = () => reject(new Error("\u753B\u50CF\u3092\u8868\u793A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002"));
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
      user: text.split("@")[0] || ""
    };
  }
  function getActiveContactSortMode() {
    var _a;
    const explicit = ((_a = ui == null ? void 0 : ui.contactSortMode) == null ? void 0 : _a.value) || "";
    if (explicit)
      return normalizeContactSortMode(explicit);
    const prefs = readContactPrefs();
    return prefs.sortMode;
  }
  function applyContactSortMode(mode) {
    var _a;
    const normalized = normalizeContactSortMode(mode);
    saveContactPrefs({ sortMode: normalized });
    if (ui == null ? void 0 : ui.contactSortMode) {
      ui.contactSortMode.value = normalized === "used" ? "used" : normalized === "updated" ? "updated" : "name";
    }
    (_a = ui == null ? void 0 : ui.contactSortMenu) == null ? void 0 : _a.querySelectorAll("[data-contact-sort-mode]").forEach((item) => {
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
      var _a;
      const targets = ((_a = item.phones) == null ? void 0 : _a.length) ? item.phones.map((phone) => phone.number) : [item.target];
      return targets.some((targetValue) => {
        const current = normalizeLookupTarget(targetValue);
        return Boolean(needle.phone && current.phone && needle.phone === current.phone || needle.text && current.text && needle.text === current.text || needle.user && current.user && needle.user === current.user);
      });
    }) || null;
  }
  function formatContactSecondary(item) {
    var _a;
    const target = String((item == null ? void 0 : item.target) || "").trim();
    const phoneCount = ((_a = item == null ? void 0 : item.phones) == null ? void 0 : _a.length) || 0;
    const parts = [phoneCount > 1 ? `${target}\u30FB\u307B\u304B${phoneCount - 1}\u4EF6` : target];
    if (item == null ? void 0 : item.note)
      parts.push(item.note);
    return parts.filter(Boolean).join(" \u30FB ");
  }
  function getContacts({ favoritesOnly = false } = {}) {
    const query = String(contactSearchQuery || "").trim().toLowerCase();
    const sortMode = getActiveContactSortMode();
    const items = readContacts().filter((item) => item.name || item.target);
    const filtered = items.filter((item) => {
      if (favoritesOnly && !item.favorite)
        return false;
      if (!query)
        return true;
      const searchText = [
        item.name,
        item.target,
        ...(item.phones || []).map((phone) => `${phone.number} ${phone.label}`),
        item.note,
        normalizeLookupTarget(item.target).phone
      ].join(" ").toLowerCase();
      return searchText.includes(query);
    });
    filtered.sort((a, b) => {
      if (sortMode === "used") {
        return (b.callCount || 0) - (a.callCount || 0) || Number(b.favorite) - Number(a.favorite) || japaneseCollator.compare(a.name || a.target, b.name || b.target);
      }
      if (sortMode === "updated") {
        return String(b.updatedAt).localeCompare(String(a.updatedAt)) || Number(b.favorite) - Number(a.favorite) || japaneseCollator.compare(a.name || a.target, b.name || b.target);
      }
      return japaneseCollator.compare(a.name || a.target, b.name || b.target) || japaneseCollator.compare(a.target, b.target);
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
          aria-label="\u304A\u6C17\u306B\u5165\u308A"
        >\u2605</span>
        <span class="contact-call" data-contact-call="${escapeHtml(item.id)}" aria-label="\u767A\u4FE1">
          <svg class="call-start-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7.2 3.5 10 8l-2 2c1.4 2.8 3.6 5 6.4 6.4l2-2 4.5 2.8-.6 3.3c-.2.9-1 1.5-1.9 1.5C9.3 22 2 14.7 2 5.6c0-.9.6-1.7 1.5-1.9z"/>
          </svg>
          <span class="sr-only">\u767A\u4FE1</span>
        </span>
      </button>
    `;
  }
  function renderVirtualContactWindow(targetNode, force = false) {
    const state = virtualContactListStates.get(targetNode);
    if (!state || !state.items.length || !targetNode.isConnected || targetNode.closest("[hidden]")) {
      return;
    }
    const listTop = targetNode.getBoundingClientRect().top + window.scrollY;
    const relativeScrollTop = Math.max(0, window.scrollY - listTop);
    const viewportRows = Math.ceil(window.innerHeight / CONTACT_VIRTUAL_ROW_HEIGHT);
    const firstVisibleIndex = Math.min(state.items.length - 1, Math.floor(relativeScrollTop / CONTACT_VIRTUAL_ROW_HEIGHT));
    const startIndex = Math.max(0, firstVisibleIndex - CONTACT_VIRTUAL_OVERSCAN);
    const endIndex = Math.min(state.items.length, firstVisibleIndex + viewportRows + CONTACT_VIRTUAL_OVERSCAN);
    if (!force && state.startIndex === startIndex && state.endIndex === endIndex)
      return;
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
    if (!virtualContactListStates.size || virtualContactRenderFrameId !== null)
      return;
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
    if (!targetNode)
      return;
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
      endIndex: -1
    });
    renderVirtualContactWindow(targetNode, true);
  }
  function renderContactsAndFavorites() {
    const renderKey = [
      contactsRevision,
      deviceContactsPermissionPending ? "permission" : "ready",
      String(contactSearchQuery || "").trim().toLowerCase(),
      getActiveContactSortMode()
    ].join("|");
    if (renderKey === lastContactsRenderKey)
      return;
    lastContactsRenderKey = renderKey;
    const contacts = getContacts();
    const favorites = getContacts({ favoritesOnly: true });
    renderContactList(ui.contactsList, contacts, contactSearchQuery ? "\u8A72\u5F53\u3059\u308B\u9023\u7D61\u5148\u304C\u3042\u308A\u307E\u305B\u3093\u3002" : deviceContactsPermissionPending ? "\u7AEF\u672B\u306E\u9023\u7D61\u5148\u3078\u306E\u30A2\u30AF\u30BB\u30B9\u3092\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : "\u7AEF\u672B\u306E\u9023\u7D61\u5148\u306F\u3042\u308A\u307E\u305B\u3093\u3002");
    renderContactList(ui.favoritesList, favorites, "\u304A\u6C17\u306B\u5165\u308A\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093\u3002");
    if (ui.contactLookupResult) {
      ui.contactLookupResult.hidden = !contactSearchQuery;
      ui.contactLookupResult.textContent = contactSearchQuery ? `${contacts.length} \u4EF6` : "";
    }
    applyContactSortMode(getActiveContactSortMode());
  }
  function openDetailSheet(mode, title) {
    contactOverlayMode = mode;
    if (ui.contactOverlay) {
      ui.contactOverlay.hidden = false;
      ui.contactOverlay.dataset.sheetMode = mode;
    }
    if (ui.contactOverlayTitle)
      ui.contactOverlayTitle.textContent = title;
    if (ui.btnSaveContact)
      ui.btnSaveContact.hidden = mode !== "editor";
    if (ui.contactDetailView)
      ui.contactDetailView.hidden = mode !== "detail";
    if (ui.contactEditorView)
      ui.contactEditorView.hidden = mode !== "editor";
    if (ui.historyDetailView)
      ui.historyDetailView.hidden = mode !== "history";
    updateHomeChrome();
  }
  function openContactOverlay(mode, contactId = "", source = currentHomeTab) {
    var _a;
    const contact = getContactById(contactId);
    activeContactId = contactId;
    activeContactSource = source;
    openDetailSheet(mode, mode === "editor" ? contact ? "\u9023\u7D61\u5148\u3092\u7DE8\u96C6" : "\u9023\u7D61\u5148\u3092\u8FFD\u52A0" : "\u9023\u7D61\u5148");
    if (mode === "detail" && contact) {
      renderContactAvatar(ui.contactAvatar, contact);
      const phones = ((_a = contact.phones) == null ? void 0 : _a.length) ? contact.phones : [{ number: contact.target, label: "" }].filter((phone) => phone.number);
      if (ui.contactDetailName)
        ui.contactDetailName.textContent = contact.name || contact.target;
      if (ui.contactDetailTarget) {
        ui.contactDetailTarget.textContent = phones.length > 1 ? `${phones.length}\u4EF6\u306E\u96FB\u8A71\u756A\u53F7` : contact.target;
        ui.contactDetailTarget.title = contact.target;
      }
      if (ui.contactInfoName)
        ui.contactInfoName.textContent = contact.name || "-";
      if (ui.contactInfoTarget) {
        ui.contactInfoTarget.textContent = phones.map((phone) => phone.label ? `${phone.label}: ${phone.number}` : phone.number).join(" / ") || "-";
      }
      if (ui.contactInfoNote)
        ui.contactInfoNote.textContent = contact.note || "-";
      if (ui.contactPhoneChoices) {
        ui.contactPhoneChoices.hidden = phones.length <= 1;
        ui.contactPhoneChoices.innerHTML = phones.length > 1 ? phones.map((phone) => `
            <button type="button" class="contact-phone-choice" data-contact-number="${escapeHtml(phone.number)}">
              <span><strong>${escapeHtml(phone.number)}</strong><small>${escapeHtml(phone.label || "\u96FB\u8A71")}</small></span>
              <b>\u767A\u4FE1</b>
            </button>
          `).join("") : "";
      }
      if (ui.btnCallContact)
        ui.btnCallContact.hidden = phones.length > 1;
      if (ui.btnToggleFavorite) {
        ui.btnToggleFavorite.textContent = contact.favorite ? "\u2605 \u304A\u6C17\u306B\u5165\u308A\u89E3\u9664" : "\u2605 \u304A\u6C17\u306B\u5165\u308A";
      }
    }
    if (mode === "editor") {
      const targetContact = contact || normalizeContact({});
      const normalizedTarget = normalizeLookupTarget(targetContact.target);
      const isSipTarget = /^sip:/i.test(targetContact.target) || String(targetContact.target || "").includes("@");
      if (ui.contactNameInput)
        ui.contactNameInput.value = targetContact.name || "";
      if (ui.contactTargetInput)
        ui.contactTargetInput.value = targetContact.target || "";
      if (ui.contactPhoneInput)
        ui.contactPhoneInput.value = isSipTarget ? "" : normalizedTarget.phone || "";
      if (ui.contactSipInput)
        ui.contactSipInput.value = isSipTarget ? targetContact.target || "" : "";
      if (ui.contactNoteInput)
        ui.contactNoteInput.value = targetContact.note || "";
      if (ui.contactFavoriteInput)
        ui.contactFavoriteInput.checked = Boolean(contact == null ? void 0 : contact.favorite);
      if (ui.contactAvatarInput)
        ui.contactAvatarInput.value = "";
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
    var _a, _b, _c, _d, _e, _f, _g;
    const name = String(((_a = ui.contactNameInput) == null ? void 0 : _a.value) || "").trim();
    const phone = String(((_b = ui.contactPhoneInput) == null ? void 0 : _b.value) || "").trim();
    const sip = String(((_c = ui.contactSipInput) == null ? void 0 : _c.value) || "").trim();
    const target = String(((_d = ui.contactTargetInput) == null ? void 0 : _d.value) || "").trim() || phone || sip;
    if (!name || !target) {
      showUserError("\u540D\u524D\u3068\u756A\u53F7 / SIP \u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    const nextItem = normalizeContact({
      id: activeContactId || "",
      name,
      target,
      note: String(((_e = ui.contactNoteInput) == null ? void 0 : _e.value) || "").trim(),
      avatar: pendingContactAvatar,
      favorite: Boolean((_f = ui.contactFavoriteInput) == null ? void 0 : _f.checked),
      callCount: ((_g = getContactById(activeContactId)) == null ? void 0 : _g.callCount) || 0,
      updatedAt: new Date().toISOString()
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
    showToast(index >= 0 ? "\u9023\u7D61\u5148\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\u3002" : "\u9023\u7D61\u5148\u3092\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002");
    openContactOverlay("detail", nextItem.id, activeContactSource);
  }
  function toggleFavorite(contactId) {
    const items = readContacts();
    const index = items.findIndex((item) => item.id === contactId);
    if (index < 0)
      return;
    items[index] = normalizeContact({
      ...items[index],
      favorite: !items[index].favorite,
      updatedAt: new Date().toISOString()
    });
    saveContacts(items);
    renderContactsAndFavorites();
    if (activeContactId === contactId && contactOverlayMode === "detail") {
      openContactOverlay("detail", contactId, activeContactSource);
    }
    showToast(items[index].favorite ? "\u304A\u6C17\u306B\u5165\u308A\u306B\u8FFD\u52A0\u3057\u307E\u3057\u305F\u3002" : "\u304A\u6C17\u306B\u5165\u308A\u3092\u89E3\u9664\u3057\u307E\u3057\u305F\u3002");
  }
  function deleteContactById(contactId) {
    var _a;
    if (!contactId)
      return;
    const contact = getContactById(contactId);
    if (contact == null ? void 0 : contact.nativeContactId) {
      const opened = (_a = nativeBridge == null ? void 0 : nativeBridge.openEditContact) == null ? void 0 : _a.call(nativeBridge, contact.nativeContactId);
      if (!opened)
        showUserError("\u7AEF\u672B\u306E\u9023\u7D61\u5E33\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      return;
    }
    const nextItems = readContacts().filter((item) => item.id !== contactId);
    saveContacts(nextItems);
    renderContactsAndFavorites();
    closeContactOverlay();
    showToast("\u9023\u7D61\u5148\u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002");
  }
  function bumpContactUsage(contactId) {
    const items = readContacts();
    const index = items.findIndex((item) => item.id === contactId);
    if (index < 0)
      return;
    items[index] = normalizeContact({
      ...items[index],
      callCount: Number(items[index].callCount || 0) + 1,
      updatedAt: new Date().toISOString()
    });
    saveContacts(items);
  }
  async function callContactById(contactId, selectedTarget = "") {
    var _a;
    const contact = getContactById(contactId);
    if (!contact)
      return;
    if (!selectedTarget && ((_a = contact.phones) == null ? void 0 : _a.length) > 1) {
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
    var _a;
    const quiet = Boolean(options.quiet);
    (_a = nativeBridge == null ? void 0 : nativeBridge.requestSupportInfo) == null ? void 0 : _a.call(nativeBridge);
    const nativeInfo = readNativeSupportInfo();
    const platform = nativeInfo.platform || getPlatform();
    const browserNotification = readBrowserNotificationPermission();
    const browserMicrophone = await queryBrowserMicrophonePermission();
    const notificationPermission = normalizePermissionState(nativeInfo.notificationPermission || browserNotification);
    const microphonePermission = normalizePermissionState(nativeInfo.microphonePermission || browserMicrophone);
    const contactsPermission = normalizePermissionState(nativeInfo.contactsPermission);
    const backgroundExecutionAllowed = nativeInfo.ignoringBatteryOptimizations === true || String(nativeInfo.ignoringBatteryOptimizations || "").toLowerCase() === "true";
    currentSetupChecklist = buildSetupChecklist(platform, notificationPermission, microphonePermission, contactsPermission, backgroundExecutionAllowed);
    renderSetupChecklist(currentSetupChecklist);
    if (!quiet) {
      log(`[SETUP] ${reason} platform=${platform} blocking=${currentSetupChecklist.hasBlockingItems}`);
    }
    return currentSetupChecklist;
  }
  function openSupportTarget(target) {
    var _a;
    rememberUserAction();
    const opened = (_a = nativeBridge == null ? void 0 : nativeBridge.openSupportTarget) == null ? void 0 : _a.call(nativeBridge, target);
    if (!opened) {
      showUserError("\u3053\u306E\u7AEF\u672B\u3067\u306F\u8A2D\u5B9A\u753B\u9762\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      return;
    }
    log(`[SETUP] open_target=${target}`);
  }
  function shouldShowSetupOnLaunch() {
    return !hasSeenSetupGuide();
  }
  function openSetupView() {
    var _a, _b, _c;
    setupGuideReturnState = resolveHomeMode() === "main" ? getNavigationState() : null;
    const animateEntry = (setupGuideReturnState == null ? void 0 : setupGuideReturnState.tab) === "settings";
    setupGuidePinned = true;
    showView("view-home");
    showHomeTab("setup");
    (_b = (_a = ui.homePanels) == null ? void 0 : _a.setup) == null ? void 0 : _b.classList.toggle("opened-from-settings", animateEntry);
    updateHomeChrome();
    if (animateEntry && ((_c = ui.homePanels) == null ? void 0 : _c.setup)) {
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
    var _a, _b;
    const config = getConfigFromForm();
    const nativeInfo = readNativeSupportInfo();
    const nativeMailLog = ((_a = nativeBridge == null ? void 0 : nativeBridge.readMailLog) == null ? void 0 : _a.call(nativeBridge)) || "";
    const nativeLongLog = ((_b = nativeBridge == null ? void 0 : nativeBridge.readLongLog) == null ? void 0 : _b.call(nativeBridge)) || "";
    const platform = nativeInfo.platform || getPlatform();
    const history = readCallHistory().slice(-10);
    const checklistLines = currentSetupChecklist.items.map((item) => {
      const badge = getPermissionBadge(item.status).label;
      return `- ${item.title}: ${badge} / ${item.summary}`;
    });
    return [
      "WebRTC SIP Phone Diagnostic Report",
      `GeneratedAt: ${new Date().toISOString()}`,
      `InstallationId: ${ensureInstallId()}`,
      `Platform: ${platform}`,
      `AppVersion: ${nativeInfo.appVersion || "unknown"} (${nativeInfo.appBuild || "-"})`,
      `OSVersion: ${nativeInfo.osVersion || navigator.userAgent}`,
      `Device: ${[nativeInfo.manufacturer, nativeInfo.model, nativeInfo.deviceName].filter(Boolean).join(" / ") || "unknown"}`,
      `User: ${config.authUser || config.sipUri || "unknown"}`,
      `RegistrationState: ${registrationState}`,
      `CallState: ${callState}`,
      `LastUserActionAt: ${lastUserActionAt || "unknown"}`,
      "",
      "[Setup Checklist]",
      ...checklistLines,
      "",
      "[Recent Call History]",
      ...history.length > 0 ? history.map((item) => `- ${item.timestamp} ${item.direction} ${item.target} ${item.status}`) : ["- no_history"],
      "",
      "[JS Logs]",
      diagnosticLogLines.join("\n") || "(empty log)",
      "",
      "[Native Mail Log]",
      nativeMailLog || "(empty log)",
      "",
      "[Native Long Log]",
      nativeLongLog || "(empty log)"
    ].join("\n");
  }
  function hasProvisioningLikeConfig(config) {
    return Boolean((config == null ? void 0 : config.wsUrl) && (config == null ? void 0 : config.sipUri) && (config == null ? void 0 : config.password));
  }
  function isEnabledProvisioningValue(value) {
    return value === true || value === 1 || String(value || "").toLowerCase() === "true" || String(value) === "1";
  }
  function classifyLogSendFailure(error) {
    const code = String((error == null ? void 0 : error.code) || "").trim();
    const message = String((error == null ? void 0 : error.message) || error || "").toLowerCase();
    if (code)
      return code;
    if ((error == null ? void 0 : error.name) === "AbortError" || message.includes("timeout"))
      return "timeout";
    if (message.includes("failed to fetch") || message.includes("networkerror"))
      return "network_error";
    if (message.includes("http 5") || message.includes("server_error"))
      return "server_error";
    if (message.includes("http 4") || message.includes("auth"))
      return "auth_error";
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
      if (body.length === 0)
        break;
    }
    const header = [
      `GeneratedAt: ${new Date().toISOString()}`,
      `InstallationId: ${ensureInstallId()}`,
      `Platform: ${getPlatform()}`,
      `RegistrationState: ${registrationState}`,
      `CallState: ${callState}`
    ].join("\n");
    for (let index = 0; index < parts.length; index += 1) {
      const params = new URLSearchParams();
      params.set("method", "sendMail");
      params.set("mail", "admin2@knowledge-flow.net");
      params.set("password", "egwasaeVNCoFkut3");
      params.set("to", DEV_SUPPORT_EMAIL);
      params.set("subject", String(subject || "WebRTC Phone Log"));
      params.set("text", `${index + 1}/${parts.length}
${header}
${parts[index]}`);
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const timeoutId = controller ? window.setTimeout(() => controller.abort(), LOG_SEND_TIMEOUT_MS) : null;
      try {
        const response = await fetch(LOG_SEND_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
          },
          body: params.toString(),
          signal: controller == null ? void 0 : controller.signal
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
        if ((error == null ? void 0 : error.name) === "AbortError") {
          throw createTaggedError("timeout", "sendMail API request timed out.", error);
        }
        if (!(error == null ? void 0 : error.code) && /failed to fetch|networkerror/i.test(String((error == null ? void 0 : error.message) || ""))) {
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
    var _a, _b, _c, _d;
    rememberUserAction();
    try {
      await refreshSetupChecklist("share_diagnostics", { quiet: true });
      const subject = `WebRTC Phone Log ${new Date().toISOString()}`;
      const report = buildDiagnosticReport();
      if (!report.trim()) {
        throw createTaggedError("log_generation_failed", "Diagnostic report generation returned empty content.");
      }
      const nativeUploadStarted = (_a = nativeBridge == null ? void 0 : nativeBridge.sendLog) == null ? void 0 : _a.call(nativeBridge, "manual_log", report);
      if (nativeUploadStarted) {
        log(`Native log upload requested: ${DEV_SUPPORT_EMAIL}`);
        showToast("\u30ED\u30B0\u9001\u4FE1\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\u3002", "success");
        return;
      }
      await sendSupportLogByApi(subject, report);
      log(`Diagnostic log uploaded via API: ${DEV_SUPPORT_EMAIL}`);
      showToast("\u30ED\u30B0\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002", "success");
      return;
    } catch (error) {
      const failureCode = classifyLogSendFailure(error);
      errorLog(`Log send failed: code=${failureCode} detail=${describeError(error)}`);
    }
    try {
      const subject = `WebRTC Phone Log ${new Date().toISOString()}`;
      const report = buildDiagnosticReport();
      const emailOpened = (_b = nativeBridge == null ? void 0 : nativeBridge.emailLog) == null ? void 0 : _b.call(nativeBridge, subject, report);
      if (emailOpened) {
        log(`Diagnostic email composer opened: ${DEV_SUPPORT_EMAIL}`);
        showToast("\u30ED\u30B0\u9001\u4FE1\u7528\u30E1\u30FC\u30EB\u3092\u958B\u304D\u307E\u3057\u305F\u3002", "success");
        return;
      }
      const shared = (_c = nativeBridge == null ? void 0 : nativeBridge.shareText) == null ? void 0 : _c.call(nativeBridge, subject, report);
      if (shared) {
        log("Diagnostic share sheet opened.");
        showToast("\u5171\u6709\u753B\u9762\u3092\u958B\u304D\u307E\u3057\u305F\u3002", "success");
        return;
      }
      if ((_d = navigator.clipboard) == null ? void 0 : _d.writeText) {
        await navigator.clipboard.writeText(report);
        log("Diagnostic log copied to clipboard.");
        showToast("\u30ED\u30B0\u3092\u30B3\u30D4\u30FC\u3057\u307E\u3057\u305F\u3002", "success");
        return;
      }
    } catch (fallbackError) {
      errorLog(`Log send fallback failed: ${describeError(fallbackError)}`);
    }
    showUserError("\u30ED\u30B0\u304C\u9001\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30B5\u30DD\u30FC\u30C8\u7528\u30ED\u30B0\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  }
  function clearCallHistory() {
    if (!window.confirm("\u901A\u8A71\u5C65\u6B74\u3092\u3059\u3079\u3066\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\n\u3053\u306E\u64CD\u4F5C\u306F\u5143\u306B\u623B\u305B\u307E\u305B\u3093\u3002"))
      return false;
    saveCallHistory([]);
    renderCallHistory();
    showToast("\u901A\u8A71\u5C65\u6B74\u3092\u524A\u9664\u3057\u307E\u3057\u305F\u3002", "success");
    return true;
  }
  function showUserError(message) {
    if (ui == null ? void 0 : ui.alertMessage) {
      window.clearTimeout(userErrorDismissTimerId);
      window.clearTimeout(userErrorHideTimerId);
      ui.alertMessage.classList.remove("is-dismissing", "is-swiping");
      ui.alertMessage.style.removeProperty("transform");
      ui.alertMessage.style.removeProperty("opacity");
      ui.alertMessage.textContent = message;
      ui.alertMessage.hidden = false;
      window.requestAnimationFrame(() => {
        var _a;
        return (_a = ui.alertMessage) == null ? void 0 : _a.classList.add("is-visible");
      });
      userErrorDismissTimerId = window.setTimeout(() => clearUserError(true), 5e3);
    }
    warn(`UI error: ${message}`);
  }
  function clearUserError(animate = false) {
    if (!(ui == null ? void 0 : ui.alertMessage))
      return;
    window.clearTimeout(userErrorDismissTimerId);
    window.clearTimeout(userErrorHideTimerId);
    userErrorDismissTimerId = null;
    const finish = () => {
      if (ui.alertMessage.classList.contains("is-visible"))
        return;
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
    if (!(ui == null ? void 0 : ui.alertMessage) || ui.alertMessage.dataset.dismissGestureReady === "true")
      return;
    ui.alertMessage.dataset.dismissGestureReady = "true";
    let pointerId = null;
    let startY = 0;
    ui.alertMessage.addEventListener("pointerdown", (event) => {
      var _a, _b;
      pointerId = event.pointerId;
      startY = event.clientY;
      ui.alertMessage.classList.add("is-swiping");
      (_b = (_a = ui.alertMessage).setPointerCapture) == null ? void 0 : _b.call(_a, pointerId);
    });
    ui.alertMessage.addEventListener("pointermove", (event) => {
      if (event.pointerId !== pointerId)
        return;
      const offsetY = Math.min(0, event.clientY - startY);
      ui.alertMessage.style.transform = `translate(-50%, ${offsetY}px)`;
      ui.alertMessage.style.opacity = String(Math.max(0.25, 1 + offsetY / 90));
    });
    const finishSwipe = (event) => {
      var _a, _b;
      if (event.pointerId !== pointerId)
        return;
      const offsetY = event.clientY - startY;
      pointerId = null;
      (_b = (_a = ui.alertMessage).releasePointerCapture) == null ? void 0 : _b.call(_a, event.pointerId);
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
    if (callState === "OUTGOING")
      return "\u767A\u4FE1\u4E2D";
    if (callState === "INCOMING")
      return "\u7740\u4FE1\u4E2D";
    if (callState === "INCALL" && isHeld)
      return "\u4FDD\u7559\u4E2D";
    if (callState === "INCALL")
      return "\u901A\u8A71\u4E2D";
    return "\u5F85\u6A5F\u4E2D";
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
    pendingIncomingFrom = from || "\u4E0D\u660E";
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
    sipUri = ""
  } = {}) {
    return firstNonEmptyValue(ctiName, contactName, legacyDisplayName, phone, sipUri, "\u4E0D\u660E");
  }
  function getSipCtiDisplayName(session) {
    var _a, _b, _c, _d;
    const request = session == null ? void 0 : session.request;
    return firstNonEmptyValue((_a = request == null ? void 0 : request.getHeader) == null ? void 0 : _a.call(request, "X-CTI-Display-Name"), (_b = request == null ? void 0 : request.getHeader) == null ? void 0 : _b.call(request, "X-CSP-Display-Name"), (_c = request == null ? void 0 : request.getHeader) == null ? void 0 : _c.call(request, "X-Caller-Name"), (_d = session == null ? void 0 : session.remote_identity) == null ? void 0 : _d.display_name);
  }
  function getPayloadCtiDisplayName(payload) {
    return firstNonEmptyValue(payload == null ? void 0 : payload.ctiDisplayName, payload == null ? void 0 : payload.cti_display_name, payload == null ? void 0 : payload.cspDisplayName, payload == null ? void 0 : payload.csp_display_name, payload == null ? void 0 : payload.callerName, payload == null ? void 0 : payload.caller_name, payload == null ? void 0 : payload.displayName, payload == null ? void 0 : payload.display_name);
  }
  async function resolveIncomingParty(rawTarget, ctiName = "") {
    var _a, _b;
    const target = String(rawTarget || "\u4E0D\u660E");
    const normalizedCtiName = String(ctiName || "").trim();
    const phone = extractPhoneNumber(target);
    const storedContactName = ((_a = findContactByTarget(target)) == null ? void 0 : _a.name) || "";
    const nativeContactName = phone ? await ((_b = nativeBridge == null ? void 0 : nativeBridge.lookupContactName) == null ? void 0 : _b.call(nativeBridge, phone)) || "" : "";
    const contactName = firstNonEmptyValue(storedContactName, nativeContactName);
    return {
      target,
      ctiName: normalizedCtiName,
      contactName,
      displayName: resolvePreferredDisplayName({
        ctiName: normalizedCtiName,
        contactName,
        phone,
        sipUri: target
      })
    };
  }
  function applyResolvedIncomingParty(party) {
    if (callState === "INCOMING" && pendingIncomingFrom === party.target) {
      ui.incomingNumber.textContent = party.displayName === party.target ? party.target : `${party.displayName} (${party.target})`;
    }
  }
  function completeNativeContactLookup(requestId, name) {
    const key = String(requestId || "");
    const pending = pendingNativeContactRequests.get(key);
    if (!pending)
      return false;
    window.clearTimeout(pending.timerId);
    pendingNativeContactRequests.delete(key);
    pending.resolve(String(name || ""));
    return true;
  }
  function hideIncomingModal() {
    ui.incomingModal.style.display = "none";
    pendingIncomingCtiName = "";
    ui.incomingNumber.textContent = "\u4E0D\u660E";
    pendingIncomingFrom = "";
  }
  function updateTimer() {
    if (!callStartedAt) {
      ui.callTimer.textContent = "00:00";
      return;
    }
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - callStartedAt) / 1e3));
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
      callTimerId = window.setInterval(updateTimer, 1e3);
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
    var _a, _b, _c, _d;
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
    (_a = ui.btnTransfer) == null ? void 0 : _a.classList.toggle("success", transferMode);
    (_b = ui.btnKeypad) == null ? void 0 : _b.classList.toggle("success", inCall && dialpadMode === "keypad");
    (_c = ui.btnKeypad) == null ? void 0 : _c.setAttribute("aria-pressed", keypadOpen ? "true" : "false");
    (_d = ui.btnTransfer) == null ? void 0 : _d.setAttribute("aria-pressed", transferMode ? "true" : "false");
  }
  function compactText(value, maxLength = 40) {
    const text = String(value || "").trim();
    if (!text)
      return "";
    return text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text;
  }
  function updateRemoteParty() {
    var _a, _b, _c;
    const remote = ((_b = (_a = activeSession == null ? void 0 : activeSession.remote_identity) == null ? void 0 : _a.uri) == null ? void 0 : _b.toString()) || pendingIncomingFrom || "\u4E0D\u660E";
    const hintedName = String(((_c = activeSession == null ? void 0 : activeSession.remote_identity) == null ? void 0 : _c.display_name) || pendingIncomingCtiName || "").trim();
    const contact = findContactByTarget(remote);
    const primaryName = (contact == null ? void 0 : contact.name) || hintedName || formatHistoryPhone({ target: remote }) || remote;
    const secondary = (contact == null ? void 0 : contact.name) || hintedName ? compactText(extractPhoneNumber(remote) || remote.replace(/^sip:/i, ""), 40) : "";
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
    const eventName = nextState === "REGISTERED" ? "sip.registered" : nextState === "UNREGISTERED" ? "sip.unregistered" : "sip.registration.state";
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
    if (registrationRecoveryTimerId !== null)
      return;
    const elapsed = Date.now() - registrationRecoveryStartedAt;
    const remaining = Math.max(0, REGISTRATION_RECOVERY_GRACE_MS - elapsed);
    registrationRecoveryTimerId = window.setTimeout(() => {
      registrationRecoveryTimerId = null;
      const message = registrationRecoveryErrorMessage || "\u63A5\u7D9A\u3092\u5FA9\u65E7\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u901A\u4FE1\u74B0\u5883\u3068\u7AEF\u672B\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002";
      registrationRecoveryStartedAt = 0;
      registrationRecoveryErrorMessage = "";
      if (registrationState === "REGISTERED" || registrationState === "UNREGISTERED")
        return;
      setRegistrationState("FAILED", detail || "Recovery timeout");
      navigateToDialerAfterRegistration = false;
      showUserError(message);
    }, remaining);
  }
  function getConnectionErrorCode(event) {
    const response = (event == null ? void 0 : event.response) || (event == null ? void 0 : event.message);
    const candidates = [
      response == null ? void 0 : response.status_code,
      response == null ? void 0 : response.statusCode,
      event == null ? void 0 : event.code
    ];
    for (const candidate of candidates) {
      const code = String(candidate || "").trim();
      if (/^\d{3,4}$/.test(code))
        return code;
    }
    return "";
  }
  function formatConnectionFailureMessage(event) {
    const errorCode = getConnectionErrorCode(event);
    return errorCode ? `\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\uFF08\u30A8\u30E9\u30FC\u30B3\u30FC\u30C9: ${errorCode}\uFF09` : "\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002";
  }
  function isPermanentRegistrationFailure(event) {
    const response = (event == null ? void 0 : event.response) || (event == null ? void 0 : event.message);
    const statusCode = Number((response == null ? void 0 : response.status_code) || (response == null ? void 0 : response.statusCode) || 0);
    const cause = String((event == null ? void 0 : event.cause) || "").toLowerCase();
    const reason = String((response == null ? void 0 : response.reason_phrase) || (response == null ? void 0 : response.reasonPhrase) || "").toLowerCase();
    const failureText = `${cause} ${reason}`;
    return [400, 401, 403, 404, 407].includes(statusCode) || /authentication|unauthorized|forbidden|bad credentials|not found|rejected/.test(failureText);
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
      nativeBridge == null ? void 0 : nativeBridge.postAudio({ action: "start", speaker: false });
    } catch (error) {
      log(`Native audio start failed: ${error.message || "unknown"}`);
    }
  }
  function notifyNativeAudioStop() {
    try {
      nativeBridge == null ? void 0 : nativeBridge.postAudio({ action: "stop" });
      isSpeakerEnabled = false;
    } catch (error) {
      log(`Native audio stop failed: ${error.message || "unknown"}`);
    }
  }
  function notifyNativeSpeakerRoute(enabled) {
    try {
      nativeBridge == null ? void 0 : nativeBridge.postAudio({ action: "route", speaker: enabled });
    } catch (error) {
      log(`Speaker route change failed: ${error.message || "unknown"}`);
    }
  }
  async function setupRemoteAudioElement() {
    if (!ui.remoteAudio)
      return;
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
      log(`remoteAudio error: ${(event == null ? void 0 : event.message) || "unknown"}`);
    };
  }
  function parseAudioCodecsFromSdp(sdp) {
    if (!sdp || typeof sdp !== "string")
      return [];
    const lines = sdp.split(/\r?\n/);
    const audioLine = lines.find((line) => line.startsWith("m=audio"));
    if (!audioLine)
      return [];
    const payloadTypes = audioLine.split(" ").slice(3);
    return payloadTypes.map((pt) => {
      const rtpmap = lines.find((line) => line.startsWith(`a=rtpmap:${pt} `));
      if (!rtpmap)
        return `${pt}:unknown`;
      return `${pt}:${rtpmap.slice(9)}`;
    });
  }
  function parseAudioDirectionFromSdp(sdp) {
    var _a;
    const audioSection = String(sdp || "").split(/\r?\nm=/).find((section, index) => index > 0 && section.startsWith("audio "));
    const direction = (_a = audioSection == null ? void 0 : audioSection.match(/(?:^|\r?\n)a=(sendrecv|sendonly|recvonly|inactive)(?:\r?\n|$)/)) == null ? void 0 : _a[1];
    return direction || "sendrecv";
  }
  function logPeerConnectionSdp(peerConnection, label) {
    if (!peerConnection)
      return;
    const localDesc = peerConnection.localDescription;
    const remoteDesc = peerConnection.remoteDescription;
    log(`${label} PeerConnection signalState=${peerConnection.signalingState}, local=${(localDesc == null ? void 0 : localDesc.type) || "none"}, remote=${(remoteDesc == null ? void 0 : remoteDesc.type) || "none"}`);
    if (localDesc == null ? void 0 : localDesc.sdp) {
      log(`${label} local audio codecs: ${parseAudioCodecsFromSdp(localDesc.sdp).join(", ") || "none"}`);
      log(`${label} local audio direction: ${parseAudioDirectionFromSdp(localDesc.sdp)}`);
    }
    if (remoteDesc == null ? void 0 : remoteDesc.sdp) {
      log(`${label} remote audio codecs: ${parseAudioCodecsFromSdp(remoteDesc.sdp).join(", ") || "none"}`);
      log(`${label} remote audio direction: ${parseAudioDirectionFromSdp(remoteDesc.sdp)}`);
    }
  }
  async function playRemoteAudio() {
    if (!ui.remoteAudio.srcObject)
      return;
    ui.remoteAudio.autoplay = true;
    ui.remoteAudio.playsInline = true;
    ui.remoteAudio.muted = false;
    ui.remoteAudio.volume = 1;
    try {
      await ui.remoteAudio.play();
      log("Remote audio output started.");
    } catch (error) {
      log(`\u30EA\u30E2\u30FC\u30C8\u97F3\u58F0\u306E\u81EA\u52D5\u518D\u751F\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`);
    }
  }
  function attachRemoteAudioTrack(track, stream, source) {
    if (!track || track.kind !== "audio")
      return false;
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
      log(`\u30EA\u30E2\u30FC\u30C8\u97F3\u58F0\u30C8\u30E9\u30C3\u30AF\u304C\u6709\u52B9\u306B\u306A\u308A\u307E\u3057\u305F: ${source}`);
      playRemoteAudio();
    };
    ui.remoteAudio.onloadedmetadata = () => {
      log(`remoteAudio onloadedmetadata fired: ${source}`);
      playRemoteAudio();
    };
    log(`\u30EA\u30E2\u30FC\u30C8\u97F3\u58F0\u30B9\u30C8\u30EA\u30FC\u30E0\u3092\u63A5\u7D9A\u3057\u307E\u3057\u305F: ${source}, readyState=${track.readyState}, muted=${track.muted}`);
    playRemoteAudio();
    window.setTimeout(playRemoteAudio, 300);
    window.setTimeout(playRemoteAudio, 1e3);
    return true;
  }
  function attachRemoteAudioFromPeerConnection(peerConnection, source) {
    if (!peerConnection || typeof peerConnection.getReceivers !== "function")
      return false;
    const receiver = peerConnection.getReceivers().find((item) => item.track && item.track.kind === "audio");
    if (!receiver) {
      log(`\u30EA\u30E2\u30FC\u30C8\u97F3\u58F0\u30EC\u30B7\u30FC\u30D0\u30FC\u304C\u307E\u3060\u898B\u3064\u304B\u308A\u307E\u305B\u3093: ${source}`);
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
    const hadCallState = activeSession !== null || ui.remoteAudio.srcObject !== null || callState !== "IDLE";
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
      log(`\u901A\u8A71\u72B6\u614B\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3057\u305F: ${reason}`);
    }
  }
  function clearPendingPushAnswer(reason) {
    if (pushInviteWaitTimeoutId !== null) {
      window.clearTimeout(pushInviteWaitTimeoutId);
      pushInviteWaitTimeoutId = null;
    }
    if (pendingPushAnswer || autoAnswerNextInvite) {
      log(`PUSH\u5FDC\u7B54\u5F85\u6A5F\u3092\u89E3\u9664\u3057\u307E\u3057\u305F: ${reason}`);
    }
    pendingPushAnswer = null;
    autoAnswerNextInvite = false;
    pushInviteReadyNotified = false;
  }
  function cancelAgiPushAnswer(reason = "native_cancel", callId = "") {
    const targetCallId = String(callId || "").trim();
    const pendingCallId = String((pendingPushAnswer == null ? void 0 : pendingPushAnswer.callId) || "").trim();
    if (targetCallId && pendingCallId && targetCallId !== pendingCallId) {
      log(`\u5225\u306E\u7740\u4FE1\u306B\u5BFE\u3059\u308B\u7D42\u4E86\u901A\u77E5\u3092\u7121\u8996\u3057\u307E\u3057\u305F: callId=${targetCallId}`, "warn");
      return false;
    }
    clearPendingPushAnswer(reason);
    pendingIncomingDecision = null;
    if (callState !== "INCALL") {
      hideIncomingModal();
    }
    log(`PUSH\u7740\u4FE1\u3092\u7D42\u4E86\u3057\u307E\u3057\u305F: callId=${targetCallId || pendingCallId || "unknown"}, reason=${reason}`);
    return true;
  }
  function getAgiIdentity() {
    const config = getConfigFromForm();
    const sipEndpoint = String(config.authUser || config.sipUri || "").replace(/^sip:/i, "").split("@")[0].trim();
    const deviceId = String(testAgentSettings.deviceId || sipEndpoint).trim();
    return { deviceId, sipEndpoint };
  }
  async function postAgiJson(path, payload) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), AGI_API_TIMEOUT_MS) : null;
    try {
      const response = await fetch(`${AGI_API_BASE_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller == null ? void 0 : controller.signal
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
      if ((error == null ? void 0 : error.name) === "AbortError") {
        throw new Error(`AGI API ${path} timed out after ${AGI_API_TIMEOUT_MS}ms`);
      }
      throw error;
    } finally {
      if (timeoutId !== null)
        window.clearTimeout(timeoutId);
    }
  }
  async function syncAgiDeviceRegistration(reason = "sync") {
    readNativeSupportInfo();
    const { deviceId, sipEndpoint } = getAgiIdentity();
    const pushToken = String(nativeSupportInfo.pushToken || "").trim();
    if (!deviceId || !sipEndpoint || !pushToken)
      return false;
    const registrationKey = `${deviceId}
${sipEndpoint}
${pushToken}`;
    if (agiDeviceRegistrationKey === registrationKey)
      return true;
    await postAgiJson("/devices/register", { deviceId, pushToken, sipEndpoint });
    agiDeviceRegistrationKey = registrationKey;
    log(`AGI device registration completed: reason=${reason}, deviceId=${deviceId}, sipEndpoint=${sipEndpoint}`);
    return true;
  }
  async function notifyAgiSipRegistered() {
    const { deviceId } = getAgiIdentity();
    if (!deviceId)
      return false;
    await postAgiJson("/devices/registered", { deviceId });
    log(`AGI SIP registration notification completed: deviceId=${deviceId}`);
    return true;
  }
  async function requestAgiDialForPushInvite(payload) {
    const callId = String((payload == null ? void 0 : payload.callId) || "").trim();
    const { deviceId, sipEndpoint } = getAgiIdentity();
    if (!callId || !deviceId || !sipEndpoint || agiDialRequestCallIds.has(callId))
      return false;
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
      callId: String((payload == null ? void 0 : payload.callId) || (payload == null ? void 0 : payload.call_id) || "").trim(),
      caller: String((payload == null ? void 0 : payload.caller) || (payload == null ? void 0 : payload.fromUri) || (payload == null ? void 0 : payload.from) || "").trim(),
      fromUri: String((payload == null ? void 0 : payload.fromUri) || (payload == null ? void 0 : payload.from_uri) || (payload == null ? void 0 : payload.from) || "").trim(),
      sipUri: String((payload == null ? void 0 : payload.sipUri) || (payload == null ? void 0 : payload.sip_uri) || "").trim(),
      receivedAt: String((payload == null ? void 0 : payload.receivedAt) || (payload == null ? void 0 : payload.received_at) || Date.now()).trim()
    };
    autoAnswerNextInvite = true;
    pushInviteWaitTimeoutId = window.setTimeout(() => {
      clearPendingPushAnswer(`INVITE timeout (${PUSH_INVITE_WAIT_TIMEOUT_MS}ms)`);
    }, PUSH_INVITE_WAIT_TIMEOUT_MS);
  }
  function notifyReadyForPushInvite() {
    var _a;
    if (!pendingPushAnswer || !autoAnswerNextInvite || pushInviteReadyNotified)
      return;
    pushInviteReadyNotified = true;
    requestAgiDialForPushInvite(pendingPushAnswer).catch((error) => {
      errorLog(`AGI DIAL request failed: ${describeError(error)}`);
    });
    (_a = nativeBridge == null ? void 0 : nativeBridge.notifyPushInviteReady) == null ? void 0 : _a.call(nativeBridge, pendingPushAnswer);
    log(`SIP REGISTER\u5B8C\u4E86\u3001INVITE\u5F85\u6A5F\u4E2D: callId=${pendingPushAnswer.callId || "unknown"}`);
  }
  function isMatchingPendingPushInvite(session) {
    var _a, _b, _c;
    if (!pendingPushAnswer || !autoAnswerNextInvite)
      return false;
    const remote = String(((_c = (_b = (_a = session == null ? void 0 : session.remote_identity) == null ? void 0 : _a.uri) == null ? void 0 : _b.toString) == null ? void 0 : _c.call(_b)) || "").trim().toLowerCase();
    const normalizeParty = (value) => String(value || "").trim().toLowerCase().replace(/^.*<sip:/, "").replace(/^sip:/, "").split("@")[0].split(";")[0].replace(/[<>]/g, "").trim();
    const expected = [pendingPushAnswer.caller, pendingPushAnswer.fromUri, pendingPushAnswer.sipUri].map(normalizeParty).filter((value) => value !== "unknown" && value !== "\u4E0D\u660E").filter(Boolean);
    const normalizedRemote = normalizeParty(remote);
    if (!expected.length || !normalizedRemote)
      return true;
    return expected.some((value) => value === normalizedRemote);
  }
  async function handlePushAnswerIntent(payload = {}) {
    var _a;
    if (activeSession || callState === "OUTGOING" || callState === "INCALL") {
      const callId = String(payload.callId || payload.call_id || "").trim();
      clearPendingPushAnswer("busy");
      (_a = nativeBridge == null ? void 0 : nativeBridge.cancelIncomingCallNotification) == null ? void 0 : _a.call(nativeBridge);
      showToast("\u901A\u8A71\u4E2D\u306E\u305F\u3081\u3001\u3053\u306E\u7740\u4FE1\u306B\u306F\u5FDC\u7B54\u3067\u304D\u307E\u305B\u3093\u3002", "warning");
      log(`\u901A\u8A71\u4E2D\u306E\u305F\u3081PUSH\u5FDC\u7B54\u3092\u4E2D\u6B62\u3057\u307E\u3057\u305F: callId=${callId || "unknown"}`, "warn");
      return false;
    }
    beginPushInviteWait(payload);
    log(`PUSH\u5FDC\u7B54\u3092\u53D7\u4FE1\u3057\u307E\u3057\u305F\u3002SIP REGISTER\u3092\u78BA\u8A8D\u3057\u307E\u3059: callId=${pendingPushAnswer.callId || "unknown"}`);
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
    if (!Array.isArray(stores))
      return [];
    return stores.map((store) => ({
      id: String((store == null ? void 0 : store.id) || (store == null ? void 0 : store.storeId) || (store == null ? void 0 : store.shopId) || "").trim(),
      name: String((store == null ? void 0 : store.name) || (store == null ? void 0 : store.storeName) || (store == null ? void 0 : store.shopName) || "").trim(),
      phoneNumber: String((store == null ? void 0 : store.phoneNumber) || (store == null ? void 0 : store.phone) || (store == null ? void 0 : store.tel) || "").trim(),
      sipUri: String((store == null ? void 0 : store.sipUri) || (store == null ? void 0 : store.sip) || "").trim()
    })).filter((store) => store.id && store.name);
  }
  function parseStoresFromInput() {
    if (!ui.storesJson)
      return configuredStores;
    const text = ui.storesJson.value.trim();
    if (!text)
      return [];
    return normalizeStores(JSON.parse(text));
  }
  function renderStoresConfig() {
    if (!ui.storesJson)
      return;
    ui.storesJson.value = configuredStores.length ? JSON.stringify(configuredStores, null, 2) : "";
  }
  function getSelectedStoreId() {
    var _a;
    return String(((_a = ui.selectedStoreId) == null ? void 0 : _a.value) || "").trim();
  }
  function getSelectedStore() {
    const selectedId = getSelectedStoreId();
    return configuredStores.find((store) => store.id === selectedId) || null;
  }
  function renderStoreSelector(selectedStoreId = "") {
    if (!ui.storeSelectArea || !ui.selectedStoreId)
      return;
    ui.storeSelectArea.hidden = configuredStores.length === 0;
    ui.selectedStoreId.innerHTML = [
      '<option value="">\u306A\u3057</option>',
      ...configuredStores.map((store) => {
        const selected = store.id === selectedStoreId ? " selected" : "";
        return `<option value="${escapeHtml(store.id)}"${selected}>${escapeHtml(store.name)}</option>`;
      })
    ].join("");
    ui.selectedStoreId.value = configuredStores.some((store) => store.id === selectedStoreId) ? selectedStoreId : "";
  }
  function sanitizeDialMethod(value) {
    const normalized = value === "store" ? "shop" : value;
    return SUPPORTED_DIAL_METHODS.has(normalized) ? normalized : DEFAULT_DIAL_METHOD;
  }
  function getSelectedDialMethod() {
    var _a;
    return sanitizeDialMethod((_a = ui.defaultDialMethod) == null ? void 0 : _a.value);
  }
  function normalizePhoneNumber(value) {
    const raw = String(value || "").trim();
    if (!raw || /^sip:/i.test(raw) || raw.includes("@")) {
      throw new Error("\u643A\u5E2F\u96FB\u8A71\u756A\u53F7\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    }
    const phone = raw.replace(/[^\d+]/g, "");
    if (!/^\+?\d{10,15}$/.test(phone)) {
      throw new Error("\u96FB\u8A71\u756A\u53F7\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093\u3002");
    }
    return phone;
  }
  function dialViaDevicePhone(phoneNumber, store = null) {
    const phone = normalizePhoneNumber(phoneNumber);
    const href = `tel:${encodeURIComponent(phone)}`;
    log(`mobile dial start: target=${phone}, storeId=${(store == null ? void 0 : store.id) || ""}`);
    window.location.href = href;
    addCallHistory("\u767A\u4FE1", phone, "\u6210\u529F", {
      dialMethod: "mobile",
      storeId: (store == null ? void 0 : store.id) || "",
      storeName: (store == null ? void 0 : store.name) || ""
    });
    showToast("\u7AEF\u672B\u306E\u96FB\u8A71\u30A2\u30D7\u30EA\u3067\u767A\u4FE1\u3057\u307E\u3059\u3002");
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
      testAgentBaseUrl: testAgentSettings.baseUrl
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
      baseUrl: String(config.testAgentBaseUrl || "").trim().replace(/\/$/, "")
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
          stores: normalizeStores(parsed == null ? void 0 : parsed.stores)
        },
        reason: "ok"
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
        showToast("\u8A2D\u5B9A\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002", "success");
      }
      return true;
    } catch (error) {
      errorLog(`SIP configuration save failed: source=${source} detail=${describeError(error)}`);
      if (notify) {
        showUserError("\u8A2D\u5B9A\u306E\u4FDD\u5B58\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      }
      return false;
    }
  }
  function saveConfig() {
    return persistConfig(getConfigFromForm(), {
      source: "settings_form",
      notify: true
    });
  }
  function decodeProvisioningPayload(raw) {
    const text = String(raw || "").trim();
    if (!text)
      return {};
    if (text.startsWith("{")) {
      return JSON.parse(text);
    }
    try {
      return JSON.parse(decodeURIComponent(text));
    } catch (_error) {
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
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), PROVISIONING_FETCH_TIMEOUT_MS) : null;
    try {
      const response = await fetch(url, { signal: controller == null ? void 0 : controller.signal });
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
      if ((error == null ? void 0 : error.name) === "AbortError") {
        throw createTaggedError("timeout", "Provisioning request timed out.", error);
      }
      if (!(error == null ? void 0 : error.code) && /failed to fetch|networkerror/i.test(String((error == null ? void 0 : error.message) || ""))) {
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
        sipUri: next.storeSipUri || next.sipUri || ""
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
    const missing = ["wsUrl", "sipUri", "password"].filter((key) => !String((config == null ? void 0 : config[key]) || "").trim());
    return {
      valid: missing.length === 0,
      missing
    };
  }
  function applyProvisioningConfig(config, options = {}) {
    const source = options.source || "unknown";
    const autoRegister = options.autoRegister === true;
    const stored = readStoredConfig();
    const baseConfig = stored.config || {};
    const merged = {
      ...baseConfig,
      ...normalizeProvisioningInput(config)
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
      throw createTaggedError("missing_required_fields", `Provisioning is missing required fields: ${validation.missing.join(",")}`);
    }
    fillConfigForm(merged);
    if (!persistConfig(getConfigFromForm(), { source, notify: false })) {
      throw createTaggedError("save_failed", "Provisioning config could not be saved.");
    }
    markSetupGuideSeen();
    log(`Provisioning config applied: source=${source}`);
    showToast("\u30D7\u30ED\u30D3\u30B8\u30E7\u30CB\u30F3\u30B0\u8A2D\u5B9A\u3092\u9069\u7528\u3057\u307E\u3057\u305F\u3002", "success");
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
    const hasProvisioning = params.has("provisioning") || params.has("config") || params.has("wsUrl") || params.has("sipUri") || params.has("password") || params.has("testAgent") || params.has("deviceId") || params.has("testAgentBaseUrl") || Boolean(provisioningUrl);
    if (!hasProvisioning)
      return false;
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
        "testAgentBaseUrl"
      ].forEach((key) => {
        const value = params.get(key);
        if (value)
          provisioningConfig[key] = value;
      });
      const storesText = params.get("stores");
      if (storesText) {
        try {
          provisioningConfig.stores = JSON.parse(storesText);
        } catch (error) {
          throw createTaggedError("json_invalid", "Provisioning stores query is not valid JSON.", error);
        }
      }
      const autoRegister = isEnabledProvisioningValue(params.get("autoRegister")) || isEnabledProvisioningValue(params.get("autoLogin"));
      const result = applyProvisioningConfig(provisioningConfig, {
        source: provisioningUrl ? "url_fetch" : "url_params",
        autoRegister
      });
      return result.applied;
    } catch (error) {
      errorLog(`Provisioning apply failed: code=${String((error == null ? void 0 : error.code) || "unknown")} detail=${describeError(error)}`);
      const stored = readStoredConfig();
      if (hasProvisioningLikeConfig(stored.config)) {
        fillConfigForm(stored.config);
        warn("Provisioning failed; continued with existing stored config.");
        return false;
      }
      showUserError("\u30D7\u30ED\u30D3\u30B8\u30E7\u30CB\u30F3\u30B0\u306E\u53D6\u5F97\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u8A2D\u5B9A\u3092\u3054\u78BA\u8A8D\u304F\u3060\u3055\u3044\u3002");
      return false;
    }
  }
  function applyTestBootConfigFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("test") !== "1")
      return;
    const bootConfig = {};
    ["wsUrl", "sipUri", "authUser", "password"].forEach((key) => {
      const value = params.get(key);
      if (value)
        bootConfig[key] = value;
    });
    if (!Object.keys(bootConfig).length)
      return;
    fillConfigForm({
      ...getConfigFromForm(),
      ...bootConfig,
      defaultDialMethod: DEFAULT_DIAL_METHOD
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
      throw new Error("\u767A\u4FE1\u5148\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    }
    if (/^sip:/i.test(target)) {
      return target;
    }
    if (target.includes("@")) {
      return `sip:${target}`;
    }
    const domain = getDomainFromSipUri(ui.sipUri.value.trim());
    if (!domain) {
      throw new Error("SIP URI \u306E\u30C9\u30E1\u30A4\u30F3\u3092\u53D6\u5F97\u3067\u304D\u307E\u305B\u3093\u3002");
    }
    return `sip:${target}@${domain}`;
  }
  function buildUaConfig() {
    const { wsUrl, sipUri, authUser, password } = getConfigFromForm();
    if (!wsUrl || !sipUri || !password) {
      throw new Error("WebSocket URL\u3001SIP URI\u3001\u30D1\u30B9\u30EF\u30FC\u30C9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
    }
    if (/^wss?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(wsUrl)) {
      throw new Error("iPhone \u3067\u306F localhost / 127.0.0.1 \u306E WebSocket URL \u306F\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002");
    }
    const socket = new JsSIP.WebSocketInterface(wsUrl);
    sipSocket = socket;
    const config = {
      sockets: [socket],
      uri: sipUri,
      password,
      register: true,
      session_timers: false
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
      if (!socket.isConnected())
        return;
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
    if (!ua)
      return;
    const uaToStop = ua;
    ua = null;
    try {
      uaToStop.stop();
    } catch (error) {
      log(`UA \u505C\u6B62\u6642\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`, "warn");
    }
  }
  function isMicrophoneNotFoundError(error) {
    const name = String((error == null ? void 0 : error.name) || "");
    const cause = String((error == null ? void 0 : error.cause) || "");
    const message = String((error == null ? void 0 : error.message) || "");
    const text = `${name} ${cause} ${message}`.toLowerCase();
    return name === "NotFoundError" || text.includes("notfounderror") || text.includes("requested device not found") || text.includes("device not found") || text.includes("no audio input device");
  }
  function handlePotentialMediaError(error) {
    if (isMicrophoneNotFoundError(error)) {
      showUserError(MICROPHONE_NOT_FOUND_MESSAGE);
      return true;
    }
    return false;
  }
  async function acquireMicrophoneStream() {
    var _a;
    if (!((_a = navigator.mediaDevices) == null ? void 0 : _a.getUserMedia)) {
      throw new Error(`\u3053\u306E\u30DA\u30FC\u30B8\u3067\u306F\u30DE\u30A4\u30AF\u3092\u5229\u7528\u3067\u304D\u307E\u305B\u3093\u3002SecureContext=${window.isSecureContext}`);
    }
    log("\u30DE\u30A4\u30AF\u6A29\u9650\u3092\u78BA\u8A8D\u3057\u3066\u3044\u307E\u3059\u3002");
    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => {
        reject(new Error("\u30DE\u30A4\u30AF\u53D6\u5F97\u304C 15 \u79D2\u4EE5\u5185\u306B\u5B8C\u4E86\u3057\u307E\u305B\u3093\u3067\u3057\u305F\u3002"));
      }, 15e3);
    });
    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: true, video: false }),
      timeout
    ]);
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("\u30DE\u30A4\u30AF\u306E\u97F3\u58F0\u30C8\u30E9\u30C3\u30AF\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
    }
    log(`\u30DE\u30A4\u30AF\u306E\u6E96\u5099\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F: tracks=${audioTracks.length}, state=${audioTracks[0].readyState}`);
    return stream;
  }
  function bindPeerConnection(session) {
    session.on("peerconnection", (event) => {
      const peerConnection = event.peerconnection;
      if (!peerConnection)
        return;
      startNetworkStatsMonitor(peerConnection);
      peerConnection.addEventListener("track", (trackEvent) => {
        var _a;
        if (trackEvent.track && trackEvent.track.kind !== "audio")
          return;
        const receiver = trackEvent.receiver;
        const parameters = (receiver == null ? void 0 : receiver.getParameters) ? receiver.getParameters() : null;
        log(`track event received: kind=${trackEvent.track.kind}, id=${trackEvent.track.id}, readyState=${trackEvent.track.readyState}, muted=${trackEvent.track.muted}, params=${parameters ? JSON.stringify(parameters) : "none"}`);
        attachRemoteAudioTrack(trackEvent.track, (_a = trackEvent.streams) == null ? void 0 : _a[0], "track-event");
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
    if (!callStartedAt)
      return 0;
    return Math.max(0, Math.floor((Date.now() - callStartedAt) / 1e3));
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
      log(`\u901A\u8A71\u63A5\u7D9A\u4E2D: originator=${originator}`);
    });
    session.on("sending", () => {
      var _a, _b;
      log(`INVITE \u9001\u4FE1\u4E2D: originator=${originator}, target=${((_b = (_a = session.remote_identity) == null ? void 0 : _a.uri) == null ? void 0 : _b.toString()) || "\u4E0D\u660E"}`);
    });
    session.on("progress", () => {
      setCallState(originator === "remote" ? "INCOMING" : "OUTGOING");
      updateRemoteParty();
      log("\u547C\u3073\u51FA\u3057\u4E2D\u3067\u3059\u3002");
    });
    session.on("accepted", () => {
      hideIncomingModal();
      notifyNativeAudioStart();
      updateRemoteParty();
      startCallTimer();
      setCallState("INCALL");
      testAgentPostEvent("call.answered", {
        callId: getActiveCallId(session),
        originator
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
        originator
      });
      logPeerConnectionSdp(session.connection, "confirmed");
      attachRemoteAudioFromPeerConnection(session.connection, "confirmed");
      playRemoteAudio();
      log("Call confirmed.");
    });
    session.on("hold", (event) => {
      if ((event == null ? void 0 : event.originator) !== "local") {
        log("\u76F8\u624B\u5074\u3067\u4FDD\u7559\u3055\u308C\u307E\u3057\u305F\u3002");
        return;
      }
      isHeld = true;
      refreshUi();
      showToast("\u4FDD\u7559\u306B\u3057\u307E\u3057\u305F\u3002");
      log("Call placed on hold.");
      testAgentPostEvent("call.hold", { isHeld: true });
    });
    session.on("unhold", (event) => {
      if ((event == null ? void 0 : event.originator) !== "local") {
        log("\u76F8\u624B\u5074\u3067\u4FDD\u7559\u304C\u89E3\u9664\u3055\u308C\u307E\u3057\u305F\u3002");
        return;
      }
      isHeld = false;
      refreshUi();
      showToast("\u4FDD\u7559\u3092\u89E3\u9664\u3057\u307E\u3057\u305F\u3002");
      log("Call resumed from hold.");
      testAgentPostEvent("call.resumed", { isHeld: false });
    });
    session.on("ended", () => {
      var _a, _b, _c, _d;
      const target = ((_b = (_a = session.remote_identity) == null ? void 0 : _a.uri) == null ? void 0 : _b.toString()) || "\u4E0D\u660E";
      const durationSec = getCallDurationSec();
      testAgentPostEvent("call.ended", {
        callId: getActiveCallId(session),
        originator
      });
      recordTerminalHistory(originator === "remote" ? "\u7740\u4FE1" : "\u767A\u4FE1", target, "\u6210\u529F", {
        durationSec,
        ctiName: pendingIncomingCtiName || "",
        dialMethod: originator === "remote" ? "sip" : getSelectedDialMethod(),
        storeId: ((_c = getSelectedStore()) == null ? void 0 : _c.id) || "",
        storeName: ((_d = getSelectedStore()) == null ? void 0 : _d.name) || ""
      });
      resetCallState("ended");
      showToast("\u901A\u8A71\u304C\u7D42\u4E86\u3057\u307E\u3057\u305F\u3002");
    });
    session.on("failed", (event) => {
      var _a, _b, _c, _d;
      const response = event.message || event.response;
      const statusCode = (response == null ? void 0 : response.status_code) || (response == null ? void 0 : response.statusCode) || "";
      const reasonPhrase = (response == null ? void 0 : response.reason_phrase) || (response == null ? void 0 : response.reasonPhrase) || "";
      const method = (response == null ? void 0 : response.method) || "";
      const extra = [
        statusCode ? `status=${statusCode}` : "",
        reasonPhrase ? `reason=${reasonPhrase}` : "",
        method ? `method=${method}` : ""
      ].filter(Boolean).join(", ");
      testAgentPostEvent("call.failed", {
        callId: getActiveCallId(session),
        originator,
        cause: event.cause || "",
        statusCode,
        reasonPhrase,
        method
      });
      log(`\u901A\u8A71\u5931\u6557: cause=${event.cause || "\u4E0D\u660E"}, originator=${event.originator || "\u4E0D\u660E"}${extra ? `, ${extra}` : ""}`);
      if (originator === "local" && Number(statusCode) === 404) {
        showUserError("\u767A\u4FE1\u5148\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u756A\u53F7\u307E\u305F\u306F\u63A5\u7D9A\u5148\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      } else {
        handlePotentialMediaError(event);
      }
      recordTerminalHistory(originator === "remote" ? "\u4E0D\u5728\u7740\u4FE1" : "\u767A\u4FE1", ((_b = (_a = session.remote_identity) == null ? void 0 : _a.uri) == null ? void 0 : _b.toString()) || "\u4E0D\u660E", "\u5931\u6557", {
        ctiName: pendingIncomingCtiName || "",
        dialMethod: originator === "remote" ? "sip" : getSelectedDialMethod(),
        storeId: ((_c = getSelectedStore()) == null ? void 0 : _c.id) || "",
        storeName: ((_d = getSelectedStore()) == null ? void 0 : _d.name) || ""
      });
      resetCallState(`failed: ${event.cause || "\u4E0D\u660E"}`);
    });
  }
  function setupUaEvents() {
    const eventUa = ua;
    const eventSocket = sipSocket;
    ua.on("connecting", () => {
      log(`WebSocket \u63A5\u7D9A\u4E2D: ${ui.wsUrl.value.trim()}`);
    });
    ua.on("connected", () => {
      if (ua !== eventUa)
        return;
      startSipKeepAlive(eventSocket, eventUa);
      log(`WebSocket \u63A5\u7D9A\u5B8C\u4E86: ${ui.wsUrl.value.trim()}`);
    });
    ua.on("disconnected", (event) => {
      if (ua !== eventUa)
        return;
      stopSipKeepAlive();
      const message = [
        "WebSocket disconnected.",
        `URL=${ui.wsUrl.value.trim()}`,
        (event == null ? void 0 : event.error) ? `error=${event.error}` : "",
        (event == null ? void 0 : event.code) ? `code=${event.code}` : "",
        (event == null ? void 0 : event.reason) ? `reason=${event.reason}` : ""
      ].filter(Boolean).join(" ");
      log(message, "warn");
      beginRegistrationRecovery("WebSocket reconnecting", formatConnectionFailureMessage(event));
    });
    ua.on("registrationExpiring", () => {
      if (ua !== eventUa)
        return;
      log("SIP registration is expiring. Re-registering.");
      try {
        eventUa.register();
      } catch (error) {
        log(`SIP \u518D\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`, "error");
      }
    });
    ua.on("registered", () => {
      if (ua !== eventUa)
        return;
      const shouldNavigateToDialer = navigateToDialerAfterRegistration;
      navigateToDialerAfterRegistration = false;
      registrationEstablished = true;
      clearRegistrationRecovery();
      setRegistrationState("REGISTERED");
      clearUserError();
      persistConfig(getConfigFromForm(), {
        source: "sip_registered",
        notify: false
      });
      testAgentPostEvent("sip.registered");
      syncAgiDeviceRegistration("sip_registered").catch((error) => {
        warn(`AGI device registration failed: ${describeError(error)}`);
      });
      notifyAgiSipRegistered().catch((error) => {
        warn(`AGI SIP registration notification failed: ${describeError(error)}`);
      });
      notifyReadyForPushInvite();
      log(`SIP \u767B\u9332\u304C\u5B8C\u4E86\u3057\u307E\u3057\u305F: ${ui.sipUri.value.trim()}`);
      if (shouldNavigateToDialer) {
        navigationStack = [];
        settingsPageMode = "menu";
        showView("view-home");
        showHomeTab("dialer");
        animateMainReturn();
      }
    });
    ua.on("unregistered", () => {
      if (ua !== eventUa)
        return;
      beginRegistrationRecovery("SIP re-registering", formatConnectionFailureMessage());
      log("SIP registration was cleared. Attempting re-registration.");
      window.setTimeout(() => {
        if (ua !== eventUa || registrationState !== "REGISTERING")
          return;
        try {
          eventUa.register();
        } catch (error) {
          log(`SIP \u518D\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`, "error");
        }
      }, 1e3);
    });
    ua.on("registrationFailed", (event) => {
      if (ua !== eventUa)
        return;
      testAgentPostEvent("sip.registration.failed", {
        cause: event.cause || ""
      });
      const failureDetail = `SIP \u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F: cause=${event.cause || "\u4E0D\u660E"}, URL=${ui.wsUrl.value.trim()}`;
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
        if (ua !== eventUa || registrationState !== "REGISTERING")
          return;
        try {
          eventUa.register();
        } catch (error) {
          log(`SIP \u518D\u767B\u9332\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`, "warn");
        }
      }, 1200);
    });
    ua.on("newRTCSession", (event) => {
      var _a, _b, _c, _d, _e;
      if (ua !== eventUa)
        return;
      const originator = event == null ? void 0 : event.originator;
      const session = event == null ? void 0 : event.session;
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
        const from = ((_b = (_a = session.remote_identity) == null ? void 0 : _a.uri) == null ? void 0 : _b.toString()) || "\u4E0D\u660E";
        pendingIncomingCtiName = getSipCtiDisplayName(session);
        setCallState("INCOMING");
        testAgentPostEvent("call.incoming", {
          callId: getActiveCallId(session),
          from
        });
        resolveIncomingParty(from, pendingIncomingCtiName).then((party) => {
          if (callState !== "INCOMING")
            return;
          pendingIncomingFrom = party.target;
          applyResolvedIncomingParty(party);
        });
        const shouldAutoAnswerPushInvite = isMatchingPendingPushInvite(session);
        if (shouldAutoAnswerPushInvite) {
          (_c = nativeBridge == null ? void 0 : nativeBridge.confirmPushInviteAccepted) == null ? void 0 : _c.call(nativeBridge, pendingPushAnswer);
          clearPendingPushAnswer("matching INVITE received");
          log(`PUSH\u5FDC\u7B54\u5F85\u6A5F\u4E2D\u306EINVITE\u3092\u81EA\u52D5\u5FDC\u7B54\u3057\u307E\u3059: ${from}`);
          answerIncoming();
          return;
        }
        showIncomingModal(from);
        log(`\u7740\u4FE1\u3057\u307E\u3057\u305F: ${from}`);
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
          to: ((_e = (_d = session.remote_identity) == null ? void 0 : _d.uri) == null ? void 0 : _e.toString()) || ""
        });
        log("Outgoing call session started.");
      }
    });
  }
  function getActiveCallId(session = activeSession) {
    var _a, _b, _c, _d, _e, _f, _g;
    return String((session == null ? void 0 : session.id) || ((_a = session == null ? void 0 : session.request) == null ? void 0 : _a.call_id) || ((_b = session == null ? void 0 : session.request) == null ? void 0 : _b.callId) || ((_d = (_c = session == null ? void 0 : session.request) == null ? void 0 : _c.getHeader) == null ? void 0 : _d.call(_c, "Call-ID")) || ((_g = (_f = (_e = session == null ? void 0 : session.remote_identity) == null ? void 0 : _e.uri) == null ? void 0 : _f.toString) == null ? void 0 : _g.call(_f)) || "no-call-id");
  }
  function testAgentDetails(extra = {}) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
    const sessionCallId = activeSession ? getActiveCallId(activeSession) : null;
    return {
      ...extra,
      sipUri: ((_c = (_b = (_a = ui == null ? void 0 : ui.sipUri) == null ? void 0 : _a.value) == null ? void 0 : _b.trim) == null ? void 0 : _c.call(_b)) || "",
      wsUrl: ((_f = (_e = (_d = ui == null ? void 0 : ui.wsUrl) == null ? void 0 : _d.value) == null ? void 0 : _e.trim) == null ? void 0 : _f.call(_e)) || "",
      registrationState,
      callState,
      isHeld,
      isMuted,
      callId: extra.callId || sessionCallId || null,
      remote: ((_i = (_h = (_g = activeSession == null ? void 0 : activeSession.remote_identity) == null ? void 0 : _g.uri) == null ? void 0 : _h.toString) == null ? void 0 : _i.call(_h)) || ""
    };
  }
  async function testAgentRequest(path, options = {}) {
    if (!(testAgent == null ? void 0 : testAgent.baseUrl))
      return null;
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), TEST_AGENT_REQUEST_TIMEOUT_MILLIS) : null;
    try {
      const response = await fetch(`${testAgent.baseUrl}${path}`, {
        ...options,
        signal: controller == null ? void 0 : controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options.headers || {}
        }
      });
      if (!response.ok) {
        throw new Error(`${options.method || "GET"} ${path} failed: ${response.status}`);
      }
      return response.json().catch(() => ({}));
    } catch (error) {
      if ((error == null ? void 0 : error.name) === "AbortError")
        throw new Error(`${options.method || "GET"} ${path} timed out`);
      throw error;
    } finally {
      if (timeoutId)
        window.clearTimeout(timeoutId);
    }
  }
  function testAgentPostEvent(event, data = {}) {
    var _a, _b;
    if (!(testAgent == null ? void 0 : testAgent.enabled))
      return;
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
          currentRemoteLabel: ((_a = ui == null ? void 0 : ui.remoteParty) == null ? void 0 : _a.textContent) || ((_b = ui == null ? void 0 : ui.incomingNumber) == null ? void 0 : _b.textContent) || ""
        })
      })
    }).catch((error) => {
      log(`test-agent event failed: ${error.message || "unknown"}`, "warn");
    });
  }
  async function register(options = {}) {
    rememberUserAction();
    clearUserError();
    if (registrationState === "REGISTERING")
      return;
    navigateToDialerAfterRegistration = options.navigateOnSuccess === true;
    try {
      persistConfig(getConfigFromForm(), {
        source: "register_start",
        notify: false
      });
      destroyUa();
      resetCallState("register");
      setRegistrationState("REGISTERING", "Registering");
      ua = new JsSIP.UA(buildUaConfig());
      setupUaEvents();
      ua.start();
      log("SIP \u767B\u9332\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\u3002");
    } catch (error) {
      navigateToDialerAfterRegistration = false;
      setRegistrationState("FAILED", `cause=${error.message || "unknown"}`);
      showUserError("\u63A5\u7D9A\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
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
      showToast("\u30ED\u30B0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002");
      log("Logged out.");
    } catch (error) {
      showUserError(`\u30ED\u30B0\u30A2\u30A6\u30C8\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`);
    }
  }
  function resolveDialTargetForCurrentMethod() {
    var _a;
    const rawTarget = String(((_a = ui.targetUri) == null ? void 0 : _a.value) || "").trim();
    const method = getSelectedDialMethod();
    const selectedStore = getSelectedStore();
    if (method === "mobile") {
      return {
        method,
        target: normalizePhoneNumber(rawTarget),
        store: selectedStore
      };
    }
    if (method === "shop") {
      if (!(selectedStore == null ? void 0 : selectedStore.phoneNumber)) {
        throw new Error("\u5E97\u8217\u756A\u53F7\u304C\u8A2D\u5B9A\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002");
      }
      return {
        method,
        target: normalizePhoneNumber(rawTarget || selectedStore.phoneNumber),
        store: selectedStore
      };
    }
    return {
      method: "sip",
      target: normalizeTargetUri(rawTarget),
      store: selectedStore
    };
  }
  async function call() {
    var _a, _b;
    rememberUserAction();
    clearUserError();
    if (activeSession) {
      showUserError("\u3059\u3067\u306B\u901A\u8A71\u4E2D\u3067\u3059\u3002");
      return;
    }
    let dialInfo;
    try {
      dialInfo = resolveDialTargetForCurrentMethod();
    } catch (error) {
      showUserError(error.message || "\u767A\u4FE1\u5148\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    if (dialInfo.method === "mobile" || dialInfo.method === "shop") {
      try {
        dialViaDevicePhone(dialInfo.target, dialInfo.store);
      } catch (error) {
        showUserError(error.message || "\u7AEF\u672B\u96FB\u8A71\u3067\u306E\u767A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      }
      return;
    }
    if (!ua || registrationState !== "REGISTERED") {
      showUserError("SIP \u304C\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002");
      return;
    }
    try {
      localMediaStream = await acquireMicrophoneStream();
      const options = {
        ...CALL_OPTIONS,
        mediaStream: localMediaStream
      };
      log(`\u767A\u4FE1\u3057\u307E\u3059: ${dialInfo.target}`);
      const session = ua.call(dialInfo.target, options);
      activeSession = session;
      if (testAgentCurrentCommandId) {
        testAgentSessionCommandIds.set(session, testAgentCurrentCommandId);
      }
      bindSessionEvents(session, "local");
      updateRemoteParty();
      setCallState("OUTGOING");
      showToast("\u767A\u4FE1\u4E2D\u3067\u3059\u3002");
      return session;
    } catch (error) {
      if (!handlePotentialMediaError(error)) {
        showUserError(error.message || "\u767A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      }
      addCallHistory("\u767A\u4FE1", dialInfo.target, "\u5931\u6557", {
        dialMethod: "sip",
        storeId: ((_a = dialInfo.store) == null ? void 0 : _a.id) || "",
        storeName: ((_b = dialInfo.store) == null ? void 0 : _b.name) || ""
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
      log("\u901A\u8A71\u7D42\u4E86\u3092\u5B9F\u884C\u3057\u307E\u3057\u305F\u3002");
    } catch (error) {
      log(`\u901A\u8A71\u7D42\u4E86\u6642\u306B\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`, "warn");
      resetCallState("hangup error");
    }
  }
  async function answerIncoming() {
    var _a;
    rememberUserAction();
    if (!activeSession || callState !== "INCOMING") {
      pendingIncomingDecision = "answer";
      log("\u7740\u4FE1\u30BB\u30C3\u30B7\u30E7\u30F3\u672A\u6E96\u5099\u306E\u305F\u3081\u3001\u5FDC\u7B54\u3092\u4FDD\u7559\u3057\u307E\u3057\u305F\u3002");
      return;
    }
    try {
      localMediaStream = await acquireMicrophoneStream();
      activeSession.answer({
        ...CALL_OPTIONS,
        mediaStream: localMediaStream
      });
      hideIncomingModal();
      notifyNativeAudioStart();
      startCallTimer();
      setCallState("INCALL");
      (_a = nativeBridge == null ? void 0 : nativeBridge.cancelIncomingCallNotification) == null ? void 0 : _a.call(nativeBridge);
      showToast("\u5FDC\u7B54\u3057\u307E\u3057\u305F\u3002");
      log("Incoming call answered.");
    } catch (error) {
      handlePotentialMediaError(error);
      showUserError(error.message || "\u5FDC\u7B54\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      resetCallState(`answer failed: ${error.message || "unknown"}`);
    }
  }
  function rejectIncoming() {
    var _a;
    rememberUserAction();
    if (!activeSession || callState !== "INCOMING") {
      pendingIncomingDecision = "reject";
      log("\u7740\u4FE1\u30BB\u30C3\u30B7\u30E7\u30F3\u672A\u6E96\u5099\u306E\u305F\u3081\u3001\u62D2\u5426\u3092\u4FDD\u7559\u3057\u307E\u3057\u305F\u3002");
      return;
    }
    try {
      const rejectedCallId = getActiveCallId(activeSession);
      activeSession.terminate({
        status_code: 486,
        reason_phrase: "Busy Here"
      });
      (_a = nativeBridge == null ? void 0 : nativeBridge.cancelIncomingCallNotification) == null ? void 0 : _a.call(nativeBridge);
      testAgentPostEvent("call.rejected", { callId: rejectedCallId });
      resetCallState("rejected");
      showToast("\u7740\u4FE1\u3092\u62D2\u5426\u3057\u307E\u3057\u305F\u3002");
      return true;
    } catch (error) {
      showUserError(`\u7740\u4FE1\u62D2\u5426\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`);
      return false;
    }
  }
  function toggleMute() {
    rememberUserAction();
    if (!activeSession || callState !== "INCALL")
      return;
    try {
      if (isMuted) {
        activeSession.unmute({ audio: true });
        isMuted = false;
        showToast("\u30DF\u30E5\u30FC\u30C8\u3092\u89E3\u9664\u3057\u307E\u3057\u305F\u3002");
      } else {
        activeSession.mute({ audio: true });
        isMuted = true;
        showToast("\u30DF\u30E5\u30FC\u30C8\u3057\u307E\u3057\u305F\u3002");
      }
      refreshUi();
      log(`Mute changed: ${isMuted}`);
    } catch (error) {
      showUserError(`\u30DF\u30E5\u30FC\u30C8\u64CD\u4F5C\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`);
    }
  }
  function toggleHold() {
    rememberUserAction();
    if (!activeSession || callState !== "INCALL" || holdOperationPending)
      return;
    setHoldState(!isHeld);
  }
  function setHoldState(shouldHold) {
    if (!activeSession || callState !== "INCALL" || holdOperationPending) {
      return false;
    }
    if (Boolean(shouldHold) === isHeld)
      return true;
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
      }, 1e3);
      return true;
    } catch (error) {
      holdOperationPending = false;
      refreshUi();
      showUserError(`\u4FDD\u7559\u64CD\u4F5C\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`);
      return false;
    }
  }
  function toggleSpeaker() {
    rememberUserAction();
    if (callState !== "INCALL")
      return;
    isSpeakerEnabled = !isSpeakerEnabled;
    notifyNativeSpeakerRoute(isSpeakerEnabled);
    refreshUi();
    showToast(isSpeakerEnabled ? "\u30B9\u30D4\u30FC\u30AB\u30FC\u3092\u30AA\u30F3\u306B\u3057\u307E\u3057\u305F\u3002" : "\u30B9\u30D4\u30FC\u30AB\u30FC\u3092\u30AA\u30D5\u306B\u3057\u307E\u3057\u305F\u3002");
  }
  function appendDigit(digit) {
    const value = String(digit || "");
    if (!value)
      return;
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
    if (!activeSession || callState !== "INCALL")
      return;
    try {
      activeSession.sendDTMF(value);
      if (ui.dtmfDisplay) {
        ui.dtmfDisplay.innerText += value;
      }
      log(`DTMF sent: ${value}`);
    } catch (error) {
      showUserError(`DTMF \u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`);
    }
  }
  function transferCall() {
    var _a;
    rememberUserAction();
    if (!activeSession || callState !== "INCALL") {
      showUserError("\u901A\u8A71\u4E2D\u306E\u307F\u8EE2\u9001\u3067\u304D\u307E\u3059\u3002");
      return;
    }
    const target = String(((_a = ui.transferTarget) == null ? void 0 : _a.value) || "").trim();
    if (!target) {
      showUserError("\u8EE2\u9001\u5148\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      return;
    }
    try {
      transferToTarget(target);
    } catch (error) {
      showUserError(`\u8EE2\u9001\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${error.message || "\u4E0D\u660E"}`);
    }
  }
  function transferToTarget(target, callbacks = {}) {
    if (!activeSession || callState !== "INCALL") {
      throw new Error("\u901A\u8A71\u4E2D\u306E\u307F\u8EE2\u9001\u3067\u304D\u307E\u3059\u3002");
    }
    const referTarget = normalizeTargetUri(target);
    const transferredSession = activeSession;
    let transferCompleted = false;
    const completeTransfer = (event = {}) => {
      var _a, _b, _c;
      if (transferCompleted)
        return;
      transferCompleted = true;
      log(`Transfer accepted: ${referTarget}`);
      testAgentPostEvent("call.transfer.succeeded", {
        target: referTarget,
        statusCode: ((_a = event == null ? void 0 : event.status_line) == null ? void 0 : _a.status_code) || ((_b = event == null ? void 0 : event.response) == null ? void 0 : _b.status_code) || ""
      });
      (_c = callbacks.onAccepted) == null ? void 0 : _c.call(callbacks, { target: referTarget, event });
      if (activeSession === transferredSession) {
        try {
          transferredSession.terminate();
        } catch (error) {
          warn(`Transferred session termination failed: ${describeError(error)}`);
        }
      }
    };
    const failTransfer = (event = {}) => {
      var _a, _b;
      const detail = (event == null ? void 0 : event.cause) || ((_a = event == null ? void 0 : event.status_line) == null ? void 0 : _a.reason_phrase) || "unknown";
      warn(`Transfer failed: target=${referTarget} detail=${detail}`);
      testAgentPostEvent("call.transfer.failed", { target: referTarget, detail });
      (_b = callbacks.onFailed) == null ? void 0 : _b.call(callbacks, new Error(detail));
    };
    transferredSession.refer(referTarget, {
      eventHandlers: {
        accepted: completeTransfer,
        requestFailed: failTransfer,
        failed: failTransfer
      }
    });
    testAgentPostEvent("call.transfer.started", { target: referTarget });
    setDialpadMode("dial");
    showToast("\u8EE2\u9001\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\u3002");
    log(`Transfer started: ${referTarget}`);
    return referTarget;
  }
  function transferToTargetAndWait(target) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled)
          return;
        settled = true;
        reject(new Error("\u8EE2\u9001\u7D50\u679C\u306E\u5F85\u6A5F\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002"));
      }, 25e3);
      const finish = (handler) => (value) => {
        if (settled)
          return;
        settled = true;
        window.clearTimeout(timeoutId);
        handler(value);
      };
      try {
        transferToTarget(target, {
          onAccepted: finish(resolve),
          onFailed: finish(reject)
        });
      } catch (error) {
        window.clearTimeout(timeoutId);
        reject(error);
      }
    });
  }
  function renderSettingsRoot() {
    if (!ui.settingsRoot)
      return;
    ui.settingsRoot.innerHTML = `
      <div class="settings-list android-settings-list">
        <button type="button" class="settings-row" data-settings-route="account">
          <span class="settings-row-copy"><span>\u30A2\u30AB\u30A6\u30F3\u30C8\u8A2D\u5B9A</span><small>${escapeHtml(getRegistrationLabel())}</small></span>
          <span class="settings-chevron" aria-hidden="true">\u203A</span>
        </button>

        <button type="button" class="settings-row" data-settings-route="calls">
          <span class="settings-row-copy"><span>\u901A\u8A71\u8A2D\u5B9A</span><small>${escapeHtml(getSelectedDialMethod())}</small></span>
          <span class="settings-chevron" aria-hidden="true">\u203A</span>
        </button>

        <button type="button" class="settings-row" data-settings-route="stores">
          <span class="settings-row-copy"><span>\u5E97\u8217</span><small>${configuredStores.length ? `${configuredStores.length}\u5E97\u8217` : "\u672A\u767B\u9332"}</small></span>
          <span class="settings-chevron" aria-hidden="true">\u203A</span>
        </button>

        <button type="button" class="settings-row" data-settings-route="environment">
          <span class="settings-row-copy"><span>\u6A29\u9650\u3068\u7AEF\u672B\u8A2D\u5B9A</span><small>${escapeHtml(resolvePlatform())}</small></span>
          <span class="settings-chevron" aria-hidden="true">\u203A</span>
        </button>

        <button type="button" class="settings-row danger" data-settings-action="logout">
          <span class="settings-row-copy"><span>\u30ED\u30B0\u30A2\u30A6\u30C8</span></span>
        </button>
      </div>
    `;
  }
  function renderSettingsSubpage() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    if (!ui.settingsSubpage)
      return;
    const route = settingsPageMode || "menu";
    if (route === "account") {
      ui.settingsSubpage.innerHTML = `
        <div class="settings-card">
          <label>
            <span>WebSocket URL</span>
            <input id="settingsWsUrl" type="text" value="${escapeHtml(((_a = ui.wsUrl) == null ? void 0 : _a.value) || "")}">
          </label>

          <label>
            <span>SIP URI</span>
            <input id="settingsSipUri" type="text" value="${escapeHtml(((_b = ui.sipUri) == null ? void 0 : _b.value) || "")}">
          </label>

          <label>
            <span>\u8A8D\u8A3C\u30E6\u30FC\u30B6\u30FC</span>
            <input id="settingsAuthUser" type="text" value="${escapeHtml(((_c = ui.authUser) == null ? void 0 : _c.value) || "")}">
          </label>

          <label>
            <span>\u30D1\u30B9\u30EF\u30FC\u30C9</span>
            <input id="settingsPassword" type="password" value="${escapeHtml(((_d = ui.password) == null ? void 0 : _d.value) || "")}">
          </label>

          <button type="button" class="primary-button" id="btnSaveAccountSettings">
            \u4FDD\u5B58
          </button>
        </div>
      `;
      (_e = $("btnSaveAccountSettings")) == null ? void 0 : _e.addEventListener("click", () => {
        var _a2, _b2, _c2, _d2;
        ui.wsUrl.value = ((_a2 = $("settingsWsUrl")) == null ? void 0 : _a2.value) || "";
        ui.sipUri.value = ((_b2 = $("settingsSipUri")) == null ? void 0 : _b2.value) || "";
        ui.authUser.value = ((_c2 = $("settingsAuthUser")) == null ? void 0 : _c2.value) || "";
        ui.password.value = ((_d2 = $("settingsPassword")) == null ? void 0 : _d2.value) || "";
        saveConfig();
      });
      return;
    }
    if (route === "calls") {
      ui.settingsSubpage.innerHTML = `
        <div class="settings-card">
          <label>
            <span>\u30C7\u30D5\u30A9\u30EB\u30C8\u767A\u4FE1\u65B9\u6CD5</span>
            <select id="settingsDefaultDialMethod" class="app-select">
              <option value="sip">SIP \u767A\u4FE1</option>
              <option value="mobile">\u643A\u5E2F\u96FB\u8A71\u756A\u53F7\u3078\u767A\u4FE1</option>
              <option value="shop">\u5E97\u8217\u756A\u53F7\u3092\u4F7F\u3046</option>
            </select>
          </label>

          <button type="button" class="primary-button" id="btnSaveCallSettings">
            \u4FDD\u5B58
          </button>
        </div>
      `;
      const methodSelect = $("settingsDefaultDialMethod");
      if (methodSelect) {
        methodSelect.value = getSelectedDialMethod();
      }
      (_f = $("btnSaveCallSettings")) == null ? void 0 : _f.addEventListener("click", () => {
        if (ui.defaultDialMethod) {
          ui.defaultDialMethod.value = sanitizeDialMethod((methodSelect == null ? void 0 : methodSelect.value) || "sip");
        }
        saveConfig();
      });
      return;
    }
    if (route === "stores") {
      const storeItems = configuredStores.length ? configuredStores.map((store) => `
            <div class="store-settings-row">
              <span class="settings-row-copy">
                <span>${escapeHtml(store.name)}</span>
                <small>${escapeHtml(store.phoneNumber || store.sipUri || "\u767A\u4FE1\u5148\u672A\u8A2D\u5B9A")}</small>
              </span>
              <button type="button" class="store-delete-button" data-delete-store="${escapeHtml(store.id)}" aria-label="${escapeHtml(store.name)}\u3092\u524A\u9664">\u524A\u9664</button>
            </div>
          `).join("") : '<p class="empty-settings-message">\u5E97\u8217\u306F\u307E\u3060\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002</p>';
      ui.settingsSubpage.innerHTML = `
        <div class="settings-card store-settings-card">
          <div class="store-settings-list">${storeItems}</div>
        </div>
        <div class="settings-card store-add-card">
          <h3>\u5E97\u8217\u3092\u8FFD\u52A0</h3>
          <label>
            <span>\u5E97\u8217\u540D</span>
            <input id="settingsStoreName" type="text" autocomplete="organization" placeholder="\u5E97\u8217A">
          </label>
          <label>
            <span>\u96FB\u8A71\u756A\u53F7</span>
            <input id="settingsStorePhone" type="tel" inputmode="tel" placeholder="0312345678">
          </label>
          <label>
            <span>SIP URI\uFF08\u4EFB\u610F\uFF09</span>
            <input id="settingsStoreSipUri" type="text" autocomplete="off" placeholder="sip:store@example.com">
          </label>
          <button type="button" class="primary-button" id="btnAddStore">\u5E97\u8217\u3092\u8FFD\u52A0</button>
        </div>
      `;
      (_g = $("btnAddStore")) == null ? void 0 : _g.addEventListener("click", () => {
        var _a2, _b2, _c2;
        const name = String(((_a2 = $("settingsStoreName")) == null ? void 0 : _a2.value) || "").trim();
        const phoneNumber = String(((_b2 = $("settingsStorePhone")) == null ? void 0 : _b2.value) || "").trim();
        const sipUri = String(((_c2 = $("settingsStoreSipUri")) == null ? void 0 : _c2.value) || "").trim();
        if (!name) {
          showUserError("\u5E97\u8217\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
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
          if (!store || !window.confirm(`${store.name}\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F`))
            return;
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
            <span class="settings-row-copy"><span>\u901A\u77E5</span><small>Android\u306E\u901A\u77E5\u8A2D\u5B9A\u3092\u958B\u304F</small></span>
            <span class="settings-chevron" aria-hidden="true">\u203A</span>
          </button>

          <button type="button" class="settings-row" id="btnEnvPermissions">
            <span class="settings-row-copy"><span>\u6A29\u9650</span><small>\u30DE\u30A4\u30AF\u306A\u3069\u306E\u6A29\u9650\u3092\u78BA\u8A8D\u3059\u308B</small></span>
            <span class="settings-chevron" aria-hidden="true">\u203A</span>
          </button>

          <button type="button" class="settings-row" id="btnEnvSetupGuide">
            <span class="settings-row-copy"><span>\u521D\u671F\u8A2D\u5B9A\u30AC\u30A4\u30C9</span><small>\u7AEF\u672B\u8A2D\u5B9A\u3092\u518D\u78BA\u8A8D\u3059\u308B</small></span>
            <span class="settings-chevron" aria-hidden="true">\u203A</span>
          </button>
        </div>
      `;
      (_h = $("btnEnvNotifications")) == null ? void 0 : _h.addEventListener("click", () => openSupportTarget("notifications"));
      (_i = $("btnEnvPermissions")) == null ? void 0 : _i.addEventListener("click", () => {
        openSupportTarget(resolvePlatform() === "android" ? "permissions" : "app-settings");
      });
      (_j = $("btnEnvSetupGuide")) == null ? void 0 : _j.addEventListener("click", openSetupView);
      return;
    }
    ui.settingsSubpage.innerHTML = "";
  }
  function renderSettingsPage() {
    if (!ui.settingsRoot || !ui.settingsSubpage)
      return;
    const isRoot = settingsPageMode === "menu" || settingsPageMode === "root";
    const route = settingsPageMode || "menu";
    const dataKey = isRoot ? `${registrationState}|${getSelectedDialMethod()}|${configuredStores.length}|${resolvePlatform()}` : route === "stores" ? JSON.stringify(configuredStores) : route;
    const renderKey = `${currentHomeTab}|${route}|${dataKey}`;
    ui.settingsRoot.hidden = !isRoot;
    ui.settingsSubpage.hidden = isRoot;
    if (lastSettingsRenderKey === renderKey)
      return;
    if (isRoot) {
      renderSettingsRoot();
    } else {
      renderSettingsSubpage();
    }
    lastSettingsRenderKey = renderKey;
    if (currentHomeTab === "settings") {
      const activeView = resolveHomeMode() === "account" && ui.accountSettingsCard ? ui.accountSettingsCard : isRoot ? ui.settingsRoot : ui.settingsSubpage;
      activeView.classList.remove("settings-view-enter");
      window.requestAnimationFrame(() => activeView.classList.add("settings-view-enter"));
    }
  }
  function getNavigationState() {
    return { tab: currentHomeTab, settingsPageMode };
  }
  function rememberNavigationState() {
    if (restoringNavigationState || resolveHomeMode() !== "main")
      return;
    const state = getNavigationState();
    const previous = navigationStack[navigationStack.length - 1];
    if ((previous == null ? void 0 : previous.tab) === state.tab && (previous == null ? void 0 : previous.settingsPageMode) === state.settingsPageMode)
      return;
    navigationStack.push(state);
    if (navigationStack.length > 32)
      navigationStack.shift();
  }
  function animateMainReturn() {
    var _a, _b;
    const surface = (_b = (_a = ui.views) == null ? void 0 : _a.home) == null ? void 0 : _b.querySelector(".phone-surface");
    if (!surface)
      return;
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
    if (!state)
      return false;
    restoringNavigationState = true;
    try {
      settingsPageMode = state.settingsPageMode || "menu";
      showHomeTab(state.tab || "dialer");
    } finally {
      restoringNavigationState = false;
    }
    if (options.animateMain && state.tab !== "settings")
      animateMainReturn();
    return true;
  }
  function navigateToHomeTab(tabName) {
    if (String(tabName || "") !== currentHomeTab)
      rememberNavigationState();
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
    if (callState === "OUTGOING" || callState === "INCOMING" || callState === "INCALL")
      return true;
    if (contactOverlayMode !== "closed") {
      closeContactOverlay();
      return true;
    }
    if (resolveHomeMode() === "setup") {
      leaveSetupView();
      return true;
    }
    if (resolveHomeMode() !== "main")
      return false;
    if (navigationStack.length > 0)
      return restoreNavigationState(navigationStack.pop(), { animateMain: true });
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
      if (contactOverlayMode === "history")
        return "\u901A\u8A71\u5C65\u6B74\u8A73\u7D30";
      return contactOverlayMode === "editor" ? "\u9023\u7D61\u5148\u3092\u7DE8\u96C6" : "\u9023\u7D61\u5148";
    }
    if (mode === "setup")
      return "\u521D\u671F\u8A2D\u5B9A";
    if (mode === "account")
      return "\u30A2\u30AB\u30A6\u30F3\u30C8\u8A2D\u5B9A";
    if (currentHomeTab === "settings") {
      const labels = {
        menu: "\u8A2D\u5B9A",
        root: "\u8A2D\u5B9A",
        account: "\u30A2\u30AB\u30A6\u30F3\u30C8\u8A2D\u5B9A",
        calls: "\u901A\u8A71\u8A2D\u5B9A",
        stores: "\u5E97\u8217",
        environment: "\u6A29\u9650\u3068\u7AEF\u672B\u8A2D\u5B9A"
      };
      return labels[settingsPageMode] || "\u8A2D\u5B9A";
    }
    return {
      history: "\u5C65\u6B74",
      dialer: "\u30AD\u30FC\u30D1\u30C3\u30C9",
      contacts: "\u9023\u7D61\u5148",
      favorites: "\u304A\u6C17\u306B\u5165\u308A",
      setup: "\u521D\u671F\u8A2D\u5B9A",
      settings: "\u8A2D\u5B9A"
    }[currentHomeTab] || "WebRTC Phone";
  }
  function getAccountLabel() {
    var _a, _b;
    return ((_a = ui.authUser) == null ? void 0 : _a.value.trim()) || ((_b = ui.sipUri) == null ? void 0 : _b.value.trim()) || "SIP";
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
      if (!panel)
        return;
      const active = name === currentHomeTab;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    [
      ["history", ui.tabHistory],
      ["dialer", ui.tabDialer],
      ["contacts", ui.tabContacts],
      ["favorites", ui.tabFavorites]
    ].forEach(([name, button]) => {
      if (!button)
        return;
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
    const platformLabel = platform === "android" ? "Android" : platform === "ios" ? "iPhone" : "Web";
    if (ui.setupPlatformBadge) {
      ui.setupPlatformBadge.textContent = platformLabel;
    }
    if (ui.setupSummary) {
      ui.setupSummary.textContent = hasBlockingItems ? "\u5FC5\u8981\u306A\u8A2D\u5B9A\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002" : "\u901A\u8A71\u306B\u5FC5\u8981\u306A\u78BA\u8A8D\u306F\u5B8C\u4E86\u3057\u3066\u3044\u307E\u3059\u3002";
    }
    if (ui.btnProceedFromSetup) {
      ui.btnProceedFromSetup.hidden = hasBlockingItems;
    }
    if (ui.btnSkipSetup) {
      ui.btnSkipSetup.hidden = !hasBlockingItems;
    }
    if (!ui.setupChecklist)
      return;
    ui.setupChecklist.innerHTML = items.map((item) => {
      const badge = getPermissionBadge(item.status);
      const action = item.target && item.buttonLabel ? `
          <button
            type="button"
            class="secondary-button setup-action-button"
            data-target="${escapeHtml(item.target)}"
          >
            ${escapeHtml(item.buttonLabel)}
          </button>
        ` : "";
      const summary = item.summary ? `<p>${escapeHtml(item.summary)}</p>` : "";
      const details = Array.isArray(item.details) && item.details.length > 0 ? `
          <div class="setup-permission-list">
            ${item.details.map((detail) => `
              <div class="setup-permission-row">
                <span>${escapeHtml(detail.label)}</span>
                <strong class="${detail.done ? "is-done" : "is-pending"}">
                  ${detail.done ? "\u2714" : "\u672A\u8A2D\u5B9A"}
                </strong>
              </div>
            `).join("")}
          </div>
        ` : "";
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
  function buildSetupChecklist(platform, notificationPermission, microphonePermission, contactsPermission, backgroundExecutionAllowed) {
    const microphoneReady = microphonePermission === "granted";
    const contactsReady = platform !== "android" || contactsPermission === "granted";
    const requiredPermissionsReady = microphoneReady && contactsReady;
    const items = [
      {
        title: "\u5FC5\u8981\u306A\u6A29\u9650",
        status: requiredPermissionsReady ? "done" : "action",
        summary: "",
        details: [
          { label: "\u30DE\u30A4\u30AF", done: microphoneReady },
          ...platform === "android" ? [{ label: "\u9023\u7D61\u5E33", done: contactsReady }] : []
        ],
        buttonLabel: platform === "android" ? "\u6A29\u9650\u4E00\u89A7" : "\u30A2\u30D7\u30EA\u8A2D\u5B9A\u3092\u958B\u304F",
        target: platform === "android" ? "permissions" : "app-settings",
        blocking: true
      },
      {
        title: "\u901A\u77E5",
        status: notificationPermission === "granted" ? "done" : "action",
        summary: notificationPermission === "granted" ? "\u7740\u4FE1\u901A\u77E5\u3092\u8868\u793A\u3067\u304D\u307E\u3059\u3002" : "\u7740\u4FE1\u8868\u793A\u306E\u305F\u3081\u306B\u901A\u77E5\u3092\u8A31\u53EF\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        buttonLabel: notificationPermission === "granted" ? "" : notificationPermission === "prompt" ? "\u901A\u77E5\u3092\u8A31\u53EF" : "\u901A\u77E5\u8A2D\u5B9A\u3092\u958B\u304F",
        target: notificationPermission === "prompt" ? "request-notifications" : "notifications",
        blocking: true
      }
    ];
    if (platform === "android") {
      items.push({
        title: "\u30D0\u30C3\u30AF\u30B0\u30E9\u30A6\u30F3\u30C9\u3067\u306E\u5B9F\u884C\u8A31\u53EF",
        status: backgroundExecutionAllowed ? "done" : "action",
        summary: backgroundExecutionAllowed ? "\u30D0\u30C3\u30AF\u30B0\u30E9\u30A6\u30F3\u30C9\u7740\u4FE1\u3092\u53D7\u3051\u53D6\u308C\u308B\u8A2D\u5B9A\u3067\u3059\u3002" : "\u5B89\u5B9A\u3057\u3066\u7740\u4FE1\u3092\u53D7\u3051\u53D6\u308B\u305F\u3081\u3001\u30D0\u30C3\u30C6\u30EA\u30FC\u6700\u9069\u5316\u306E\u5BFE\u8C61\u5916\u306B\u8A2D\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
        buttonLabel: backgroundExecutionAllowed ? "" : "\u8A2D\u5B9A\u3092\u958B\u304F",
        target: "battery-optimization",
        blocking: true
      });
    }
    return {
      platform,
      items,
      hasBlockingItems: items.some((item) => item.blocking && item.status !== "done")
    };
  }
  function getRegistrationLabel() {
    if (registrationState === "REGISTERED")
      return "\u63A5\u7D9A\u6E08\u307F";
    if (registrationState === "REGISTERING")
      return "\u63A5\u7D9A\u4E2D";
    if (registrationState === "FAILED")
      return "\u63A5\u7D9A\u5931\u6557";
    return "\u672A\u767B\u9332";
  }
  function updateAccountStatusLabelVisibility(statusState) {
    if (!ui.accountStatusText || accountStatusLabelState === statusState)
      return;
    accountStatusLabelState = statusState;
    window.clearTimeout(accountStatusLabelTimerId);
    accountStatusLabelTimerId = null;
    ui.accountStatusText.classList.remove("is-auto-hidden");
    if (statusState !== "registered")
      return;
    accountStatusLabelTimerId = window.setTimeout(() => {
      var _a;
      accountStatusLabelTimerId = null;
      if (registrationState !== "REGISTERED")
        return;
      (_a = ui.accountStatusText) == null ? void 0 : _a.classList.add("is-auto-hidden");
    }, REGISTERED_STATUS_LABEL_VISIBLE_MS);
  }
  function updateHomeChrome() {
    var _a;
    const homeMode = resolveHomeMode();
    const isMain = homeMode === "main";
    const isSettings = currentHomeTab === "settings";
    const isSubpage = isSettings && settingsPageMode !== "menu" && settingsPageMode !== "root";
    const isOverlay = contactOverlayMode !== "closed";
    const isAccountOnly = homeMode === "account";
    const accountLabel = getAccountLabel();
    const statusState = registrationState === "REGISTERED" ? "registered" : registrationState === "FAILED" ? "failed" : registrationState === "REGISTERING" ? "registering" : "unregistered";
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
      ui.btnAccountSettings.setAttribute("aria-label", `${accountLabel}\u3001\u7AEF\u672B\u30B9\u30C6\u30FC\u30BF\u30B9\uFF1A${statusLabel}`);
    }
    if (ui.homeTitle) {
      ui.homeTitle.textContent = getPanelTitle();
    }
    if ((_a = ui.views) == null ? void 0 : _a.home) {
      ui.views.home.dataset.homeMode = homeMode;
    }
    if (ui.btnBackNav) {
      ui.btnBackNav.hidden = !(isMain && isSettings || isOverlay || homeMode === "setup");
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
    var _a, _b;
    const isRegistered = registrationState === "REGISTERED";
    const canDial = isRegistered;
    const hasSession = activeSession !== null;
    const inCall = callState === "INCALL";
    const callScreenActive = callState === "OUTGOING" || callState === "INCOMING" || callState === "INCALL";
    if (ui.btnLogin)
      ui.btnLogin.disabled = registrationState === "REGISTERING";
    if (ui.btnLogout)
      ui.btnLogout.disabled = !isRegistered && registrationState !== "REGISTERING";
    if (ui.btnTopLogout)
      ui.btnTopLogout.disabled = registrationState === "REGISTERING";
    if (ui.callButton)
      ui.callButton.disabled = !canDial || hasSession;
    if (ui.hangupButton)
      ui.hangupButton.disabled = !hasSession || callState === "INCOMING";
    if (ui.btnAnswerModal)
      ui.btnAnswerModal.disabled = callState !== "INCOMING";
    if (ui.btnRejectModal)
      ui.btnRejectModal.disabled = callState !== "INCOMING";
    if (ui.btnMute)
      ui.btnMute.disabled = !inCall;
    if (ui.btnHold)
      ui.btnHold.disabled = !inCall || holdOperationPending;
    if (ui.btnSpeaker)
      ui.btnSpeaker.disabled = !inCall;
    if (ui.btnTransfer)
      ui.btnTransfer.disabled = !inCall;
    if (ui.btnKeypad)
      ui.btnKeypad.disabled = !inCall;
    if (ui.btnHideKeypad)
      ui.btnHideKeypad.disabled = !inCall;
    if (ui.btnEndCall)
      ui.btnEndCall.disabled = !hasSession;
    if (ui.btnDoTransfer)
      ui.btnDoTransfer.disabled = !inCall;
    if (ui.regState)
      ui.regState.textContent = getRegistrationLabel();
    if (ui.callStateText)
      ui.callStateText.textContent = getCallStateLabel();
    (_a = ui.btnMute) == null ? void 0 : _a.setAttribute("aria-pressed", isMuted ? "true" : "false");
    (_b = ui.btnSpeaker) == null ? void 0 : _b.setAttribute("aria-pressed", isSpeakerEnabled ? "true" : "false");
    if (ui.btnSpeaker) {
      ui.btnSpeaker.innerHTML = '<span class="control-icon">\u25D4</span><span>\u30B9\u30D4\u30FC\u30AB\u30FC</span>';
    }
    if (ui.btnHold) {
      ui.btnHold.innerHTML = `<span class="control-icon">\u2161</span><span>${isHeld ? "\u4FDD\u7559\u89E3\u9664" : "\u4FDD\u7559"}</span>`;
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r;
    (_a = ui.btnLogin) == null ? void 0 : _a.addEventListener("click", () => register({ navigateOnSuccess: true }));
    (_b = ui.btnLogout) == null ? void 0 : _b.addEventListener("click", logout);
    (_c = ui.btnTopLogout) == null ? void 0 : _c.addEventListener("click", logout);
    const swipeTabs = ["history", "dialer", "favorites", "contacts"];
    (_d = ui.tabHistory) == null ? void 0 : _d.addEventListener("click", () => animateHomeTabTap("history"));
    (_e = ui.tabDialer) == null ? void 0 : _e.addEventListener("click", () => animateHomeTabTap("dialer"));
    (_f = ui.tabContacts) == null ? void 0 : _f.addEventListener("click", () => animateHomeTabTap("contacts"));
    (_g = ui.tabFavorites) == null ? void 0 : _g.addEventListener("click", () => animateHomeTabTap("favorites"));
    (_h = ui.tabSettings) == null ? void 0 : _h.addEventListener("click", () => openSettingsRoute("menu", { recordHistory: true }));
    (_i = ui.btnQuickSettings) == null ? void 0 : _i.addEventListener("click", (event) => {
      event.stopPropagation();
      if (ui.homeOverflowMenu) {
        ui.homeOverflowMenu.hidden = !ui.homeOverflowMenu.hidden;
      } else {
        openSettingsRoute("menu", { recordHistory: true });
      }
    });
    (_j = ui.btnMenuSettings) == null ? void 0 : _j.addEventListener("click", () => {
      if (ui.homeOverflowMenu)
        ui.homeOverflowMenu.hidden = true;
      openSettingsRoute("menu", { recordHistory: true });
    });
    (_k = ui.btnMenuShareLog) == null ? void 0 : _k.addEventListener("click", () => {
      if (ui.homeOverflowMenu)
        ui.homeOverflowMenu.hidden = true;
      shareDiagnostics();
    });
    (_l = ui.btnMenuLogout) == null ? void 0 : _l.addEventListener("click", () => {
      if (ui.homeOverflowMenu)
        ui.homeOverflowMenu.hidden = true;
      logout();
    });
    document.addEventListener("pointerdown", (event) => {
      if (!ui.homeOverflowMenu || ui.homeOverflowMenu.hidden)
        return;
      const target = event.target;
      if (target instanceof Element && (target.closest("#homeOverflowMenu") || target.closest("#btnQuickSettings")))
        return;
      event.preventDefault();
      event.stopPropagation();
      ui.homeOverflowMenu.hidden = true;
    }, true);
    (_m = ui.btnAccountSettings) == null ? void 0 : _m.addEventListener("click", () => openSettingsRoute("account", { recordHistory: true }));
    (_n = ui.btnBackNav) == null ? void 0 : _n.addEventListener("click", handleBackNavigation);
    let swipeGesture = null;
    let activeSwipeTransition = null;
    const resetSwipePanel = (panel, hide = false) => {
      if (!panel)
        return;
      panel.style.removeProperty("transform");
      panel.style.removeProperty("transition");
      panel.style.removeProperty("will-change");
      if (hide)
        panel.hidden = true;
    };
    const finalizeActiveSwipeTransition = () => {
      var _a2;
      if (!activeSwipeTransition)
        return;
      const transition = activeSwipeTransition;
      activeSwipeTransition = null;
      window.cancelAnimationFrame(transition.frameId);
      window.clearTimeout(transition.timerId);
      (_a2 = ui.views.home) == null ? void 0 : _a2.classList.remove("is-swipe-transition");
      resetSwipePanel(transition.currentPanel);
      resetSwipePanel(transition.adjacentPanel, !transition.complete);
      if (transition.complete && transition.nextTab)
        navigateToHomeTab(transition.nextTab);
    };
    const finishSwipeGesture = (complete) => {
      if (!swipeGesture)
        return;
      const gesture = swipeGesture;
      swipeGesture = null;
      const { currentPanel, adjacentPanel, direction, width, nextTab } = gesture;
      const duration = complete ? 160 : 110;
      currentPanel.style.transition = `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
      if (adjacentPanel)
        adjacentPanel.style.transition = currentPanel.style.transition;
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
      if (nextTab === currentHomeTab || !swipeTabs.includes(nextTab))
        return;
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
        timerId: 0
      };
      activeSwipeTransition = transition;
      transition.frameId = window.requestAnimationFrame(() => {
        if (activeSwipeTransition !== transition)
          return;
        const animation = `transform ${duration}ms cubic-bezier(0.2, 0.8, 0.2, 1)`;
        currentPanel.style.transition = animation;
        adjacentPanel.style.transition = animation;
        currentPanel.style.transform = `translate3d(${-direction * width}px, 0, 0)`;
        adjacentPanel.style.transform = "translate3d(0, 0, 0)";
        transition.timerId = window.setTimeout(finalizeActiveSwipeTransition, duration);
      });
    };
    (_o = ui.views.home) == null ? void 0 : _o.addEventListener("touchstart", (event) => {
      var _a2, _b2;
      const touch = (_a2 = event.touches) == null ? void 0 : _a2[0];
      const target = event.target;
      if (!touch || !swipeTabs.includes(currentHomeTab) || contactOverlayMode !== "closed")
        return;
      if ((_b2 = target == null ? void 0 : target.closest) == null ? void 0 : _b2.call(target, "input, textarea, select, .overflow-menu, .sheet-overlay"))
        return;
      finalizeActiveSwipeTransition();
      const currentPanel = document.querySelector(`[data-home-panel="${currentHomeTab}"]`);
      if (!currentPanel)
        return;
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
        dragging: false
      };
    }, { passive: true });
    (_p = ui.views.home) == null ? void 0 : _p.addEventListener("touchmove", (event) => {
      var _a2;
      if (!swipeGesture)
        return;
      const touch = (_a2 = event.touches) == null ? void 0 : _a2[0];
      if (!touch)
        return;
      const gesture = swipeGesture;
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      if (!gesture.dragging) {
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 8) {
          swipeGesture = null;
          return;
        }
        if (Math.abs(deltaX) < 8 || Math.abs(deltaX) < Math.abs(deltaY) * 1.15)
          return;
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
        gesture.adjacentPanel = gesture.nextTab ? document.querySelector(`[data-home-panel="${gesture.nextTab}"]`) : null;
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
    (_q = ui.views.home) == null ? void 0 : _q.addEventListener("touchend", (event) => {
      var _a2;
      if (!swipeGesture)
        return;
      const touch = (_a2 = event.changedTouches) == null ? void 0 : _a2[0];
      const deltaX = touch ? touch.clientX - swipeGesture.startX : 0;
      const elapsed = Math.max(1, performance.now() - swipeGesture.startedAt);
      const averageVelocity = Math.abs(deltaX) / elapsed;
      const flickVelocity = Math.max(Math.abs(swipeGesture.velocityX), averageVelocity);
      const isShortFlick = Math.abs(deltaX) >= 16 && flickVelocity >= 0.28;
      const isDeliberateDrag = Math.abs(deltaX) >= swipeGesture.width * 0.34;
      const complete = Boolean(swipeGesture.adjacentPanel) && (isShortFlick || isDeliberateDrag);
      finishSwipeGesture(complete);
    }, { passive: true });
    (_r = ui.views.home) == null ? void 0 : _r.addEventListener("touchcancel", () => {
      if (swipeGesture)
        finishSwipeGesture(false);
    }, { passive: true });
  }
  function bindHistoryEvents() {
    var _a, _b, _c, _d, _e, _f, _g;
    (_a = ui.btnMenuClearHistory) == null ? void 0 : _a.addEventListener("click", () => {
      if (ui.homeOverflowMenu)
        ui.homeOverflowMenu.hidden = true;
      clearCallHistory();
    });
    (_b = ui.historyFilterAll) == null ? void 0 : _b.addEventListener("click", () => {
      setHistoryFilter("all");
    });
    (_c = ui.historyFilterMissed) == null ? void 0 : _c.addEventListener("click", () => {
      setHistoryFilter("missed");
    });
    (_d = ui.historyFilterOutgoing) == null ? void 0 : _d.addEventListener("click", () => {
      setHistoryFilter("outgoing");
    });
    (_e = ui.historyFilterIncoming) == null ? void 0 : _e.addEventListener("click", () => {
      setHistoryFilter("incoming");
    });
    const handleHistoryListClick = (event) => {
      const redialButton = event.target.closest(".history-redial-button");
      const detailButton = event.target.closest(".history-detail-trigger");
      if (!redialButton && !detailButton)
        return;
      event.preventDefault();
      event.stopPropagation();
      if (redialButton) {
        redialHistoryItem(redialButton.dataset.historyIndex);
        return;
      }
      detailButton.blur();
      detailButton.classList.add("is-opening-detail");
      window.setTimeout(() => detailButton.classList.remove("is-opening-detail"), 180);
      showHistoryDetails(detailButton.dataset.historyDetailIndex, detailButton.dataset.historySource || currentHomeTab || "history");
    };
    (_f = ui.historyList) == null ? void 0 : _f.addEventListener("click", handleHistoryListClick);
    (_g = ui.callHistoryList) == null ? void 0 : _g.addEventListener("click", handleHistoryListClick);
  }
  function bindContactEvents() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q;
    (_a = ui.contactLookupInput) == null ? void 0 : _a.addEventListener("input", () => {
      var _a2;
      contactSearchQuery = String(((_a2 = ui.contactLookupInput) == null ? void 0 : _a2.value) || "").trim();
      renderContactsAndFavorites();
    });
    (_b = ui.contactAvatarInput) == null ? void 0 : _b.addEventListener("change", async () => {
      var _a2;
      const [file] = ui.contactAvatarInput.files || [];
      if (!file)
        return;
      try {
        pendingContactAvatar = await createContactAvatarDataUrl(file);
        renderContactAvatar(ui.contactAvatarPreview, { avatar: pendingContactAvatar });
      } catch (error) {
        pendingContactAvatar = ((_a2 = getContactById(activeContactId)) == null ? void 0 : _a2.avatar) || "";
        renderContactAvatar(ui.contactAvatarPreview, { avatar: pendingContactAvatar });
        showUserError(error.message || "\u753B\u50CF\u3092\u8A2D\u5B9A\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
      }
    });
    (_c = ui.contactSortMode) == null ? void 0 : _c.addEventListener("change", () => {
      applyContactSortMode(ui.contactSortMode.value);
      renderContactsAndFavorites();
      showToast("\u9023\u7D61\u5148\u306E\u4E26\u3073\u9806\u3092\u5909\u66F4\u3057\u307E\u3057\u305F\u3002");
    });
    (_d = ui.btnContactSort) == null ? void 0 : _d.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!ui.contactSortMenu)
        return;
      ui.contactSortMenu.hidden = !ui.contactSortMenu.hidden;
      ui.btnContactSort.setAttribute("aria-expanded", String(!ui.contactSortMenu.hidden));
    });
    (_e = ui.contactSortMenu) == null ? void 0 : _e.addEventListener("click", (event) => {
      var _a2;
      const item = event.target.closest("[data-contact-sort-mode]");
      if (!item)
        return;
      applyContactSortMode(item.dataset.contactSortMode);
      ui.contactSortMenu.hidden = true;
      (_a2 = ui.btnContactSort) == null ? void 0 : _a2.setAttribute("aria-expanded", "false");
      renderContactsAndFavorites();
      showToast("\u9023\u7D61\u5148\u306E\u4E26\u3073\u9806\u3092\u5909\u66F4\u3057\u307E\u3057\u305F\u3002");
    });
    document.addEventListener("click", (event) => {
      var _a2;
      if (!ui.contactSortMenu || ui.contactSortMenu.hidden)
        return;
      if (event.target.closest("#contactSortMenu") || event.target.closest("#btnContactSort"))
        return;
      ui.contactSortMenu.hidden = true;
      (_a2 = ui.btnContactSort) == null ? void 0 : _a2.setAttribute("aria-expanded", "false");
    });
    (_f = ui.btnAddContact) == null ? void 0 : _f.addEventListener("click", () => {
      var _a2;
      if (deviceContactsAvailable) {
        const opened = (_a2 = nativeBridge == null ? void 0 : nativeBridge.openCreateContact) == null ? void 0 : _a2.call(nativeBridge);
        if (!opened)
          showUserError("\u7AEF\u672B\u306E\u9023\u7D61\u5E33\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
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
      const contactId = (openButton == null ? void 0 : openButton.dataset.contactOpen) || (row == null ? void 0 : row.dataset.contactId);
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
    (_g = ui.contactsList) == null ? void 0 : _g.addEventListener("click", handleContactListAction);
    (_h = ui.favoritesList) == null ? void 0 : _h.addEventListener("click", handleContactListAction);
    (_i = ui.btnCloseContactOverlay) == null ? void 0 : _i.addEventListener("click", closeContactOverlay);
    (_j = ui.contactOverlay) == null ? void 0 : _j.addEventListener("click", (event) => {
      if (event.target === ui.contactOverlay && contactOverlayMode !== "closed") {
        closeContactOverlay();
      }
    });
    (_k = ui.btnSaveContact) == null ? void 0 : _k.addEventListener("click", saveContactFromForm);
    (_l = ui.contactEditorView) == null ? void 0 : _l.addEventListener("submit", (event) => {
      event.preventDefault();
      saveContactFromForm();
    });
    (_m = ui.btnEditContact) == null ? void 0 : _m.addEventListener("click", () => {
      var _a2;
      const contact = getContactById(activeContactId);
      if (contact == null ? void 0 : contact.nativeContactId) {
        const opened = (_a2 = nativeBridge == null ? void 0 : nativeBridge.openEditContact) == null ? void 0 : _a2.call(nativeBridge, contact.nativeContactId);
        if (!opened)
          showUserError("\u7AEF\u672B\u306E\u9023\u7D61\u5E33\u3092\u958B\u3051\u307E\u305B\u3093\u3067\u3057\u305F\u3002");
        return;
      }
      openContactOverlay("editor", activeContactId, activeContactSource);
    });
    (_n = ui.btnDeleteContact) == null ? void 0 : _n.addEventListener("click", () => {
      deleteContactById(activeContactId);
    });
    (_o = ui.btnToggleFavorite) == null ? void 0 : _o.addEventListener("click", () => {
      toggleFavorite(activeContactId);
    });
    (_p = ui.btnCallContact) == null ? void 0 : _p.addEventListener("click", () => {
      callContactById(activeContactId);
    });
    (_q = ui.contactPhoneChoices) == null ? void 0 : _q.addEventListener("click", (event) => {
      const button = event.target.closest("[data-contact-number]");
      if (!button)
        return;
      callContactById(activeContactId, button.dataset.contactNumber);
    });
    window.addEventListener("scroll", scheduleVirtualContactRender, { passive: true });
    window.addEventListener("resize", scheduleVirtualContactRender, { passive: true });
  }
  function bindSettingsEvents() {
    var _a, _b, _c, _d, _e, _f;
    const handleSettingsAction = (event) => {
      const routeButton = event.target.closest("[data-settings-route]");
      const actionButton = event.target.closest("[data-settings-action]");
      if (routeButton) {
        openSettingsRoute(routeButton.dataset.settingsRoute, { recordHistory: true });
        return;
      }
      if (!actionButton)
        return;
      if (actionButton.dataset.settingsAction === "logout") {
        logout();
      }
      if (actionButton.dataset.settingsAction === "share-log") {
        shareDiagnostics();
      }
    };
    (_a = ui.settingsToolsCard) == null ? void 0 : _a.addEventListener("click", handleSettingsAction);
    (_b = ui.settingsRoot) == null ? void 0 : _b.addEventListener("click", handleSettingsAction);
    (_c = ui.btnRefreshSetup) == null ? void 0 : _c.addEventListener("click", () => {
      refreshSetupChecklist("user_refresh");
    });
    (_d = ui.btnProceedFromSetup) == null ? void 0 : _d.addEventListener("click", proceedFromSetupView);
    (_e = ui.btnSkipSetup) == null ? void 0 : _e.addEventListener("click", leaveSetupView);
    (_f = ui.btnOpenSetupGuide) == null ? void 0 : _f.addEventListener("click", openSetupView);
  }
  function bindCallEvents() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u;
    (_a = ui.callButton) == null ? void 0 : _a.addEventListener("click", call);
    (_b = ui.defaultDialMethod) == null ? void 0 : _b.addEventListener("change", () => {
      saveConfig();
    });
    (_c = ui.storesJson) == null ? void 0 : _c.addEventListener("change", () => {
      try {
        configuredStores = parseStoresFromInput();
        renderStoreSelector(getSelectedStoreId());
        saveConfig();
      } catch (error) {
        showUserError(`\u5E97\u8217\u8A2D\u5B9A\u306E\u5F62\u5F0F\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093: ${error.message || "\u4E0D\u660E"}`);
      }
    });
    (_d = ui.selectedStoreId) == null ? void 0 : _d.addEventListener("change", saveConfig);
    (_e = ui.hangupButton) == null ? void 0 : _e.addEventListener("click", hangup);
    (_f = ui.btnEndCall) == null ? void 0 : _f.addEventListener("click", hangup);
    (_g = ui.btnAnswerModal) == null ? void 0 : _g.addEventListener("click", answerIncoming);
    (_h = ui.btnRejectModal) == null ? void 0 : _h.addEventListener("click", rejectIncoming);
    (_i = ui.btnMute) == null ? void 0 : _i.addEventListener("click", toggleMute);
    (_j = ui.btnHold) == null ? void 0 : _j.addEventListener("click", toggleHold);
    (_k = ui.btnSpeaker) == null ? void 0 : _k.addEventListener("click", toggleSpeaker);
    (_l = ui.btnTransfer) == null ? void 0 : _l.addEventListener("click", () => {
      setDialpadMode(dialpadMode === "transfer" ? "dial" : "transfer");
    });
    (_m = ui.btnKeypad) == null ? void 0 : _m.addEventListener("click", () => {
      setDialpadMode("keypad");
    });
    (_n = ui.btnHideKeypad) == null ? void 0 : _n.addEventListener("click", () => {
      setDialpadMode("dial");
    });
    (_o = ui.btnDoTransfer) == null ? void 0 : _o.addEventListener("click", transferCall);
    document.querySelectorAll(".digit").forEach((button) => {
      button.addEventListener("click", () => {
        appendDigit(button.dataset.digit || button.textContent || "");
      });
    });
    let backspaceHoldTimerId = null;
    let backspaceLongPressed = false;
    const getBackspaceInput = () => callState === "INCALL" && dialpadMode === "transfer" ? ui.transferTarget : ui.targetUri;
    const cancelBackspaceHold = () => {
      var _a2;
      window.clearTimeout(backspaceHoldTimerId);
      backspaceHoldTimerId = null;
      (_a2 = ui.backspaceButton) == null ? void 0 : _a2.classList.remove("is-long-press");
    };
    (_p = ui.backspaceButton) == null ? void 0 : _p.addEventListener("pointerdown", (event) => {
      if (event.button !== void 0 && event.button !== 0)
        return;
      backspaceLongPressed = false;
      cancelBackspaceHold();
      backspaceHoldTimerId = window.setTimeout(() => {
        var _a2;
        backspaceHoldTimerId = null;
        backspaceLongPressed = true;
        const input = getBackspaceInput();
        if (input)
          input.value = "";
        (_a2 = ui.backspaceButton) == null ? void 0 : _a2.classList.add("is-long-press");
      }, 500);
    });
    (_q = ui.backspaceButton) == null ? void 0 : _q.addEventListener("pointerup", cancelBackspaceHold);
    (_r = ui.backspaceButton) == null ? void 0 : _r.addEventListener("pointercancel", cancelBackspaceHold);
    (_s = ui.backspaceButton) == null ? void 0 : _s.addEventListener("pointerleave", cancelBackspaceHold);
    (_t = ui.backspaceButton) == null ? void 0 : _t.addEventListener("contextmenu", (event) => event.preventDefault());
    (_u = ui.backspaceButton) == null ? void 0 : _u.addEventListener("click", (event) => {
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
    if (element)
      return element;
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
      settings: $("panel-settings") || document.querySelector("[data-panel='settings']")
    };
    ui = {
      views: {
        home: homeView,
        incall: incallView
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
      logOutput: $("logOutput")
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
        const from = payload.from || payload.target || payload.phone || "\u4E0D\u660E";
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
          showToast("\u30ED\u30B0\u3092\u9001\u4FE1\u3057\u307E\u3057\u305F\u3002", "success");
          return;
        }
        const failureCode = classifyLogSendFailure({ message: detail });
        errorLog(`Native log upload failed: reason=${reason} code=${failureCode} detail=${detail}`);
        showUserError("\u30ED\u30B0\u9001\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002\u30ED\u30B0\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
      },
      applyProvisioning(payload = {}) {
        try {
          const sourcePayload = typeof payload === "string" ? decodeProvisioningPayload(payload) : normalizeProvisioningInput(payload);
          const autoRegister = isEnabledProvisioningValue(sourcePayload == null ? void 0 : sourcePayload.autoRegister) || isEnabledProvisioningValue(sourcePayload == null ? void 0 : sourcePayload.autoLogin);
          const result = applyProvisioningConfig(sourcePayload, {
            source: "native_bridge",
            autoRegister,
            startTestAgent: true
          });
          refreshSetupChecklist("native_provisioning", { quiet: true });
          return result.applied || result.fallback;
        } catch (error) {
          errorLog(`Native provisioning apply failed: code=${String((error == null ? void 0 : error.code) || "unknown")} detail=${describeError(error)}`);
          const stored = readStoredConfig();
          if (hasProvisioningLikeConfig(stored.config)) {
            fillConfigForm(stored.config);
            warn("Native provisioning failed; continued with existing stored config.");
            return false;
          }
          showUserError("\u30D7\u30ED\u30D3\u30B8\u30E7\u30CB\u30F3\u30B0\u306E\u9069\u7528\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
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
          dialpadMode
        };
      }
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
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
      registrationState,
      callState,
      isHeld,
      isMuted,
      account: ((_c = (_b = (_a = ui == null ? void 0 : ui.sipUri) == null ? void 0 : _a.value) == null ? void 0 : _b.trim) == null ? void 0 : _c.call(_b)) || "",
      currentRemoteLabel: ((_d = ui == null ? void 0 : ui.remoteParty) == null ? void 0 : _d.textContent) || ((_e = ui == null ? void 0 : ui.incomingNumber) == null ? void 0 : _e.textContent) || "",
      session: activeSession ? {
        callId: getActiveCallId(),
        direction: activeSession.direction || "",
        remote: ((_h = (_g = (_f = activeSession.remote_identity) == null ? void 0 : _f.uri) == null ? void 0 : _g.toString) == null ? void 0 : _h.call(_g)) || ""
      } : null
    };
  }
  function waitForOutgoingCommandResult(session) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const listeners = [];
      const cleanup = () => {
        var _a;
        window.clearTimeout(timeoutId);
        for (const [name, listener] of listeners)
          (_a = session.removeListener) == null ? void 0 : _a.call(session, name, listener);
      };
      const finish = (handler) => (event = {}) => {
        if (settled)
          return;
        settled = true;
        cleanup();
        handler(event);
      };
      const succeeded = finish(() => resolve({ accepted: true }));
      const failed = finish((event) => {
        const response = event.message || event.response;
        const statusCode = (response == null ? void 0 : response.status_code) || (response == null ? void 0 : response.statusCode) || "";
        const reason = (response == null ? void 0 : response.reason_phrase) || (response == null ? void 0 : response.reasonPhrase) || event.cause || "\u4E0D\u660E";
        reject(new Error(`\u767A\u4FE1\u306B\u5931\u6557\u3057\u307E\u3057\u305F: ${statusCode ? `${statusCode} ` : ""}${reason}`));
      });
      for (const name of ["progress", "accepted", "confirmed"]) {
        session.on(name, succeeded);
        listeners.push([name, succeeded]);
      }
      session.on("failed", failed);
      listeners.push(["failed", failed]);
      const timeoutId = window.setTimeout(finish(() => reject(new Error("\u767A\u4FE1\u7D50\u679C\u306E\u5F85\u6A5F\u304C\u30BF\u30A4\u30E0\u30A2\u30A6\u30C8\u3057\u307E\u3057\u305F\u3002"))), 25e3);
    });
  }
  function createTestAgentApi() {
    return {
      ping: () => ({ ok: true, deviceId: (testAgent == null ? void 0 : testAgent.deviceId) || "" }),
      getStatus: getTestAgentStatus,
      getCurrentSession: () => getTestAgentStatus().session,
      getAccount: () => getTestAgentStatus().account,
      register: async () => {
        await register();
        return { accepted: true, ...getTestAgentStatus() };
      },
      call: async (target) => {
        if (!String(target || "").trim())
          return { accepted: false, reason: "\u767A\u4FE1\u5148\u306F\u5FC5\u9808\u3067\u3059\u3002" };
        if (ui.targetUri)
          ui.targetUri.value = String(target).trim();
        if (ui.defaultDialMethod)
          ui.defaultDialMethod.value = "sip";
        const session = await call();
        if (!session)
          return { accepted: false, reason: "\u767A\u4FE1\u30BB\u30C3\u30B7\u30E7\u30F3\u3092\u958B\u59CB\u3067\u304D\u307E\u305B\u3093\u3067\u3057\u305F\u3002", ...getTestAgentStatus() };
        await waitForOutgoingCommandResult(session);
        return { accepted: true, ...getTestAgentStatus() };
      },
      answer: async () => {
        if (!activeSession || callState !== "INCOMING") {
          return { accepted: false, reason: "\u5FDC\u7B54\u53EF\u80FD\u306A\u7740\u4FE1\u304C\u3042\u308A\u307E\u305B\u3093\u3002", ...getTestAgentStatus() };
        }
        if (testAgentCurrentCommandId)
          testAgentSessionCommandIds.set(activeSession, testAgentCurrentCommandId);
        await answerIncoming();
        return { accepted: true, ...getTestAgentStatus() };
      },
      hangup: () => {
        if (!activeSession)
          return { accepted: false, reason: "\u5207\u65AD\u53EF\u80FD\u306A\u901A\u8A71\u304C\u3042\u308A\u307E\u305B\u3093\u3002", ...getTestAgentStatus() };
        if (testAgentCurrentCommandId)
          testAgentSessionCommandIds.set(activeSession, testAgentCurrentCommandId);
        hangup();
        return { accepted: true, ...getTestAgentStatus() };
      },
      hold: () => ({ accepted: setHoldState(true), ...getTestAgentStatus() }),
      resume: () => ({ accepted: setHoldState(false), ...getTestAgentStatus() }),
      transfer: async (target) => {
        if (testAgentCurrentCommandId && activeSession)
          testAgentSessionCommandIds.set(activeSession, testAgentCurrentCommandId);
        const result = await transferToTargetAndWait(target);
        return { accepted: true, target: result.target, ...getTestAgentStatus() };
      }
    };
  }
  function stopTestAgent(reason = "disabled") {
    if (testAgent == null ? void 0 : testAgent.commandTimerId)
      window.clearInterval(testAgent.commandTimerId);
    if (testAgent == null ? void 0 : testAgent.heartbeatTimerId)
      window.clearInterval(testAgent.heartbeatTimerId);
    if (testAgent)
      log(`Test agent stopped: ${reason}`);
    testAgent = null;
    if (window.WebRTCPhone)
      delete window.WebRTCPhone.testAgent;
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
      if (!["http:", "https:"].includes(parsedBaseUrl.protocol))
        throw new Error("unsupported protocol");
    } catch (_error) {
      stopTestAgent("invalid base URL");
      warn("Test agent not started: testAgentBaseUrl is invalid.");
      return false;
    }
    if ((testAgent == null ? void 0 : testAgent.enabled) && testAgent.baseUrl === baseUrl && testAgent.deviceId === deviceId) {
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
      heartbeatPending: false
    };
    testAgent = agent;
    if (window.WebRTCPhone)
      window.WebRTCPhone.testAgent = createTestAgentApi();
    const reportConnection = (connected, detail = "") => {
      if (testAgent !== agent)
        return;
      const next = connected ? "connected" : "failed";
      if (agent.connectionState !== next) {
        log(`Test agent connection ${next}: ${baseUrl}${detail ? ` (${detail})` : ""}`, connected ? "info" : "warn");
        agent.connectionState = next;
      }
    };
    const pollCommands = async () => {
      if (testAgent !== agent || !agent.enabled || agent.pollPending)
        return;
      agent.pollPending = true;
      try {
        const result = await testAgentRequest(`/devices/${encodeURIComponent(deviceId)}/commands`);
        reportConnection(true);
        for (const command of (result == null ? void 0 : result.commands) || []) {
          const commandId = String((command == null ? void 0 : command.id) || (command == null ? void 0 : command.commandId) || "");
          let outcome = commandId ? testAgentCommandResults.get(commandId) : null;
          if (outcome) {
            log(`\u91CD\u8907\u30B3\u30DE\u30F3\u30C9\u3092\u518D\u5B9F\u884C\u305B\u305A\u3001\u4FDD\u5B58\u6E08\u307F\u7D50\u679C\u3092\u8FD4\u3057\u307E\u3059: commandId=${commandId}`, "warn");
          } else {
            outcome = { ok: true };
            testAgentCurrentCommandId = commandId || null;
            try {
              const commandResult = await handleTestAgentCommand(command);
              if ((commandResult == null ? void 0 : commandResult.accepted) === false) {
                outcome = { ok: false, error: commandResult.reason || "\u30B3\u30DE\u30F3\u30C9\u3092\u53D7\u3051\u4ED8\u3051\u3089\u308C\u307E\u305B\u3093\u3067\u3057\u305F\u3002" };
              }
            } catch (error) {
              outcome = { ok: false, error: error.message || "\u4E0D\u660E\u306A\u30A8\u30E9\u30FC" };
              errorLog(`Test Agent \u30B3\u30DE\u30F3\u30C9\u5931\u6557: type=${(command == null ? void 0 : command.type) || "\u4E0D\u660E"} detail=${outcome.error}`);
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
              body: JSON.stringify(outcome)
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
      if (testAgent !== agent || agent.heartbeatPending)
        return;
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
            data: testAgentDetails({ online: navigator.onLine, platform: getPlatform(), registrationState, callState })
          })
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
    const type = String((command == null ? void 0 : command.type) || "");
    const payload = { ...command, ...(command == null ? void 0 : command.payload) || {} };
    const api = createTestAgentApi();
    log(`test-agent command: ${type}`);
    if (type === "register")
      return api.register();
    if (type === "logout" || type === "unregister")
      return logout();
    if (type === "call")
      return api.call(payload.target || payload.to);
    if (type === "hangup")
      return api.hangup();
    if (type === "answer")
      return api.answer();
    if (type === "hold")
      return api.hold();
    if (type === "resume")
      return api.resume();
    if (type === "transfer")
      return api.transfer(payload.target || payload.to);
    if (type === "reject")
      return rejectIncoming();
    if (type === "dtmf")
      return sendDtmf(payload.digit || "");
    if (type === "shareDiagnostics")
      return shareDiagnostics();
    throw new Error(`\u672A\u5BFE\u5FDC\u306E Test Agent \u30B3\u30DE\u30F3\u30C9\u3067\u3059: ${type || "\u7A7A"}`);
  }
  async function initialize() {
    var _a, _b;
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
    log(`WebRTC environment: isSecureContext=${window.isSecureContext}, mediaDevices=${Boolean(navigator.mediaDevices)}, getUserMedia=${Boolean((_a = navigator.mediaDevices) == null ? void 0 : _a.getUserMedia)}`);
    await refreshSetupChecklist("startup", { quiet: true });
    syncAgiDeviceRegistration("startup").catch((error) => {
      warn(`AGI device registration failed: ${describeError(error)}`);
    });
    if (shouldShowSetupOnLaunch()) {
      showHomeTab("setup");
    }
    (_b = nativeBridge == null ? void 0 : nativeBridge.notifyReady) == null ? void 0 : _b.call(nativeBridge);
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
