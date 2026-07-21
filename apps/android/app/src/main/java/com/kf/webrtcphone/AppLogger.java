package com.kf.webrtcphone;

import android.content.Context;
import android.util.Log;

import java.util.concurrent.atomic.AtomicBoolean;

public final class AppLogger {

    interface UploadListener {
        void onUploadFinished(boolean success, String reason, String detail);
    }

    private static final String TAG = "WebRtcPhone";
    private static final int MAX_LOG_CHARS = 200_000;
    private static final String LOGFILE_MAIL = "log_mail.log";
    private static final String LOGFILE_LONG = "log_long.log";
    private static final Object LOCK = new Object();
    private static final AtomicBoolean UPLOAD_IN_PROGRESS = new AtomicBoolean(false);

    private static volatile Context appContext;
    private static volatile LogUploadClient uploadClient;
    private static volatile UploadListener uploadListener;

    private AppLogger() {
    }

    public static void initialize(Context context) {
        Context applicationContext = context.getApplicationContext();
        appContext = applicationContext;
        if (uploadClient == null) {
            uploadClient = LogUploadClient.fromManifest(applicationContext);
        }
    }

    public static void setUploadListener(UploadListener listener) {
        uploadListener = listener;
    }

    public static void d(String message) {
        log(AppLogEntry.Level.DEBUG, message, null, false, null);
    }

    public static void i(String message) {
        log(AppLogEntry.Level.INFO, message, null, false, null);
    }

    public static void w(String message) {
        log(AppLogEntry.Level.WARN, message, null, false, null);
    }

    public static void w(String message, Throwable error) {
        log(AppLogEntry.Level.WARN, message, error, false, null);
    }

    public static void e(String message) {
        log(AppLogEntry.Level.ERROR, message, null, false, null);
    }

    public static void e(String message, Throwable error) {
        log(AppLogEntry.Level.ERROR, message, error, false, null);
    }

    public static void eAndUpload(String message, Throwable error, String reason) {
        log(AppLogEntry.Level.ERROR, message, error, true, reason);
    }

    public static String getMailLogTail() {
        Context context = appContext;
        if (context == null) {
            return "";
        }
        synchronized (LOCK) {
            return AppFileStore.readTail(context, LOGFILE_MAIL, MAX_LOG_CHARS);
        }
    }

    public static String getLongLogTail() {
        Context context = appContext;
        if (context == null) {
            return "";
        }
        synchronized (LOCK) {
            return AppFileStore.readTail(context, LOGFILE_LONG, MAX_LOG_CHARS);
        }
    }

    public static void clear() {
        Context context = appContext;
        if (context == null) {
            return;
        }
        synchronized (LOCK) {
            AppFileStore.clear(context, LOGFILE_MAIL);
            AppFileStore.clear(context, LOGFILE_LONG);
        }
    }

    public static boolean requestUpload(String reason, String additionalContext) {
        Context context = appContext;
        LogUploadClient client = uploadClient;
        if (context == null || client == null) {
            e("Log upload unavailable: logger_not_initialized");
            return false;
        }

        if (!UPLOAD_IN_PROGRESS.compareAndSet(false, true)) {
            w("Log upload skipped: upload_in_progress");
            return false;
        }

        i("Log upload requested: reason=" + reason);

        new Thread(() -> {
            try {
                String nativeMailLog = getMailLogTail();
                String uploadText = buildUploadText(additionalContext, nativeMailLog);
                String uploadContext = buildUploadContext(additionalContext, nativeMailLog);
                i("Log upload prepared: reason=" + reason
                        + ", additionalContextChars=" + lengthOf(additionalContext)
                        + ", nativeMailLogChars=" + nativeMailLog.length()
                        + ", uploadChars=" + uploadText.length());
                client.upload(reason, uploadContext, uploadText);
                i("Log upload completed: reason=" + reason);
                notifyUploadFinished(true, reason, "");
            } catch (Exception error) {
                e("Log upload failed: reason=" + reason, error);
                notifyUploadFinished(false, reason, error.getMessage());
            } finally {
                UPLOAD_IN_PROGRESS.set(false);
            }
        }, "log-upload").start();
        return true;
    }

    private static void notifyUploadFinished(boolean success, String reason, String detail) {
        UploadListener listener = uploadListener;
        if (listener != null) {
            listener.onUploadFinished(success, reason, detail == null ? "" : detail);
        }
    }

    private static void log(
            AppLogEntry.Level level,
            String message,
            Throwable error,
            boolean shouldRequestUpload,
            String uploadReason
    ) {
        AppLogEntry entry = new AppLogEntry(level, resolveCaller(), message, error);
        writeLogcat(level, entry, error);

        Context context = appContext;
        if (context != null && entry.isPersisted()) {
            synchronized (LOCK) {
                AppFileStore.appendTrimmed(context, LOGFILE_MAIL, entry.toMailLine() + "\n", MAX_LOG_CHARS);
                AppFileStore.appendTrimmed(context, LOGFILE_LONG, entry.toLongLine() + "\n\n", MAX_LOG_CHARS);
            }
        }

        if (shouldRequestUpload) {
            AppLogger.requestUpload(uploadReason == null ? "error" : uploadReason, message);
        }
    }

    private static void writeLogcat(AppLogEntry.Level level, AppLogEntry entry, Throwable error) {
        switch (level) {
            case DEBUG:
                Log.d(TAG, entry.toLogcatLine());
                break;
            case INFO:
                Log.i(TAG, entry.toLogcatLine());
                break;
            case WARN:
                Log.w(TAG, entry.toLogcatLine(), error);
                break;
            case ERROR:
                Log.e(TAG, entry.toLogcatLine(), error);
                break;
            default:
                Log.i(TAG, entry.toLogcatLine());
                break;
        }
    }

    private static String buildUploadText(String additionalContext, String nativeMailLog) {
        String contextText = normalizeForUpload(additionalContext);
        String logText = normalizeForUpload(nativeMailLog);
        StringBuilder builder = new StringBuilder();
        if (!contextText.isEmpty()) {
            builder.append("[Diagnostic Report]\n").append(contextText);
        }
        if (!logText.isEmpty()) {
            if (builder.length() > 0) {
                builder.append("\n\n");
            }
            builder.append("[Native Mail Log]\n").append(logText);
        }
        return builder.toString();
    }

    private static String buildUploadContext(String additionalContext, String nativeMailLog) {
        return "additionalContextChars=" + lengthOf(additionalContext)
                + "\nnativeMailLogChars=" + lengthOf(nativeMailLog);
    }

    private static int lengthOf(String value) {
        return value == null ? 0 : value.length();
    }

    private static String normalizeForUpload(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\r\n", "\n").replace('\r', '\n').trim();
    }

    private static StackTraceElement resolveCaller() {
        StackTraceElement[] stackTrace = Thread.currentThread().getStackTrace();
        for (StackTraceElement element : stackTrace) {
            String className = element.getClassName();
            if (className == null) {
                continue;
            }
            if (className.equals(Thread.class.getName()) || className.equals(AppLogger.class.getName())) {
                continue;
            }
            return element;
        }
        return stackTrace.length > 0 ? stackTrace[stackTrace.length - 1] : new StackTraceElement(
                "unknown",
                "unknown",
                "UnknownSource",
                -1
        );
    }
}
