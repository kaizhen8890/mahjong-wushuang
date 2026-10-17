package com.mahjongwushuang.table;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LanRoomPlugin.class);
        registerPlugin(SkillNfcPlugin.class);
        registerPlugin(VirtualTableDisplayPlugin.class);
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            private boolean dispatching;
            private void fallback() {
                setEnabled(false);
                try { getOnBackPressedDispatcher().onBackPressed(); }
                finally { setEnabled(true); }
            }
            @Override public void handleOnBackPressed() {
                if (dispatching) return;
                if (getBridge() == null || getBridge().getWebView() == null) { fallback(); return; }
                dispatching = true;
                // A visible editor may consume Back synchronously. Otherwise retain Capacitor's navigation.
                getBridge().getWebView().evaluateJavascript(
                    "!window.dispatchEvent(new Event('mahjong:native-back',{cancelable:true}))",
                    handled -> { dispatching = false; if (!"true".equals(handled)) fallback(); });
            }
        });
        enterFullscreen();
    }

    @Override
    public void onResume() {
        super.onResume();
        // Window-scoped: no system timeout changes, CPU wake lock or permission.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        enterFullscreen();
    }

    @Override
    public void onPause() {
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        super.onPause();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterFullscreen();
    }

    private void enterFullscreen() {
        // Some tablet shells keep their caption bar unless the window itself
        // also declares fullscreen, in addition to hiding system insets.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(
            getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        controller.hide(WindowInsetsCompat.Type.systemBars());
    }
}
