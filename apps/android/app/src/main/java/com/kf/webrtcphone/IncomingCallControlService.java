package com.kf.webrtcphone;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

public class IncomingCallControlService extends Service {

    private static final String ACTION_START = "com.kf.webrtcphone.action.START_CALL_CONTROL";
    private static final String EXTRA_WEB_SOCKET_URL = "control_web_socket_url";
    private static final String EXTRA_CONTROL_TOKEN = "control_web_socket_token";
    private static final String EXTRA_DEVICE_ID = "control_device_id";
    private static final String CHANNEL_ID = "incoming_call_control";
    private static final int FOREGROUND_NOTIFICATION_ID = 1002;
    private static final long CONTROL_TIMEOUT_MILLIS = 30_000L;
    private static final long RECONNECT_DELAY_MILLIS = 5_000L;

    private static volatile IncomingCallControlService activeService;

    private static final Set<String> STOP_COMMANDS = new HashSet<>(Arrays.asList(
            "stop_ringing",
            "incoming_call_ended",
            "call_answered",
            "cancel_incoming_call",
            "RINGEND"
    ));

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final OkHttpClient webSocketClient = new OkHttpClient.Builder()
            .pingInterval(20, TimeUnit.SECONDS)
            .build();

    private WebSocket webSocket;
    private String activeCallId = "";
    private String activeWebSocketUrl = "";
    private String activeControlToken = "";
    private String activeDeviceId = "";
    private long connectionStartedAtMillis = 0L;
    private volatile boolean connectionEstablished = false;

    public static void start(
            Context context,
            String callId,
            String webSocketUrl,
            String controlToken,
            String deviceId
    ) {
        Intent intent = new Intent(context, IncomingCallControlService.class);
        intent.setAction(ACTION_START);
        intent.putExtra(IncomingCallIntents.EXTRA_CALL_ID, callId);
        intent.putExtra(EXTRA_WEB_SOCKET_URL, webSocketUrl);
        intent.putExtra(EXTRA_CONTROL_TOKEN, controlToken);
        intent.putExtra(EXTRA_DEVICE_ID, deviceId);
        ContextCompat.startForegroundService(context, intent);
    }

    public static void stop(Context context) {
        context.stopService(new Intent(context, IncomingCallControlService.class));
    }

    public static void notifyInviteReady(
            String callId,
            String caller,
            String sipUri,
            String receivedAt
    ) {
        IncomingCallControlService service = activeService;
        if (service == null) {
            AppLogger.w("INVITE ready notification skipped because call control is not active: callId=" + callId);
            return;
        }
        service.sendInviteReady(callId, caller, sipUri, receivedAt);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        activeService = this;
        AppLogger.i("IncomingCallControlService created");
        createControlChannel();
        startForeground(FOREGROUND_NOTIFICATION_ID, buildControlNotification());
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            AppLogger.w("Call control service stopped because start intent is null");
            stopControlConnection();
            return START_NOT_STICKY;
        }

        String callId = stringExtra(intent, IncomingCallIntents.EXTRA_CALL_ID);
        String webSocketUrl = stringExtra(intent, EXTRA_WEB_SOCKET_URL);
        String controlToken = stringExtra(intent, EXTRA_CONTROL_TOKEN);
        String deviceId = stringExtra(intent, EXTRA_DEVICE_ID);

        if (callId.isEmpty() || webSocketUrl.isEmpty()) {
            AppLogger.w("Call control WebSocket not started because required values are missing");
            stopControlConnection();
            return START_NOT_STICKY;
        }

        AppLogger.i("Starting call control WebSocket: callId=" + callId + ", url=" + webSocketUrl);
        connect(callId, webSocketUrl, controlToken, deviceId);
        return START_NOT_STICKY;
    }

    private void sendInviteReady(String callId, String caller, String sipUri, String receivedAt) {
        if (callId.isEmpty() || !callId.equals(activeCallId) || webSocket == null) {
            AppLogger.w("INVITE ready notification skipped: callId=" + callId);
            return;
        }

        try {
            JSONObject message = new JSONObject();
            message.put("type", "invite_ready");
            message.put("call_id", callId);
            message.put("caller", caller);
            message.put("sip_uri", sipUri);
            message.put("received_at", receivedAt);
            webSocket.send(message.toString());
            AppLogger.i("INVITE ready notification sent: callId=" + callId);
        } catch (Exception error) {
            AppLogger.w("Failed to send INVITE ready notification", error);
        }
    }

    private void connect(
            String callId,
            String webSocketUrl,
            String controlToken,
            String deviceId
    ) {
        handler.removeCallbacksAndMessages(null);
        closeWebSocket();
        activeCallId = callId;
        activeWebSocketUrl = webSocketUrl;
        activeControlToken = controlToken;
        activeDeviceId = deviceId;
        connectionStartedAtMillis = System.currentTimeMillis();
        connectionEstablished = false;
        openWebSocket();

        handler.postDelayed(() -> {
            if (activeCallId.isEmpty() || connectionEstablished) {
                return;
            }
            AppLogger.w("Call control WebSocket timed out: callId=" + activeCallId);
            stopIncomingCallUi("timeout");
        }, CONTROL_TIMEOUT_MILLIS);
    }

    private void openWebSocket() {
        if (activeCallId.isEmpty() || activeWebSocketUrl.isEmpty()) {
            return;
        }

        final String callId = activeCallId;
        final String deviceId = activeDeviceId;
        closeWebSocket();

        Request.Builder requestBuilder = new Request.Builder().url(activeWebSocketUrl);
        if (!activeControlToken.isEmpty()) {
            requestBuilder.header("Authorization", "Bearer " + activeControlToken);
        }

        webSocket = webSocketClient.newWebSocket(
                requestBuilder.build(),
                new WebSocketListener() {
                    @Override
                    public void onOpen(WebSocket socket, Response response) {
                        connectionEstablished = true;
                        JSONObject subscribe = new JSONObject();
                        try {
                            subscribe.put("type", "subscribe_incoming_call");
                            subscribe.put("call_id", callId);
                            if (!deviceId.isEmpty()) {
                                subscribe.put("device_id", deviceId);
                            }
                        } catch (Exception ignored) {
                            // Continue with the required fields if an optional field fails.
                        }
                        socket.send(subscribe.toString());
                        AppLogger.i("Call control WebSocket connected: callId=" + callId);
                    }

                    @Override
                    public void onMessage(WebSocket socket, String text) {
                        AppLogger.i("Call control WebSocket message: " + text);
                        handleControlMessage(text);
                    }

                    @Override
                    public void onClosing(WebSocket socket, int code, String reason) {
                        AppLogger.i("Call control WebSocket closing: code=" + code + ", reason=" + reason);
                        socket.close(code, reason);
                    }

                    @Override
                    public void onFailure(WebSocket socket, Throwable error, Response response) {
                        AppLogger.w("Call control WebSocket failed: " + error.getMessage(), error);
                        if (socket == webSocket) {
                            webSocket = null;
                            scheduleReconnect();
                        }
                    }
                }
        );
    }

    private void scheduleReconnect() {
        long elapsed = System.currentTimeMillis() - connectionStartedAtMillis;
        if (activeCallId.isEmpty() || elapsed + RECONNECT_DELAY_MILLIS >= CONTROL_TIMEOUT_MILLIS) {
            return;
        }
        AppLogger.i("Retrying call control WebSocket in 5 seconds: callId=" + activeCallId);
        handler.postDelayed(this::openWebSocket, RECONNECT_DELAY_MILLIS);
    }

    private void handleControlMessage(String text) {
        try {
            JSONObject message = new JSONObject(text);
            String type = firstNonEmpty(
                    message.optString("type"),
                    message.optString("event_type"),
                    message.optString("action")
            );
            String callId = firstNonEmpty(
                    message.optString("call_id"),
                    message.optString("callId")
            );

            if (!STOP_COMMANDS.contains(type)) {
                AppLogger.d("Call control command ignored: type=" + type);
                return;
            }

            if (!callId.isEmpty() && !callId.equals(activeCallId)) {
                AppLogger.d("Call control command ignored for another call: callId=" + callId);
                return;
            }

            stopIncomingCallUi(type);
        } catch (Exception error) {
            AppLogger.w("Invalid call control WebSocket message: " + text, error);
        }
    }

    private void stopIncomingCallUi(String reason) {
        NotificationManager notificationManager = getSystemService(NotificationManager.class);
        if (notificationManager != null) {
            notificationManager.cancel(IncomingCallIntents.INCOMING_CALL_NOTIFICATION_ID);
        }

        Intent cancelIntent = new Intent(IncomingCallIntents.ACTION_CANCEL_INCOMING);
        cancelIntent.setPackage(getPackageName());
        cancelIntent.putExtra(IncomingCallIntents.EXTRA_CALL_ID, activeCallId);
        cancelIntent.putExtra(IncomingCallIntents.EXTRA_REASON, reason);
        sendBroadcast(cancelIntent);

        AppLogger.i("Incoming call stopped by WebSocket: callId="
                + activeCallId + ", reason=" + reason);
        stopControlConnection();
    }

    private void stopControlConnection() {
        handler.removeCallbacksAndMessages(null);
        closeWebSocket();
        AppLogger.i("Call control connection stopped: callId=" + activeCallId);
        activeCallId = "";
        activeWebSocketUrl = "";
        activeControlToken = "";
        activeDeviceId = "";
        connectionStartedAtMillis = 0L;
        connectionEstablished = false;
        stopForeground(true);
        stopSelf();
    }

    private void closeWebSocket() {
        if (webSocket != null) {
            webSocket.close(1000, "incoming call control finished");
            webSocket = null;
        }
    }

    private void createControlChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Incoming call connection",
                NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps the incoming call control connection active");
        channel.setSound(null, null);
        manager.createNotificationChannel(channel);
    }

    private Notification buildControlNotification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle("Incoming call")
                .setContentText("Waiting for call status")
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOngoing(true)
                .setSilent(true)
                .build();
    }

    private static String stringExtra(Intent intent, String key) {
        String value = intent.getStringExtra(key);
        return value == null ? "" : value;
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.isEmpty()) {
                return value;
            }
        }
        return "";
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        if (activeService == this) {
            activeService = null;
        }
        handler.removeCallbacksAndMessages(null);
        closeWebSocket();
        AppLogger.i("IncomingCallControlService destroyed");
        super.onDestroy();
    }
}
