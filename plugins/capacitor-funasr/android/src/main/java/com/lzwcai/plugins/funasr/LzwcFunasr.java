package com.lzwcai.plugins.funasr;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.media.AudioDeviceInfo;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.core.app.ActivityCompat;

import com.getcapacitor.Logger;

import org.json.JSONException;
import org.json.JSONObject;
import org.json.JSONArray;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

public class LzwcFunasr {

    private static final String TAG = "LzwcFunasr";
    // FunASR 配置参数 - 与示例代码保持一致
    private static final String MODE = "2pass";
    private static final String CHUNK_SIZE = "5,10,5";
    private static final int CHUNK_INTERVAL = 10;
    private static final int SEND_SIZE = 1920;
    private static final int SAMPLE_RATE = 16000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int BUFFER_SIZE_FACTOR = 2;

    private LzwcFunasrPlugin plugin;
    private Context context;
    private OkHttpClient client;
    private WebSocket webSocket;
    private AudioRecord audioRecord;
    private ExecutorService executorService;
    private Handler mainHandler;

    private String serverUrl;
    private String hotWords;
    private int sampleRate;
    private String mode;
    private String chunkSize;
    private int chunkInterval;

    private AtomicBoolean isConnected = new AtomicBoolean(false);
    private AtomicBoolean isRecording = new AtomicBoolean(false);
    private AtomicBoolean isInitialized = new AtomicBoolean(false);

    private int bufferSize;
    private byte[] audioBuffer;
    private String selectedDeviceId = null;
    // 文本缓冲：与 Web 端对齐的回退策略
    private StringBuilder onlineAccumulatedText = new StringBuilder();
    private StringBuilder offlineAccumulatedText = new StringBuilder();
    private String lastNonEmptyText = "";

    public LzwcFunasr() {
        client = new OkHttpClient();
        executorService = Executors.newCachedThreadPool();
        mainHandler = new Handler(Looper.getMainLooper());

        // 计算音频缓冲区大小
        bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT) * BUFFER_SIZE_FACTOR;
        audioBuffer = new byte[bufferSize];
    }

    public void setPlugin(LzwcFunasrPlugin plugin) {
        this.plugin = plugin;
        this.context = plugin.getContext();
    }

    public String echo(String value) {
        Logger.info("Echo", value);
        return value;
    }

    public boolean initialize(String serverUrl, String hotWords, int sampleRate, String mode) {
        Log.d(TAG, "Initializing FunASR with serverUrl: " + serverUrl);

        this.serverUrl = serverUrl;
        this.hotWords = hotWords != null ? hotWords : "";
        this.sampleRate = sampleRate > 0 ? sampleRate : SAMPLE_RATE;
        this.mode = mode != null ? mode : MODE;
        this.chunkSize = CHUNK_SIZE;
        this.chunkInterval = CHUNK_INTERVAL;

        try {
            connectWebSocket();
            isInitialized.set(true);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize", e);
            return false;
        }
    }

    public boolean startListening() {
        Log.d(TAG, "Starting listening");

        if (!isInitialized.get()) {
            Log.e(TAG, "FunASR not initialized");
            return false;
        }

        if (!isConnected.get()) {
            Log.e(TAG, "WebSocket not connected");
            return false;
        }

        if (isRecording.get()) {
            Log.w(TAG, "Already recording");
            return true;
        }

        try {
            startRecording();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to start listening", e);
            return false;
        }
    }

    public boolean stopListening() {
        Log.d(TAG, "Stopping listening");

        if (!isRecording.get()) {
            Log.w(TAG, "Not currently recording");
            return true;
        }

        try {
            // 根据FunASR协议，发送结束标志
            sendEndOfAudioFlag();
            stopRecording();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to stop listening", e);
            return false;
        }
    }

    private void sendEndOfAudioFlag() {
        try {
            // 按照FunASR协议发送结束标志，关键是要设置is_final=True来强制输出所有缓存的识别结果
            JSONObject endMsg = new JSONObject();
            endMsg.put("is_speaking", false);
            endMsg.put("is_final", true);  // 关键参数：强制输出所有缓存的识别结果，解决末尾字丢失问题

            if (webSocket != null && isConnected.get()) {
                webSocket.send(endMsg.toString());
                Log.d(TAG, "Sent end of audio flag with is_final=True: " + endMsg.toString());
            }
        } catch (JSONException e) {
            Log.e(TAG, "Failed to send end of audio flag", e);
        }
    }

    public boolean disconnect() {
        Log.d(TAG, "Disconnecting");

        try {
            stopRecording();
            disconnectWebSocket();
            isInitialized.set(false);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Failed to disconnect", e);
            return false;
        }
    }

    public boolean isConnected() {
        return isConnected.get();
    }

    private void connectWebSocket() {
        if (isConnected.get()) {
            Log.w(TAG, "WebSocket already connected");
            return;
        }

        Request request = new Request.Builder()
                .url(serverUrl)
                .build();

        webSocket = client.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                Log.d(TAG, "WebSocket connected");
                isConnected.set(true);

                // 发送初始化消息
                sendInitMessage();

                // 重置缓冲，避免跨会话串扰（与 Web 对齐）
                onlineAccumulatedText.setLength(0);
                offlineAccumulatedText.setLength(0);
                lastNonEmptyText = "";

                if (plugin != null) {
                    mainHandler.post(() -> plugin.notifyConnectionStatusChanged(true, "connected"));
                }
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                Log.d(TAG, "Received message: " + text);
                handleMessage(text);
            }

            @Override
            public void onMessage(WebSocket webSocket, ByteString bytes) {
                Log.d(TAG, "Received binary message");
            }

            @Override
            public void onClosing(WebSocket webSocket, int code, String reason) {
                Log.d(TAG, "WebSocket closing: " + reason);
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                Log.d(TAG, "WebSocket closed: " + reason);
                isConnected.set(false);

                // 连接关闭时清理缓冲（与 Web 对齐）
                onlineAccumulatedText.setLength(0);
                offlineAccumulatedText.setLength(0);
                lastNonEmptyText = "";

                if (plugin != null) {
                    mainHandler.post(() -> plugin.notifyConnectionStatusChanged(false, "disconnected"));
                }
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                Log.e(TAG, "WebSocket error", t);
                isConnected.set(false);

                if (plugin != null) {
                    mainHandler.post(() -> {
                        plugin.notifyConnectionStatusChanged(false, "error");
                        plugin.notifyError("connection_error", t.getMessage());
                    });
                }
            }
        });
    }

    public JSArray getAudioDevices() {
        JSArray devicesArray = new JSArray();

        if (context == null) {
            Log.w(TAG, "Context is null, cannot get audio devices");
            return devicesArray;
        }

        try {
            AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (audioManager == null) {
                Log.w(TAG, "AudioManager is null");
                return devicesArray;
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioDeviceInfo[] inputs = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS);
                for (int i = 0; i < inputs.length; i++) {
                    AudioDeviceInfo info = inputs[i];
                    JSObject deviceObj = new JSObject();

                    String id = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? String.valueOf(info.getId())
                            : info.getType() + ":" + i;

                    deviceObj.put("id", id);
                    deviceObj.put("name", getDeviceName(info));
                    deviceObj.put("type", getDeviceType(info.getType()));
                    devicesArray.put(deviceObj);
                }
            } else {
                // For older Android versions, provide a default microphone device
                JSObject deviceObj = new JSObject();
                deviceObj.put("id", "default");
                deviceObj.put("name", "默认麦克风");
                deviceObj.put("type", "microphone");
                devicesArray.put(deviceObj);
            }
        } catch (Exception e) {
            Log.w(TAG, "Failed to enumerate audio input devices", e);
        }

        return devicesArray;
    }

    public void selectAudioDevice(String deviceId) {
        Log.d(TAG, "Selecting audio device: " + deviceId);
        this.selectedDeviceId = deviceId;

        // 如果当前正在录音，需要重新启动录音以使用新设备
        if (isRecording.get()) {
            Log.d(TAG, "Restarting recording with new device");
            stopRecording();
            try {
                Thread.sleep(100); // 短暂等待确保录音完全停止
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            startRecording();
        }
    }

    private String getDeviceName(AudioDeviceInfo info) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            CharSequence productName = info.getProductName();
            if (productName != null && productName.length() > 0) {
                return productName.toString();
            }
        }

        String prefix = getDevicePrefix(info.getType());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                String address = info.getAddress();
                if (address != null && !address.isEmpty()) {
                    return prefix + " (" + address + ")";
                }
            } catch (Exception ignored) {
            }
        }
        return prefix;
    }

    private String getDevicePrefix(int audioDeviceType) {
        switch (audioDeviceType) {
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                return "蓝牙";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                return "有线耳机";
            case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
                return "USB设备";
            case AudioDeviceInfo.TYPE_BUILTIN_MIC:
            default:
                return "麦克风";
        }
    }

    private String getDeviceType(int audioDeviceType) {
        switch (audioDeviceType) {
            case AudioDeviceInfo.TYPE_BLUETOOTH_SCO:
            case AudioDeviceInfo.TYPE_BLUETOOTH_A2DP:
                return "bluetooth";
            case AudioDeviceInfo.TYPE_WIRED_HEADSET:
            case AudioDeviceInfo.TYPE_WIRED_HEADPHONES:
                return "headset";
            case AudioDeviceInfo.TYPE_BUILTIN_MIC:
            case AudioDeviceInfo.TYPE_USB_DEVICE:
            case AudioDeviceInfo.TYPE_USB_HEADSET:
            default:
                return "microphone";
        }
    }

    private void setPreferredDevice() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && selectedDeviceId != null) {
            try {
                AudioManager audioManager = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
                if (audioManager != null) {
                    AudioDeviceInfo[] devices = audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS);
                    for (AudioDeviceInfo device : devices) {
                        if (selectedDeviceId.equals(String.valueOf(device.getId()))) {
                            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                                boolean success = audioRecord.setPreferredDevice(device);
                                Log.d(TAG, "Set preferred device " + device.getProductName() + ": " + success);
                            }
                            break;
                        }
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to set preferred device", e);
            }
        }
    }

    private void disconnectWebSocket() {
        if (webSocket != null) {
            webSocket.close(1000, "Normal closure");
            webSocket = null;
        }
        isConnected.set(false);
    }

    private void sendInitMessage() {
        try {
            JSONObject initMsg = new JSONObject();
            initMsg.put("mode", mode);

            // 按照示例代码格式设置 chunk_size 数组
            JSONArray chunkArray = new JSONArray();
            String[] chunkList = chunkSize.split(",");
            for (String s : chunkList) {
                chunkArray.put(Integer.valueOf(s.trim()));
            }
            initMsg.put("chunk_size", chunkArray);
            initMsg.put("chunk_interval", chunkInterval);
            initMsg.put("wav_name", "default");

            // 处理热词格式 - 按照示例代码的格式
            if (!hotWords.isEmpty()) {
                JSONObject hotwordsJSON = new JSONObject();
                String[] hotWordsList = hotWords.split("\n");
                for (String s : hotWordsList) {
                    if (s.equals("")) {
                        Log.w(TAG, "hotWords为空");
                        continue;
                    }
                    String[] hotWordsArray = s.split(" ");
                    if (hotWordsArray.length != 2) {
                        Log.w(TAG, "hotWords格式不正确");
                        continue;
                    }
                    hotwordsJSON.put(hotWordsArray[0], Integer.valueOf(hotWordsArray[1]));
                }
                initMsg.put("hotwords", hotwordsJSON.toString());
            }

            initMsg.put("wav_format", "pcm");
            initMsg.put("is_speaking", true);

            if (webSocket != null) {
                webSocket.send(initMsg.toString());
                Log.d(TAG, "Sent init message: " + initMsg.toString());
            }
        } catch (JSONException e) {
            Log.e(TAG, "Failed to create init message", e);
        }
    }

    public boolean sendHeartbeat() {
        try {
            if (webSocket == null || !isConnected.get()) {
                Log.w(TAG, "Cannot send heartbeat: WebSocket is not connected");
                return false;
            }

            // 发送心跳消息，使用简单的 JSON 消息保持连接活跃
            JSONObject heartbeatMsg = new JSONObject();
            heartbeatMsg.put("type", "heartbeat");
            heartbeatMsg.put("timestamp", System.currentTimeMillis());

            webSocket.send(heartbeatMsg.toString());
            Log.d(TAG, "Sent heartbeat: " + heartbeatMsg.toString());
            return true;
        } catch (JSONException e) {
            Log.e(TAG, "Failed to create heartbeat message", e);
            return false;
        } catch (Exception e) {
            Log.e(TAG, "Failed to send heartbeat", e);
            return false;
        }
    }

    private void handleMessage(String message) {
        try {
            JSONObject json = new JSONObject(message);

            // 根据FunASR协议处理识别结果
            if (json.has("text")) {
                String incomingText = json.optString("text", "");
                boolean isFinal = json.optBoolean("is_final", false);
                String mode = json.optString("mode", "");
                String wavName = json.optString("wav_name", "");

                // 处理时间戳信息（如果存在）
                String timestamp = json.optString("timestamp", "");

                // 按模式维护缓冲（与 Web 对齐）
                if (incomingText != null && !incomingText.isEmpty()) {
                    lastNonEmptyText = incomingText;
                    if ("2pass-online".equals(mode)) {
                        onlineAccumulatedText.append(incomingText);
                    } else if ("2pass-offline".equals(mode)) {
                        offlineAccumulatedText.append(incomingText);
                    } else {
                        // 未声明模式时，默认按在线结果累积
                        onlineAccumulatedText.append(incomingText);
                    }
                }

                // 计算要输出的文本：不再在最终无文本时使用缓冲回退，保持空文本以便上层做友好提示
                String emitText = incomingText != null ? incomingText : "";

                Log.d(TAG, "Recognition result - mode: " + mode + ", text: " + emitText + ", is_final: " + isFinal);

                // 仅当存在文本或明确的最终标志时才通知上层（与 Web 对齐）
                if ((emitText != null && !emitText.isEmpty()) || isFinal) {
                    final String finalEmitText = emitText;
                    final String finalMode = mode != null && !mode.isEmpty() ? mode : (offlineAccumulatedText.length() > 0 ? "2pass-offline" : "2pass-online");
                    if (plugin != null) {
                        mainHandler.post(() -> plugin.notifyRecognitionResult(finalEmitText, isFinal, finalMode));
                    }
                }

                // 最终一次后清空缓冲，避免下轮误用历史文本
                if (isFinal) {
                    onlineAccumulatedText.setLength(0);
                    offlineAccumulatedText.setLength(0);
                    lastNonEmptyText = "";
                }
            }

            // 处理服务器状态消息
            if (json.has("message")) {
                String msg = json.getString("message");
                Log.d(TAG, "Server message: " + msg);
            }

            // 处理错误信息
            if (json.has("error")) {
                String error = json.getString("error");
                Log.e(TAG, "Server error: " + error);
                if (plugin != null) {
                    mainHandler.post(() -> plugin.notifyError("server_error", error));
                }
            }

        } catch (JSONException e) {
            Log.e(TAG, "Failed to parse message: " + message, e);
        }
    }

    private void startRecording() {
        if (isRecording.get()) {
            return;
        }

        try {
            // 创建AudioRecord，如果指定了设备则尝试使用指定设备
            audioRecord = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    bufferSize);

            // 如果选择了特定设备且Android版本支持，则设置首选设备
            if (selectedDeviceId != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                setPreferredDevice();
            }

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                Log.e(TAG, "AudioRecord initialization failed");
                return;
            }

            audioRecord.startRecording();
            isRecording.set(true);

            // 在后台线程中录制音频
            executorService.execute(this::recordAudio);

            Log.d(TAG, "Audio recording started");

        } catch (Exception e) {
            Log.e(TAG, "Failed to start recording", e);
            throw e;
        }
    }

    private void stopRecording() {
        if (!isRecording.get()) {
            return;
        }

        isRecording.set(false);

        if (audioRecord != null) {
            try {
                audioRecord.stop();
                audioRecord.release();
                audioRecord = null;
                Log.d(TAG, "Audio recording stopped");
            } catch (Exception e) {
                Log.e(TAG, "Error stopping audio record", e);
            }
        }
    }

    private void recordAudio() {
        Log.d(TAG, "Audio recording thread started");

        // 按照示例代码使用固定的 SEND_SIZE
        byte[] bytes = new byte[SEND_SIZE];

        while (isRecording.get() && audioRecord != null) {
            try {
                int readSize = audioRecord.read(bytes, 0, SEND_SIZE);

                if (readSize > 0) {
                    // 按照示例代码的方式发送音频数据
                    if (webSocket != null && isConnected.get()) {
                        ByteString byteString = ByteString.of(bytes);
                        webSocket.send(byteString);
                    }
                } else if (readSize == AudioRecord.ERROR_INVALID_OPERATION) {
                    Log.e(TAG, "AudioRecord invalid operation");
                    break;
                } else if (readSize == AudioRecord.ERROR_BAD_VALUE) {
                    Log.e(TAG, "AudioRecord bad value");
                    break;
                }

            } catch (Exception e) {
                Log.e(TAG, "Error reading audio data", e);
                break;
            }
        }

        Log.d(TAG, "Audio recording thread ended");
    }
}
