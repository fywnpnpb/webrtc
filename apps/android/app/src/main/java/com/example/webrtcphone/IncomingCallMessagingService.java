package com.example.webrtcphone;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class IncomingCallMessagingService extends FirebaseMessagingService {

    private static final String TAG = "WebRtcPhone";
    private static final String INCOMING_CALL_CHANNEL_ID = "incoming_call";
    private static final int INCOMING_CALL_NOTIFICATION_ID = 1001;

    @Override
    public void onMessageReceived(RemoteMessage message) {
        Map<String, String> data = message.getData();
        Log.d(TAG, "FCM message received: from=" + message.getFrom()
                + ", messageId=" + message.getMessageId()
                + ", data=" + data);

        String type = firstNonEmpty(data.get("type"), data.get("event_type"));

        if (!"incoming_call".equals(type) && !"incoming_call_bootstrap".equals(type)) {
            Log.d(TAG, "FCM message ignored because type is not incoming_call: " + type);
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

        showIncomingCallNotification(callId, fromUri);
    }

    @Override
    public void onNewToken(String token) {
        super.onNewToken(token);
        Log.d(TAG, "FCM registration token refreshed: " + token);
    }

    private void showIncomingCallNotification(String callId, String fromUri) {
        createIncomingCallChannel();

        if (!canPostNotifications()) {
            Log.w(TAG, "Incoming call notification skipped because POST_NOTIFICATIONS is not granted");
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
                IncomingCallIntents.ACTION_ANSWER_INCOMING,
                callId,
                fromUri
        );
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

        NotificationManagerCompat.from(this).notify(INCOMING_CALL_NOTIFICATION_ID, notification);
        Log.d(TAG, "Incoming call notification posted: callId=" + callId + ", fromUri=" + fromUri);
    }

    private void createIncomingCallChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }

        NotificationManager manager = getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel(
                INCOMING_CALL_CHANNEL_ID,
                "Incoming calls",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Incoming call notifications for WebRTC SIP phone");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
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
