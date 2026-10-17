package com.mahjongwushuang.table;

import android.content.Intent;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.net.Uri;
import android.nfc.tech.Ndef;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.concurrent.atomic.AtomicReference;

/** Read-only NDEF identity transport. Web layer validates the finite card registry. */
@CapacitorPlugin(name = "SkillNfc")
public class SkillNfcPlugin extends Plugin {
    private final AtomicReference<String> active = new AtomicReference<>();
    private JSObject pendingLaunch;
    private volatile boolean watching;
    private volatile boolean paused;
    private String lastUri;
    private long lastLaunchAt;
    @Override public void load() { acceptIntent(getActivity().getIntent()); }
    @Override protected void handleOnNewIntent(Intent intent) { acceptIntent(intent); }
    private synchronized void acceptIntent(Intent intent) {
        if (intent == null || !NfcAdapter.ACTION_NDEF_DISCOVERED.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data == null) return;
        String uri = data.toString();
        if (uri.length() > 160 || !uri.startsWith("mahjongwushuang://card/")) return;
        publishLaunch(uri, "external");
    }
    private synchronized void publishLaunch(String uri, String origin) {
        long now = android.os.SystemClock.elapsedRealtime();
        if (uri.equals(lastUri) && now - lastLaunchAt < 1800) { lastLaunchAt = now; return; }
        lastUri = uri; lastLaunchAt = now;
        JSObject event = new JSObject(); event.put("sessionId", "launch"); event.put("kind", "tag");
        event.put("uri", uri); event.put("eventId", java.util.UUID.randomUUID().toString());
        event.put("origin", origin);
        pendingLaunch = event;
        notifyListeners("scan", event);
    }
    @PluginMethod public synchronized void takeLaunch(PluginCall call) {
        JSObject result = new JSObject(); result.put("event", pendingLaunch);
        pendingLaunch = null; call.resolve(result);
    }
    private NfcAdapter adapter() { return NfcAdapter.getDefaultAdapter(getContext()); }
    @PluginMethod public void status(PluginCall call) {
        NfcAdapter a = adapter(); JSObject result = new JSObject();
        result.put("supported", a != null); result.put("enabled", a != null && a.isEnabled()); call.resolve(result);
    }
    @PluginMethod public void settings(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { getActivity().startActivity(new Intent(Settings.ACTION_NFC_SETTINGS)); call.resolve(); }
            catch (Exception e) { call.reject("无法打开 NFC 设置，请从系统设置开启 NFC"); }
        });
    }
    @PluginMethod public void watch(PluginCall call) {
        watching = call.getBoolean("enabled", false);
        getActivity().runOnUiThread(() -> { refreshReader(); call.resolve(); });
    }
    @PluginMethod public void start(PluginCall call) {
        String id = call.getString("sessionId", "");
        if (!id.matches("[a-zA-Z0-9-]{1,80}")) { call.reject("扫描会话无效"); return; }
        getActivity().runOnUiThread(() -> {
            NfcAdapter a = adapter();
            if (a == null || !a.isEnabled() || paused) { call.reject("此设备没有 NFC 或尚未开启"); return; }
            active.set(id); refreshReader(); call.resolve();
        });
    }
    /** Foreground reader remains armed after each tag. Manual help uses the same reader. */
    private void refreshReader() {
        NfcAdapter a = adapter();
        if (paused || (!watching && active.get() == null) || a == null || !a.isEnabled()) { disable(); return; }
        String id = active.get();
        try {
            a.enableReaderMode(getActivity(), tag -> received(id, tag),
                NfcAdapter.FLAG_READER_NFC_A | NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS, null);
        } catch (Exception ignored) { /* Resume or opening scan help will retry on restricted devices. */ }
    }
    private void received(String id, Tag tag) {
        if (paused) return;
        boolean manual = id != null;
        if (manual && !active.compareAndSet(id, null)) return;
        if (!manual && (!watching || active.get() != null)) return;
        JSObject result = new JSObject(); result.put("sessionId", id); result.put("kind", "tag");
        String value = null;
        try {
            Ndef ndef = Ndef.get(tag);
            NdefMessage message = ndef == null ? null : ndef.getCachedNdefMessage();
            NdefRecord[] records = message == null ? new NdefRecord[0] : message.getRecords();
            Uri uri = records.length == 0 ? null : records[0].toUri();
            if (uri != null && uri.toString().length() <= 160) value = uri.toString();
        } catch (Exception ignored) { /* A moved/damaged tag must not crash the NFC callback. */ }
        if (value == null) {
            result.put("kind", "error"); result.put("message", "卡片没有有效的 URL 记录，请用第三方工具写入代号库中的完整链接");
        } else result.put("uri", value);
        final String uriValue = value;
        getActivity().runOnUiThread(() -> {
            if (paused) return;
            if (manual) {
                synchronized (this) { lastUri = uriValue; lastLaunchAt = android.os.SystemClock.elapsedRealtime(); }
                notifyListeners("scan", result);
                refreshReader();
            } else if (watching && uriValue != null && uriValue.startsWith("mahjongwushuang://card/")) {
                publishLaunch(uriValue, "foreground");
            }
            // Keep a held card quiet; another read is allowed after physical removal.
            try {
                NfcAdapter a = adapter();
                if (a != null) a.ignore(tag, 700, () -> {
                    synchronized (SkillNfcPlugin.this) { if (java.util.Objects.equals(lastUri, uriValue)) lastUri = null; }
                }, new android.os.Handler(android.os.Looper.getMainLooper()));
            } catch (Exception ignored) { /* Sliding debounce still protects unsupported vendor stacks. */ }
        });
    }
    @PluginMethod public void stop(PluginCall call) {
        String id = call.getString("sessionId", "");
        getActivity().runOnUiThread(() -> { if (active.compareAndSet(id, null)) refreshReader(); call.resolve(); });
    }
    @Override protected void handleOnResume() { paused = false; getActivity().runOnUiThread(this::refreshReader); }
    private void disable() { try { NfcAdapter a = adapter(); if (a != null) a.disableReaderMode(getActivity()); } catch (Exception ignored) {} }
    @Override protected void handleOnPause() {
        paused = true;
        String id = active.getAndSet(null); disable();
        if (id != null) { JSObject event = new JSObject(); event.put("sessionId", id); event.put("kind", "stopped"); event.put("message", "扫描已暂停，返回后点击重新扫描"); notifyListeners("scan", event); }
    }
    @Override protected void handleOnDestroy() { watching = false; paused = true; active.set(null); disable(); }
}
