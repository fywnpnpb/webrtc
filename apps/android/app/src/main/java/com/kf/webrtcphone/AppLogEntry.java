package com.kf.webrtcphone;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

final class AppLogEntry {

    enum Level {
        DEBUG,
        INFO,
        WARN,
        ERROR
    }

    private final String timestamp;
    private final Level level;
    private final StackTraceElement caller;
    private final String message;
    private final String stackTrace;

    AppLogEntry(Level level, StackTraceElement caller, String message, Throwable error) {
        this.timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)
                .format(new Date());
        this.level = level;
        this.caller = caller;
        this.message = message == null ? "" : message;
        this.stackTrace = buildStackTrace(error);
    }

    boolean isPersisted() {
        return level != Level.DEBUG;
    }

    String toMailLine() {
        StringBuilder builder = new StringBuilder();
        builder.append('[').append(timestamp).append(']').append(' ')
                .append('[').append(level.name()).append(']').append(' ')
                .append(formatCallerInline()).append(" - ")
                .append(message);
        if (!stackTrace.isEmpty()) {
            builder.append('\n').append(stackTrace);
        }
        return builder.toString();
    }

    String toLongLine() {
        StringBuilder builder = new StringBuilder();
        builder.append('[').append(timestamp).append(']').append('\n')
                .append("level=").append(level.name()).append('\n')
                .append("caller=").append(formatCallerInline()).append('\n')
                .append("message=").append(message);
        if (!stackTrace.isEmpty()) {
            builder.append('\n').append(stackTrace);
        }
        return builder.toString();
    }

    String toLogcatLine() {
        return "[" + level.name() + "] " + formatCallerInline() + " - " + message;
    }

    private String formatCallerInline() {
        String fileName = caller.getFileName() == null ? "UnknownSource" : caller.getFileName();
        return fileName
                + ":" + caller.getLineNumber()
                + " " + caller.getMethodName() + "()";
    }

    private static String buildStackTrace(Throwable error) {
        if (error == null) {
            return "";
        }

        try (StringWriter stringWriter = new StringWriter();
             PrintWriter printWriter = new PrintWriter(stringWriter)) {
            error.printStackTrace(printWriter);
            printWriter.flush();
            return stringWriter.toString().trim();
        } catch (Exception ignored) {
            return error.toString();
        }
    }
}
