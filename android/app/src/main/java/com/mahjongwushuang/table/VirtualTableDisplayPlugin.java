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
        getActivity().runOnUiThread(this::restore);
    }
}
