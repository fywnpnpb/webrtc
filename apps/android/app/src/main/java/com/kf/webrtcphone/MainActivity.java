package com.kf.webrtcphone;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.ActivityNotFoundException;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.kf.webrtcphone.contacts.DeviceContactsManager;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Queue;

public class MainActivity extends Activity {

    private static final int REQUEST_RECORD_AUDIO = 100;
    private static final int REQUEST_POST_NOTIFICATIONS = 101;
    private static final int REQUEST_READ_CONTACTS = 102;
    private static final String WEB_APP_URL = "file:///android_asset/index.html";
    private static final String WEB_BRIDGE_NAME = "AndroidPhone";

    private WebView webView;
    private AudioManager audioManager;
    private DeviceContactsManager deviceContactsManager;
    private AudioFocusRequest audioFocusRequest;
    private PermissionRequest pendingWebPermissionRequest;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private boolean webPageReady = false;
    private boolean speakerphoneEnabled = false;
    private boolean callAudioActive = false;
    private volatile String firebasePushToken = "";
    private String activeIncomingCallId = "";
    private String pendingProvisioningPayload = "";
    private final Queue<String> pendingJavascriptCalls = new ArrayDeque<>();
    private final BroadcastReceiver incomingCallCancelReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (!IncomingCallIntents.ACTION_CANCEL_INCOMING.equals(intent.getAction())) {
                return;
            }

            String callId = getStringExtra(intent, IncomingCallIntents.EXTRA_CALL_ID);
            if (!callId.isEmpty()
                    && !activeIncomingCallId.isEmpty()
                    && !callId.equals(activeIncomingCallId)) {
                AppLogger.d("Ignore cancel command for another call: " + callId);
                return;
            }

            String reason = getStringExtra(intent, IncomingCallIntents.EXTRA_REASON);
            AppLogger.i("Incoming call cancelled by control service: callId=" + callId + ", reason=" + reason);
            activeIncomingCallId = "";
            enqueueJavascriptCall(
                    "window.WebRTCPhone && window.WebRTCPhone.cancelPushAnswer("
                            + JSONObject.quote(reason)
                            + ","
                            + JSONObject.quote(callId)
                            + ");"
            );
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        deviceContactsManager = new DeviceContactsManager(this, REQUEST_READ_CONTACTS);
        AppLogger.i("MainActivity created");
        AppLogger.setUploadListener((success, reason, detail) -> evaluateJavascriptSafely(
                "window.WebRTCPhone && window.WebRTCPhone.onLogUploadResult("
                        + success + ","
                        + JSONObject.quote(safeBridgeText(reason)) + ","
                        + JSONObject.quote(safeBridgeText(detail))
                        + ");",
                "log_upload_result"
        ));

        showOverLockScreen();
        webView = new WebView(this);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        connectivityManager = getSystemService(ConnectivityManager.class);
        setContentView(webView);
        setVolumeControlStream(AudioManager.STREAM_MUSIC);

        setupWebView(webView);
        registerIncomingCallReceiver();
        registerNetworkCallback();
        webView.clearCache(true);
        if (ensureAndroidAudioPermission()) {
            ensureNotificationPermission();
        }
        logFirebaseToken();

        webView.loadUrl(WEB_APP_URL);
        handleIncomingIntent(getIntent());
        notifySupportInfoUpdated();
        dispatchNetworkInfo("activity_created", true);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        AppLogger.i("MainActivity received new intent: action="
                + (intent == null ? "" : intent.getAction()));
        handleIncomingIntent(intent);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
        AppLogger.i("MainActivity resumed");
        evaluateJavascriptSafely(
                "window.WebRTCPhone&&window.WebRTCPhone.refreshDeviceContacts"
                        + "&&window.WebRTCPhone.refreshDeviceContacts();",
                "activity_resumed_contacts"
        );
        notifySupportInfoUpdated();
        dispatchNetworkInfo("activity_resumed", true);
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        AppLogger.i("MainActivity paused");
        super.onPause();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int keyCode = event.getKeyCode();
        if (event.getAction() == KeyEvent.ACTION_DOWN
                && (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN)
                && callAudioActive) {
            int direction = keyCode == KeyEvent.KEYCODE_VOLUME_UP
                    ? AudioManager.ADJUST_RAISE
                    : AudioManager.ADJUST_LOWER;
            adjustCallPlaybackVolume(direction);
            return true;
        }

        return super.dispatchKeyEvent(event);
    }

    @Override
    public void onBackPressed() {
        if (webView == null || !webPageReady) {
            super.onBackPressed();
            return;
        }

        webView.evaluateJavascript(
                "(function(){try{return Boolean(window.WebRTCPhone"
                        + "&&window.WebRTCPhone.handleBack"
                        + "&&window.WebRTCPhone.handleBack());}catch(error){return false;}})();",
                handled -> {
                    if (!"true".equals(handled)) {
                        MainActivity.super.onBackPressed();
                    }
                }
        );
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView(WebView target) {
        target.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                AppLogger.i("WebView loaded: " + url);
                notifySupportInfoUpdated();
                dispatchNetworkInfo("page_finished", false);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request.isForMainFrame()) {
                    AppLogger.e("WebView load failed: " + request.getUrl() + " / " + error.getDescription());
                }
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                AppLogger.e("WebView renderer process gone: didCrash="
                        + detail.didCrash()
                        + ", priorityAtExit="
                        + detail.rendererPriorityAtExit());
                recreateWebView("render_process_gone");
                return true;
            }
        });

        target.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                AppLogger.d("JS console: " + consoleMessage.message()
                        + " @" + consoleMessage.sourceId()
                        + ":" + consoleMessage.lineNumber());
                return true;
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                runOnUiThread(() -> handleWebPermissionRequest(request));
            }
        });

        WebSettings settings = target.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUseWideViewPort(false);
        settings.setLoadWithOverviewMode(false);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);

        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
            target.setLayerType(View.LAYER_TYPE_SOFTWARE, null);
            AppLogger.i("WebView software rendering enabled for Android 10 or earlier");
        }

        target.addJavascriptInterface(new NativeBridge(), WEB_BRIDGE_NAME);
    }

    private void recreateWebView(String reason) {
        runOnUiThread(() -> {
            AppLogger.i("Recreating WebView: reason=" + reason);
            webPageReady = false;
            pendingJavascriptCalls.clear();
            if (pendingWebPermissionRequest != null) {
                pendingWebPermissionRequest.deny();
                pendingWebPermissionRequest = null;
            }
            if (webView != null) {
                try {
                    webView.destroy();
                } catch (Exception error) {
                    AppLogger.w("Failed to destroy crashed WebView", error);
                }
            }

            webView = new WebView(this);
            setContentView(webView);
            setupWebView(webView);
            webView.clearCache(true);
            webView.loadUrl(WEB_APP_URL);
            notifySupportInfoUpdated();
        });
    }

    private void registerIncomingCallReceiver() {
        ContextCompat.registerReceiver(
                this,
                incomingCallCancelReceiver,
                new IntentFilter(IncomingCallIntents.ACTION_CANCEL_INCOMING),
                ContextCompat.RECEIVER_NOT_EXPORTED
        );
    }

    private void registerNetworkCallback() {
        if (connectivityManager == null || networkCallback != null) {
            return;
        }

        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                dispatchNetworkInfo("available", true);
            }

            @Override
            public void onLost(Network network) {
                dispatchNetworkInfo("lost", true);
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities networkCapabilities) {
                dispatchNetworkInfo("capabilities_changed", true);
            }
        };

        try {
            connectivityManager.registerDefaultNetworkCallback(networkCallback);
        } catch (Exception error) {
            AppLogger.w("Failed to register network callback", error);
            networkCallback = null;
        }
    }

    private void unregisterNetworkCallback() {
        if (connectivityManager == null || networkCallback == null) {
            return;
        }

        try {
            connectivityManager.unregisterNetworkCallback(networkCallback);
        } catch (Exception error) {
            AppLogger.w("Failed to unregister network callback", error);
        } finally {
            networkCallback = null;
        }
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }

        applyProvisioningFromIntent(intent);

        String action = intent.getAction();
        String callId = getStringExtra(intent, IncomingCallIntents.EXTRA_CALL_ID);
        String fromUri = getStringExtra(intent, IncomingCallIntents.EXTRA_FROM_URI);
        AppLogger.i("Incoming intent handled: action=" + action
                + ", callId=" + callId
                + ", fromUri=" + fromUri);

        if (IncomingCallIntents.ACTION_OPEN_INCOMING.equals(action)) {
            activeIncomingCallId = callId;
            enqueueJavascriptCall(buildShowIncomingCallScript(callId, fromUri));
        } else if (IncomingCallIntents.ACTION_ANSWER_PUSH_CALL.equals(action)) {
            activeIncomingCallId = callId;
            dismissIncomingNotification();
            enqueueJavascriptCall(buildHandlePushAnswerScript(intent, callId, fromUri));
        } else if (IncomingCallIntents.ACTION_REJECT_INCOMING.equals(action)) {
            activeIncomingCallId = callId;
            cancelIncomingNotification();
            enqueueJavascriptCall(
                    "window.WebRTCPhone && window.WebRTCPhone.cancelPushAnswer("
                            + JSONObject.quote("rejected")
                            + ","
                            + JSONObject.quote(callId)
                            + ");"
            );
        }
    }

    private void applyProvisioningFromIntent(Intent intent) {
        String payload = extractProvisioningPayload(intent);
        if (payload.isEmpty()) {
            return;
        }
        pendingProvisioningPayload = payload;
        AppLogger.i("Provisioning payload received from intent");
        if (webPageReady && webView != null) {
            evaluateJavascriptSafely(
                    "window.WebRTCPhone && window.WebRTCPhone.applyProvisioning("
                            + pendingProvisioningPayload
                            + ");",
                    "apply_provisioning_intent"
            );
            pendingProvisioningPayload = "";
        }
    }

    private String extractProvisioningPayload(Intent intent) {
        String directJson = firstNonEmpty(
                getStringExtra(intent, "provisioning_json"),
                getStringExtra(intent, "provisioning")
        );
        if (!directJson.isEmpty()) {
            return normalizeProvisioningJson(directJson);
        }

        Uri data = intent.getData();
        if (data == null) {
            return "";
        }

        String encoded = firstNonEmpty(
                data.getQueryParameter("provisioning"),
                data.getQueryParameter("config"),
                data.getQueryParameter("payload")
        );
        if (!encoded.isEmpty()) {
            return normalizeProvisioningJson(encoded);
        }

        JSONObject payload = new JSONObject();
        try {
            applyKfPhoneStyleProvisioning(payload, data);
            putIfPresent(payload, "wsUrl", firstNonEmpty(data.getQueryParameter("wsUrl"), data.getQueryParameter("ws")));
            putIfPresent(payload, "sipUri", firstNonEmpty(data.getQueryParameter("sipUri"), data.getQueryParameter("sip")));
            putIfPresent(payload, "authUser", firstNonEmpty(data.getQueryParameter("authUser"), data.getQueryParameter("auth")));
            putIfPresent(payload, "password", firstNonEmpty(data.getQueryParameter("password"), data.getQueryParameter("pass")));
            putIfPresent(payload, "selectedStoreId", data.getQueryParameter("storeId"));
            putIfPresent(payload, "storeName", data.getQueryParameter("storeName"));
            putIfPresent(payload, "ctiName", data.getQueryParameter("ctiName"));
            putIfPresent(payload, "defaultDialMethod", data.getQueryParameter("defaultDialMethod"));
            putIfPresent(payload, "storesJson", data.getQueryParameter("storesJson"));
            putIfPresent(payload, "testAgent", data.getQueryParameter("testAgent"));
            putIfPresent(payload, "deviceId", data.getQueryParameter("deviceId"));
            putIfPresent(payload, "testAgentBaseUrl", data.getQueryParameter("testAgentBaseUrl"));
            boolean autoRegister = isEnabledProvisioningValue(data.getQueryParameter("autoRegister"))
                    || isEnabledProvisioningValue(data.getQueryParameter("autoLogin"));
            if (autoRegister) {
                payload.put("autoRegister", true);
            }
        } catch (Exception error) {
            AppLogger.w("Failed to parse provisioning URI", error);
        }

        return payload.length() == 0 ? "" : payload.toString();
    }

    private void applyKfPhoneStyleProvisioning(JSONObject payload, Uri data) throws Exception {
        if (data == null) {
            return;
        }

        Uri kfphUri = data;
        String embeddedKfph = firstNonEmpty(data.getQueryParameter("kfph"), data.getQueryParameter("kfphUrl"));
        if (!embeddedKfph.isEmpty()) {
            kfphUri = Uri.parse(embeddedKfph);
        } else if ("webrtcphone".equalsIgnoreCase(data.getScheme())
                && "provision".equalsIgnoreCase(data.getHost())) {
            String path = safeBridgeText(data.getPath());
            if (path.startsWith("/")) {
                path = path.substring(1);
            }
            if (path.contains("@")) {
                kfphUri = Uri.parse("kfph://" + path);
            }
        }

        if (!"kfph".equalsIgnoreCase(kfphUri.getScheme())) {
            return;
        }

        String authUser = safeBridgeText(kfphUri.getUserInfo());
        String host = safeBridgeText(kfphUri.getHost());
        int port = kfphUri.getPort();
        String password = firstPathSegment(kfphUri);

        if (authUser.isEmpty() || host.isEmpty()) {
            AppLogger.w("KFPhone style provisioning URI is missing auth user or host: " + kfphUri);
            return;
        }

        String hostPort = port > 0 ? host + ":" + port : host;
        putIfPresent(payload, "authUser", authUser);
        putIfPresent(payload, "sipUri", "sip:" + authUser + "@" + hostPort);
        putIfPresent(payload, "password", password);
        putIfPresent(payload, "kfphHost", host);
        if (port > 0) {
            payload.put("kfphPort", port);
        }

        AppLogger.i("KFPhone style provisioning parsed: user=" + authUser + ", host=" + hostPort);
    }

    private String firstPathSegment(Uri uri) {
        if (uri == null || uri.getPathSegments() == null || uri.getPathSegments().isEmpty()) {
            return "";
        }
        return safeBridgeText(uri.getPathSegments().get(0));
    }

    private String normalizeProvisioningJson(String raw) {
        String trimmed = safeBridgeText(raw);
        if (trimmed.isEmpty()) {
            return "";
        }
        if (trimmed.startsWith("{")) {
            return trimmed;
        }
        try {
            String decoded = new String(Base64.getDecoder().decode(trimmed), StandardCharsets.UTF_8).trim();
            return decoded.startsWith("{") ? decoded : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private void putIfPresent(JSONObject payload, String key, String value) throws Exception {
        if (value != null && !value.trim().isEmpty()) {
            payload.put(key, value.trim());
        }
    }

    private void showOverLockScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(
                    WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                            | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            );
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private String buildShowIncomingCallScript(String callId, String fromUri) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("callId", callId);
            payload.put("fromUri", fromUri);
        } catch (Exception ignored) {
            // Safe to continue with a partial payload.
        }
        return "window.WebRTCPhone && window.WebRTCPhone.incomingCall(" + payload + ");";
    }

    private String buildHandlePushAnswerScript(Intent intent, String callId, String fromUri) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("action", IncomingCallIntents.ACTION_ANSWER_PUSH_CALL);
            payload.put("callId", callId);
            payload.put("caller", getStringExtra(intent, IncomingCallIntents.EXTRA_CALLER));
            payload.put("fromUri", fromUri);
            payload.put("sipUri", getStringExtra(intent, IncomingCallIntents.EXTRA_SIP_URI));
            payload.put("receivedAt", getStringExtra(intent, IncomingCallIntents.EXTRA_RECEIVED_AT));
            payload.put(
                    "autoAnswerAfterRegister",
                    intent.getBooleanExtra(IncomingCallIntents.EXTRA_AUTO_ANSWER_AFTER_REGISTER, true)
            );
        } catch (Exception ignored) {
            // Safe to continue with the required call ID if an optional field fails.
        }
        return "window.WebRTCPhone && window.WebRTCPhone.handlePushAnswerIntent(" + payload + ");";
    }

    private void evaluateJavascriptSafely(String script, String reason) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            runOnUiThread(() -> evaluateJavascriptSafely(script, reason));
            return;
        }

        if (webView == null) {
            AppLogger.w("Skipped JavaScript evaluation because WebView is null: reason=" + reason);
            return;
        }

        try {
            webView.evaluateJavascript(script, null);
        } catch (Exception error) {
            AppLogger.w("evaluateJavascript failed: reason=" + reason, error);
            if (webPageReady) {
                pendingJavascriptCalls.add(script);
            }
        }
    }

    private void enqueueJavascriptCall(String script) {
        if (webView == null) {
            return;
        }

        if (webPageReady) {
            evaluateJavascriptSafely(script, "enqueue_immediate");
        } else {
            AppLogger.d("Queue JavaScript until Web app is ready: " + script);
            pendingJavascriptCalls.add(script);
        }
    }

    private void flushPendingJavascriptCalls() {
        while (webView != null && !pendingJavascriptCalls.isEmpty()) {
            evaluateJavascriptSafely(pendingJavascriptCalls.poll(), "flush_pending");
        }
        if (!pendingProvisioningPayload.isEmpty()) {
            evaluateJavascriptSafely(
                    "window.WebRTCPhone && window.WebRTCPhone.applyProvisioning("
                            + pendingProvisioningPayload
                            + ");",
                    "flush_provisioning"
            );
            pendingProvisioningPayload = "";
        }
    }

    private void handleWebPermissionRequest(PermissionRequest request) {
        boolean wantsAudio = false;
        for (String resource : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) {
                wantsAudio = true;
                break;
            }
        }

        if (!wantsAudio) {
            AppLogger.w("Web permission denied because only audio capture is supported");
            request.deny();
            return;
        }

        if (hasAndroidAudioPermission()) {
            grantAudioCaptureIfRequested(request);
            return;
        }

        if (pendingWebPermissionRequest != null) {
            pendingWebPermissionRequest.deny();
        }
        pendingWebPermissionRequest = request;
        AppLogger.i("Requesting Android microphone permission for WebView");
        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
    }

    private void grantAudioCaptureIfRequested(PermissionRequest request) {
        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        AppLogger.i("Audio capture permission granted to WebView");
    }

    private boolean ensureAndroidAudioPermission() {
        if (!hasAndroidAudioPermission()) {
            AppLogger.i("Requesting Android microphone permission");
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
            return false;
        }
        return true;
    }

    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return;
        }

        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            AppLogger.i("Requesting POST_NOTIFICATIONS permission");
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_POST_NOTIFICATIONS);
        }
    }

    private void logFirebaseToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener((task) -> {
            if (!task.isSuccessful()) {
                AppLogger.w("Fetching FCM registration token failed", task.getException());
                return;
            }

            firebasePushToken = task.getResult() == null ? "" : task.getResult();
            AppLogger.d("FCM registration token received: length=" + firebasePushToken.length());
            runOnUiThread(this::notifySupportInfoUpdated);
        });
    }

    private boolean areNotificationsEnabled() {
        return NotificationManagerCompat.from(this).areNotificationsEnabled();
    }

    private boolean isIgnoringBatteryOptimizations() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return true;
        }

        PowerManager powerManager = getSystemService(PowerManager.class);
        return powerManager != null && powerManager.isIgnoringBatteryOptimizations(getPackageName());
    }

    private boolean isPowerSaveModeEnabled() {
        PowerManager powerManager = getSystemService(PowerManager.class);
        return powerManager != null && powerManager.isPowerSaveMode();
    }

    private String buildSupportInfoJson() {
        JSONObject payload = new JSONObject();
        try {
            android.content.pm.PackageInfo packageInfo = getPackageManager()
                    .getPackageInfo(getPackageName(), 0);
            String versionName = packageInfo.versionName;
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? packageInfo.getLongVersionCode()
                    : packageInfo.versionCode;
            payload.put("platform", "android");
            payload.put("appVersion", versionName != null ? versionName : "");
            payload.put("appBuild", String.valueOf(versionCode));
            payload.put("osVersion", Build.VERSION.RELEASE);
            payload.put("manufacturer", Build.MANUFACTURER);
            payload.put("model", Build.MODEL);
            payload.put("deviceName", Build.DEVICE);
            payload.put("pushToken", firebasePushToken);
            payload.put("notificationPermission", areNotificationsEnabled() ? "granted" : "denied");
            payload.put("microphonePermission", hasAndroidAudioPermission() ? "granted" : "denied");
            payload.put("contactsPermission",
                    deviceContactsManager != null && deviceContactsManager.hasReadPermission()
                            ? "granted"
                            : "denied");
            payload.put("ignoringBatteryOptimizations", isIgnoringBatteryOptimizations());
            payload.put("powerSaveModeEnabled", isPowerSaveModeEnabled());
        } catch (Exception error) {
            AppLogger.w("Failed to build support info JSON", error);
        }
        return payload.toString();
    }

    private void openSupportTargetInternal(String target) {
        Intent intent;
        Uri packageUri = Uri.parse("package:" + getPackageName());
        String normalizedTarget = target == null ? "" : target;

        try {
            switch (normalizedTarget) {
                case "request-notifications":
                    ensureNotificationPermission();
                    return;
                case "notifications":
                    intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
                    break;
                case "permissions":
                case "app-settings":
                case "app-details":
                    intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                            .setData(packageUri);
                    break;
                case "battery-optimization":
                    intent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    break;
                default:
                    intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                            .setData(packageUri);
                    break;
            }

            AppLogger.i("Opening support target: " + normalizedTarget);
            startActivity(intent);
        } catch (ActivityNotFoundException error) {
            AppLogger.w("Support target unavailable: " + normalizedTarget, error);
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(packageUri);
            startActivity(fallback);
        }
    }

    private void shareTextInternal(String subject, String text) {
        AppLogger.i("Sharing diagnostic text: subject=" + safeBridgeText(subject)
                + ", length=" + (text == null ? 0 : text.length()));
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/plain");
        intent.putExtra(Intent.EXTRA_SUBJECT, subject);
        intent.putExtra(Intent.EXTRA_TEXT, text);
        startActivity(Intent.createChooser(intent, "Share log"));
    }

    private void emailLogInternal(String recipient, String subject, String text) {
        AppLogger.i("Opening diagnostic email: recipient=" + safeBridgeText(recipient)
                + ", subject=" + safeBridgeText(subject)
                + ", length=" + (text == null ? 0 : text.length()));
        Intent intent = new Intent(Intent.ACTION_SENDTO);
        intent.setData(Uri.fromParts("mailto", safeBridgeText(recipient), null));
        intent.putExtra(Intent.EXTRA_SUBJECT, subject);
        intent.putExtra(Intent.EXTRA_TEXT, text);
        try {
            startActivity(Intent.createChooser(intent, "Send log by email"));
        } catch (ActivityNotFoundException error) {
            AppLogger.w("Email application unavailable; opening share sheet", error);
            shareTextInternal(subject, text);
        }
    }

    private void notifySupportInfoUpdated() {
        if (webView == null) {
            return;
        }

        String script = "window.__nativeSupportInfo=" + buildSupportInfoJson()
                + ";window.dispatchEvent(new Event('native-support-updated'));";
        enqueueJavascriptCall(script);
    }

    private void dispatchNetworkInfo(String eventName, boolean persistLog) {
        String networkJson = buildNativeNetworkInfoJson();
        if (persistLog) {
            AppLogger.i("Network state changed: event=" + eventName + ", payload=" + networkJson);
        }
        enqueueJavascriptCall(
                "window.__nativeNetworkInfo=" + networkJson
                        + ";window.dispatchEvent(new Event('native-network-change'));"
        );
    }

    private String buildNativeNetworkInfoJson() {
        JSONObject payload = new JSONObject();
        try {
            if (connectivityManager == null) {
                payload.put("connected", false);
                return payload.toString();
            }

            Network activeNetwork = connectivityManager.getActiveNetwork();
            NetworkCapabilities capabilities = activeNetwork == null
                    ? null
                    : connectivityManager.getNetworkCapabilities(activeNetwork);

            payload.put("connected", activeNetwork != null && capabilities != null);
            payload.put("online", activeNetwork != null && capabilities != null);
            payload.put("transport", resolveTransport(capabilities));
            payload.put("metered", connectivityManager.isActiveNetworkMetered());
            payload.put("validated", capabilities != null
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED));
            payload.put("notRoaming", capabilities != null
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_ROAMING));
            payload.put("notCongested", capabilities != null
                    && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_CONGESTED));
            payload.put("downlinkKbps", capabilities == null
                    ? JSONObject.NULL
                    : capabilities.getLinkDownstreamBandwidthKbps());
            payload.put("uplinkKbps", capabilities == null
                    ? JSONObject.NULL
                    : capabilities.getLinkUpstreamBandwidthKbps());
        } catch (Exception error) {
            AppLogger.w("Failed to build native network info", error);
        }
        return payload.toString();
    }

    private String resolveTransport(NetworkCapabilities capabilities) {
        if (capabilities == null) {
            return "";
        }
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
            return "wifi";
        }
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
            return "cellular";
        }
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
            return "ethernet";
        }
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_BLUETOOTH)) {
            return "bluetooth";
        }
        if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) {
            return "vpn";
        }
        return "other";
    }

    private boolean hasAndroidAudioPermission() {
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == REQUEST_POST_NOTIFICATIONS) {
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            AppLogger.i("POST_NOTIFICATIONS permission result=" + granted);
            notifySupportInfoUpdated();
            return;
        }

        if (requestCode == REQUEST_READ_CONTACTS) {
            deviceContactsManager.onReadPermissionResult();
            boolean granted = grantResults.length > 0
                    && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            AppLogger.i("READ_CONTACTS permission result=" + granted);
            evaluateJavascriptSafely(
                    "window.WebRTCPhone&&window.WebRTCPhone.refreshDeviceContacts"
                            + "&&window.WebRTCPhone.refreshDeviceContacts();",
                    "contacts_permission_result"
            );
            notifySupportInfoUpdated();
            return;
        }

        if (requestCode != REQUEST_RECORD_AUDIO) {
            return;
        }

        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        AppLogger.i("RECORD_AUDIO permission result=" + granted);
        PermissionRequest request = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;

        if (granted && request != null) {
            grantAudioCaptureIfRequested(request);
        } else if (request != null) {
            request.deny();
        }

        ensureNotificationPermission();
        notifySupportInfoUpdated();
    }

    private void cancelIncomingNotification() {
        dismissIncomingNotification();
        IncomingCallControlService.stop(this);
        AppLogger.i("Incoming call notification cancelled: callId=" + activeIncomingCallId);
        activeIncomingCallId = "";
    }

    private void dismissIncomingNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.cancel(IncomingCallIntents.INCOMING_CALL_NOTIFICATION_ID);
        }
    }

    private void prepareCallAudioRoute() {
        if (audioManager == null) {
            return;
        }

        requestCallAudioFocus();
        callAudioActive = true;
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        ensureAudibleCallVolume();
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        applyAudioRoute();
    }

    private void adjustCallPlaybackVolume(int direction) {
        if (audioManager == null) {
            return;
        }

        audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, AudioManager.FLAG_SHOW_UI);
        audioManager.adjustStreamVolume(AudioManager.STREAM_VOICE_CALL, direction, 0);
        AppLogger.i("Call volume adjusted: streamMusic="
                + audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
                + ", streamVoice=" + audioManager.getStreamVolume(AudioManager.STREAM_VOICE_CALL));
    }

    private void ensureAudibleCallVolume() {
        if (audioManager == null) {
            return;
        }

        setStreamVolumeFloor(AudioManager.STREAM_MUSIC, 0.8f);
        setStreamVolumeFloor(AudioManager.STREAM_VOICE_CALL, 0.8f);
    }

    private void setStreamVolumeFloor(int streamType, float ratio) {
        int maxVolume = audioManager.getStreamMaxVolume(streamType);
        int currentVolume = audioManager.getStreamVolume(streamType);
        int floorVolume = Math.max(1, Math.round(maxVolume * ratio));
        if (currentVolume < floorVolume) {
            audioManager.setStreamVolume(streamType, floorVolume, 0);
            AppLogger.i("Raised volume floor: stream=" + streamType
                    + ", from=" + currentVolume
                    + ", to=" + floorVolume
                    + ", max=" + maxVolume);
        }
    }

    private void applyAudioRoute() {
        if (audioManager == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            boolean selectedDevice = false;
            int preferredDeviceType = speakerphoneEnabled
                    ? AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    : AudioDeviceInfo.TYPE_BUILTIN_EARPIECE;
            for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
                if (device.getType() == preferredDeviceType) {
                    selectedDevice = audioManager.setCommunicationDevice(device);
                    break;
                }
            }
            if (!selectedDevice && !speakerphoneEnabled) {
                audioManager.clearCommunicationDevice();
            }
            AppLogger.i("Communication route selected: speaker=" + speakerphoneEnabled
                    + ", selectedDevice=" + selectedDevice
                    + ", availableDevices=" + describeCommunicationDevices());
        }

        audioManager.setSpeakerphoneOn(speakerphoneEnabled);
        AppLogger.i("Audio route state: mode=" + audioManager.getMode()
                + ", speakerphoneOn=" + audioManager.isSpeakerphoneOn());
    }

    private String describeCommunicationDevices() {
        if (audioManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return "";
        }

        StringBuilder builder = new StringBuilder();
        for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
            if (builder.length() > 0) {
                builder.append(',');
            }
            builder.append(device.getType());
        }
        return builder.toString();
    }

    private void clearCallAudioRoute() {
        if (audioManager == null) {
            return;
        }

        callAudioActive = false;
        speakerphoneEnabled = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.clearCommunicationDevice();
        }

        audioManager.setSpeakerphoneOn(false);
        audioManager.setMode(AudioManager.MODE_NORMAL);
        abandonCallAudioFocus();
        AppLogger.i("Call audio route cleared");
    }

    private void requestCallAudioFocus() {
        if (audioManager == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener(
                            (focusChange) -> AppLogger.d("Audio focus changed: " + focusChange)
                    )
                    .build();
            int result = audioManager.requestAudioFocus(audioFocusRequest);
            AppLogger.i("Audio focus request result: " + result);
        } else {
            int result = audioManager.requestAudioFocus(
                    (focusChange) -> AppLogger.d("Audio focus changed: " + focusChange),
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
            );
            AppLogger.i("Audio focus request result: " + result);
        }
    }

    private void abandonCallAudioFocus() {
        if (audioManager == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
                audioFocusRequest = null;
            }
        } else {
            audioManager.abandonAudioFocus(null);
        }
        AppLogger.i("Audio focus abandoned");
    }

    @Override
    protected void onDestroy() {
        AppLogger.i("MainActivity destroyed");
        AppLogger.setUploadListener(null);
        try {
            unregisterReceiver(incomingCallCancelReceiver);
        } catch (IllegalArgumentException error) {
            AppLogger.w("Incoming call receiver was already unregistered", error);
        }
        unregisterNetworkCallback();
        clearCallAudioRoute();
        if (pendingWebPermissionRequest != null) {
            pendingWebPermissionRequest.deny();
            pendingWebPermissionRequest = null;
        }
        if (webView != null) {
            try {
                webView.destroy();
            } catch (Exception error) {
                AppLogger.w("Failed to destroy WebView on activity destroy", error);
            }
            webView = null;
        }
        super.onDestroy();
    }

    public class NativeBridge {
        @JavascriptInterface
        public void notifyReady() {
            runOnUiThread(() -> {
                webPageReady = true;
                AppLogger.i("Web app bridge is ready");
                flushPendingJavascriptCalls();
                notifySupportInfoUpdated();
                dispatchNetworkInfo("bridge_ready", false);
            });
        }

        @JavascriptInterface
        public void prepareAudioForCall() {
            runOnUiThread(() -> {
                speakerphoneEnabled = false;
                prepareCallAudioRoute();
                AppLogger.i("Audio mode prepared for call");
                if (webView != null) {
                    webView.postDelayed(() -> {
                        prepareCallAudioRoute();
                        AppLogger.i("Audio mode re-applied for call");
                    }, 600);
                }
            });
        }

        @JavascriptInterface
        public void setSpeakerphoneEnabled(boolean enabled) {
            runOnUiThread(() -> {
                speakerphoneEnabled = enabled;
                applyAudioRoute();
                AppLogger.i("Speakerphone route changed: " + enabled);
            });
        }

        @JavascriptInterface
        public void clearAudioForCall() {
            runOnUiThread(() -> {
                clearCallAudioRoute();
                AppLogger.i("Audio mode cleared after call");
            });
        }

        @JavascriptInterface
        public void cancelIncomingCallNotification() {
            runOnUiThread(MainActivity.this::cancelIncomingNotification);
        }

        @JavascriptInterface
        public void notifyPushInviteReady(
                String callId,
                String caller,
                String sipUri,
                String receivedAt
        ) {
            runOnUiThread(() -> IncomingCallControlService.notifyInviteReady(
                    safeBridgeText(callId),
                    safeBridgeText(caller),
                    safeBridgeText(sipUri),
                    safeBridgeText(receivedAt)
            ));
        }

        @JavascriptInterface
        public String getSupportInfo() {
            return buildSupportInfoJson();
        }

        @JavascriptInterface
        public String getMailLogText() {
            return AppLogger.getMailLogTail();
        }

        @JavascriptInterface
        public String getLongLogText() {
            return AppLogger.getLongLogTail();
        }

        @JavascriptInterface
        public String lookupContactName(String rawPhoneNumber) {
            return deviceContactsManager.lookupName(rawPhoneNumber);
        }

        @JavascriptInterface
        public String getDeviceContacts() {
            return deviceContactsManager.readContactsJson();
        }

        @JavascriptInterface
        public boolean openCreateContact() {
            return deviceContactsManager.openCreateContact();
        }

        @JavascriptInterface
        public boolean openEditContact(String contactId) {
            return deviceContactsManager.openEditContact(contactId);
        }

        @JavascriptInterface
        public boolean sendLog(String reason, String additionalContext) {
            return AppLogger.requestUpload(
                    safeBridgeText(reason).isEmpty() ? "manual_log" : safeBridgeText(reason),
                    safeBridgeText(additionalContext)
            );
        }

        @JavascriptInterface
        public boolean emailLog(String recipient, String subject, String text) {
            runOnUiThread(() -> emailLogInternal(
                    safeBridgeText(recipient),
                    safeBridgeText(subject),
                    safeBridgeText(text)
            ));
            return true;
        }

        @JavascriptInterface
        public void logDebug(String message) {
            AppLogger.d("[JS] " + safeBridgeText(message));
        }

        @JavascriptInterface
        public void logInfo(String message) {
            AppLogger.i("[JS] " + safeBridgeText(message));
        }

        @JavascriptInterface
        public void logWarn(String message) {
            AppLogger.w("[JS] " + safeBridgeText(message));
        }

        @JavascriptInterface
        public void logError(String message) {
            AppLogger.e("[JS] " + safeBridgeText(message));
        }

        @JavascriptInterface
        public void openSupportTarget(String target) {
            runOnUiThread(() -> openSupportTargetInternal(target));
        }

        @JavascriptInterface
        public void shareText(String subject, String text) {
            runOnUiThread(() -> shareTextInternal(subject, text));
        }
    }

    public static Intent createIncomingIntent(Context context, String action, String callId, String fromUri) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setAction(action);
        intent.putExtra(IncomingCallIntents.EXTRA_CALL_ID, callId);
        intent.putExtra(IncomingCallIntents.EXTRA_FROM_URI, fromUri);
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }

    private static String getStringExtra(Intent intent, String key) {
        String value = intent.getStringExtra(key);
        return value == null ? "" : value;
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.trim().isEmpty()) {
                return value.trim();
            }
        }
        return "";
    }

    private static boolean isEnabledProvisioningValue(String value) {
        return "1".equals(value) || "true".equalsIgnoreCase(value);
    }

    private static String safeBridgeText(String value) {
        if (value == null) {
            return "";
        }
        String normalized = value.replace('\r', ' ').trim();
        if (normalized.length() <= 8_000) {
            return normalized;
        }
        return normalized.substring(0, 8_000);
    }
}
