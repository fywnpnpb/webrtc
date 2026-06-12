package com.example.webrtcphone;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.ConsoleMessage;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import com.google.firebase.messaging.FirebaseMessaging;

import java.util.ArrayDeque;
import java.util.Queue;

public class MainActivity extends Activity {

    private static final String TAG = "WebRtcPhone";
    private static final int REQUEST_RECORD_AUDIO = 100;
    private static final int REQUEST_POST_NOTIFICATIONS = 101;
    private static final String WEB_APP_URL = "http://127.0.0.1:8080/";
    private static final String WEB_BRIDGE_NAME = "AndroidPhone";
    private static final int INCOMING_CALL_NOTIFICATION_ID = 1001;

    private WebView webView;
    private AudioManager audioManager;
    private AudioFocusRequest audioFocusRequest;
    private PermissionRequest pendingWebPermissionRequest;
    private boolean webPageReady = false;
    private final Queue<String> pendingJavascriptCalls = new ArrayDeque<>();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        setContentView(webView);
        setVolumeControlStream(AudioManager.STREAM_VOICE_CALL);

        setupWebView(webView);
        webView.clearCache(true);
        if (ensureAndroidAudioPermission()) {
            ensureNotificationPermission();
        }
        logFirebaseToken();

        webView.loadUrl(WEB_APP_URL);
        handleIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void setupWebView(WebView target) {
        target.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                Log.d(TAG, "WebView loaded: " + url);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request.isForMainFrame()) {
                    Log.e(TAG, "WebView load failed: " + request.getUrl() + " / " + error.getDescription());
                }
            }
        });

        target.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, "JS console: " + consoleMessage.message()
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
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);

        target.addJavascriptInterface(new NativeBridge(), WEB_BRIDGE_NAME);
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null || intent.getAction() == null) {
            return;
        }

        String action = intent.getAction();
        String callId = getStringExtra(intent, IncomingCallIntents.EXTRA_CALL_ID);
        String fromUri = getStringExtra(intent, IncomingCallIntents.EXTRA_FROM_URI);

        if (IncomingCallIntents.ACTION_OPEN_INCOMING.equals(action)) {
            enqueueJavascriptCall(buildShowIncomingCallScript(callId, fromUri));
        } else if (IncomingCallIntents.ACTION_ANSWER_INCOMING.equals(action)) {
            cancelIncomingNotification();
            enqueueJavascriptCall(buildShowIncomingCallScript(callId, fromUri));
            enqueueJavascriptCall("window.answerIncomingCall && window.answerIncomingCall();");
        } else if (IncomingCallIntents.ACTION_REJECT_INCOMING.equals(action)) {
            cancelIncomingNotification();
            enqueueJavascriptCall(buildShowIncomingCallScript(callId, fromUri));
            enqueueJavascriptCall("window.rejectIncomingCall && window.rejectIncomingCall();");
        }
    }

    private String buildShowIncomingCallScript(String callId, String fromUri) {
        JSONObject payload = new JSONObject();
        try {
            payload.put("callId", callId);
            payload.put("fromUri", fromUri);
        } catch (Exception ignored) {
            // JSON 生成失敗時も空文字で Web 側へ渡す。
        }
        return "window.WebRtcPhoneApp && window.WebRtcPhoneApp.showIncomingCall(" + payload + ");";
    }

    private void enqueueJavascriptCall(String script) {
        if (webPageReady) {
            webView.evaluateJavascript(script, null);
        } else {
            Log.d(TAG, "Queue JavaScript until Web app is ready: " + script);
            pendingJavascriptCalls.add(script);
        }
    }

    private void flushPendingJavascriptCalls() {
        while (!pendingJavascriptCalls.isEmpty()) {
            webView.evaluateJavascript(pendingJavascriptCalls.poll(), null);
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
        requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQUEST_RECORD_AUDIO);
    }

    private void grantAudioCaptureIfRequested(PermissionRequest request) {
        request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
    }

    private boolean ensureAndroidAudioPermission() {
        if (!hasAndroidAudioPermission()) {
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
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_POST_NOTIFICATIONS);
        }
    }

    private void logFirebaseToken() {
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener((task) -> {
            if (!task.isSuccessful()) {
                Log.w(TAG, "Fetching FCM registration token failed", task.getException());
                return;
            }

            Log.d(TAG, "FCM registration token: " + task.getResult());
        });
    }

    private boolean hasAndroidAudioPermission() {
        return checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode != REQUEST_RECORD_AUDIO) {
            return;
        }

        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        PermissionRequest request = pendingWebPermissionRequest;
        pendingWebPermissionRequest = null;

        if (granted && request != null) {
            grantAudioCaptureIfRequested(request);
        } else if (request != null) {
            request.deny();
        }

        ensureNotificationPermission();
    }

    private void cancelIncomingNotification() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.cancel(INCOMING_CALL_NOTIFICATION_ID);
    }

    private void prepareCallAudioRoute() {
        if (audioManager == null) {
            return;
        }

        requestCallAudioFocus();
        audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
        audioManager.setSpeakerphoneOn(true);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            boolean selectedSpeaker = false;
            for (AudioDeviceInfo device : audioManager.getAvailableCommunicationDevices()) {
                if (device.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                    selectedSpeaker = audioManager.setCommunicationDevice(device);
                    break;
                }
            }
            Log.d(TAG, "Communication speaker selected: " + selectedSpeaker);
        }

        Log.d(TAG, "Audio route state: mode=" + audioManager.getMode()
                + ", speakerphoneOn=" + audioManager.isSpeakerphoneOn());
    }

    private void clearCallAudioRoute() {
        if (audioManager == null) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            audioManager.clearCommunicationDevice();
        }

        audioManager.setSpeakerphoneOn(false);
        audioManager.setMode(AudioManager.MODE_NORMAL);
        abandonCallAudioFocus();
    }

    private void requestCallAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
            audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attributes)
                    .setOnAudioFocusChangeListener((focusChange) -> Log.d(TAG, "Audio focus changed: " + focusChange))
                    .build();
            int result = audioManager.requestAudioFocus(audioFocusRequest);
            Log.d(TAG, "Audio focus request result: " + result);
        } else {
            int result = audioManager.requestAudioFocus(
                    (focusChange) -> Log.d(TAG, "Audio focus changed: " + focusChange),
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            Log.d(TAG, "Audio focus request result: " + result);
        }
    }

    private void abandonCallAudioFocus() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (audioFocusRequest != null) {
                audioManager.abandonAudioFocusRequest(audioFocusRequest);
                audioFocusRequest = null;
            }
        } else {
            audioManager.abandonAudioFocus(null);
        }
    }

    @Override
    protected void onDestroy() {
        if (pendingWebPermissionRequest != null) {
            pendingWebPermissionRequest.deny();
            pendingWebPermissionRequest = null;
        }
        webView.destroy();
        super.onDestroy();
    }

    public class NativeBridge {
        @JavascriptInterface
        public void notifyReady() {
            runOnUiThread(() -> {
                webPageReady = true;
                Log.d(TAG, "Web app bridge is ready");
                flushPendingJavascriptCalls();
            });
        }

        @JavascriptInterface
        public void prepareAudioForCall() {
            runOnUiThread(() -> {
                prepareCallAudioRoute();
                Log.d(TAG, "Audio mode prepared for call");
                webView.postDelayed(() -> {
                    prepareCallAudioRoute();
                    Log.d(TAG, "Audio mode re-applied for call");
                }, 600);
            });
        }

        @JavascriptInterface
        public void clearAudioForCall() {
            runOnUiThread(() -> {
                clearCallAudioRoute();
                Log.d(TAG, "Audio mode cleared after call");
            });
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
}
