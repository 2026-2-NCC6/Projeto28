package com.smarttennis.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int CAMERA_PERMISSION_REQUEST = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Solicita permissão de câmera proativamente para o leitor de QR Code
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.CAMERA},
                    CAMERA_PERMISSION_REQUEST);
        }

        // Configuração de WebView para comunicação segura na rede local (Wi-Fi)
        try {
            WebView webView = getBridge() != null ? getBridge().getWebView() : null;
            if (webView != null) {
                WebSettings settings = webView.getSettings();
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setDomStorageEnabled(true);
            }
        } catch (Exception ignored) {
        }
    }
}
