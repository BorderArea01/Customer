package com.lzwcai.plugins.funasr;

import android.Manifest;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "LzwcFunasr",
    permissions = {
        @Permission(
            strings = { Manifest.permission.RECORD_AUDIO },
            alias = "microphone"
        )
    }
)
public class LzwcFunasrPlugin extends Plugin {

    private static final String TAG = "LzwcFunasrPlugin";
    private LzwcFunasr implementation = new LzwcFunasr();

    @Override
    public void load() {
        super.load();
        Log.d(TAG, "LzwcFunasrPlugin loaded");
        implementation.setPlugin(this);
    }

    @PluginMethod
    public void echo(PluginCall call) {
        String value = call.getString("value");

        JSObject ret = new JSObject();
        ret.put("value", implementation.echo(value));
        call.resolve(ret);
    }

    @PluginMethod
    public void initialize(PluginCall call) {
        Log.d(TAG, "initialize called");
        
        String serverUrl = call.getString("serverUrl");
        String hotWords = call.getString("hotWords", "");
        Integer sampleRate = call.getInt("sampleRate", 16000);
        String mode = call.getString("mode", "2pass");
        String chunkSize = call.getString("chunkSize", "5,10,5");
        Integer chunkInterval = call.getInt("chunkInterval", 10);
        
        if (serverUrl == null || serverUrl.isEmpty()) {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Server URL is required");
            call.resolve(ret);
            return;
        }
        
        try {
            boolean success = implementation.initialize(serverUrl, hotWords, sampleRate, mode);
            JSObject ret = new JSObject();
            ret.put("success", success);
            ret.put("message", success ? "Initialized successfully" : "Initialization failed");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Initialize error", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Initialization failed: " + e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void startListening(PluginCall call) {
        Log.d(TAG, "startListening called");
        
        if (!hasRequiredPermissions()) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        
        try {
            boolean success = implementation.startListening();
            JSObject ret = new JSObject();
            ret.put("success", success);
            ret.put("message", success ? "Started listening" : "Failed to start listening");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Start listening error", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Failed to start listening: " + e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        Log.d(TAG, "stopListening called");
        
        try {
            boolean success = implementation.stopListening();
            JSObject ret = new JSObject();
            ret.put("success", success);
            ret.put("message", success ? "Stopped listening" : "Failed to stop listening");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Stop listening error", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Failed to stop listening: " + e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void disconnect(PluginCall call) {
        Log.d(TAG, "disconnect called");
        
        try {
            boolean success = implementation.disconnect();
            JSObject ret = new JSObject();
            ret.put("success", success);
            ret.put("message", success ? "Disconnected successfully" : "Failed to disconnect");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Disconnect error", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Failed to disconnect: " + e.getMessage());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getConnectionStatus(PluginCall call) {
        Log.d(TAG, "getConnectionStatus called");
        
        try {
            boolean connected = implementation.isConnected();
            String status = connected ? "connected" : "disconnected";
            
            JSObject ret = new JSObject();
            ret.put("connected", connected);
            ret.put("status", status);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Get connection status error", e);
            JSObject ret = new JSObject();
            ret.put("connected", false);
            ret.put("status", "error");
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void isConnected(PluginCall call) {
        Log.d(TAG, "isConnected called");
        
        try {
            boolean connected = implementation.isConnected();
            
            JSObject ret = new JSObject();
            ret.put("connected", connected);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "isConnected error", e);
            JSObject ret = new JSObject();
            ret.put("connected", false);
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void getAudioDevices(PluginCall call) {
        Log.d(TAG, "getAudioDevices called");
        
        try {
            JSObject ret = new JSObject();
            ret.put("devices", implementation.getAudioDevices());
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "getAudioDevices error", e);
            JSObject ret = new JSObject();
            ret.put("devices", new com.getcapacitor.JSArray());
            call.resolve(ret);
        }
    }

    @PluginMethod
    public void selectAudioDevice(PluginCall call) {
        String deviceId = call.getString("deviceId");
        if (deviceId == null) {
            call.reject("Device ID is required");
            return;
        }
        
        try {
            implementation.selectAudioDevice(deviceId);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to select audio device: " + e.getMessage());
        }
    }

    @PluginMethod
    public void sendHeartbeat(PluginCall call) {
        Log.d(TAG, "sendHeartbeat called");
        
        try {
            boolean success = implementation.sendHeartbeat();
            JSObject ret = new JSObject();
            ret.put("success", success);
            ret.put("message", success ? "Heartbeat sent successfully" : "Failed to send heartbeat");
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Send heartbeat error", e);
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Failed to send heartbeat: " + e.getMessage());
            call.resolve(ret);
        }
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (hasRequiredPermissions()) {
            startListening(call);
        } else {
            JSObject ret = new JSObject();
            ret.put("success", false);
            ret.put("message", "Microphone permission denied");
            call.resolve(ret);
        }
    }

    // 事件通知方法
    public void notifyRecognitionResult(String text, boolean isFinal, String mode) {
        JSObject data = new JSObject();
        data.put("text", text);
        data.put("isFinal", isFinal);
        data.put("mode", mode);
        data.put("timestamp", System.currentTimeMillis());
        notifyListeners("recognitionResult", data);
    }

    public void notifyConnectionStatusChanged(boolean connected, String status) {
        JSObject data = new JSObject();
        data.put("connected", connected);
        data.put("status", status);
        notifyListeners("connectionStatusChanged", data);
    }

    public void notifyError(String error, String message) {
        JSObject data = new JSObject();
        data.put("error", error);
        data.put("message", message);
        notifyListeners("error", data);
    }
}
