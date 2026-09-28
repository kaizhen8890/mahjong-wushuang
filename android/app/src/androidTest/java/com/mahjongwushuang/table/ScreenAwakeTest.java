package com.mahjongwushuang.table;

import android.app.Instrumentation;
import android.content.Intent;
import android.view.WindowManager;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;

/** Verifies the actual Activity lifecycle without changing Android's sleep setting. */
@RunWith(AndroidJUnit4.class)
public class ScreenAwakeTest {
    @Test
    public void screenFlagFollowsForegroundLifecycle() {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Intent intent = new Intent(instrumentation.getTargetContext(), MainActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        // WebView animations can keep MonitoringInstrumentation's idle waiter busy.
        // Observe Activity creation directly, then execute assertions on its UI thread.
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(MainActivity.class.getName(), null, false);
        instrumentation.getTargetContext().startActivity(intent);
        MainActivity activity;
        try {
            activity = (MainActivity) monitor.waitForActivityWithTimeout(15000);
        } finally {
            instrumentation.removeMonitor(monitor);
        }
        assertNotNull("MainActivity did not launch", activity);
        try {
            instrumentation.runOnMainSync(() -> {
                int flag = WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON;
                assertNotEquals(0, activity.getWindow().getAttributes().flags & flag);
                instrumentation.callActivityOnPause(activity);
                assertEquals(0, activity.getWindow().getAttributes().flags & flag);
                instrumentation.callActivityOnResume(activity);
                assertNotEquals(0, activity.getWindow().getAttributes().flags & flag);
            });
        } finally {
            instrumentation.runOnMainSync(activity::finish);
        }
    }
}
