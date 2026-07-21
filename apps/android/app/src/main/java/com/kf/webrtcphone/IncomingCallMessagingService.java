package com.kf.webrtcphone;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class IncomingCallMessagingService extends FirebaseMessagingService {

    private static final String INCOMING_CALL_CHANNEL_ID = "incoming_call_v2";
    private static final long WAKE_LOCK_TIMEOUT_MILLIS = 10_000L;
    private static final String DEFAULT_RINGEND_WEB_SOCKET_URL =
            "wss://test202606.mimio.jp/agi-ringend?deviceId=";

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        AppLogger.i("PUSH received: from=" + message.getFrom()
                + ", messageId=" + message.getMessageId()
                + ", data=" + data);

        String type = firstNonEmpty(data.get("type"), data.get("event_type"));

        if (!"incoming_call".equals(type) && !"incoming_call_bootstrap".equals(type)) {
            AppLogger.d("FCM message ignored because type is not incoming_call: " + type);
            return;
        }

        String callId = firstNonEmpty(data.get("call_id"), data.get("callId"));
        if (callId.isEmpty()) {
            callId = String.valueOf(System.currentTimeMillis());
        }

        String fromUri = firstNonEmpty(data.get("from_uri"), data.get("fromUri"), data.get("from"));
        if (fromUri.isEmpty()) {
            fromUri = "unknown";
        }
        String caller = firstNonEmpty(data.get("caller"), data.get("caller_name"), data.get("from"), fromUri);
        String sipUri = firstNonEmpty(data.get("sip_uri"), data.get("sipUri"), data.get("to_uri"));
        String receivedAt = firstNonEmpty(data.get("received_at"), data.get("receivedAt"));
        if (receivedAt.isEmpty()) {
            receivedAt = String.valueOf(System.currentTimeMillis());
        }

        String controlWebSocketUrl = firstNonEmpty(
                data.get("control_ws_url"),
                data.get("websocket_url"),
                data.get("ws_url")
        );
        String controlToken = firstNonEmpty(
                data.get("control_ws_token"),
                data.get("control_token")
        );
        String deviceId = firstNonEmpty(data.get("device_id"), data.get("deviceId"));
        if (controlWebSocketUrl.isEmpty() && !deviceId.isEmpty()) {
            controlWebSocketUrl = DEFAULT_RINGEND_WEB_SOCKET_URL + Uri.encode(deviceId);
            AppLogger.i("Using default AGI RINGEND WebSocket URL for deviceId=" + deviceId);
        }

        AppLogger.i("Incoming call PUSH parsed: callId=" + callId + ", fromUri=" + fromUri);

        if (!controlWebSocketUrl.isEmpty()) {
            IncomingCallControlService.start(
                    this,
                    callId,
                    controlWebSocketUrl,
                    controlToken,
                    deviceId
            );
        } else {
            AppLogger.w("Incoming call PUSH has no control WebSocket URL");
        }

        wakeScreenForIncomingCall();
        showIncomingCallNotification(callId, fromUri, caller, sipUri, receivedAt);
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        AppLogger.i("FCM registration token refreshed");
        AppLogger.d("FCM registration token refreshed value: " + token);
    }

    @SuppressLint("MissingPermission")
    private void showIncomingCallNotification(
            String callId,
            String fromUri,
            String caller,
            String sipUri,
            String receivedAt
    ) {
        createIncomingCallChannel();

        if (!canPostNotifications()) {
            AppLogger.w("Incoming call notification skipped because POST_NOTIFICATIONS is not granted");
            return;
        }

        Intent openIntent = MainActivity.createIncomingIntent(
                this,
                IncomingCallIntents.ACTION_OPEN_INCOMING,
                callId,
                fromUri
        );
        Intent answerIntent = MainActivity.createIncomingIntent(
                this,
                IncomingCallIntents.ACTION_ANSWER_PUSH_CALL,
                callId,
                fromUri
        );
        answerIntent.putExtra(IncomingCallIntents.EXTRA_CALLER, caller);
        answerIntent.putExtra(IncomingCallIntents.EXTRA_SIP_URI, sipUri);
        answerIntent.putExtra(IncomingCallIntents.EXTRA_RECEIVED_AT, receivedAt);
        answerIntent.putExtra(IncomingCallIntents.EXTRA_AUTO_ANSWER_AFTER_REGISTER, true);
        Intent rejectIntent = MainActivity.createIncomingIntent(
                this,
                IncomingCallIntents.ACTION_REJECT_INCOMING,
                callId,
                fromUri
        );

        PendingIntent openPendingIntent = toActivityPendingIntent(openIntent, callId.hashCode());
        PendingIntent answerPendingIntent = toActivityPendingIntent(answerIntent, callId.hashCode() + 1);
        PendingIntent rejectPendingIntent = toActivityPendingIntent(rejectIntent, callId.hashCode() + 2);

        Notification notification = new NotificationCompat.Builder(this, INCOMING_CALL_CHANNEL_ID)
                .setSmallIcon(android.R.drawable.sym_call_incoming)
                .setContentTitle("Incoming call")
                .setContentText(fromUri)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_CALL)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setAutoCancel(false)
                .setContentIntent(openPendingIntent)
                .setFullScreenIntent(openPendingIntent, true)
                .addAction(android.R.drawable.sym_action_call, "Answer", answerPendingIntent)
                .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Reject", rejectPendingIntent)
                .build();

        NotificationManagerCompat.from(this).notify(
                IncomingCallIntents.INCOMING_CALL_NOTIFICATION_ID,
                notification
        );
        AppLogger.i("Incoming call notification posted: callId=" + callId + ", fromUri=" + fromUri);
    }

    private void createIncomingCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }

        NotificationChannel channel = new NotificationChannel(
                INCOMING_CALL_CHANNEL_ID,
                "Incoming calls",
                NotificationManager.IMPORTANCE_HIGH
        );
        Uri ringtoneUri = Settings.System.DEFAULT_RINGTONE_URI;
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setDescription("Incoming call notifications for WebRTC SIP phone");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[]{0, 1000, 500, 1000});
        channel.setSound(ringtoneUri, audioAttributes);
        manager.createNotificationChannel(channel);
    }

    private void wakeScreenForIncomingCall() {
        PowerManager powerManager = getSystemService(PowerManager.class);
        if (powerManager == null) {
            return;
        }

        PowerManager.WakeLock wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                getPackageName() + ":incoming-call"
        );
        wakeLock.acquire(WAKE_LOCK_TIMEOUT_MILLIS);
        AppLogger.i("Wake lock acquired for incoming call");
    }

    private boolean canPostNotifications() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }

        return ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED;
    }

    private PendingIntent toActivityPendingIntent(Intent intent, int requestCode) {
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getActivity(this, requestCode, intent, flags);
    }

    private static String firstNonEmpty(String... values) {
        for (String value : values) {
            if (value != null && !value.isEmpty()) {
                return value;
            }
        }
        return "";
    }
}
