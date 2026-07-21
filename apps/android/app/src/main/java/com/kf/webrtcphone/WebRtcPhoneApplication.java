package com.kf.webrtcphone;

import android.app.Application;

public class WebRtcPhoneApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        AppLogger.initialize(this);
        AppLogger.i("Application started");

        Thread.UncaughtExceptionHandler previousHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            AppLogger.eAndUpload(
                    "Uncaught exception on thread=" + thread.getName(),
                    error,
                    "uncaught_exception"
            );
            if (previousHandler != null) {
                previousHandler.uncaughtException(thread, error);
            }
        });
    }
}
