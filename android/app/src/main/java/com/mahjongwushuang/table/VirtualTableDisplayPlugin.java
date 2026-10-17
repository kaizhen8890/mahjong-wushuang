package com.mahjongwushuang.table;

import android.content.pm.ActivityInfo;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Activity-scoped orientation; never writes system rotation preferences. */
@CapacitorPlugin(name = "VirtualTableDisplay")
public class VirtualTableDisplayPlugin extends Plugin {
    private Integer previousOrientation;
    private Float previousBrightness;
    private boolean night;
    @PluginMethod
    public void setNight(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            night = call.getBoolean("active", false);
            if (night) dim(); else restoreBrightness();
            call.resolve();
        });
    }
    private void dim() {
        android.view.WindowManager.LayoutParams attributes = getActivity().getWindow().getAttributes();
        if (previousBrightness == null) previousBrightness = attributes.screenBrightness;
        attributes.screenBrightness = 0.01f;
        getActivity().getWindow().setAttributes(attributes);
    }
    private void restoreBrightness() {
        if (previousBrightness == null) return;
        android.view.WindowManager.LayoutParams attributes = getActivity().getWindow().getAttributes();
        attributes.screenBrightness = previousBrightness;
        getActivity().getWindow().setAttributes(attributes);
        previousBrightness = null;
    }
    @Override protected void handleOnPause() { getActivity().runOnUiThread(this::restoreBrightness); }
    @Override protected void handleOnResume() { getActivity().runOnUiThread(() -> { if (night) dim(); }); }


    @PluginMethod
    public void setActive(PluginCall call) {
        boolean active = call.getBoolean("active", false);
        getActivity().runOnUiThread(() -> {
            if (active) {
                if (previousOrientation == null) previousOrientation = getActivity().getRequestedOrientation();
                getActivity().setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            } else restore();
            call.resolve();
        });
    }

    private void restore() {
        if (previousOrientation != null) {
            getActivity().setRequestedOrientation(previousOrientation);
            previousOrientation = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        getActivity().runOnUiThread(() -> { night = false; restoreBrightness(); restore(); });
    }
}
