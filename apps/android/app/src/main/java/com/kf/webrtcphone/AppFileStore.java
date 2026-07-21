package com.kf.webrtcphone;

import android.content.Context;
import android.util.Log;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;

final class AppFileStore {

    private static final String TAG = "WebRtcPhone";

    private AppFileStore() {
    }

    static void appendTrimmed(Context context, String fileName, String text, int maxChars) {
        String existing = readAll(context, fileName);
        String combined = existing + text;
        if (combined.length() > maxChars) {
            combined = combined.substring(combined.length() - maxChars);
        }
        write(context, fileName, combined, false);
    }

    static String readTail(Context context, String fileName, int maxChars) {
        String text = readAll(context, fileName);
        if (text.length() <= maxChars) {
            return text;
        }
        return text.substring(text.length() - maxChars);
    }

    static void clear(Context context, String fileName) {
        write(context, fileName, "", false);
    }

    private static String readAll(Context context, String fileName) {
        StringBuilder builder = new StringBuilder();
        try (InputStream inputStream = context.openFileInput(fileName);
             InputStreamReader inputStreamReader = new InputStreamReader(inputStream, StandardCharsets.UTF_8);
             BufferedReader bufferedReader = new BufferedReader(inputStreamReader)) {
            String line;
            boolean firstLine = true;
            while ((line = bufferedReader.readLine()) != null) {
                if (!firstLine) {
                    builder.append('\n');
                }
                builder.append(line);
                firstLine = false;
            }
        } catch (IOException error) {
            if (!(error instanceof java.io.FileNotFoundException)) {
                Log.e(TAG, "Failed to read log file: " + fileName, error);
            }
        }
        return builder.toString();
    }

    private static void write(Context context, String fileName, String text, boolean append) {
        int mode = append ? Context.MODE_APPEND : Context.MODE_PRIVATE;
        try (OutputStreamWriter writer = new OutputStreamWriter(
                context.openFileOutput(fileName, mode),
                StandardCharsets.UTF_8
        )) {
            writer.write(text);
        } catch (IOException error) {
            Log.e(TAG, "Failed to write log file: " + fileName, error);
        }
    }
}
