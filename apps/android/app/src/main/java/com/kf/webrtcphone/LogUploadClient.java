package com.kf.webrtcphone;

import android.content.Context;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.SocketException;
import java.net.UnknownHostException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import okhttp3.FormBody;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

final class LogUploadClient {

    private static final String API_URL = "https://dental-apo.jp/ajax/api/sptest";
    private static final String API_METHOD = "sendMail";
    private static final String API_MAIL = "admin2@knowledge-flow.net";
    private static final String API_PASSWORD = "egwasaeVNCoFkut3";
    private static final String API_TO = "dev.knowledgeflow@gmail.com";
    private static final int PART_SIZE = 12000;
    private static final int TIMEOUT_SECONDS = 15;

    private final Context context;
    private final OkHttpClient client;

    private LogUploadClient(Context context) {
        this.context = context.getApplicationContext();
        this.client = new OkHttpClient.Builder()
                .connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .callTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
                .build();
    }

    static LogUploadClient fromManifest(Context context) {
        return new LogUploadClient(context);
    }

    void upload(String reason, String additionalContext, String logText) throws IOException {
        String normalizedLog = sanitize(logText);
        if (normalizedLog.isEmpty()) {
            throw new IOException("log_file_missing: no diagnostic log content");
        }

        String title = buildTitle(reason);
        String header = buildHeader(additionalContext);
        List<String> parts = splitLog(normalizedLog);
        for (int index = 0; index < parts.size(); index += 1) {
            AppLogger.i("Log upload part started: part=" + (index + 1) + "/" + parts.size());
            uploadPart(title, header, parts, index);
            AppLogger.i("Log upload part completed: part=" + (index + 1) + "/" + parts.size());
        }
    }

    private void uploadPart(String title, String header, List<String> parts, int index) throws IOException {
        String partLabel = (index + 1) + "/" + parts.size();
        AppLogger.i("Log upload part started: " + partLabel);
        String text = (index + 1)
                + "/"
                + parts.size()
                + "\n"
                + header
                + "\n"
                + parts.get(index);

        FormBody requestBody = new FormBody.Builder()
                .add("method", API_METHOD)
                .add("mail", API_MAIL)
                .add("password", API_PASSWORD)
                .add("to", API_TO)
                .add("subject", title)
                .add("text", text)
                .build();

        Request request = new Request.Builder()
                .url(API_URL)
                .post(requestBody)
                .build();

        try (Response response = client.newCall(request).execute()) {
            String responseBody = response.body() == null ? "" : sanitize(response.body().string());
            if (!response.isSuccessful()) {
                String code = response.code() == 401 || response.code() == 403
                        ? "auth_error"
                        : "server_error";
                throw new IOException(code + ": HTTP " + response.code() + " body=" + responseBody);
            }
            if (responseBody.matches("(?is).*(error|fail|ng).*")) {
                throw new IOException("server_error: API response=" + responseBody);
            }
            AppLogger.i("Log upload part completed: " + partLabel);
        } catch (InterruptedIOException error) {
            throw new IOException("timeout: log upload request timed out", error);
        } catch (IOException error) {
            throw classifyUploadIOException(error);
        }
    }

    private String buildTitle(String reason) {
        String trimmedReason = sanitize(reason);
        String label = trimmedReason.isEmpty() ? "manual_log" : trimmedReason;
        return "WebRtcPhone " + label;
    }

    private String buildHeader(String additionalContext) {
        StringBuilder builder = new StringBuilder();
        builder.append("package=").append(context.getPackageName()).append('\n');
        builder.append("generatedAt=").append(System.currentTimeMillis());
        String contextText = sanitize(additionalContext);
        if (!contextText.isEmpty()) {
            builder.append('\n').append(contextText);
        }
        return builder.toString();
    }

    private List<String> splitLog(String normalized) {
        if (normalized.isEmpty()) {
            normalized = "(empty log)";
        }

        List<String> parts = new ArrayList<>();
        for (int start = 0; start < normalized.length(); start += PART_SIZE) {
            parts.add(normalized.substring(start, Math.min(normalized.length(), start + PART_SIZE)));
        }
        if (parts.isEmpty()) {
            parts.add("(empty log)");
        }
        return parts;
    }

    private static String sanitize(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\r\n", "\n").replace('\r', '\n').trim();
    }

    private static IOException classifyUploadIOException(IOException error) {
        String message = sanitize(error.getMessage());
        if (message.matches("(?is)^(log_file_missing|log_generation_failed|network_error|timeout|server_error|auth_error|unexpected_exception).*")) {
            return error;
        }
        if (hasCause(error, UnknownHostException.class)
                || hasCause(error, ConnectException.class)
                || hasCause(error, NoRouteToHostException.class)
                || hasCause(error, SocketException.class)) {
            return new IOException("network_error: log upload request failed: " + message, error);
        }
        return new IOException("unexpected_exception: log upload request failed: " + message, error);
    }

    private static boolean hasCause(Throwable error, Class<? extends Throwable> type) {
        Throwable current = error;
        while (current != null) {
            if (type.isInstance(current)) {
                return true;
            }
            current = current.getCause();
        }
        return false;
    }
}
