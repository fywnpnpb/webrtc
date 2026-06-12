package com.example.webrtcphone;

public final class IncomingCallIntents {
    public static final String ACTION_OPEN_INCOMING = "com.example.webrtcphone.action.OPEN_INCOMING";
    public static final String ACTION_ANSWER_INCOMING = "com.example.webrtcphone.action.ANSWER_INCOMING";
    public static final String ACTION_REJECT_INCOMING = "com.example.webrtcphone.action.REJECT_INCOMING";

    public static final String EXTRA_CALL_ID = "incoming_call_id";
    public static final String EXTRA_FROM_URI = "incoming_call_from_uri";

    private IncomingCallIntents() {
    }
}
