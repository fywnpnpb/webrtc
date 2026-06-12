(() => {
  const $ = (id) => document.getElementById(id);

  const CONFIG_STORAGE_KEY = "minimal-webrtc-sip-phone.config.v1";
  const CALL_HISTORY_STORAGE_KEY = "minimal-webrtc-sip-phone.call-history.v1";
  const MAX_CALL_HISTORY_ITEMS = 20;
  const MICROPHONE_NOT_FOUND_MESSAGE = "マイクが検出されません。端末の接続と権限を確認してください。";

  const CALL_OPTIONS = {
    mediaConstraints: { audio: true, video: false },
    rtcOfferConstraints: {
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    },
  };

  let ui = null;
  let ua = null;
  let activeSession = null;
  let callHistory = [];
  let registrationState = "UNREGISTERED";
  let callState = "IDLE";
  let isHeld = false;
  let isMuted = false;
  let callStartedAt = null;
  let callTimerId = null;
  let dialpadMode = "dial";
  let pendingIncomingDecision = null;
  let pendingIncomingFrom = "";

  function initUiRefs() {
    ui = {
      views: {
        login: $("view-login"),
        dialer: $("view-dialer"),
        incall: $("view-incall"),
        history: $("view-history"),
      },
      logsView: $("view-logs"),
      incomingModal: $("modal-incoming"),
      incomingNumber: $("incoming-number"),
      regState: $("regState"),
      callStateText: $("callStateText"),
      alertMessage: $("alertMessage"),
      wsUrl: $("wsUrl"),
      sipUri: $("sipUri"),
      authUser: $("authUser"),
      password: $("password"),
      targetUri: $("targetUri"),
      transferTarget: $("transferTarget"),
      incallSurface: $("incallSurface"),
      incallKeypad: $("incallKeypad"),
      dtmfDisplay: $("dtmf-display"),
      dialTargetArea: $("dialTargetArea"),
      transferArea: $("transferArea"),
      inCallPanel: $("inCallPanel"),
      remoteParty: $("remoteParty"),
      callTimer: $("callTimer"),
      btnLogin: $("btnLogin"),
      btnLogout: $("btnLogout"),
      btnHistory: $("btnHistory"),
      btnBackHistory: $("btnBackHistory"),
      btnClearHistory: $("btnClearHistory"),
      callButton: $("callButton"),
      hangupButton: $("hangupButton"),
      btnAnswerModal: $("btnAnswerModal"),
      btnRejectModal: $("btnRejectModal"),
      btnMute: $("btnMute"),
      btnHold: $("btnHold"),
      btnTransfer: $("btnTransfer"),
      btnKeypad: $("btnKeypad"),
      btnHideKeypad: $("btnHideKeypad"),
      btnEndCall: $("btnEndCall"),
      btnDoTransfer: $("btnDoTransfer"),
      clearButton: $("clearButton"),
      backspaceButton: $("backspaceButton"),
      callHistoryList: $("callHistoryList"),
      historyList: $("history-list"),
      logOutput: $("logOutput"),
      remoteAudio: $("remoteAudio"),
    };
  }

  function log(message) {
    const time = new Date().toLocaleTimeString();
    ui.logOutput.textContent = `[${time}] ${message}\n${ui.logOutput.textContent}`;
    console.log(message);
  }

  function installGlobalErrorLogging() {
    window.addEventListener("error", (event) => {
      log(`JavaScript error: ${event.message || "不明"} (${event.filename || "unknown"}:${event.lineno || 0})`);
    });

    window.addEventListener("unhandledrejection", (event) => {
      const reason = event.reason;
      const message = reason?.message || String(reason || "不明");
      log(`JavaScript promise error: ${message}`);
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

  function normalizeHistoryRecord(item) {
    if (item && item.timestamp && item.direction && item.status) {
      return item;
    }

    return {
      target: item?.target || "不明",
      timestamp: item?.timestamp || item?.time || new Date().toISOString(),
      direction: item?.direction || item?.kind || "通話",
      status: item?.status || "成功",
    };
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

  function renderCallHistory() {
    const latestItems = readCallHistory().slice(-MAX_CALL_HISTORY_ITEMS).reverse();

    if (latestItems.length === 0) {
      const empty = '<li class="empty-history">履歴はありません</li>';
      if (ui.callHistoryList) ui.callHistoryList.innerHTML = empty;
      if (ui.historyList) ui.historyList.innerHTML = empty;
      return;
    }

    if (ui.callHistoryList) {
      ui.callHistoryList.innerHTML = latestItems.slice(0, 3).map((item) => {
        const kind = escapeHtml(item.direction || "通話");
        const target = escapeHtml(item.target || "不明");
        const time = escapeHtml(new Date(item.timestamp).toLocaleString());
        return `<li class="call-history-item"><span class="history-kind">${kind}</span><span class="history-target">${target}</span><span class="history-time">${time}</span></li>`;
      }).join("");
    }

    if (ui.historyList) {
      ui.historyList.innerHTML = latestItems.map((item) => {
        const status = escapeHtml(item.status || "成功");
        const direction = escapeHtml(item.direction || "通話");
        const target = escapeHtml(item.target || "不明");
        const time = escapeHtml(new Date(item.timestamp).toLocaleString());
        return `<li class="history-item"><span class="history-item-status">${status}</span><span class="history-item-target">${direction}: ${target}</span><span class="history-item-time">${time}</span></li>`;
      }).join("");
    }
  }

  function inferHistoryStatus(kind) {
    const text = String(kind || "");
    if (text.includes("失敗") || text.includes("拒否")) return "失敗";
    return "成功";
  }

  function addCallHistory(kind, target, status = inferHistoryStatus(kind)) {
    const items = readCallHistory();
    items.push({
      target: target || "不明",
      timestamp: new Date().toISOString(),
      direction: kind || "通話",
      status,
    });
    saveCallHistory(items.slice(-MAX_CALL_HISTORY_ITEMS));
    renderCallHistory();
  }

  function showHistoryView() {
    renderCallHistory();
    showView("view-history");
  }

  function clearCallHistory() {
    saveCallHistory([]);
    renderCallHistory();
  }

  function backFromHistory() {
    showView("view-dialer");
  }

  function showUserError(message) {
    ui.alertMessage.textContent = message;
    ui.alertMessage.hidden = false;
    log(`エラー: ${message}`);
  }

  function clearUserError() {
    ui.alertMessage.hidden = true;
    ui.alertMessage.textContent = "";
  }

  function getRegistrationLabel() {
    if (registrationState === "REGISTERED") return "登録済み";
    if (registrationState === "REGISTERING") return "登録中";
    if (registrationState === "FAILED") return "登録失敗";
    return "未登録";
  }

  function getCallStateLabel() {
    if (callState === "OUTGOING") return "発信中";
    if (callState === "INCOMING") return "着信中";
    if (callState === "INCALL" && isHeld) return "保留中";
    if (callState === "INCALL") return "通話中";
    return "待機中";
  }

  function showView(viewId) {
    ui.views.login.style.display = viewId === "view-login" ? "block" : "none";
    ui.views.dialer.style.display = viewId === "view-dialer" ? "block" : "none";
    ui.views.incall.style.display = viewId === "view-incall" ? "block" : "none";
    ui.views.history.style.display = viewId === "view-history" ? "block" : "none";
    ui.views.login.classList.toggle("active", viewId === "view-login");
    ui.views.dialer.classList.toggle("active", viewId === "view-dialer");
    ui.views.incall.classList.toggle("active", viewId === "view-incall");
    ui.views.history.classList.toggle("active", viewId === "view-history");
  }

  function checkDevMode() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("dev") === "1") {
      ui.logsView.style.display = "block";
      log("開発者モードを有効にしました。");
    }
  }

  function showIncomingModal(from) {
    pendingIncomingFrom = from || "不明";
    ui.incomingNumber.textContent = pendingIncomingFrom;
    ui.incomingModal.style.display = "flex";
  }

  function hideIncomingModal() {
    ui.incomingModal.style.display = "none";
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

    ui.transferArea.hidden = !transferMode;
    ui.incallKeypad.classList.toggle("is-open", keypadOpen);
    ui.incallSurface.classList.toggle("is-keypad-mode", keypadScreenMode);
    ui.btnTransfer.classList.toggle("success", transferMode);
    ui.btnKeypad.classList.toggle("success", inCall && dialpadMode === "keypad");
    ui.btnKeypad.setAttribute("aria-pressed", keypadOpen ? "true" : "false");
    ui.btnTransfer.setAttribute("aria-pressed", transferMode ? "true" : "false");
  }

  function updateRemoteParty() {
    const remote = activeSession?.remote_identity?.uri?.toString() || pendingIncomingFrom || "不明";
    ui.remoteParty.textContent = remote;
  }

  function refreshUi() {
    const isRegistered = registrationState === "REGISTERED";
    const hasSession = activeSession !== null;
    const inCall = callState === "INCALL";
    const callScreenActive = callState === "OUTGOING" || callState === "INCOMING" || callState === "INCALL";

    ui.btnLogin.disabled = registrationState === "REGISTERING";
    ui.btnLogout.disabled = !isRegistered && registrationState !== "REGISTERING";
    ui.callButton.disabled = !isRegistered || hasSession;
    ui.hangupButton.disabled = !hasSession || callState === "INCOMING";
    ui.btnAnswerModal.disabled = callState !== "INCOMING";
    ui.btnRejectModal.disabled = callState !== "INCOMING";
    ui.btnMute.disabled = !inCall;
    ui.btnHold.disabled = !inCall;
    ui.btnTransfer.disabled = !inCall;
    ui.btnKeypad.disabled = !inCall;
    ui.btnHideKeypad.disabled = !inCall;
    ui.btnEndCall.disabled = !hasSession;
    ui.btnDoTransfer.disabled = !inCall;
    ui.regState.textContent = getRegistrationLabel();
    ui.callStateText.textContent = getCallStateLabel();
    ui.btnMute.setAttribute("aria-pressed", isMuted ? "true" : "false");
    ui.btnHold.textContent = isHeld ? "保留解除" : "保留";
    if (!callScreenActive) {
      setDialpadMode("dial");
    }
  }

  function routeCallView() {
    if (callState === "IDLE") {
      if (registrationState === "REGISTERED") {
        showView("view-dialer");
      }
      return;
    }

    showView("view-incall");
  }

  function setRegistrationState(nextState) {
    registrationState = nextState;
    refreshUi();
    routeCallView();
  }

  function setCallState(nextState) {
    callState = nextState;
    refreshUi();
    routeCallView();
  }

  function notifyAndroidAudioStart() {
    try {
      window.AndroidPhone?.prepareAudioForCall?.();
    } catch (error) {
      log(`Android音声モード設定に失敗しました: ${error.message || "不明"}`);
    }
  }

  function notifyAndroidAudioStop() {
    try {
      window.AndroidPhone?.clearAudioForCall?.();
    } catch (error) {
      log(`Android音声モード解除に失敗しました: ${error.message || "不明"}`);
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
    const codecMap = payloadTypes.map((pt) => {
      const rtpmap = lines.find((line) => line.startsWith(`a=rtpmap:${pt} `));
      if (!rtpmap) return `${pt}:unknown`;
      return `${pt}:${rtpmap.slice(9)}`;
    });
    return codecMap;
  }

  function logPeerConnectionSdp(peerConnection, label) {
    if (!peerConnection) return;

    const localDesc = peerConnection.localDescription;
    const remoteDesc = peerConnection.remoteDescription;

    log(`${label} PeerConnection signalState=${peerConnection.signalingState}, local=${localDesc?.type || "none"}, remote=${remoteDesc?.type || "none"}`);

    if (localDesc?.sdp) {
      log(`${label} local audio codecs: ${parseAudioCodecsFromSdp(localDesc.sdp).join(", ") || "none"}`);
    }
    if (remoteDesc?.sdp) {
      log(`${label} remote audio codecs: ${parseAudioCodecsFromSdp(remoteDesc.sdp).join(", ") || "none"}`);
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
      log("リモート音声の再生を開始しました。");
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

    const receiver = peerConnection.getReceivers().find((item) => item.track && item.track.kind === "audio");
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
    const hadCallState = activeSession !== null || ui.remoteAudio.srcObject !== null || callState !== "IDLE";
    activeSession = null;
    pendingIncomingDecision = null;
    isHeld = false;
    isMuted = false;
    setDialpadMode("dial");
    if (ui.dtmfDisplay) {
      ui.dtmfDisplay.innerText = "";
    }
    hideIncomingModal();
    clearRemoteAudio();
    stopCallTimer();
    notifyAndroidAudioStop();
    setCallState("IDLE");
    if (hadCallState) {
      log(`通話状態をリセットしました: ${reason}`);
    }
  }

  function getConfigFromForm() {
    return {
      wsUrl: ui.wsUrl.value.trim(),
      sipUri: ui.sipUri.value.trim(),
      authUser: ui.authUser.value.trim(),
      password: ui.password.value,
    };
  }

  function fillConfigForm(config) {
    ui.wsUrl.value = config.wsUrl || "";
    ui.sipUri.value = config.sipUri || "";
    ui.authUser.value = config.authUser || "";
    ui.password.value = config.password || "";
  }

  function loadSavedConfig() {
    try {
      const raw = window.localStorage.getItem(CONFIG_STORAGE_KEY);
      if (!raw) return;

      fillConfigForm(JSON.parse(raw));
      log("保存済み設定を読み込みました。");
    } catch (error) {
      log(`保存済み設定の読み込みに失敗しました: ${error.message || "不明"}`);
    }
  }

  function saveConfig() {
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(getConfigFromForm()));
      log("SIP設定を保存しました。");
    } catch (error) {
      log(`SIP設定の保存に失敗しました: ${error.message || "不明"}`);
    }
  }

  function buildUaConfig() {
    const { wsUrl, sipUri, authUser, password } = getConfigFromForm();

    if (!wsUrl || !sipUri || !password) {
      throw new Error("WebSocket URL、SIP URI、パスワードは必須です。");
    }

    if (/^wss?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(wsUrl)) {
      throw new Error("iPhone実機では localhost / 127.0.0.1 のWebSocket URLは使えません。MacまたはSIPサーバーのLAN IPを指定してください。");
    }

    const socket = new JsSIP.WebSocketInterface(wsUrl);
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

  function destroyUa() {
    if (!ua) return;

    try {
      ua.stop();
    } catch (error) {
      log(`UA停止時にエラーが発生しました: ${error.message || "不明"}`);
    }

    ua = null;
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
      || text.includes("no audio")
      || text.includes("not found");
  }

  function handlePotentialMediaError(error) {
    if (isMicrophoneNotFoundError(error)) {
      showUserError(MICROPHONE_NOT_FOUND_MESSAGE);
      return true;
    }
    return false;
  }

  function bindPeerConnection(session) {
    session.on("peerconnection", (event) => {
      const peerConnection = event.peerconnection;
      if (!peerConnection) return;

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

  function bindSessionEvents(session, originator) {
    bindPeerConnection(session);

    session.on("connecting", () => {
      log(`通話セッション接続中: originator=${originator}`);
    });

    session.on("sending", () => {
      log(`INVITEを送信中: originator=${originator}, target=${session.remote_identity?.uri?.toString() || "不明"}`);
    });

    session.on("progress", () => {
      setCallState(originator === "remote" ? "INCOMING" : "OUTGOING");
      updateRemoteParty();
      log("呼び出し中です。");
    });

    session.on("accepted", () => {
      hideIncomingModal();
      notifyAndroidAudioStart();
      updateRemoteParty();
      startCallTimer();
      setCallState("INCALL");
      logPeerConnectionSdp(session.connection, "accepted");
      attachRemoteAudioFromPeerConnection(session.connection, "accepted");
      playRemoteAudio();
      log("通話が受け付けられました。");
    });

    session.on("confirmed", () => {
      hideIncomingModal();
      notifyAndroidAudioStart();
      updateRemoteParty();
      startCallTimer();
      setCallState("INCALL");
      logPeerConnectionSdp(session.connection, "confirmed");
      attachRemoteAudioFromPeerConnection(session.connection, "confirmed");
      playRemoteAudio();
      log("通話が確立しました。");
    });

    session.on("hold", () => {
      isHeld = true;
      refreshUi();
      log("通話を保留しました。");
    });

    session.on("unhold", () => {
      isHeld = false;
      refreshUi();
      log("保留を解除しました。");
    });

    session.on("ended", () => {
      addCallHistory(originator === "remote" ? "呼入" : "呼出", session.remote_identity?.uri?.toString() || "不明", "成功");
      resetCallState("ended");
    });

    session.on("failed", (event) => {
      handlePotentialMediaError(event);
      const response = event.message || event.response;
      const statusCode = response?.status_code || response?.statusCode || "";
      const reasonPhrase = response?.reason_phrase || response?.reasonPhrase || "";
      const method = response?.method || "";
      const extra = [
        statusCode ? `status=${statusCode}` : "",
        reasonPhrase ? `reason=${reasonPhrase}` : "",
        method ? `method=${method}` : "",
      ].filter(Boolean).join(", ");
      log(`通話失敗: cause=${event.cause || "不明"}, originator=${event.originator || "不明"}${extra ? `, ${extra}` : ""}`);
      addCallHistory(originator === "remote" ? "呼入" : "呼出", session.remote_identity?.uri?.toString() || "不明", "失敗");
      resetCallState(`failed: ${event.cause || "不明"}`);
    });
  }

  function setupUaEvents() {
    ua.on("connecting", () => log(`WebSocketに接続中です: ${ui.wsUrl.value.trim()}`));
    ua.on("connected", () => {
      clearUserError();
      log(`WebSocketに接続しました: ${ui.wsUrl.value.trim()}`);
    });
    ua.on("disconnected", (event) => {
      setRegistrationState("FAILED");
      const message = [
        "WebSocketが切断されました。",
        `URL=${ui.wsUrl.value.trim()}`,
        event?.error ? `error=${event.error}` : "",
        event?.code ? `code=${event.code}` : "",
        event?.reason ? `reason=${event.reason}` : "",
      ].filter(Boolean).join(" ");
      showUserError(message);
    });
    ua.on("registrationExpiring", () => {
      log("SIP登録の期限が近いため再登録します。");
      try {
        ua.register();
      } catch (error) {
        log(`SIP再登録に失敗しました: ${error.message || "不明"}`);
      }
    });

    ua.on("registered", () => {
      setRegistrationState("REGISTERED");
      saveConfig();
      showView("view-dialer");
      log(`SIP登録が完了しました: ${ui.sipUri.value.trim()}`);
    });

    ua.on("unregistered", () => {
      setRegistrationState("UNREGISTERED");
      showView("view-login");
      log("SIP登録を解除しました。");
    });

    ua.on("registrationFailed", (event) => {
      setRegistrationState("FAILED");
      showView("view-login");
      showUserError(`SIP登録に失敗しました: cause=${event.cause || "不明"}, URL=${ui.wsUrl.value.trim()}`);
    });

    ua.on("newRTCSession", (event) => {
      const originator = event?.originator;
      const session = event?.session;
      if (!session) {
        log("newRTCSessionを受信しましたが、sessionがありません。");
        return;
      }

      log(`newRTCSession: originator=${originator}, callState=${callState}, hasActive=${activeSession ? "yes" : "no"}`);

      if (activeSession && callState === "IDLE") {
        log("待機中に古いactiveSessionが残っていたため破棄します。");
        activeSession = null;
      }

      if (activeSession) {
        session.terminate();
        log("既存通話があるため新しいセッションを拒否しました。");
        return;
      }

      activeSession = session;
      bindSessionEvents(session, originator);
      updateRemoteParty();

      if (originator === "remote") {
        const from = session.remote_identity?.uri?.toString() || "不明";
        setCallState("INCOMING");
        showIncomingModal(from);
        addCallHistory("着信", from);
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
        log("発信セッションを開始しました。");
      }
    });
  }

  function getDomainFromSipUri(sipUri) {
    const normalized = sipUri.replace(/^sip:/i, "");
    const atIndex = normalized.indexOf("@");
    return atIndex >= 0 ? normalized.slice(atIndex + 1) : "";
  }

  function normalizeTargetUri(rawTarget) {
    const target = rawTarget.trim();
    if (!target) {
      throw new Error("発信先番号を入力してください。");
    }

    if (target.startsWith("sip:")) {
      return target;
    }

    if (target.includes("@")) {
      return `sip:${target}`;
    }

    const domain = getDomainFromSipUri(ui.sipUri.value.trim());
    if (!domain) {
      throw new Error("SIP URIからドメインを取得できません。発信先は sip:user@example.com 形式で入力してください。");
    }

    return `sip:${target}@${domain}`;
  }

  function register() {
    try {
      clearUserError();
      destroyUa();
      resetCallState("register");

      ua = new JsSIP.UA(buildUaConfig());
      setupUaEvents();
      setRegistrationState("REGISTERING");
      log(`SIP登録を開始します: uri=${ui.sipUri.value.trim()}, ws=${ui.wsUrl.value.trim()}`);
      ua.start();
    } catch (error) {
      destroyUa();
      setRegistrationState("FAILED");
      showView("view-login");
      log(error.message || "登録処理でエラーが発生しました。");
    }
  }

  function logout() {
    destroyUa();
    resetCallState("logout");
    setRegistrationState("UNREGISTERED");
    showView("view-login");
  }

  function call() {
    try {
      clearUserError();

      if (!ua || registrationState !== "REGISTERED") {
        throw new Error("先にSIP登録を完了してください。");
      }

      if (activeSession) {
        throw new Error("既に通話セッションがあります。");
      }

      const target = normalizeTargetUri(ui.targetUri.value);
      log(`発信準備: target=${target}`);
      ua.call(target, CALL_OPTIONS);
      addCallHistory("発信", target);
      log(`発信しました: ${target}`);
    } catch (error) {
      if (!handlePotentialMediaError(error)) {
        log(`発信処理でエラーが発生しました: ${error.message || "不明"}`);
      }
    }
  }

  function answerIncoming() {
    try {
      clearUserError();

      if (!activeSession && callState === "INCOMING") {
        pendingIncomingDecision = "answer";
        log("SIPセッション到着前のため応答を保留しました。");
        return;
      }

      if (!activeSession || callState !== "INCOMING") {
        throw new Error("応答可能な着信がありません。");
      }

      const from = ui.incomingNumber.textContent;
      notifyAndroidAudioStart();
      activeSession.answer(CALL_OPTIONS);
      hideIncomingModal();
      setCallState("INCALL");
      addCallHistory("応答", from);
      log("着信に応答しました。");
    } catch (error) {
      notifyAndroidAudioStop();
      if (!handlePotentialMediaError(error)) {
        log(error.message || "応答処理でエラーが発生しました。");
      }
    }
  }

  function rejectIncoming() {
    if (!activeSession && callState === "INCOMING") {
      pendingIncomingDecision = "reject";
      addCallHistory("拒否", pendingIncomingFrom || "不明");
      hideIncomingModal();
      setCallState("IDLE");
      log("着信通知を拒否しました。");
      return;
    }

    if (!activeSession || callState !== "INCOMING") return;

    const session = activeSession;

    try {
      session.terminate();
      addCallHistory("拒否", session.remote_identity?.uri?.toString() || "不明");
      log("着信を拒否しました。");
      setTimeout(() => {
        if (activeSession === session) {
          resetCallState("reject_timeout");
        }
      }, 2000);
    } catch (error) {
      log(`拒否処理でエラーが発生しました: ${error.message || "不明"}`);
      resetCallState("reject_error");
    }
  }

  function hangup() {
    if (!activeSession) {
      log("切断要求を無視しました: activeSessionがありません。");
      return;
    }

    const session = activeSession;

    try {
      log(`切断を要求します: callState=${callState}, remote=${session.remote_identity?.uri?.toString() || "不明"}`);
      session.terminate();
      if (ua && typeof ua.terminateSessions === "function") {
        ua.terminateSessions();
      }
      addCallHistory("切断", session.remote_identity?.uri?.toString() || "不明");
      log("切断を要求しました。");
      setTimeout(() => {
        if (activeSession === session) {
          resetCallState("hangup_timeout");
        }
      }, 2000);
    } catch (error) {
      log(`切断処理でエラーが発生しました: ${error.message || "不明"}`);
      resetCallState("hangup_error");
    }
  }

  function toggleMute() {
    if (!activeSession || callState !== "INCALL") return;

    try {
      if (isMuted) {
        if (typeof activeSession.unmute === "function") {
          activeSession.unmute({ audio: true });
        }
        isMuted = false;
      } else {
        if (typeof activeSession.mute === "function") {
          activeSession.mute({ audio: true });
        }
        isMuted = true;
      }
      refreshUi();
    } catch (error) {
      log(`Mute operation failed: ${error.message || "unknown"}`);
    }
  }

  function toggleHold() {
    if (!activeSession || callState !== "INCALL") return;

    try {
      if (isHeld) {
        if (typeof activeSession.unhold === "function") {
          activeSession.unhold();
        }
        isHeld = false;
      } else {
        if (typeof activeSession.hold === "function") {
          activeSession.hold();
        }
        isHeld = true;
      }
      refreshUi();
    } catch (error) {
      log(`保留操作に失敗しました: ${error.message || "不明"}`);
    }
  }

  function transferCall() {
    if (!activeSession || callState !== "INCALL") return;

    try {
      const target = normalizeTargetUri(ui.transferTarget.value);
      if (typeof activeSession.refer !== "function") {
        throw new Error("このSIPセッションは転送に対応していません。");
      }
      activeSession.refer(target);
      addCallHistory("転送", target);
      log(`転送を要求しました: ${target}`);
      ui.transferTarget.value = "";
      setDialpadMode("keypad");
    } catch (error) {
      log(`転送に失敗しました: ${error.message || "不明"}`);
    }
  }

  function sendDtmf(digit) {
    if (!activeSession || callState !== "INCALL") return;

    try {
      if (typeof activeSession.sendDTMF === "function") {
        activeSession.sendDTMF(digit);
        if (ui.dtmfDisplay) {
          ui.dtmfDisplay.innerText += digit;
        }
        log(`DTMF送信: ${digit}`);
      } else {
        log("このSIPセッションはDTMFに対応していません。");
      }
    } catch (error) {
      log(`DTMF送信に失敗しました: ${error.message || "不明"}`);
    }
  }

  function appendDigit(digit) {
    if (callState === "INCALL") {
      if (dialpadMode === "transfer") {
        ui.transferTarget.value = `${ui.transferTarget.value}${digit}`;
      } else {
        sendDtmf(digit);
      }
      return;
    }

    ui.targetUri.value = `${ui.targetUri.value}${digit}`;
  }

  function handleNativeIncomingCall(raw) {
    const payload = raw && typeof raw === "object" ? raw : {};
    const from = String(payload.fromUri || payload.from_uri || payload.from || "不明");
    showView("view-dialer");
    setCallState("INCOMING");
    showIncomingModal(from);
    addCallHistory("通知", from);
    log(`Androidから着信通知を受信しました: ${from}`);
    return true;
  }

  function exposeNativeBridgeApi() {
    window.WebRtcPhoneApp = {
      showIncomingCall: handleNativeIncomingCall,
      answerIncomingCall: () => {
        answerIncoming();
        return true;
      },
      rejectIncomingCall: () => {
        rejectIncoming();
        return true;
      },
      hangupCall: () => {
        hangup();
        return true;
      },
      holdCall: () => {
        toggleHold();
        return true;
      },
      transferCall: (target) => {
        ui.transferTarget.value = String(target || "");
        transferCall();
        return true;
      },
      sendDtmf: (digit) => {
        sendDtmf(String(digit || ""));
        return true;
      },
    };

    window.showIncomingCall = window.WebRtcPhoneApp.showIncomingCall;
    window.answerIncomingCall = window.WebRtcPhoneApp.answerIncomingCall;
    window.rejectIncomingCall = window.WebRtcPhoneApp.rejectIncomingCall;
  }

  function bindUiEventsOnce() {
    ui.btnLogin.addEventListener("click", register);
    ui.btnLogout.addEventListener("click", logout);
    ui.btnHistory.addEventListener("click", showHistoryView);
    ui.btnBackHistory.addEventListener("click", backFromHistory);
    ui.btnClearHistory.addEventListener("click", clearCallHistory);
    ui.callButton.addEventListener("click", call);
    ui.hangupButton.addEventListener("click", hangup);
    ui.btnEndCall.addEventListener("click", hangup);
    ui.btnAnswerModal.addEventListener("click", answerIncoming);
    ui.btnRejectModal.addEventListener("click", rejectIncoming);
    ui.btnMute.addEventListener("click", toggleMute);
    ui.btnHold.addEventListener("click", toggleHold);
    ui.btnTransfer.addEventListener("click", () => setDialpadMode(dialpadMode === "transfer" ? "keypad" : "transfer"));
    ui.btnKeypad.addEventListener("click", () => setDialpadMode(dialpadMode === "keypad" ? "dial" : "keypad"));
    ui.btnHideKeypad.addEventListener("click", () => setDialpadMode("dial"));
    ui.btnDoTransfer.addEventListener("click", transferCall);

    document.querySelectorAll(".digit").forEach((button) => {
      button.addEventListener("click", () => appendDigit(button.dataset.digit || ""));
    });

    ui.clearButton.addEventListener("click", () => {
      ui.targetUri.value = "";
      ui.transferTarget.value = "";
    });

    ui.backspaceButton.addEventListener("click", () => {
      if (callState === "INCALL" && dialpadMode === "transfer") {
        ui.transferTarget.value = ui.transferTarget.value.slice(0, -1);
      } else {
        ui.targetUri.value = ui.targetUri.value.slice(0, -1);
      }
    });
  }

  function initialize() {
    initUiRefs();
    installGlobalErrorLogging();
    loadSavedConfig();
    renderCallHistory();
    bindUiEventsOnce();
    exposeNativeBridgeApi();
    setupRemoteAudioElement();

    document.addEventListener("ios-audio-unlocked", () => {
      log("iOS audio unlocked event received.");
      playRemoteAudio();
    });

    showView("view-login");
    hideIncomingModal();
    refreshUi();
    checkDevMode();
    log("アプリを初期化しました。");
    log(`WebRTC環境: isSecureContext=${window.isSecureContext}, mediaDevices=${Boolean(navigator.mediaDevices)}, getUserMedia=${Boolean(navigator.mediaDevices?.getUserMedia)}`);

    if (window.AndroidPhone && typeof window.AndroidPhone.notifyReady === "function") {
      window.AndroidPhone.notifyReady();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
