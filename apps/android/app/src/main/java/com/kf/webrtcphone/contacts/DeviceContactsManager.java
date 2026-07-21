package com.kf.webrtcphone.contacts;

import android.Manifest;
import android.app.Activity;
import android.content.ContentUris;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import androidx.core.content.ContextCompat;

import com.kf.webrtcphone.AppLogger;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;

public final class DeviceContactsManager {

    public static final String PERMISSION_REQUESTED = "__permission_requested__";

    private final Activity activity;
    private final int permissionRequestCode;
    private boolean permissionRequestInFlight;

    public DeviceContactsManager(Activity activity, int permissionRequestCode) {
        this.activity = activity;
        this.permissionRequestCode = permissionRequestCode;
    }

    public boolean hasReadPermission() {
        return ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CONTACTS)
                == PackageManager.PERMISSION_GRANTED;
    }

    public void requestReadPermission() {
        if (permissionRequestInFlight) return;
        permissionRequestInFlight = true;
        activity.runOnUiThread(() -> activity.requestPermissions(
                    new String[]{Manifest.permission.READ_CONTACTS},
                    permissionRequestCode
            ));
    }

    public void onReadPermissionResult() {
        permissionRequestInFlight = false;
    }

    public String readContactsJson() {
        if (!hasReadPermission()) {
            requestReadPermission();
            return PERMISSION_REQUESTED;
        }

        Map<Long, JSONObject> contacts = new LinkedHashMap<>();
        String[] projection = {
                ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY,
                ContactsContract.CommonDataKinds.Phone.NUMBER,
                ContactsContract.CommonDataKinds.Phone.TYPE,
                ContactsContract.CommonDataKinds.Phone.LABEL,
                ContactsContract.CommonDataKinds.Phone.PHOTO_THUMBNAIL_URI
        };

        try (Cursor cursor = activity.getContentResolver().query(
                ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
                projection,
                null,
                null,
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY + " COLLATE LOCALIZED ASC"
        )) {
            if (cursor == null) return "[]";

            int idIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.CONTACT_ID);
            int nameIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME_PRIMARY);
            int numberIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.NUMBER);
            int typeIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.TYPE);
            int labelIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.LABEL);
            int photoIndex = cursor.getColumnIndexOrThrow(ContactsContract.CommonDataKinds.Phone.PHOTO_THUMBNAIL_URI);

            while (cursor.moveToNext()) {
                long contactId = cursor.getLong(idIndex);
                String number = safeText(cursor.getString(numberIndex));
                if (number.isEmpty()) continue;

                JSONObject contact = contacts.get(contactId);
                if (contact == null) {
                    contact = new JSONObject();
                    contact.put("id", String.valueOf(contactId));
                    contact.put("name", safeText(cursor.getString(nameIndex)));
                    contact.put("photoUri", safeText(cursor.getString(photoIndex)));
                    contact.put("phones", new JSONArray());
                    contacts.put(contactId, contact);
                }

                int type = cursor.getInt(typeIndex);
                String customLabel = safeText(cursor.getString(labelIndex));
                CharSequence resolvedLabel = ContactsContract.CommonDataKinds.Phone.getTypeLabel(
                        activity.getResources(),
                        type,
                        customLabel
                );
                JSONObject phone = new JSONObject();
                phone.put("number", number);
                phone.put("label", safeText(resolvedLabel == null ? "" : resolvedLabel.toString()));
                contact.getJSONArray("phones").put(phone);
            }
        } catch (Exception error) {
            AppLogger.w("Device contact list read failed", error);
            return "[]";
        }

        JSONArray result = new JSONArray();
        for (JSONObject contact : contacts.values()) {
            result.put(contact);
        }
        return result.toString();
    }

    public String lookupName(String rawPhoneNumber) {
        if (!hasReadPermission()) {
            requestReadPermission();
            return PERMISSION_REQUESTED;
        }

        String phoneNumber = safeText(rawPhoneNumber);
        Uri uri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(phoneNumber)
        );
        try (Cursor cursor = activity.getContentResolver().query(
                uri,
                new String[]{ContactsContract.PhoneLookup.DISPLAY_NAME},
                null,
                null,
                null
        )) {
            if (cursor != null && cursor.moveToFirst()) {
                int index = cursor.getColumnIndex(ContactsContract.PhoneLookup.DISPLAY_NAME);
                return index >= 0 ? safeText(cursor.getString(index)) : "";
            }
        } catch (Exception error) {
            AppLogger.w("Contact lookup failed: " + phoneNumber, error);
        }
        return "";
    }

    public boolean openCreateContact() {
        Intent intent = new Intent(Intent.ACTION_INSERT, ContactsContract.Contacts.CONTENT_URI);
        return startContactIntent(intent, "create");
    }

    public boolean openEditContact(String contactId) {
        try {
            long parsedId = Long.parseLong(safeText(contactId));
            Uri contactUri = ContentUris.withAppendedId(ContactsContract.Contacts.CONTENT_URI, parsedId);
            Intent intent = new Intent(Intent.ACTION_EDIT, contactUri);
            intent.putExtra("finishActivityOnSaveCompleted", true);
            return startContactIntent(intent, "edit");
        } catch (NumberFormatException error) {
            AppLogger.w("Invalid contact id: " + contactId, error);
            return false;
        }
    }

    private boolean startContactIntent(Intent intent, String action) {
        try {
            activity.runOnUiThread(() -> {
                try {
                    activity.startActivity(intent);
                } catch (Exception error) {
                    AppLogger.w("Contacts app launch failed: action=" + action, error);
                }
            });
            return true;
        } catch (Exception error) {
            AppLogger.w("Contacts app launch failed: action=" + action, error);
            return false;
        }
    }

    private static String safeText(String value) {
        return value == null ? "" : value.trim();
    }
}
