package com.kf.webrtcphone;

public final class IncomingCallIntents {
    public static final String ACTION_OPEN_INCOMING = "com.kf.webrtcphone.action.OPEN_INCOMING";
    public static final String ACTION_ANSWER_PUSH_CALL = "answer_push_call";
    public static final String ACTION_REJECT_INCOMING = "com.kf.webrtcphone.action.REJECT_INCOMING";
    public static final String ACTION_CANCEL_INCOMING = "com.kf.webrtcphone.action.CANCEL_INCOMING";

    public static final String EXTRA_CALL_ID = "incoming_call_id";
    public static final String EXTRA_FROM_URI = "incoming_call_from_uri";
    public static final String EXTRA_CALLER = "incoming_call_caller";
    public static final String EXTRA_SIP_URI = "incoming_call_sip_uri";
    public static final String EXTRA_RECEIVED_AT = "incoming_call_received_at";
    public static final String EXTRA_AUTO_ANSWER_AFTER_REGISTER = "incoming_call_auto_answer_after_register";
    public static final String EXTRA_REASON = "incoming_call_cancel_reason";

    public static final int INCOMING_CALL_NOTIFICATION_ID = 1001;

    private IncomingCallIntents() {
    }
}
